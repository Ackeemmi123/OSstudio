/* ------------------------------------------------------------------------ */
/* Publishing: an approved spec version, approved by the client on its     */
/* review link, built as the real site and put on the client's domain.     */
/* The server publishes (it holds the hosting key) after checking the      */
/* person may, and records each publication here. A project's publications */
/* share one form key: the site's forms post to /api/site-forms/<key>,     */
/* and the server mails the client's contact. Messages are never stored;   */
/* only the time of each send, to limit how many an hour.                  */
/* ------------------------------------------------------------------------ */

create table public.site_publications (
  id uuid primary key,
  studio_id uuid not null,
  client_id uuid not null,
  project_id uuid not null,
  spec_id uuid not null references public.site_specs (id) on delete cascade,
  spec_version int not null check (spec_version between 1 and 10000),
  -- The build the client approved on the review link.
  approved_build_id uuid not null references public.site_builds (id),
  hosting_project text not null check (char_length(hosting_project) between 1 and 100),
  deployment_id text not null check (char_length(deployment_id) between 1 and 100),
  deployment_url text not null check (deployment_url ~ '^https://[^\s]+$'),
  domain text check (domain is null or domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'),
  form_key text not null check (form_key ~ '^[A-Za-z0-9_-]{24,64}$'),
  -- Where the site's forms are mailed: the client's contact when published.
  form_recipient text check (form_recipient is null or form_recipient ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  site_name text not null check (char_length(site_name) between 1 and 120),
  status text not null check (status in ('live', 'previous')),
  published_by jsonb not null check (jsonb_typeof(published_by) = 'object'),
  created_at timestamptz not null default now(),
  foreign key (client_id, studio_id) references public.clients (id, studio_id) on delete cascade,
  foreign key (project_id, studio_id) references public.projects (id, studio_id) on delete cascade
);
create index site_publications_project on public.site_publications (project_id, created_at desc);
create index site_publications_form_key on public.site_publications (form_key) where status = 'live';
create unique index site_publications_one_live on public.site_publications (project_id) where status = 'live';

create table public.site_form_sends (
  id bigint generated always as identity primary key,
  form_key text not null,
  created_at timestamptz not null default now()
);
create index site_form_sends_key on public.site_form_sends (form_key, created_at);

revoke all on public.site_publications, public.site_form_sends from public, anon, authenticated, service_role;
grant select on public.site_publications to authenticated;
alter table public.site_publications enable row level security;
alter table public.site_form_sends enable row level security;
create policy "members read" on public.site_publications for select to authenticated using (private.is_member(studio_id));

/* The server records a publication, which becomes the project's live one. Service role only. */
create function public.record_site_publication(p_publication jsonb) returns void
  language plpgsql security definer set search_path = '' as $$
declare
  v_project uuid := (p_publication ->> 'project_id')::uuid;
begin
  update public.site_publications set status = 'previous' where project_id = v_project and status = 'live';
  insert into public.site_publications (id, studio_id, client_id, project_id, spec_id, spec_version, approved_build_id,
    hosting_project, deployment_id, deployment_url, domain, form_key, form_recipient, site_name, status, published_by)
  values ((p_publication ->> 'id')::uuid, (p_publication ->> 'studio_id')::uuid, (p_publication ->> 'client_id')::uuid, v_project,
    (p_publication ->> 'spec_id')::uuid, (p_publication ->> 'spec_version')::int, (p_publication ->> 'approved_build_id')::uuid,
    p_publication ->> 'hosting_project', p_publication ->> 'deployment_id', p_publication ->> 'deployment_url',
    nullif(p_publication ->> 'domain', ''), p_publication ->> 'form_key', nullif(p_publication ->> 'form_recipient', ''),
    p_publication ->> 'site_name', 'live', p_publication -> 'published_by');
  insert into public.activity_events (id, studio_id, entity_type, entity_id, event_type, description, actor)
  values (gen_random_uuid(), (p_publication ->> 'studio_id')::uuid, 'client', (p_publication ->> 'client_id')::uuid, 'site_spec.published',
    left(format('Published version %s of the website%s', p_publication ->> 'spec_version',
      coalesce(' on ' || nullif(p_publication ->> 'domain', ''), '')), 500), '{"kind":"system"}'::jsonb);
end;
$$;

/* The server makes an earlier publication live again, after the hosting did. Service role only. */
create function public.restore_site_publication(p_publication uuid) returns void
  language plpgsql security definer set search_path = '' as $$
declare
  v_row public.site_publications;
begin
  select * into v_row from public.site_publications where id = p_publication;
  if v_row.id is null then
    raise exception 'This publication does not exist.' using errcode = 'P0002';
  end if;
  update public.site_publications set status = 'previous' where project_id = v_row.project_id and status = 'live';
  update public.site_publications set status = 'live' where id = p_publication;
  insert into public.activity_events (id, studio_id, entity_type, entity_id, event_type, description, actor)
  values (gen_random_uuid(), v_row.studio_id, 'client', v_row.client_id, 'site_spec.published',
    left(format('Restored version %s of the website', v_row.spec_version), 500), '{"kind":"system"}'::jsonb);
end;
$$;

/* Where a live site's form goes, and whether it may send now: at most 20 an hour. Service role only. */
create function public.take_form_send(p_key text) returns jsonb
  language plpgsql security definer set search_path = '' as $$
declare
  v_row public.site_publications;
begin
  select * into v_row from public.site_publications where form_key = p_key and status = 'live';
  if v_row.id is null then return null; end if;
  if (select count(*) from public.site_form_sends where form_key = p_key and created_at > now() - interval '1 hour') >= 20 then
    return jsonb_build_object('limited', true);
  end if;
  insert into public.site_form_sends (form_key) values (p_key);
  delete from public.site_form_sends where created_at < now() - interval '2 days';
  return jsonb_build_object('limited', false, 'recipient', v_row.form_recipient, 'siteName', v_row.site_name,
    'siteUrl', coalesce('https://' || v_row.domain, v_row.deployment_url), 'studioId', v_row.studio_id);
end;
$$;

revoke all on function public.record_site_publication(jsonb), public.restore_site_publication(uuid), public.take_form_send(text) from public, anon, authenticated;
grant execute on function public.record_site_publication(jsonb), public.restore_site_publication(uuid), public.take_form_send(text) to service_role;
