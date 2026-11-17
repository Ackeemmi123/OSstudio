/* ------------------------------------------------------------------------ */
/* Site builds: a website spec version built into a static site by a design  */
/* system, stored privately and shown through an unguessable link.           */
/*                                                                           */
/* Only this server (service role) creates a build or stores its files: the  */
/* build route checks the person's access first. Studio members can read     */
/* their builds; nobody can read the files except through the server.        */
/* ------------------------------------------------------------------------ */

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('site-builds', 'site-builds', false, 5242880,
    array['text/html', 'text/css', 'text/plain', 'image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
  on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table public.site_builds (
  id uuid primary key,
  studio_id uuid not null,
  client_id uuid not null,
  project_id uuid not null,
  spec_id uuid not null references public.site_specs (id) on delete cascade,
  spec_version int not null check (spec_version between 1 and 10000),
  design_system text not null check (design_system ~ '^[a-z][a-z0-9-]{0,40}@[0-9]+\.[0-9]+$'),
  -- The files live under this prefix in the site-builds bucket.
  storage_prefix text not null unique,
  file_count int not null check (file_count between 1 and 500),
  byte_count bigint not null check (byte_count between 1 and 104857600),
  -- What the checks found: [{ level: 'warning' | 'error', message }]. A build with errors is not stored.
  checks jsonb not null default '[]' check (jsonb_typeof(checks) = 'array'),
  -- The link: /s/<share_token>/. Long and random, never derived from an id.
  share_token text not null unique check (share_token ~ '^[A-Za-z0-9_-]{32,64}$'),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_by jsonb not null check (jsonb_typeof(created_by) = 'object'),
  created_at timestamptz not null default now(),
  foreign key (client_id, studio_id) references public.clients (id, studio_id) on delete cascade,
  foreign key (project_id, studio_id) references public.projects (id, studio_id) on delete cascade,
  constraint expires_after_creation check (expires_at > created_at)
);

create index site_builds_spec on public.site_builds (spec_id, created_at desc);

-- Every role starts with nothing (default privileges are revoked in 20261027000300 and
-- 20261028000100). People read; the server (service role) reads, creates and deletes.
revoke all on public.site_builds from public, anon, authenticated, service_role;
grant select on public.site_builds to authenticated;
grant select, insert, delete on public.site_builds to service_role;

alter table public.site_builds enable row level security;

-- Members read their studio's builds. Writes go through the server only.
create policy "members read" on public.site_builds for select to authenticated using (private.is_member(studio_id));

create trigger keep_studio before update on public.site_builds for each row execute function private.keep_studio();

/* Turning a link off. Writers can do it for their studio's builds; it only ever sets revoked_at. */
create function public.revoke_site_build(p_build uuid) returns timestamptz
  language plpgsql security definer set search_path = '' as $$
declare
  v_studio uuid;
  v_revoked timestamptz;
begin
  select studio_id, revoked_at into v_studio, v_revoked from public.site_builds where id = p_build;
  if v_studio is null or not private.can_write(v_studio) then
    raise exception 'This build does not exist, or you cannot change it.' using errcode = '42501';
  end if;
  if v_revoked is not null then return v_revoked; end if;
  update public.site_builds set revoked_at = now() where id = p_build returning revoked_at into v_revoked;
  return v_revoked;
end;
$$;

revoke all on function public.revoke_site_build(uuid) from public, anon;
grant execute on function public.revoke_site_build(uuid) to authenticated;
