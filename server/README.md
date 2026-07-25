# Pact device API

This small private Node service performs the two operations a static GitHub
Pages site must never perform: redeem a pairing code and issue a device-only
credential. It is not deployed by GitHub Pages.

## Deploy

Deploy this directory as a private Node service behind HTTPS, set only
`DATABASE_URL` and `PORT`, and use the same database that has applied
`005_device_agent_service.sql`.

```bash
DATABASE_URL='postgresql://…' npm run agent-api
```

Do not set CORS headers for the enrollment endpoint. The Windows client calls
it directly. Its bearer credential is generated once, stored as a SHA-256 hash
in the database, and returned only to the client during pairing.

Endpoints:

- `POST /v1/device-enrollments` — `{ pairingCode, installationId }`
- `GET /v1/devices/{deviceId}/policy` — device bearer credential
- `POST /v1/devices/{deviceId}/heartbeat` — policy/enforcement state only;
  never activity, browsing history, files, or screen content.
