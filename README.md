# Studio OS

The internal workspace for a web design and development studio: clients, projects, requirements, tasks and, later, specialized AI agents working from the same shared context.

This is the first version. It focuses on the application shell, the Overview dashboard and client management.

## Running locally

```bash
npm install
npm run dev        # http://localhost:3000
```

| Command             | What it does                                 |
| ------------------- | -------------------------------------------- |
| `npm run dev`       | Development server                           |
| `npm run build`     | Production build                             |
| `npm run start`     | Serve the production build                   |
| `npm run lint`      | ESLint                                       |
| `npm run typecheck` | Generates route types, then runs `tsc`       |
| `npm test`          | Unit tests (Vitest) for domain logic and data |

No environment variables are required.

## What works

- **Overview**: workload summary, active projects with stage and task progress, items needing attention (blocked tasks, reviews, approvals, missing client details) and recent activity. Every number is derived from the same data.
- **Clients**: search (name, contact, email, website, project), status filters, empty and loading states.
- **New client**: only the name is required. Optional brief fields are stored as *observed*; anything left blank stays *unknown*. Duplicate names are flagged, double submission is prevented, and a creation event is recorded.
- **Client profile**: Overview, Context, Workflow, Files & Deliverables and Activity tabs. Missing information and next steps are derived from the record.
- **Editing**: core details, status, and every context value with its confidence. Replaced values are kept as superseded history.
- **Search** (⌘K / Ctrl+K) across clients and projects, and a notifications panel listing attention items.
- **Projects, Tasks and Approvals**: read-only views of the same data. **AI Agents** describes what is planned; nothing is active.

## Data and persistence

There is no backend yet. Data lives in a **local demo repository** (`src/lib/data/local-repository.ts`) that stores the workspace in the browser's `localStorage`:

- Data stays in one browser on one device. It is not synced anywhere.
- If storage is unavailable (for example, some private windows), the workspace runs in memory and says so.
- Example records are marked as demo data. **Settings → Reset demo data** restores them.

The UI only talks to the `StudioRepository` interface (`src/lib/data/repository.ts`), so a Supabase implementation can replace the local one without changing components. A draft schema is in `supabase/migrations/0001_initial_schema.sql`. **It has not been applied anywhere.** When it is, the expected environment variables are `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`; never expose the service-role key to the browser.

## Data confidence

Context values (goal, audience, requirements, budget, deadline, platform) carry a confidence state:

| State      | Meaning                                                          |
| ---------- | ---------------------------------------------------------------- |
| Confirmed  | Explicitly confirmed by the client or an authorized team member. |
| Observed   | Taken from a source, not yet confirmed.                          |
| Proposed   | Suggested by the team or AI. Needs confirmation.                 |
| Unknown    | Not yet established.                                             |
| Superseded | Replaced by a newer value or decision.                           |

Each value can also carry a source reference, a note and its update time.

## Code structure

```
src/
  app/                    Routes (App Router). Pages are thin wrappers.
  components/
    shell/                Sidebar, top bar, search, notifications
    overview/             Dashboard
    clients/              Client list, profile tabs, new/edit dialogs
    workspace/            Projects, Tasks, Approvals, Settings views
    ui/                   Buttons, fields, modal, toast, status labels
    providers/            StudioProvider (data store for React)
  lib/
    domain/               Types, labels, pure business logic, validation (+ tests)
    data/                 Repository interface, local demo repository, seed data, store
```

Business rules (creating and updating clients, missing information, attention items, next steps, dashboard metrics) are pure functions in `src/lib/domain` and are unit tested.
