-- Studio OS: tenancy and core data.
--
-- Replaces the two unapplied drafts from the first version. Every row belongs
-- to a studio. Child tables repeat studio_id and reference their parent with a
-- composite foreign key, so a row can never point at another studio's data,
-- whatever identifiers a client sends.
--
-- Security (row-level security, triggers, grants) is in the next migration.

create extension if not exists pgcrypto with schema extensions;

/* ------------------------------------------------------------------------ */
/* Types                                                                     */
/* ------------------------------------------------------------------------ */

create type public.member_role as enum ('owner', 'member', 'viewer');
create type public.client_status as enum ('lead', 'onboarding', 'active', 'on_hold', 'archived');
create type public.project_type as enum ('website', 'ecommerce', 'brand_website', 'website_ecommerce', 'other');
create type public.project_status as enum ('planned', 'active', 'on_hold', 'completed');
create type public.project_stage as enum ('intake', 'discovery', 'strategy', 'design', 'development', 'review', 'launch');
create type public.task_status as enum ('todo', 'in_progress', 'blocked', 'in_review', 'awaiting_approval', 'done');
create type public.source_type as enum ('email', 'contact_form', 'meeting', 'phone', 'referral', 'document', 'manual', 'other');
create type public.field_confidence as enum ('confirmed', 'observed', 'proposed', 'unknown', 'superseded');
create type public.entity_type as enum ('client', 'project', 'task');
create type public.agent_id as enum ('research', 'design', 'development', 'qa', 'sales', 'coordination');

/* ------------------------------------------------------------------------ */
/* Studios and membership                                                    */
/* ------------------------------------------------------------------------ */

create table public.studios (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  created_at timestamptz not null default now()
);

-- Who may see a studio's data. Rows are only written by the functions in the
-- third migration (create a studio, add or remove a member), never directly.
create table public.studio_members (
  studio_id uuid not null references public.studios (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 120),
  role public.member_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (studio_id, user_id)
);
create index studio_members_user_idx on public.studio_members (user_id);

/* ------------------------------------------------------------------------ */
/* Actors                                                                    */
/* ------------------------------------------------------------------------ */

-- Actors are stored as JSON matching `Actor` in src/lib/domain/types.ts:
--   {"kind":"human","name":"…","userId":"…"} · {"kind":"agent","agentId":"research"} · {"kind":"system"}
-- Records imported from the browser demo carry {"kind":"human","name":"…","imported":true}.
create function public.is_valid_actor(actor jsonb) returns boolean
  language sql immutable
  as $$
    select actor is null or (
      jsonb_typeof(actor) = 'object' and (
        (actor ->> 'kind' = 'human' and coalesce(btrim(actor ->> 'name'), '') <> '')
        or (actor ->> 'kind' = 'agent' and actor ->> 'agentId' in ('research', 'design', 'development', 'qa', 'sales', 'coordination'))
        or (actor ->> 'kind' = 'system')
      )
    )
  $$;

/* ------------------------------------------------------------------------ */
/* Clients                                                                   */
/* ------------------------------------------------------------------------ */

create table public.clients (
  id uuid primary key,
  studio_id uuid not null references public.studios (id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  contact_person text check (char_length(contact_person) <= 120),
  email text check (char_length(email) <= 254),
  website text check (char_length(website) <= 254),
  status public.client_status not null default 'lead',
  project_type public.project_type,
  source_type public.source_type not null default 'manual',
  initial_notes text check (char_length(initial_notes) <= 20000),
  source_received_at timestamptz not null default now(),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, studio_id)
);
create index clients_studio_idx on public.clients (studio_id);

-- One row per brief value (goal, budget, …): the current value with its
-- confidence and provenance. Replaced values are kept, newest first, in
-- `history`, which the security migration makes append-only.
create table public.client_context_fields (
  studio_id uuid not null,
  client_id uuid not null,
  field_key text not null check (field_key in ('goal', 'requirements', 'targetAudience', 'budget', 'deadline', 'platform')),
  value text check (char_length(value) <= 5000),
  confidence public.field_confidence not null default 'unknown',
  source jsonb check (source is null or jsonb_typeof(source) = 'object'),
  note text check (char_length(note) <= 2000),
  recorded_by jsonb check (public.is_valid_actor(recorded_by)),
  confirmed_by jsonb check (public.is_valid_actor(confirmed_by)),
  confirmed_at timestamptz,
  history jsonb not null default '[]' check (jsonb_typeof(history) = 'array'),
  updated_at timestamptz not null default now(),
  primary key (client_id, field_key),
  foreign key (client_id, studio_id) references public.clients (id, studio_id) on delete cascade,
  -- "unknown" means no value; a value is never stored as unknown or superseded.
  constraint value_matches_confidence check ((value is null) = (confidence = 'unknown') and confidence <> 'superseded'),
  -- A confirmed value always names the person who confirmed it, so an agent
  -- can propose a value but never confirm one.
  constraint confirmed_by_a_person check (confidence <> 'confirmed' or confirmed_by ->> 'kind' = 'human')
);

create table public.client_context_items (
  id uuid primary key,
  studio_id uuid not null,
  client_id uuid not null,
  kind text not null check (kind in ('assumption', 'question')),
  text text not null check (char_length(btrim(text)) between 1 and 1000),
  confidence public.field_confidence not null default 'unknown',
  created_at timestamptz not null default now(),
  foreign key (client_id, studio_id) references public.clients (id, studio_id) on delete cascade
);
create index client_context_items_client_idx on public.client_context_items (client_id);

-- Source material a person supplied: an email, call notes, a brief. The
-- intake agent only ever analyzes these, and cites them as evidence.
create table public.client_sources (
  id uuid primary key,
  studio_id uuid not null,
  client_id uuid not null,
  type public.source_type not null,
  label text not null check (char_length(btrim(label)) between 1 and 160),
  content text not null check (char_length(btrim(content)) between 1 and 50000),
  received_at timestamptz not null default now(),
  added_by jsonb check (public.is_valid_actor(added_by)),
  created_at timestamptz not null default now(),
  foreign key (client_id, studio_id) references public.clients (id, studio_id) on delete cascade
);
create index client_sources_client_idx on public.client_sources (client_id);

/* ------------------------------------------------------------------------ */
/* Projects and tasks                                                        */
/* ------------------------------------------------------------------------ */

create table public.projects (
  id uuid primary key,
  studio_id uuid not null,
  client_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  project_type public.project_type not null,
  status public.project_status not null default 'planned',
  stage public.project_stage not null default 'intake',
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, studio_id),
  foreign key (client_id, studio_id) references public.clients (id, studio_id) on delete cascade
);
create index projects_client_idx on public.projects (client_id);

create table public.tasks (
  id uuid primary key,
  studio_id uuid not null,
  project_id uuid not null,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  status public.task_status not null default 'todo',
  -- {"kind":"human","name":"…"} or {"kind":"agent","agentId":"…"}; never "system".
  assignee jsonb check (public.is_valid_actor(assignee) and coalesce(assignee ->> 'kind', '') <> 'system'),
  blocked_reason text check (char_length(blocked_reason) <= 500),
  due_date date,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, studio_id),
  foreign key (project_id, studio_id) references public.projects (id, studio_id) on delete cascade
);
create index tasks_project_idx on public.tasks (project_id);

/* ------------------------------------------------------------------------ */
/* Activity (append-only; enforced in the security migration)                */
/* ------------------------------------------------------------------------ */

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios (id) on delete restrict,
  -- SHA-256 of the imported browser data. The same data is never imported twice.
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  imported_by uuid not null default auth.uid() references auth.users (id),
  counts jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (studio_id, content_hash)
);

create table public.activity_events (
  id uuid primary key,
  studio_id uuid not null references public.studios (id) on delete restrict,
  entity_type public.entity_type not null,
  entity_id uuid not null,
  event_type text not null check (event_type ~ '^[a-z_]+\.[a-z_]+$'),
  description text not null check (char_length(description) between 1 and 500),
  actor jsonb check (public.is_valid_actor(actor)),
  -- When it happened. Set by the database, except for imported history.
  "timestamp" timestamptz not null default now(),
  -- When the database stored it. Always set by the database.
  recorded_at timestamptz not null default now(),
  -- Deferred so the import can record its batch (with counts) last.
  import_batch_id uuid references public.import_batches (id) deferrable initially deferred
);
create index activity_events_studio_time_idx on public.activity_events (studio_id, "timestamp" desc);
create index activity_events_entity_idx on public.activity_events (entity_type, entity_id);
