using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

namespace Pact.WindowsAgent;

public sealed class DeviceAgent(DeviceEnrollment enrollment, HttpClient http, IWindowsSessionLock sessionLock)
{
    public bool CanLockWindowsSession => sessionLock.IsSupported;

    public async Task<AgentStatus> GetStatusAsync()
    {
        if (!enrollment.IsConfigured)
            return AgentStatus.NotEnrolled;

        var policy = await ReadCachedPolicyAsync();
        return policy is null ? AgentStatus.WaitingForPolicy : AgentStatus.FromPolicy(policy);
    }

    public async Task<AgentStatus> RefreshPolicyAsync(CancellationToken cancellationToken = default)
    {
        if (!enrollment.IsConfigured)
            return AgentStatus.NotEnrolled;

        using var request = new HttpRequestMessage(HttpMethod.Get, enrollment.PolicyUri);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", enrollment.DeviceToken);
        request.Headers.Add("X-Pact-Device-Id", enrollment.DeviceId);

        using var response = await http.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
            return AgentStatus.PolicyUnavailable(response.StatusCode.ToString());

        var policy = await response.Content.ReadFromJsonAsync<DevicePolicy>(cancellationToken: cancellationToken);
        if (policy is null || !policy.IsValidFor(enrollment.DeviceId))
            return AgentStatus.InvalidPolicy;

        await SaveCachedPolicyAsync(policy, cancellationToken);
        return AgentStatus.FromPolicy(policy);
    }

    // Enforcement remains intentionally disabled until this executable is installed as a
    // signed Windows service and an administrator explicitly enables an adapter.
    // A future adapter may call sessionLock.Lock() only for an active, acknowledged policy.
    private async Task<DevicePolicy?> ReadCachedPolicyAsync()
    {
        if (!File.Exists(enrollment.CachePath)) return null;
        await using var stream = File.OpenRead(enrollment.CachePath);
        return await JsonSerializer.DeserializeAsync<DevicePolicy>(stream);
    }

    private async Task SaveCachedPolicyAsync(DevicePolicy policy, CancellationToken cancellationToken)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(enrollment.CachePath)!);
        await using var stream = File.Create(enrollment.CachePath);
        await JsonSerializer.SerializeAsync(stream, policy, cancellationToken: cancellationToken);
    }
}

public sealed record DeviceEnrollment(string DeviceId, string DeviceToken, Uri? ApiBaseUri, string CachePath)
{
    public bool IsConfigured => !string.IsNullOrWhiteSpace(DeviceId) && !string.IsNullOrWhiteSpace(DeviceToken) && ApiBaseUri is not null;

    public Uri PolicyUri => new(ApiBaseUri!, $"v1/device-policies/{Uri.EscapeDataString(DeviceId)}");

    public static DeviceEnrollment FromEnvironment()
    {
        var baseUrl = Environment.GetEnvironmentVariable("PACT_AGENT_API_BASE_URL");
        _ = Uri.TryCreate(baseUrl, UriKind.Absolute, out var apiBaseUri);
        var programData = Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData);
        var cachePath = Path.Combine(programData, "Pact", "agent", "policy.json");
        return new(
            Environment.GetEnvironmentVariable("PACT_DEVICE_ID") ?? string.Empty,
            Environment.GetEnvironmentVariable("PACT_DEVICE_TOKEN") ?? string.Empty,
            apiBaseUri,
            cachePath);
    }
}

public sealed record DevicePolicy(
    string PolicyId,
    int Version,
    string DeviceId,
    DateTimeOffset StartsAt,
    DateTimeOffset? EndsAt,
    bool Acknowledged,
    IReadOnlyList<PolicyRule> Rules)
{
    public bool IsValidFor(string enrolledDeviceId) =>
        !string.IsNullOrWhiteSpace(PolicyId) && Version > 0 && DeviceId == enrolledDeviceId &&
        StartsAt <= DateTimeOffset.UtcNow && (EndsAt is null || EndsAt > DateTimeOffset.UtcNow);
}

public sealed record PolicyRule(string Type, string Target, string Action, int? AllowanceMinutes, string? Reason);

public sealed record AgentStatus(string State, string Message, int? PolicyVersion = null)
{
    public static AgentStatus NotEnrolled { get; } = new("not-enrolled", "This computer has not been enrolled by a parent.");
    public static AgentStatus WaitingForPolicy { get; } = new("waiting-for-policy", "This device is enrolled but has no valid policy.");
    public static AgentStatus InvalidPolicy { get; } = new("invalid-policy", "A policy was rejected because it did not match this enrolled device.");
    public static AgentStatus PolicyUnavailable(string detail) => new("policy-unavailable", $"Policy service unavailable: {detail}.");
    public static AgentStatus FromPolicy(DevicePolicy policy) => new(
        policy.Acknowledged ? "active-observe-only" : "awaiting-acknowledgement",
        policy.Acknowledged ? "Policy received. Enforcement adapters are not installed yet." : "Policy received and awaiting acknowledgement.",
        policy.Version);

    public override string ToString() => $"{State}: {Message}" + (PolicyVersion is null ? string.Empty : $" (policy v{PolicyVersion})");
}

public interface IWindowsSessionLock
{
    bool IsSupported { get; }
    bool Lock();
}
