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

The initial companion foundation is in [`windows-agent/`](windows-agent/). It is
observe-only until a signed service, parent-authorized device enrollment, and
transparent enforcement adapters are implemented.

`003_device_pairing.sql` adds a parent-only, 15-minute Windows pairing code.
Only its hash is stored. Redeeming a code must happen in a server-side device
enrollment endpoint that issues a narrowly scoped device credential; the agent
must never use a browser session token or query Neon Data API tables directly.

## Deployment

Pushing to `main` triggers the GitHub Pages workflow. Configure GitHub Pages to use **GitHub Actions** in the repository’s **Settings → Pages** if it is not already enabled.

## Neon database

The database schema is in `db/migrations/001_family_safety.sql`. To apply it to the dedicated Neon database, set the rotated connection string in a local environment variable and run:

```bash
export DATABASE_URL='your-rotated-neon-connection-string'
npm install
npm run db:migrate
```

Do not put the connection string in `.env`, GitHub Pages, or browser-side code. A server API and Neon Auth session validation will use it only in their private deployment environment.

The migration enables Row Level Security for every Data API table. A signed-in person
can only read their own profile and the rows belonging to their family; parents can
manage family data, while members can create their own change requests and pact
acceptances. `onboard_family` is the one atomic, authenticated setup operation: it
creates the person’s profile, family, and initial parent membership. The app keeps
the dashboard itself on mock data until its live data flows are added.

`002_family_integrity_and_restrictions.sql` adds the live family setup and policy
foundation: one-time family invitations, a one-family-per-account invariant,
family-scoped reference guards, versioned app/category/domain restriction targets,
and immutable policy events. Rules are transparent proposals and require the
affected member’s acknowledgement before becoming active. They do **not** collect
browsing history or enforce anything in the browser; device enforcement requires a
separately enrolled, signed companion service with policy delivery and heartbeat
acknowledgements.
