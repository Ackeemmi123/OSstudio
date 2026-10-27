-- Studio OS: actors, agent runs and access control (DRAFT, not applied anywhere).
--
-- Builds on 0001. Mirrors src/lib/domain/types.ts (Actor, Assignee) and
-- src/lib/agents/contract.ts (AgentRun). Nothing here has been run against a
-- database; review it together with your auth setup before applying.

-- Who did something. Agents are never treated as an authorized person.
create type actor_kind as enum ('human', 'agent', 'system');
create type agent_id as enum ('research', 'design', 'development', 'qa', 'sales', 'coordination');

-- People who may see studio data. Rows are created by an administrator,
-- never by the browser.
create table studio_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  role text not null default 'member' check (role in ('member', 'admin')),
  created_at timestamptz not null default now()
);
alter table studio_members enable row level security;

create function is_studio_member() returns boolean
  language sql stable security definer set search_path = public
  as $$ select exists (select 1 from studio_members where user_id = auth.uid()) $$;

-- Tasks: structured assignee instead of free text.
alter table tasks
  add column assignee_kind actor_kind check (assignee_kind is null or assignee_kind <> 'system'),
  add column assignee_user_id uuid references auth.users (id),
  add column assignee_name text,
  add column assignee_agent agent_id;

-- Provenance for context values and events.
alter table client_context_values
  add column recorded_by_kind actor_kind,
  add column recorded_by_user_id uuid references auth.users (id),
  add column recorded_by_agent agent_id,
  -- An agent may propose or record a value, never confirm it.
  add constraint agents_cannot_confirm check (not (recorded_by_kind = 'agent' and confidence = 'confirmed'));

alter table activity_events
  add column actor_kind actor_kind,
  add column actor_user_id uuid references auth.users (id),
  add column actor_agent agent_id;

-- One row per agent run attempt. See AgentRun in src/lib/agents/contract.ts.
create table agent_runs (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null,
  attempt int not null default 1,
  agent agent_id not null,
  task_type text not null,
  client_id uuid not null references clients (id) on delete cascade,
  project_id uuid references projects (id) on delete set null,
  task_id uuid references tasks (id) on delete set null,
  status text not null check (status in ('queued', 'running', 'needs_input', 'needs_approval', 'succeeded', 'failed', 'cancelled')),
  trigger jsonb not null,
  inputs jsonb not null default '[]',
  outputs jsonb not null default '[]',
  pending_approvals jsonb not null default '[]',
  blocker text,
  error jsonb,
  runner text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  unique (idempotency_key, attempt)
);
create index on agent_runs (client_id, created_at desc);
alter table agent_runs enable row level security;

-- Row-level security: signed-in studio members can read and write studio data.
-- Agent runners use a server-side service role and never run in the browser.
do $$
declare t text;
begin
  foreach t in array array['clients', 'client_context_values', 'client_context_items', 'projects', 'tasks', 'activity_events'] loop
    execute format('create policy "members read" on %I for select to authenticated using (is_studio_member())', t);
    execute format('create policy "members insert" on %I for insert to authenticated with check (is_studio_member())', t);
    execute format('create policy "members update" on %I for update to authenticated using (is_studio_member()) with check (is_studio_member())', t);
  end loop;
end $$;

-- The activity log is append-only: no update or delete policies.
drop policy "members update" on activity_events;

create policy "members read" on agent_runs for select to authenticated using (is_studio_member());
create policy "members read themselves" on studio_members for select to authenticated using (user_id = auth.uid());
