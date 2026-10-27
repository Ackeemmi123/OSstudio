# Persistence: from the browser demo to a real backend

## Today

- All data lives in the browser's `localStorage` under `studio-os:workspace:v2`
  (`LocalDemoRepository`). It is not synced, backed up or shared.
- Data saved by the first version (`studio-os:workspace:v1`) is migrated on
  first load by `src/lib/data/migrate.ts`, so nothing anyone entered is lost.
- If storage is unavailable, the workspace runs in memory and the UI says so.
- The top bar shows "Local demo" while this is the case.

## The boundary

The UI and, later, agent runners only talk to `StudioRepository`
(`src/lib/data/repository.ts`). Every write goes through a pure domain
function in `src/lib/domain` that enforces the rules (validation, history,
"only a person can confirm or approve") and returns the activity events to
store with the change. `src/lib/data/index.ts` is the one place that decides
which repository to use.

## Next step: Supabase

Prerequisites that do not exist yet:

1. A Supabase project, with the drafts in `supabase/migrations` reviewed and
   applied (`0001` tables, `0002` actors, agent runs and row-level security).
2. Sign-in (Supabase Auth), and studio members added to `studio_members` by an
   administrator. Real client data must not be stored before this exists.
3. Environment variables: `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` for the browser. The service-role key is
   server-only (agent runners, migrations) and must never be in a
   `NEXT_PUBLIC_` variable or committed.

Then:

1. Implement `SupabaseRepository` against the same interface. Reuse the domain
   functions: load the affected rows, apply the domain function, write the
   result and its events in one transaction (an RPC or a server action).
2. Choose it in `createRepository()` when the user is signed in; keep the local
   repository for demos.
3. Offer a one-time "import from this browser" for anything entered in the demo.
4. Change the top bar badge and Settings copy to reflect the real storage.

The row-level security in `0002` lets signed-in studio members read and write,
keeps the activity log append-only, and blocks agents from storing confirmed
values at the database level.
