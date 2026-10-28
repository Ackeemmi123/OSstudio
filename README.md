# Studio OS

Axivo's studio workspace for clients, projects and the next step on each, built
to work alongside specialized AI agents later.

It answers three questions:

1. **Which clients and projects are we working on?** The Clients list, and the
   "In progress" list on Today.
2. **What needs to happen next?** "Next up" on Today, and "What's next" in each
   client workspace.
3. **What needs my decision?** "Needs your decision" on Today: approvals,
   reviews, proposed client facts, and intake analyses waiting for review.

## Running locally

```bash
npm install
npm run dev        # http://localhost:3000
```

| Command             | What it does                                  |
| ------------------- | --------------------------------------------- |
| `npm run dev`       | Development server                            |
| `npm run build`     | Production build                              |
| `npm run start`     | Serve the production build                    |
| `npm run lint`      | ESLint                                        |
| `npm run typecheck` | Generates route types, then runs `tsc`        |
| `npm test`          | Unit tests (Vitest): domain, data, import, agents |
| `npm run db:start`  | Local Supabase stack (Docker)                 |
| `npm run test:db`   | Database tests against the local stack        |
| `npm run test:e2e`  | Playwright journeys (local stack and local demo) |
| `npm run staging:check` | Read-only check of a hosted staging configuration |
| `npm run staging:smoke` | One end-to-end pass against hosted staging (writes test data) |
| `npm run staging:e2e` | Browser journey on the deployed staging app (writes test data) |

With no environment variables, `npm run dev` runs the **local demo**. A
production build without Supabase settings shows a configuration error instead;
set `NEXT_PUBLIC_STUDIO_DATA_MODE=local` to build the demo on purpose. To use
Supabase, see [docs/persistence.md](docs/persistence.md) and `.env.example`.
To stand up and check a hosted staging copy, see [docs/staging.md](docs/staging.md).

## What works

- **Today**: decisions waiting on you, the next step for each client in play
  (blocked work first), active projects, and recent activity.
- **Clients**: search by name, contact, email or project, with one line on each
  client's situation. Archived clients are tucked away.
- **New client**: a name is enough. Contact details and the original inquiry
  are optional, behind one click.
- **Client workspace** (one page, no tabs):
  - *What's next*: decisions, blocked work and missing essentials for this client.
  - *Projects*: create a project, change its stage and status, add tasks, change
    task status, approve work that is awaiting approval.
  - *Brief*: goal, requirements, audience, budget, deadline and platform. Each
    value is edited on its own, shows how certain it is and where it came from,
    and can be confirmed with one click. Replaced values are kept as history.
  - *Source material* and *Activity* alongside.
- **Search** (⌘K / Ctrl+K) across clients and projects.
- **Settings**: where data is stored, a reset for the demo data, what is
  connected, and the planned agents.

Old links to `/projects`, `/tasks`, `/approvals` and `/agents` redirect to Today
or Settings.

## Sign-in, studios and the intake agent

- **Supabase mode**: sign-in with email and password (no public sign-up),
  studios with owners, members and viewers, and row-level security so nobody
  sees another studio's data. Viewers get a read-only workspace.
- **Import from this browser**: a one-time, verified copy of local demo data
  into a studio (Settings).
- **Source material**: paste emails, call notes or briefs into a client.
- **Analyze client information**: the Client Intake & Research agent reads the
  source material and proposes brief values, each with the quote it came
  from, plus what is missing or unclear and questions to ask. Nothing changes
  until a person accepts it. It does no web research. It needs
  `ANTHROPIC_API_KEY` on the server; see [docs/architecture.md](docs/architecture.md).

## Website inquiries

The Axivo website forwards contact-form inquiries to a signed endpoint,
`POST /api/inquiries`, which stores each one once and confirms with `202`.
Studio members can read them; nobody can edit them. Reviewing and approving
inquiries is not built yet. See [docs/inquiries.md](docs/inquiries.md).

## Not built

- File uploads, email intake, notifications, invoicing.
- Other agents (design, development, QA, sales, coordination) are listed in
  Settings as planned.

## Brand

Logo, the five Axivo brand colors and the Inter/Geist type pairing come from
the Axivo website repository. All tokens are in `src/app/theme.css`. See
[docs/brand.md](docs/brand.md).

## Data and persistence

In **Supabase** mode data is stored in Postgres and shared by the studio. In
**local demo** mode it is stored in this browser's `localStorage` only, and the
top bar says "Local demo". A misconfigured backend shows an error; the app
never falls back to browser storage. Details, migrations and setup steps are
in [docs/persistence.md](docs/persistence.md).

## Data confidence

| State      | Meaning                                                          |
| ---------- | ---------------------------------------------------------------- |
| Confirmed  | Explicitly confirmed by the client or an authorized team member. |
| Observed   | Taken from a source, not yet confirmed.                          |
| Proposed   | Suggested by the team or an agent. Needs a human decision.       |
| Unknown    | Not yet established.                                             |
| Superseded | Replaced by a newer value or decision.                           |

Only a person can confirm a value or approve work. The domain layer enforces
this, and the database enforces it again.

## Code structure

See [docs/architecture.md](docs/architecture.md) for the layers, the rules the
domain enforces, and how agents will plug in.
