-- Studio OS: explicit, minimal table access for the agent runner.
--
-- Supabase projects created after 30 May 2026 no longer give service_role
-- (or anon and authenticated) access to new tables in the public schema by
-- default. Earlier migrations relied on that default for the service role,
-- which /api/agents/intake uses to record runs, proposals and activity, so on
-- such a project every analysis failed with "permission denied for table
-- agent_runs". Local stacks still have the default, which hid the problem.
--
-- Remove whatever the default gave and grant only what the runner
-- (src/server/agents/supabase-intake-store.ts) does. Everything it reads
-- about the client goes through the requesting person's session instead.
-- Row-level security does not apply to the service role; the guard triggers
-- do, and still stop it from confirming facts, approving work, reviewing
-- proposals or rewriting history.

revoke all on all tables in schema public from service_role;

-- Find earlier runs and the active run, record a run, then finish it.
grant select, insert on public.agent_runs to service_role;
grant update (status, result, outputs, error, finished_at) on public.agent_runs to service_role;

-- Record proposals and mark a client's earlier pending ones superseded.
grant select, insert on public.agent_proposals to service_role;
grant update (status) on public.agent_proposals to service_role;

-- Log that a run started and finished. The log stays append-only. Its guard
-- trigger checks that the client is in the same studio, reading only these
-- two columns as the caller.
grant insert on public.activity_events to service_role;
grant select (id, studio_id) on public.clients to service_role;

-- Tables added later get no access until a migration grants it.
alter default privileges in schema public revoke all on tables from service_role;
