# Pact

A trust-first family-safety product prototype for parent/child screen-time agreements, permission requests, and transparent Windows enforcement states.

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

The Windows mute-and-lock control shown in the interface is a product integration boundary. Production enforcement requires a signed Windows service and session companion; this web prototype intentionally does not attempt to control a user's computer.

## Deployment

Pushing to `main` triggers the GitHub Pages workflow. Configure GitHub Pages to use **GitHub Actions** in the repository’s **Settings → Pages** if it is not already enabled.
