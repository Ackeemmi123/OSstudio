# Studio OS

Axivo's studio workspace for clients, projects and the next step on each, built
to work alongside specialized AI agents later.

It answers three questions:

1. **Which clients and projects are we working on?** The Clients list, and the
   "In progress" list on Today.
2. **What needs to happen next?** "Next up" on Today, and "What's next" in each
   client workspace.
3. **What needs my decision?** "Needs your decision" on Today: approvals,
   reviews, and proposed client facts. No agents are connected yet; when they
   are, their proposals land here too.

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
| `npm test`          | Unit tests (Vitest) for domain, data and agent permissions |

No environment variables are required.

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

## Not built or not connected

- **No backend.** Data lives in this browser only (see below).
- **No sign-in.** Every change is recorded as made by "You".
- **No AI agents.** The run contract, permissions and registry exist in code;
  nothing executes. The UI says so.
- **No file uploads, email intake, notifications or invoicing.**

## Brand

Logo, the five Axivo brand colors and the Inter/Geist type pairing come from
the Axivo website repository. All tokens are in `src/app/theme.css`. See
[docs/brand.md](docs/brand.md).

## Data and persistence

Data is stored in the browser's `localStorage` by `LocalDemoRepository`. It is
not synced to other devices or people. Example records are tagged "Demo";
**Settings → Reset demo data** restores them. Data entered in the first version
is migrated automatically.

A draft Supabase schema with row-level security is in `supabase/migrations`.
**It has not been applied anywhere.** The path to a real backend is in
[docs/persistence.md](docs/persistence.md).

## Data confidence

| State      | Meaning                                                          |
| ---------- | ---------------------------------------------------------------- |
| Confirmed  | Explicitly confirmed by the client or an authorized team member. |
| Observed   | Taken from a source, not yet confirmed.                          |
| Proposed   | Suggested by the team or an agent. Needs a human decision.       |
| Unknown    | Not yet established.                                             |
| Superseded | Replaced by a newer value or decision.                           |

Only a person can confirm a value or approve work. The domain layer enforces
this, and the draft database schema repeats it.

## Code structure

See [docs/architecture.md](docs/architecture.md) for the layers, the rules the
domain enforces, and how agents will plug in.
