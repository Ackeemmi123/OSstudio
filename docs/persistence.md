# Persistence and setup

Studio OS runs in one of two modes, chosen by environment variables at build
time (`src/lib/config.ts`). It never switches between them on its own.

| Mode | When | Where data lives |
| ---- | ---- | ---------------- |
| **Supabase** | `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set | Postgres, shared by the studio, behind sign-in and row-level security |
| **Local demo** | `NEXT_PUBLIC_STUDIO_DATA_MODE=local`, or nothing is set in development (`next dev`) | This browser's `localStorage` only. The top bar says "Local demo". |

The app shows a configuration error instead of any data, and never falls back
to browser storage, when:

- a production build (`next build`, every deployment) has no Supabase settings
  and the demo was not chosen with `NEXT_PUBLIC_STUDIO_DATA_MODE=local`;
- Supabase is requested or only partly configured;
- `NEXT_PUBLIC_STUDIO_DATA_MODE=local` is set while Supabase settings are too.

These values are read when the app is built, so after changing them on a host,
rebuild and redeploy.

## The data model

Migrations are in `supabase/migrations`, applied in name order:

| Migration | What it adds |
| --------- | ------------ |
| `…000100_core_schema` | Studios and members (owner, member, viewer), clients, brief values with history, open questions, source documents, projects, tasks, import batches, the activity log |
| `…000200_agents` | Agent runs (inputs, outputs, status, errors, idempotency key) and agent proposals (value, quoted evidence, review) |
| `…000300_security` | Grants, row-level security, and triggers (below) |
| `…000400_functions` | `load_studio`, `apply_changes`, `import_browser_data`, studio and member management |
| `20261030000200_site_specs` | Website spec versions per project, their rules, `apply_site_spec_changes`, and anonymisation of specs ([site-spec.md](site-spec.md)) |
| `20261030000300_is_valid_actor_search_path` | Fixes `is_valid_actor()`'s search path, as every other function has (Supabase advisor) |
| `20261031000100_site_assets` | Website images: the `site-assets` bucket and its policies, `site_assets` with provenance and rights, upload/review/delete/purge functions, specs approve only with approved images, anonymisation marks images deleted ([site-images.md](site-images.md)) |

Every table carries `studio_id`, and child rows reference their parent by
`(id, studio_id)`, so a row can never point into another studio.

### What the database enforces, whatever the client sends

- **Studio scoping.** Row-level security lets people read only studios they
  belong to. Changing an id in a URL or request returns nothing.
- **Roles.** Owners and members can change data; viewers can only read. Only
  owners manage members.
- **Only a person confirms or approves.** A brief value can be `confirmed`, and
  a task can go from `awaiting_approval` to `done`, only when the recorded actor
  is the signed-in person (`auth.uid()`). Agents and the service role cannot.
- **Nobody signs as someone else.** Actors recorded on rows and activity must
  match the signed-in user.
- **History is append-only.** Activity events and brief history cannot be
  edited or deleted; `studio_id` cannot be changed.
- **The database clock wins.** `created_at` and `updated_at` are set by triggers.
- **Concurrent edits are detected.** Updates carry the `updated_at` they were
  based on; a mismatch fails with a conflict and the app reloads.
- **Agents only propose.** Agent runs and proposals are written by the server
  (service role) only. People can change just the review columns of a
  proposal, and accepting one goes through the same rules as a manual edit.
- **The server's key reaches only the agent tables.** The service role is
  granted exactly what the agent runner does: read and record runs and
  proposals, finish a run, supersede a pending proposal, and log activity
  (`20261028000100_service_role_grants.sql`). It cannot read client data;
  the runner reads that with the requesting person's session. Supabase
  projects created after May 2026 grant nothing by default, so every grant is
  explicit.

`npm run test:db` checks all of this against a real database.

### How writes work

The browser applies the same pure domain function the demo uses
(`src/lib/domain`), then sends the resulting rows and activity events to
`apply_changes` in one call, which writes them in one transaction as the
signed-in user (security invoker, so row-level security applies).

## Importing data from the local demo

**Settings → Import from this browser** appears when this browser holds data a
person entered in the demo (example records are ignored).

1. The data is validated and shown for review: counts, and anything that will
   be skipped and why.
2. On import, ids are derived from the studio and the original id, and the
   batch is keyed by a hash of its content, so importing the same data twice
   creates nothing new.
3. Earlier changes keep their original dates and authors and are marked as
   imported.
4. After the import, the app reloads from the server and checks that every
   record is there. Only then is **Remove browser copy** offered. Nothing is
   deleted from the browser automatically.

## Setting up a Supabase project

Use a **development or staging** project first. [staging.md](staging.md) has
the full staging procedure, including the checks and the smoke test.

1. Create a project at supabase.com. In **Authentication → Providers**, keep
   Email enabled and turn **off** "Allow new users to sign up". There is no
   public sign-up in the app.
2. Review, then apply the migrations with the Supabase CLI:
   `npx supabase link --project-ref <ref>` and `npx supabase db push`.
   They create tables, policies and functions only, and drop nothing.
3. Create people in **Authentication → Users → Add user** (email and
   password, auto confirm).
4. Set environment variables (see `.env.example`):
   - Browser: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
   - Server only: `SUPABASE_SERVICE_ROLE_KEY`, used only to record agent runs
     and proposals. Never put it in a `NEXT_PUBLIC_` variable or commit it.
5. The first person signs in and is offered **Create studio**; they become its
   owner. They add colleagues under **Settings → People** by the email their
   account was created with.

## Running against a local stack

Docker is required. `npm run db:start` starts Postgres, Auth and the REST API;
`npm run test:db` runs the database tests; `npm run test:e2e` builds and starts
the app in both modes and runs Playwright. The local stack's keys are fixed
development keys, not secrets, and the test scripts refuse to run against
anything but `localhost`.
