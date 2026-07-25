using Pact.WindowsAgent;

var agent = new DeviceAgent(
    DeviceEnrollment.FromEnvironment(),
    new HttpClient { Timeout = TimeSpan.FromSeconds(15) },
    new WindowsSessionLock());

if (args.Contains("--status", StringComparer.OrdinalIgnoreCase) || args.Length == 0)
{
    Console.WriteLine(await agent.GetStatusAsync());
    return;
}

if (args.Contains("--refresh", StringComparer.OrdinalIgnoreCase))
{
    Console.WriteLine(await agent.RefreshPolicyAsync());
    return;
}

Console.Error.WriteLine("Usage: Pact.WindowsAgent [--status | --refresh]");
Environment.ExitCode = 2;
