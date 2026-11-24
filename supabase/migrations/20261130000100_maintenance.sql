/* ------------------------------------------------------------------------ */
/* Maintenance: a daily health check of every live site, and a monthly     */
/* report a studio can send each client. Form messages are still never     */
/* stored; only how many came each month. The report is off until a member */
/* turns it on for a site and says who receives it.                        */
/* ------------------------------------------------------------------------ */

/* How many form messages a live site's forms passed on, per month. Counts only. */
create table public.site_form_monthly (
  form_key text not null,
  month date not null,
  count int not null default 0,
  primary key (form_key, month)
);
revoke all on public.site_form_monthly from public, anon, authenticated, service_role;
alter table public.site_form_monthly enable row level security;

/* As in 20261122000100_site_publications.sql, and counting each send for the month. */
create or replace function public.take_form_send(p_key text) returns jsonb
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
  insert into public.site_form_monthly (form_key, month, count) values (p_key, date_trunc('month', now() at time zone 'Europe/Helsinki')::date, 1)
    on conflict (form_key, month) do update set count = public.site_form_monthly.count + 1;
  return jsonb_build_object('limited', false, 'recipient', v_row.form_recipient, 'siteName', v_row.site_name,
    'siteUrl', coalesce('https://' || v_row.domain, v_row.deployment_url), 'studioId', v_row.studio_id);
end;
$$;

/* A site's monthly report: on or off, and to whom. One row per website project. */
create table public.site_maintenance (
  project_id uuid primary key,
  studio_id uuid not null,
  client_id uuid not null,
  report_enabled boolean not null default false,
  report_to text check (report_to is null or report_to ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  updated_at timestamptz not null default now(),
  foreign key (client_id, studio_id) references public.clients (id, studio_id) on delete cascade,
  foreign key (project_id, studio_id) references public.projects (id, studio_id) on delete cascade
);
revoke all on public.site_maintenance from public, anon, authenticated, service_role;
grant select on public.site_maintenance to authenticated;
alter table public.site_maintenance enable row level security;
create policy "members read" on public.site_maintenance for select to authenticated using (private.is_member(studio_id));

/* A writer turns a site's monthly report on or off and says who gets it. */
create function public.set_site_maintenance(p_project uuid, p_enabled boolean, p_to text) returns void
  language plpgsql security definer set search_path = '' as $$
declare
  v_project public.projects;
  v_to text := nullif(btrim(coalesce(p_to, '')), '');
begin
  select * into v_project from public.projects where id = p_project;
  if v_project.id is null or not private.can_write(v_project.studio_id) then
    raise exception 'This project does not exist, or you cannot change it.' using errcode = '42501';
  end if;
  if p_enabled and v_to is null then
    raise exception 'Say who receives the report.' using errcode = '22023';
  end if;
  insert into public.site_maintenance (project_id, studio_id, client_id, report_enabled, report_to)
  values (p_project, v_project.studio_id, v_project.client_id, coalesce(p_enabled, false), v_to)
  on conflict (project_id) do update set report_enabled = excluded.report_enabled, report_to = excluded.report_to, updated_at = now();
end;
$$;

/* One health check of a live site: whether it answered, and its certificates. Kept for 120 days. */
create table public.site_health_checks (
  id bigint generated always as identity primary key,
  studio_id uuid not null,
  project_id uuid not null,
  checked_at timestamptz not null default now(),
  ok boolean not null,
  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object'),
  foreign key (project_id, studio_id) references public.projects (id, studio_id) on delete cascade
);
create index site_health_checks_project on public.site_health_checks (project_id, checked_at desc);
revoke all on public.site_health_checks from public, anon, authenticated, service_role;
grant select on public.site_health_checks to authenticated;
alter table public.site_health_checks enable row level security;
create policy "members read" on public.site_health_checks for select to authenticated using (private.is_member(studio_id));

/* Every live site, with what the health check and the report need. Service role only. */
create function public.live_sites() returns jsonb
  language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'studioId', p.studio_id, 'clientId', p.client_id, 'projectId', p.project_id, 'client', c.name,
    'domain', p.domain, 'url', coalesce('https://' || p.domain, p.deployment_url), 'formKey', p.form_key,
    'siteName', p.site_name, 'version', p.spec_version, 'publishedAt', p.created_at,
    'locale', coalesce((select s.spec -> 'locales' ->> 'default' from public.site_specs s where s.id = p.spec_id), 'sv'),
    'studio', coalesce(nullif(st.brand ->> 'name', ''), st.name), 'studioEmail', nullif(st.brand ->> 'email', ''), 'color', nullif(st.brand ->> 'color', ''),
    'report', case when m.report_enabled then m.report_to else null end)), '[]'::jsonb)
  from public.site_publications p
  join public.clients c on c.id = p.client_id and c.anonymised_at is null
  join public.studios st on st.id = p.studio_id
  left join public.site_maintenance m on m.project_id = p.project_id
  where p.status = 'live';
$$;

/* The server records a check; old checks go. Service role only. */
create function public.record_site_health(p_check jsonb) returns void
  language plpgsql security definer set search_path = '' as $$
begin
  insert into public.site_health_checks (studio_id, project_id, ok, detail)
  values ((p_check ->> 'studioId')::uuid, (p_check ->> 'projectId')::uuid, (p_check ->> 'ok')::boolean, coalesce(p_check -> 'detail', '{}'::jsonb));
  delete from public.site_health_checks where checked_at < now() - interval '120 days';
end;
$$;

/* What a month held for a site: health checks, form messages (all its keys), publications. Service role only. */
create function public.site_month_facts(p_project uuid, p_month date) returns jsonb
  language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'checks', (select count(*) from public.site_health_checks h where h.project_id = p_project
      and h.checked_at >= p_month and h.checked_at < p_month + interval '1 month'),
    'checksOk', (select count(*) from public.site_health_checks h where h.project_id = p_project and h.ok
      and h.checked_at >= p_month and h.checked_at < p_month + interval '1 month'),
    'forms', coalesce((select sum(f.count) from public.site_form_monthly f
      where f.month = p_month and f.form_key in (select distinct p.form_key from public.site_publications p where p.project_id = p_project)), 0),
    'formsBefore', coalesce((select sum(f.count) from public.site_form_monthly f
      where f.month = (p_month - interval '1 month')::date and f.form_key in (select distinct p.form_key from public.site_publications p where p.project_id = p_project)), 0),
    'published', coalesce((select jsonb_agg(jsonb_build_object('version', p.spec_version, 'at', p.created_at) order by p.created_at)
      from public.site_publications p where p.project_id = p_project and p.created_at >= p_month and p.created_at < p_month + interval '1 month'), '[]'::jsonb));
$$;

/* Who to tell when a site is down. Service role only. */
create function public.studio_members_to_alert(p_studio uuid) returns jsonb
  language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('userId', m.user_id, 'email', u.email)), '[]'::jsonb)
  from public.studio_members m join auth.users u on u.id = m.user_id
  left join public.member_email_settings e on e.studio_id = m.studio_id and e.user_id = m.user_id
  where m.studio_id = p_studio and coalesce(e.client_events, true) and u.email is not null;
$$;

/* A member reads a site's checks through the policy; this gives a writer the month's facts for a preview. */
create function public.site_month_facts_for(p_project uuid, p_month date) returns jsonb
  language plpgsql stable security definer set search_path = '' as $$
declare
  v_studio uuid;
begin
  select studio_id into v_studio from public.projects where id = p_project;
  if v_studio is null or not private.is_member(v_studio) then
    raise exception 'This project does not exist, or you cannot see it.' using errcode = '42501';
  end if;
  return public.site_month_facts(p_project, p_month);
end;
$$;

/* Which monthly reports went out, so a month is never sent twice. */
create table public.site_reports (
  project_id uuid not null,
  month date not null,
  sent_at timestamptz not null default now(),
  primary key (project_id, month)
);
revoke all on public.site_reports from public, anon, authenticated, service_role;
alter table public.site_reports enable row level security;

/* Claims a month's report before it is sent: true the first time. Service role only. */
create function public.claim_site_report(p_project uuid, p_month date) returns boolean
  language plpgsql security definer set search_path = '' as $$
declare
  v_claimed int;
begin
  insert into public.site_reports (project_id, month) values (p_project, p_month) on conflict do nothing;
  get diagnostics v_claimed = row_count;
  return v_claimed = 1;
end;
$$;
revoke all on function public.claim_site_report(uuid, date) from public, anon, authenticated;
grant execute on function public.claim_site_report(uuid, date) to service_role;

revoke all on function public.set_site_maintenance(uuid, boolean, text), public.live_sites(), public.record_site_health(jsonb),
  public.site_month_facts(uuid, date), public.studio_members_to_alert(uuid), public.site_month_facts_for(uuid, date) from public, anon, authenticated;
grant execute on function public.set_site_maintenance(uuid, boolean, text), public.site_month_facts_for(uuid, date) to authenticated;
grant execute on function public.live_sites(), public.record_site_health(jsonb), public.site_month_facts(uuid, date), public.studio_members_to_alert(uuid) to service_role;

-- As in 20261129000100_client_portal.sql, plus the monthly report settings (they hold who receives it).
create or replace function private.anonymise_client(p_id uuid, p_force boolean default false) returns void
  language plpgsql set search_path = ''
  as $$
  declare v public.clients;
  begin
    select * into v from public.clients where id = p_id for update;
    if not found then
      raise exception 'No such client.' using errcode = 'SO404';
    end if;
    if v.anonymised_at is not null then
      raise exception 'This client is already anonymised.' using errcode = 'SO409';
    end if;
    if v.retention_hold_reason is not null then
      raise exception 'This client is on a retention hold.' using errcode = '42501';
    end if;
    if not p_force and private.client_retention_ends(v) > now() then
      raise exception 'This client is still within its retention period.' using errcode = '42501';
    end if;

    perform set_config('studio_os.anonymising_client', p_id::text, true);

    -- Inquiries approved into the client, and repeats merged into them.
    perform set_config('studio_os.anonymising_inquiry', 'on', true);
    update public.inquiries set
        contact_name = null, email = null, company = null, website = null, message = null, content_hash = null,
        budget_amount_eur = null, desired_date = null, privacy_notice_version = null, decision_reason = null,
        anonymised_with_client = true
      where client_id = p_id and anonymised_at is null;
    perform set_config('studio_os.anonymising_inquiry', 'off', true);

    -- Brief values and their history, assumptions and questions, source
    -- material, onboarding progress, and the agent's proposals (they quote sources).
    delete from public.agent_proposals where client_id = p_id;
    delete from public.client_context_fields where client_id = p_id;
    delete from public.client_context_items where client_id = p_id;
    delete from public.client_sources where client_id = p_id;
    delete from public.client_onboardings where client_id = p_id;
    -- Next steps name the client's people ("Ring Mikko").
    delete from public.client_next_steps where client_id = p_id;
    -- The portal link and what it recorded of answered questions.
    delete from public.client_portals where client_id = p_id;
    delete from public.site_maintenance where client_id = p_id;
    -- First, while the built sites still exist (they go with the specs, below):
    -- the client's own files, the documents its site offered and every built
    -- site are queued for the nightly purge (Storage refuses deletes from SQL),
    -- and their records removed. Comments and approvals from the review link
    -- name the client's people, so they go too.
    insert into public.storage_purge_queue (bucket, path, is_prefix)
      select 'client-materials', storage_path, false from public.client_materials where client_id = p_id
      union all
      select 'site-documents', storage_path, false from public.site_documents where client_id = p_id
      union all
      select 'site-builds', storage_prefix, true from public.site_builds where client_id = p_id;
    delete from public.client_materials where client_id = p_id;
    delete from public.site_documents where client_id = p_id;
    delete from public.site_review_comments where client_id = p_id;
    delete from public.site_approvals where client_id = p_id;
    delete from public.site_builds where client_id = p_id;

    -- Publications stay as a record of what was put on the hosting (a live
    -- site must be taken down by hand), but no longer say where forms go or
    -- what the site was called; its forms stop sending.
    update public.site_publications set form_recipient = null, site_name = 'Former client' where client_id = p_id;

    delete from public.site_specs where client_id = p_id;
    update public.site_assets set status = 'deleted' where client_id = p_id and status <> 'deleted';


    -- Agent runs keep their agent, status and timing only.
    update public.agent_runs set "trigger" = '{}', inputs = '[]', outputs = '[]', result = null, blocker = null, error = null
      where client_id = p_id;

    -- Projects and tasks keep their status, stage and dates.
    update public.tasks t set title = 'Task', blocked_reason = null
      from public.projects p where p.id = t.project_id and p.client_id = p_id;
    update public.projects set name = 'Former project' where client_id = p_id;

    -- Activity keeps its type, time and who on the team did it.
    update public.activity_events set description = 'Details removed when the client was anonymised.'
      where (entity_type = 'client' and entity_id = p_id)
         or (entity_type = 'project' and entity_id in (select id from public.projects where client_id = p_id))
         or (entity_type = 'task' and entity_id in (
               select t.id from public.tasks t join public.projects p on p.id = t.project_id where p.client_id = p_id));

    update public.client_retention_holds set reason = null where client_id = p_id;

    update public.clients set name = 'Former client', contact_person = null, email = null, website = null,
        initial_notes = null, status = 'archived'
      where id = p_id;

    perform set_config('studio_os.anonymising_client', '', true);
  end $$;

revoke all on function private.anonymise_client(uuid, boolean) from public, anon, authenticated, service_role;
