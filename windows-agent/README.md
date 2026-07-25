# Pact Windows Agent (foundation)

This is the companion foundation for a Windows computer. It is deliberately
**observe-only**: it can be enrolled and retrieve a policy, but cannot block
apps, filter websites, inspect browsing history, mute audio, or lock a screen.

## What is included

- A device-specific enrollment configuration read from environment variables.
- An authenticated policy pull contract: `GET /v1/device-policies/{deviceId}`.
- Strict local policy validation: device ID, version, and validity window must match.
- A private local policy cache under `%ProgramData%\Pact\agent\policy.json`.
- Minimal status only; it does not collect activity or browsing data.
- A Windows session-lock adapter that is present but never invoked by the agent.

## What must exist before enforcement

1. A signed, administrator-installed Windows service and a visible user-session
   companion. The service must be able to recover safely from updates and removal.
2. A backend device-enrollment flow that issues a device credential after a
   parent authorizes the device. The current Neon schema has no device-agent API
   endpoint or enrollment RPC yet.
3. A signed policy format and server-side authorization check that derives family
   membership and device ownership. Browser-provided IDs are not authorization.
4. Explicit adapters for the intended enforcement mechanism:
   - app execution: Windows App Control / AppLocker or WDAC;
   - websites: a visible, managed browser extension or explicit DNS/firewall
     policy, with documented bypass limitations;
   - time expiry: user-session lock after an acknowledged, active policy.
5. A child-visible explanation, time window, reason, change-request path, and
   audit event for every active restriction.

## Local development

```powershell
$env:PACT_AGENT_API_BASE_URL = "https://api.example.invalid/"
$env:PACT_DEVICE_ID = "device-uuid"
$env:PACT_DEVICE_TOKEN = "device-secret"
dotnet run --project .\Pact.WindowsAgent -- --status
dotnet run --project .\Pact.WindowsAgent -- --refresh
```

Never put a device token in the web app, source control, or a shared computer
profile. On production Windows installs, use OS-backed secret storage rather
than environment variables.
