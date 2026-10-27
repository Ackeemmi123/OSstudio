-- Studio OS: agent runs and the proposals they produce.
--
-- Mirrors src/lib/agents/contract.ts. Runs and proposals are written only by
-- the server-side agent runner (service role). People can read them, and can
-- only change a proposal's review fields (accept or dismiss).

create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null,
  client_id uuid not null,
  project_id uuid,
  task_id uuid,
  agent public.agent_id not null,
  task_type text not null check (task_type ~ '^[a-z]+\.[a-z_]+$'),
  -- Identical inputs produce the same key, so a repeated request reuses the
  -- earlier run instead of creating a duplicate. A retry is a new attempt.
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 200),
  attempt int not null default 1 check (attempt between 1 and 20),
  status text not null check (status in ('queued', 'running', 'needs_input', 'needs_approval', 'succeeded', 'failed', 'cancelled')),
  "trigger" jsonb not null check (jsonb_typeof("trigger") = 'object'),
  inputs jsonb not null default '[]' check (jsonb_typeof(inputs) = 'array'),
  outputs jsonb not null default '[]' check (jsonb_typeof(outputs) = 'array'),
  -- The structured result: summary, unknowns, questions, next steps.
  result jsonb check (result is null or jsonb_typeof(result) = 'object'),
  blocker text,
  error jsonb check (error is null or jsonb_typeof(error) = 'object'),
  -- Which implementation ran it, e.g. "anthropic". Never a credential.
  runner text,
  model text,
  requested_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  unique (studio_id, idempotency_key, attempt),
  unique (id, studio_id, client_id),
  foreign key (client_id, studio_id) references public.clients (id, studio_id) on delete cascade,
  foreign key (project_id, studio_id) references public.projects (id, studio_id),
  foreign key (task_id, studio_id) references public.tasks (id, studio_id)
);
create index agent_runs_client_idx on public.agent_runs (client_id, created_at desc);
-- At most one active run per client and agent: double clicks and parallel
-- requests cannot start two analyses of the same client.
create unique index agent_runs_one_active_idx on public.agent_runs (client_id, agent) where status in ('queued', 'running');

create table public.agent_proposals (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null,
  run_id uuid not null,
  client_id uuid not null,
  -- A brief value, or a client detail.
  target text not null check (target in (
    'goal', 'requirements', 'targetAudience', 'budget', 'deadline', 'platform',
    'companyName', 'contactPerson', 'email', 'website'
  )),
  value text not null check (char_length(btrim(value)) between 1 and 2000),
  -- [{"sourceId": "…", "sourceLabel": "…", "quote": "…"}], verified against the source text.
  evidence jsonb not null check (jsonb_typeof(evidence) = 'array' and jsonb_array_length(evidence) between 1 and 5),
  -- Why the value may need checking (ambiguity, conflicting statements).
  note text check (char_length(note) <= 1000),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'dismissed', 'superseded')),
  -- How the person recorded an accepted value.
  review_confidence public.field_confidence check (review_confidence is null or review_confidence in ('observed', 'confirmed')),
  reviewed_by jsonb check (public.is_valid_actor(reviewed_by)),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (run_id, studio_id, client_id) references public.agent_runs (id, studio_id, client_id) on delete cascade,
  constraint review_is_complete check (
    (status in ('accepted', 'dismissed')) = (reviewed_by is not null and reviewed_at is not null)
    and (status = 'accepted') = (review_confidence is not null)
  ),
  constraint reviewed_by_a_person check (reviewed_by is null or reviewed_by ->> 'kind' = 'human')
);
create index agent_proposals_client_idx on public.agent_proposals (client_id, created_at desc);
