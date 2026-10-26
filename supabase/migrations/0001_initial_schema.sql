-- Studio OS: initial schema (DRAFT, not applied anywhere).
--
-- Mirrors the TypeScript domain model in src/lib/domain/types.ts so the local
-- demo repository can later be replaced by a Supabase-backed repository.
-- Review row-level security policies against your auth model before applying.

create extension if not exists "pgcrypto";

create type client_status as enum ('lead', 'onboarding', 'active', 'on_hold', 'archived');
create type project_type as enum ('website', 'ecommerce', 'brand_website', 'website_ecommerce', 'other');
create type project_status as enum ('planned', 'active', 'on_hold', 'completed');
create type project_stage as enum ('intake', 'discovery', 'strategy', 'design', 'development', 'review', 'launch');
create type task_status as enum ('todo', 'in_progress', 'blocked', 'in_review', 'awaiting_approval', 'done');
create type source_type as enum ('email', 'contact_form', 'meeting', 'phone', 'referral', 'document', 'manual', 'other');
create type field_confidence as enum ('confirmed', 'observed', 'proposed', 'unknown', 'superseded');
create type entity_type as enum ('client', 'project', 'task');

create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 120),
  contact_person text,
  email text,
  website text,
  status client_status not null default 'lead',
  project_type project_type,
  source_type source_type not null default 'manual',
  initial_notes text,
  source_received_at timestamptz not null default now(),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per value of a context field. The current value is the newest row
-- that is not superseded; older rows keep provenance and history.
create table client_context_values (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  field_key text not null check (field_key in ('goal', 'targetAudience', 'requirements', 'budget', 'deadline', 'platform')),
  value text,
  confidence field_confidence not null,
  source_type source_type,
  source_label text,
  source_url text,
  note text,
  created_at timestamptz not null default now(),
  superseded_at timestamptz
);
create index on client_context_values (client_id, field_key) where superseded_at is null;

create table client_context_items (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  kind text not null check (kind in ('assumption', 'question')),
  text text not null,
  confidence field_confidence not null default 'unknown',
  created_at timestamptz not null default now()
);

create table projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  name text not null,
  project_type project_type not null,
  status project_status not null default 'planned',
  stage project_stage not null default 'intake',
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on projects (client_id);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  title text not null,
  status task_status not null default 'todo',
  assigned_to text,
  blocked_reason text,
  due_date date,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on tasks (project_id);

create table activity_events (
  id uuid primary key default gen_random_uuid(),
  entity_type entity_type not null,
  entity_id uuid not null,
  event_type text not null,
  description text not null,
  actor text,
  timestamp timestamptz not null default now()
);
create index on activity_events (entity_type, entity_id, timestamp desc);

-- Row-level security: enabled with no policies, so nothing is readable through
-- the public anon key until policies for authenticated studio members are added.
alter table clients enable row level security;
alter table client_context_values enable row level security;
alter table client_context_items enable row level security;
alter table projects enable row level security;
alter table tasks enable row level security;
alter table activity_events enable row level security;
