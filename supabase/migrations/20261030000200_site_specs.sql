-- Studio OS: website specs (Website Factory WF-1).
--
-- 1. site_specs holds every version of a project's SiteSpec
--    (src/lib/site-spec): the platform-neutral description of the website a
--    renderer will later build. One row per version, numbered per project.
-- 2. guard_site_spec() keeps the history honest: only a draft's content
--    changes; status moves draft → in_review → approved (or back to draft),
--    and approved → superseded only when a newer version is approved;
--    approving is a person's act, in their own name, and only while every
--    brief value the spec uses is still confirmed as it was.
-- 3. apply_site_spec_changes() writes a version and its activity events in
--    one transaction, like apply_onboarding_changes().
-- 4. Anonymising a client deletes its specs (they hold client copy), and an
--    anonymised client cannot get new ones.
--
-- Nothing is loaded into load_studio(): the app reads a project's specs on
-- demand. Agents and the service role get no access.

/* ------------------------------------------------------------------------ */
/* Table                                                                     */
/* ------------------------------------------------------------------------ */

create table public.site_specs (
  id uuid primary key,
  studio_id uuid not null,
  client_id uuid not null,
  project_id uuid not null,
  version int not null check (version between 1 and 10000),
  -- The version this one started from (the approved one, when there was one).
  based_on uuid references public.site_specs (id),
  status text not null default 'draft' check (status in ('draft', 'in_review', 'approved', 'superseded')),
  spec jsonb not null check (jsonb_typeof(spec) = 'object' and spec ->> 'specVersion' = '1' and octet_length(spec::text) <= 524288),
  created_by jsonb not null check (jsonb_typeof(created_by) = 'object'),
  submitted_by jsonb,
  submitted_at timestamptz,
  approved_by jsonb,
  approved_at timestamptz,
  -- Why a reviewer sent the version back.
  review_note text check (char_length(review_note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (client_id, studio_id) references public.clients (id, studio_id) on delete cascade,
  foreign key (project_id, studio_id) references public.projects (id, studio_id) on delete cascade,
  unique (project_id, version),
  constraint approval_recorded check ((status in ('approved', 'superseded')) = (approved_at is not null and approved_by is not null)),
  constraint submission_recorded check ((status = 'in_review') = (submitted_at is not null)
                                        or status in ('approved', 'superseded'))
);
-- One open version (draft or waiting for approval) and one approved version per project.
create unique index site_specs_open_idx on public.site_specs (project_id) where status in ('draft', 'in_review');
create unique index site_specs_approved_idx on public.site_specs (project_id) where status = 'approved';
create index site_specs_studio_idx on public.site_specs (studio_id);
create index site_specs_client_idx on public.site_specs (client_id);

alter table public.site_specs enable row level security;
-- People only, through row-level security. Agents and the service role get nothing (yet).
revoke all on public.site_specs from public, anon, service_role;
grant select, insert, update on public.site_specs to authenticated;
create policy "members read" on public.site_specs for select to authenticated using (private.is_member(studio_id));
create policy "writers insert" on public.site_specs for insert to authenticated with check (private.can_write(studio_id));
create policy "writers update" on public.site_specs for update to authenticated
  using (private.can_write(studio_id)) with check (private.can_write(studio_id));

create trigger keep_studio before update on public.site_specs for each row execute function private.keep_studio();
create trigger stamp_times before insert or update on public.site_specs for each row execute function private.stamp_times();
create trigger refuse_anonymised_client before insert or update on public.site_specs
  for each row execute function private.refuse_anonymised_client();

/* ------------------------------------------------------------------------ */
/* Rules                                                                     */
/* ------------------------------------------------------------------------ */

-- Every brief value the spec uses ({"kind": "brief", "field", "confirmedAt"}
-- anywhere in it) is confirmed now, with the same confirmation time.
create function private.site_spec_brief_confirmed(p_spec jsonb, p_client uuid) returns boolean
  language sql stable set search_path = ''
  as $$
    select not exists (
      select 1 from jsonb_path_query(p_spec, 'lax $.**') s
      where jsonb_typeof(s) = 'object' and s ->> 'kind' = 'brief' and s ? 'field'
        and not exists (
          select 1 from public.client_context_fields f
          where f.client_id = p_client and f.field_key = s ->> 'field' and f.confidence = 'confirmed'
            and f.confirmed_at = (s ->> 'confirmedAt')::timestamptz))
  $$;
grant execute on function private.site_spec_brief_confirmed(jsonb, uuid) to authenticated;

create function private.guard_site_spec() returns trigger
  language plpgsql set search_path = ''
  as $$
  declare
    v_type public.project_type;
    v_next int;
  begin
    if tg_op = 'DELETE' then
      -- Only anonymising the client removes specs.
      if private.flagged_client('anonymising_client') = old.client_id then
        return old;
      end if;
      raise exception 'Website spec versions are kept.' using errcode = '42501';
    end if;

    if tg_op = 'INSERT' then
      if new.status <> 'draft' or new.submitted_by is not null or new.approved_by is not null or new.review_note is not null then
        raise exception 'A website spec version starts as a draft.' using errcode = '42501';
      end if;
      if auth.uid() is null or not private.acts_as_caller(new.created_by) then
        raise exception 'Website specs are started by a person, in their own name.' using errcode = '42501';
      end if;
      select project_type into v_type from public.projects
        where id = new.project_id and studio_id = new.studio_id and client_id = new.client_id;
      if not found then
        raise exception 'The project does not belong to this client.' using errcode = '23503';
      end if;
      if v_type = 'other' then
        raise exception 'Only website projects have a website spec.' using errcode = '42501';
      end if;
      select coalesce(max(version), 0) + 1 into v_next from public.site_specs where project_id = new.project_id;
      if new.version <> v_next then
        raise exception 'Someone else changed this in the meantime. Reload to see the latest version.' using errcode = 'SO409';
      end if;
      if new.based_on is not null then
        perform 1 from public.site_specs where id = new.based_on and project_id = new.project_id;
        if not found then
          raise exception 'A version can only start from a version of the same project.' using errcode = '23503';
        end if;
      end if;
      new.submitted_at := null;
      new.approved_at := null;
      return new;
    end if;

    -- UPDATE
    if new.client_id <> old.client_id or new.project_id <> old.project_id or new.version <> old.version
       or new.based_on is distinct from old.based_on or new.created_by <> old.created_by then
      raise exception 'Website spec history cannot be rewritten.' using errcode = '42501';
    end if;
    if auth.uid() is null then
      raise exception 'Only a person can change a website spec.' using errcode = '42501';
    end if;

    if new.status = old.status then
      if old.status <> 'draft' then
        raise exception 'Only a draft can be edited. Start a new version instead.' using errcode = '42501';
      end if;
      if new.submitted_by is distinct from old.submitted_by or new.approved_by is distinct from old.approved_by
         or new.review_note is distinct from old.review_note then
        raise exception 'Editing a draft cannot change its review.' using errcode = '42501';
      end if;
      new.submitted_at := old.submitted_at;
      new.approved_at := old.approved_at;
      return new;
    end if;

    if new.spec is distinct from old.spec then
      raise exception 'The content can only change while the version is a draft.' using errcode = '42501';
    end if;

    if old.status = 'draft' and new.status = 'in_review' then
      if not private.acts_as_caller(new.submitted_by) or new.approved_by is not null then
        raise exception 'Submit in your own name.' using errcode = '42501';
      end if;
      new.submitted_at := now();
      new.review_note := null;
    elsif old.status = 'in_review' and new.status = 'draft' then
      if new.submitted_by is not null or new.approved_by is not null then
        raise exception 'Sending a version back clears its submission.' using errcode = '42501';
      end if;
      new.submitted_at := null;
    elsif old.status = 'in_review' and new.status = 'approved' then
      if not private.acts_as_caller(new.approved_by) then
        raise exception 'Website specs are approved by a person, in their own name.' using errcode = '42501';
      end if;
      if new.submitted_by is distinct from old.submitted_by or new.review_note is distinct from old.review_note then
        raise exception 'Approving cannot change the submission.' using errcode = '42501';
      end if;
      if not private.site_spec_brief_confirmed(new.spec, new.client_id) then
        raise exception 'A value from the brief is no longer confirmed as it was. Check the spec again.' using errcode = '42501';
      end if;
      new.submitted_at := old.submitted_at;
      new.approved_at := now();
    elsif old.status = 'approved' and new.status = 'superseded' then
      if coalesce(current_setting('studio_os.superseding_spec', true), '') <> old.id::text then
        raise exception 'A version is replaced only by approving a newer one.' using errcode = '42501';
      end if;
      if new.approved_by is distinct from old.approved_by or new.submitted_by is distinct from old.submitted_by
         or new.review_note is distinct from old.review_note then
        raise exception 'Website spec history cannot be rewritten.' using errcode = '42501';
      end if;
      new.submitted_at := old.submitted_at;
      new.approved_at := old.approved_at;
    else
      raise exception 'A website spec cannot go from % to %.', old.status, new.status using errcode = '42501';
    end if;
    return new;
  end $$;

create trigger guard_site_spec before insert or update or delete on public.site_specs
  for each row execute function private.guard_site_spec();

/* ------------------------------------------------------------------------ */
/* Writing                                                                   */
/* ------------------------------------------------------------------------ */

-- Writes the activity events through apply_changes() (same checks, same
-- transaction), then inserts or updates the version. Updates carry the
-- updated_at the browser last saw. p_supersede ({"id", "expected"}) marks the
-- project's approved version as superseded, and is accepted only together
-- with approving a newer version of the same project.
create function public.apply_site_spec_changes(p_studio uuid, p_changes jsonb, p_spec jsonb, p_supersede jsonb default null)
  returns void
  language plpgsql set search_path = ''
  as $$
  declare
    r jsonb := p_spec -> 'row';
    v_target public.site_specs;
    v_old public.site_specs;
    n int;
  begin
    if p_supersede is not null and p_supersede <> 'null'::jsonb then
      select * into v_target from public.site_specs where id = (r ->> 'id')::uuid and studio_id = p_studio;
      select * into v_old from public.site_specs where id = (p_supersede ->> 'id')::uuid and studio_id = p_studio;
      if p_spec ->> 'op' <> 'update' or r ->> 'status' <> 'approved' or v_target.id is null or v_old.id is null
         or v_old.project_id <> v_target.project_id or v_old.version >= v_target.version then
        raise exception 'A version is replaced only by approving a newer one.' using errcode = '42501';
      end if;
      perform set_config('studio_os.superseding_spec', v_old.id::text, true);
      update public.site_specs set status = 'superseded'
        where id = v_old.id and studio_id = p_studio and updated_at = (p_supersede ->> 'expected')::timestamptz;
      get diagnostics n = row_count;
      perform set_config('studio_os.superseding_spec', '', true);
      if n = 0 then perform private.no_row('public.site_specs', format('id = %L', v_old.id), p_studio); end if;
    end if;

    perform public.apply_changes(p_studio, p_changes);

    if p_spec ->> 'op' = 'insert' then
      insert into public.site_specs
        select * from jsonb_populate_record(null::public.site_specs, r || jsonb_build_object('studio_id', p_studio));
    else
      update public.site_specs t set spec = x.spec, status = x.status, submitted_by = x.submitted_by,
          approved_by = x.approved_by, review_note = x.review_note
        from jsonb_populate_record(null::public.site_specs, r) x
        where t.id = x.id and t.studio_id = p_studio and t.updated_at = (p_spec ->> 'expected')::timestamptz;
      get diagnostics n = row_count;
      if n = 0 then perform private.no_row('public.site_specs', format('id = %L', r ->> 'id'), p_studio); end if;
    end if;
  end $$;

revoke execute on function public.apply_site_spec_changes(uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.apply_site_spec_changes(uuid, jsonb, jsonb, jsonb) to authenticated;

/* ------------------------------------------------------------------------ */
/* Retention                                                                 */
/* ------------------------------------------------------------------------ */

-- As in 20261029000200_client_retention.sql, plus: the client's website
-- specs are deleted with its brief and source material.
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
    delete from public.site_specs where client_id = p_id;

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
