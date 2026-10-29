-- Studio OS: retention for client records (working decisions, 28 Oct 2026).
--
-- Every client has a retention date, worked out from its own history:
--   * never a customer (never reached Active): 12 months after the last
--     client activity;
--   * a customer (reached Active at least once): 3 years after the
--     relationship ended, which is when it was archived or 12 months after
--     the last client activity, whichever comes first. The 3 years are
--     provisional until an adviser has reviewed them.
-- After that date the client is anonymised: the row stays as a minimal
-- record ("Former client", status, dates), and everything that identifies or
-- describes the client or its people is deleted or emptied.
--
-- Client activity is a change a signed-in person made to the client, its
-- projects or its tasks, as recorded in the activity log (actor kind
-- "human"). Agent runs, the system, retention jobs and retention holds never
-- move the date. Each event counts at the earlier of when it happened and
-- when the database stored it, so a device clock or an import cannot push
-- the date forward. With no activity at all, the client's creation counts.
--
-- An owner can place a hold with a written reason (an open dispute, a legal
-- requirement). A held client is never anonymised. Every hold and release is
-- logged in client_retention_holds. A release does not restart the clock;
-- if the date has passed, the client is anonymised 30 days after the
-- release at the earliest, so the team gets the usual warning first.
--
--   private.client_last_activity(id)      the last client activity
--   private.client_retention_ends(client) the retention date, null if held
--                                         or already anonymised
--   private.anonymise_client(id, force)   anonymises one client (force: an
--                                         erasure request before the date)
--   private.run_client_retention(dry_run) anonymises every client past its
--                                         date (or only lists them), and
--                                         records the run
--   public.set_client_retention_hold()    an owner places or releases a hold
--
-- The private functions are for the database owner only, like the inquiry
-- retention. pg_cron runs the retention daily as the owner.

/* ------------------------------------------------------------------------ */
/* Columns                                                                   */
/* ------------------------------------------------------------------------ */

-- Set only by the database (guard_client below); whatever the app sends for
-- them is ignored.
alter table public.clients
  add column became_customer_at timestamptz,
  add column archived_at timestamptz,
  add column anonymised_at timestamptz,
  add column retention_hold_reason text check (char_length(btrim(retention_hold_reason)) between 1 and 500),
  add column retention_hold_by jsonb check (public.is_valid_actor(retention_hold_by)),
  add column retention_held_at timestamptz,
  add constraint hold_is_complete check (
    (retention_hold_reason is null) = (retention_hold_by is null) and (retention_hold_reason is null) = (retention_held_at is null)),
  add constraint no_hold_once_anonymised check (anonymised_at is null or retention_hold_reason is null),
  add constraint empty_once_anonymised check (
    anonymised_at is null
    or (name = 'Former client' and contact_person is null and email is null and website is null and initial_notes is null));

-- Inquiries approved into a client, and repeats merged into them, are
-- anonymised with that client.
alter table public.inquiries
  add column anonymised_with_client boolean not null default false,
  drop constraint only_unconverted_anonymised,
  add constraint only_unconverted_anonymised check (
    anonymised_at is null or status in ('new', 'rejected', 'spam') or (status = 'merged' and client_id is null)
    or (anonymised_with_client and client_id is not null)),
  add constraint with_client_only_anonymised check (not anonymised_with_client or anonymised_at is not null);

-- Existing clients: the dates from the activity log where it has them.
alter table public.clients disable trigger stamp_times;
update public.clients c set
    became_customer_at = case when c.status in ('active', 'on_hold') or e.first_active is not null
                              then coalesce(e.first_active, c.created_at) end,
    archived_at = case when c.status = 'archived' then coalesce(e.last_archived, c.updated_at) end
  from (select c2.id,
               (select min(least(a."timestamp", a.recorded_at)) from public.activity_events a
                 where a.entity_type = 'client' and a.entity_id = c2.id and a.event_type = 'client.status_changed'
                   and a.description = 'Status changed to Active') as first_active,
               (select max(least(a."timestamp", a.recorded_at)) from public.activity_events a
                 where a.entity_type = 'client' and a.entity_id = c2.id and a.event_type = 'client.status_changed'
                   and a.description = 'Status changed to Archived') as last_archived
          from public.clients c2) e
  where e.id = c.id;
alter table public.clients enable trigger stamp_times;

alter table public.clients add constraint archived_when_archived check ((archived_at is not null) = (status = 'archived'));

/* ------------------------------------------------------------------------ */
/* Flags                                                                     */
/* ------------------------------------------------------------------------ */

-- Set (to the client's id) only inside private.anonymise_client() and
-- public.set_client_retention_hold(), for their own transaction. The guards
-- run as whoever writes, so they read the settings directly.
create function private.flagged_client(p_flag text) returns uuid
  language sql stable set search_path = ''
  as $$ select nullif(current_setting('studio_os.' || p_flag, true), '')::uuid $$;
revoke all on function private.flagged_client(text) from public, anon;
grant execute on function private.flagged_client(text) to authenticated, service_role;

-- Whether a client was anonymised. security definer because the agent runner
-- may not read clients beyond id and studio.
create function private.client_is_anonymised(p_client uuid) returns boolean
  language sql stable security definer set search_path = ''
  as $$ select coalesce((select anonymised_at is not null from public.clients where id = p_client), false) $$;

create function private.entity_client(p_type public.entity_type, p_id uuid) returns uuid
  language sql stable security definer set search_path = ''
  as $$
    select case p_type
      when 'client' then p_id
      when 'project' then (select client_id from public.projects where id = p_id)
      else (select p.client_id from public.tasks t join public.projects p on p.id = t.project_id where t.id = p_id)
    end
  $$;
revoke all on function private.client_is_anonymised(uuid), private.entity_client(public.entity_type, uuid) from public, anon;
grant execute on function private.client_is_anonymised(uuid), private.entity_client(public.entity_type, uuid)
  to authenticated, service_role;

/* ------------------------------------------------------------------------ */
/* Guards                                                                    */
/* ------------------------------------------------------------------------ */

-- The retention columns follow the client's status, holds and anonymisation,
-- never what the app sends. An anonymised client can no longer be changed.
create function private.guard_client() returns trigger
  language plpgsql set search_path = ''
  as $$
  declare
    v_anonymise text[] := array['name', 'contact_person', 'email', 'website', 'initial_notes', 'status',
                                'archived_at', 'anonymised_at', 'updated_at'];
    v_hold text[] := array['retention_hold_reason', 'retention_hold_by', 'retention_held_at', 'updated_at'];
  begin
    if tg_op = 'INSERT' then
      new.became_customer_at := case when new.status = 'active'
                                     then case when private.importing() then coalesce(new.created_at, now()) else now() end end;
      new.archived_at := case when new.status = 'archived'
                              then case when private.importing() then coalesce(new.updated_at, now()) else now() end end;
      new.anonymised_at := null;
      new.retention_hold_reason := null;
      new.retention_hold_by := null;
      new.retention_held_at := null;
      return new;
    end if;

    if private.flagged_client('anonymising_client') = old.id then
      if old.anonymised_at is not null then
        raise exception 'This client is already anonymised.' using errcode = 'SO409';
      end if;
      if (to_jsonb(new) - v_anonymise) <> (to_jsonb(old) - v_anonymise) then
        raise exception 'Anonymising only clears the client''s details.' using errcode = '42501';
      end if;
      new.anonymised_at := now();
      new.archived_at := case when new.status = 'archived' then coalesce(old.archived_at, now()) end;
      return new;
    end if;

    if old.anonymised_at is not null then
      raise exception 'This client was anonymised and can no longer be changed.' using errcode = 'SO409';
    end if;

    if private.flagged_client('setting_retention_hold') = old.id then
      if (to_jsonb(new) - v_hold) <> (to_jsonb(old) - v_hold) then
        raise exception 'A retention hold changes nothing else.' using errcode = '42501';
      end if;
      return new;
    end if;

    new.retention_hold_reason := old.retention_hold_reason;
    new.retention_hold_by := old.retention_hold_by;
    new.retention_held_at := old.retention_held_at;
    new.anonymised_at := null;
    new.became_customer_at := coalesce(old.became_customer_at, case when new.status = 'active' then now() end);
    new.archived_at := case when new.status = 'archived'
                            then case when old.status = 'archived' then coalesce(old.archived_at, now()) else now() end end;
    return new;
  end $$;

create trigger guard_client before insert or update on public.clients for each row execute function private.guard_client();

-- Nothing new is added to an anonymised client, and nothing it kept is
-- changed, except by the anonymisation itself.
create function private.refuse_anonymised_client() returns trigger
  language plpgsql set search_path = ''
  as $$
  declare v_client uuid;
  begin
    if tg_table_name = 'tasks' then
      v_client := private.entity_client('project', new.project_id);
    else
      v_client := new.client_id;
    end if;
    if v_client is null or private.flagged_client('anonymising_client') = v_client then
      return new;
    end if;
    if private.client_is_anonymised(v_client) then
      raise exception 'This client was anonymised and can no longer be changed.' using errcode = 'SO409';
    end if;
    return new;
  end $$;

do $$
declare t text;
begin
  foreach t in array array['client_context_fields', 'client_context_items', 'client_sources', 'client_onboardings',
                           'projects', 'tasks', 'agent_runs', 'agent_proposals', 'inquiries'] loop
    execute format('create trigger refuse_anonymised_client before insert or update on public.%I
                      for each row execute function private.refuse_anonymised_client()', t);
  end loop;
end $$;

-- Activity: as before (append-only, in your own name), plus: no new events
-- about an anonymised client, and anonymising a client may empty the
-- summaries of its events, changing nothing else.
create or replace function private.guard_activity() returns trigger
  language plpgsql set search_path = ''
  as $$
  declare v_client uuid;
  begin
    if tg_op = 'UPDATE' then
      v_client := private.flagged_client('anonymising_client');
      if v_client is not null and private.entity_client(old.entity_type, old.entity_id) = v_client
         and (to_jsonb(new) - 'description') = (to_jsonb(old) - 'description') then
        return new;
      end if;
    end if;
    if tg_op <> 'INSERT' then
      raise exception 'Activity history is append-only.' using errcode = '42501';
    end if;

    if private.importing() then
      if new.import_batch_id is null or (new.actor is not null and coalesce(new.actor ->> 'imported', '') <> 'true') then
        raise exception 'Imported activity must be marked as imported.' using errcode = '42501';
      end if;
    elsif new.import_batch_id is not null then
      raise exception 'Only the import can record imported activity.' using errcode = '42501';
    elsif auth.uid() is not null then
      if not private.acts_as_caller(new.actor) then
        raise exception 'Activity must be recorded in your own name.' using errcode = '42501';
      end if;
      new."timestamp" := now();
    else
      if coalesce(new.actor ->> 'kind', '') = 'human' then
        raise exception 'Automated activity cannot be recorded as a person.' using errcode = '42501';
      end if;
      new."timestamp" := now();
    end if;

    -- The event must be about a record in the same studio.
    if new.entity_type = 'client' then
      perform 1 from public.clients where id = new.entity_id and studio_id = new.studio_id;
    elsif new.entity_type = 'project' then
      perform 1 from public.projects where id = new.entity_id and studio_id = new.studio_id;
    else
      perform 1 from public.tasks where id = new.entity_id and studio_id = new.studio_id;
    end if;
    if not found then
      raise exception 'Activity must refer to a record in the same studio.' using errcode = '23503';
    end if;
    if private.client_is_anonymised(private.entity_client(new.entity_type, new.entity_id)) then
      raise exception 'This client was anonymised and can no longer be changed.' using errcode = 'SO409';
    end if;

    new.recorded_at := now();
    return new;
  end $$;

-- Inquiries: as in 20261029000100, plus: anonymising a client anonymises the
-- inquiries approved into it and the repeats merged into them, marked with
-- anonymised_with_client.
create or replace function private.guard_inquiry() returns trigger
  language plpgsql set search_path = ''
  as $$
  declare
    -- email_normalized is generated: a before trigger sees it as null in the new row. It follows email.
    v_decision text[] := array['status', 'client_id', 'created_client', 'decided_by', 'decided_at', 'decision_reason', 'email_normalized'];
    v_personal text[] := array['contact_name', 'email', 'company', 'website', 'message', 'content_hash', 'budget_amount_eur',
                               'desired_date', 'privacy_notice_version', 'decision_reason', 'anonymised_at', 'email_normalized',
                               'anonymised_with_client'];
    v_with_client boolean;
  begin
    if private.anonymising_inquiry() then
      if old.anonymised_at is not null then
        raise exception 'This inquiry is already anonymised.' using errcode = 'SO409';
      end if;
      v_with_client := old.client_id is not null and private.flagged_client('anonymising_client') = old.client_id;
      if new.anonymised_with_client is distinct from v_with_client then
        raise exception 'Only inquiries of a client being anonymised are anonymised with it.' using errcode = '42501';
      end if;
      if not v_with_client
         and private.inquiry_retention_ends(old.status, old.client_id, old.received_at, old.decided_at) is null then
        raise exception 'Only inquiries that did not become clients are anonymised.' using errcode = '42501';
      end if;
      if (to_jsonb(new) - v_personal) <> (to_jsonb(old) - v_personal)
         or num_nonnulls(new.contact_name, new.email, new.company, new.website, new.message, new.content_hash,
                         new.budget_amount_eur, new.desired_date, new.privacy_notice_version, new.decision_reason) > 0 then
        raise exception 'Anonymising only clears personal details.' using errcode = '42501';
      end if;
      new.anonymised_at := now();
      return new;
    end if;

    if not private.deciding_inquiry() then
      raise exception 'Inquiries are decided through the review in Studio OS.' using errcode = '42501';
    end if;
    if old.anonymised_at is not null then
      raise exception 'This inquiry was anonymised and can no longer be decided.' using errcode = 'SO409';
    end if;
    if old.status <> 'new' then
      raise exception 'This inquiry has already been decided. Reload to see the decision.' using errcode = 'SO409';
    end if;
    if (to_jsonb(new) - v_decision) <> (to_jsonb(old) - v_decision) then
      raise exception 'What the customer sent cannot be changed.' using errcode = '42501';
    end if;
    if new.status not in ('approved', 'rejected', 'spam', 'merged') or (new.status = 'merged' and old.repeat_of is null) then
      raise exception 'Unknown decision.' using errcode = '22023';
    end if;
    if auth.uid() is null or not private.acts_as_caller(new.decided_by) then
      raise exception 'Only a person can decide an inquiry, in their own name.' using errcode = '42501';
    end if;
    new.decided_at := now();
    return new;
  end $$;

/* ------------------------------------------------------------------------ */
/* Holds                                                                     */
/* ------------------------------------------------------------------------ */

-- Every hold and release. Members can read it; nobody writes it directly.
-- When the client is anonymised, the reasons are emptied (they may name the
-- client); who held or released it, and when, stays.
create table public.client_retention_holds (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null,
  client_id uuid not null,
  action text not null check (action in ('hold', 'release')),
  reason text check (char_length(btrim(reason)) between 1 and 500),
  actor jsonb not null check (public.is_valid_actor(actor) and actor ->> 'kind' = 'human'),
  created_at timestamptz not null default now(),
  foreign key (client_id, studio_id) references public.clients (id, studio_id) on delete cascade
);
create index client_retention_holds_client_idx on public.client_retention_holds (client_id, created_at);

alter table public.client_retention_holds enable row level security;
revoke all on public.client_retention_holds from public, anon, authenticated, service_role;
grant select on public.client_retention_holds to authenticated;
create policy "members read" on public.client_retention_holds for select to authenticated using (private.is_member(studio_id));

-- An owner places a hold (p_reason) or releases it (p_reason null), in their
-- own name. Placing a hold on a held client replaces the reason.
create function public.set_client_retention_hold(p_studio uuid, p_client uuid, p_reason text, p_actor jsonb) returns void
  language plpgsql security definer set search_path = ''
  as $$
  declare
    v public.clients;
    v_reason text := nullif(btrim(p_reason), '');
  begin
    if not private.is_owner(p_studio) then
      raise exception 'Only an owner can place or release a retention hold.' using errcode = '42501';
    end if;
    if not private.acts_as_caller(p_actor) then
      raise exception 'Retention holds are set in your own name.' using errcode = '42501';
    end if;
    select * into v from public.clients where id = p_client and studio_id = p_studio for update;
    if not found then
      raise exception 'This client no longer exists, or you do not have access to it.' using errcode = 'SO404';
    end if;
    if v.anonymised_at is not null then
      raise exception 'This client was anonymised and can no longer be changed.' using errcode = 'SO409';
    end if;
    if v_reason is null and v.retention_hold_reason is null then
      raise exception 'This client has no retention hold.' using errcode = 'SO409';
    end if;
    if char_length(v_reason) > 500 then
      raise exception 'Keep the reason under 500 characters.' using errcode = '22023';
    end if;

    perform set_config('studio_os.setting_retention_hold', p_client::text, true);
    update public.clients set
        retention_hold_reason = v_reason,
        retention_hold_by = case when v_reason is not null then p_actor end,
        retention_held_at = case when v_reason is not null then now() end
      where id = p_client;
    perform set_config('studio_os.setting_retention_hold', '', true);

    insert into public.client_retention_holds (studio_id, client_id, action, reason, actor)
      values (p_studio, p_client, case when v_reason is null then 'release' else 'hold' end, v_reason, p_actor);
  end $$;
revoke all on function public.set_client_retention_hold(uuid, uuid, text, jsonb) from public, anon, service_role;
grant execute on function public.set_client_retention_hold(uuid, uuid, text, jsonb) to authenticated;

/* ------------------------------------------------------------------------ */
/* The retention date                                                        */
/* ------------------------------------------------------------------------ */

-- The last change a signed-in person made to the client, its projects or its
-- tasks. Never earlier than the client's creation.
create function private.client_last_activity(p_client uuid) returns timestamptz
  language sql stable set search_path = ''
  as $$
    select greatest(
      (select created_at from public.clients where id = p_client),
      (select max(least(e."timestamp", e.recorded_at)) from public.activity_events e
        where e.actor ->> 'kind' = 'human'
          and ((e.entity_type = 'client' and e.entity_id = p_client)
            or (e.entity_type = 'project' and e.entity_id in (select id from public.projects where client_id = p_client))
            or (e.entity_type = 'task' and e.entity_id in (
                  select t.id from public.tasks t join public.projects p on p.id = t.project_id where p.client_id = p_client)))))
  $$;

-- When the client stops being kept. Null while it is on hold, and once it is anonymised.
create function private.client_retention_ends(p_client public.clients) returns timestamptz
  language sql stable set search_path = ''
  as $$
    select case when p_client.anonymised_at is null and p_client.retention_hold_reason is null then
      greatest(
        case when p_client.became_customer_at is null
             then a.last_activity + interval '12 months'
             else least(p_client.archived_at, a.last_activity + interval '12 months') + interval '3 years' end,
        (select max(h.created_at) from public.client_retention_holds h
          where h.client_id = p_client.id and h.action = 'release') + interval '30 days')
    end
    from (select private.client_last_activity(p_client.id) as last_activity) a
  $$;

-- load_studio() shows the dates, as the signed-in person: both read only
-- what row-level security lets that person read.
revoke all on function private.client_last_activity(uuid), private.client_retention_ends(public.clients)
  from public, anon, service_role;
grant execute on function private.client_last_activity(uuid), private.client_retention_ends(public.clients) to authenticated;

/* ------------------------------------------------------------------------ */
/* Anonymising                                                               */
/* ------------------------------------------------------------------------ */

-- Anonymises one client and everything that belongs to it. Refuses a client
-- on hold, an anonymised one, and (unless forced, for an erasure request)
-- one whose date has not come.
create function private.anonymise_client(p_id uuid, p_force boolean default false) returns void
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

/* ------------------------------------------------------------------------ */
/* The daily run                                                             */
/* ------------------------------------------------------------------------ */

-- One row per run, dry runs included. Ids only, never personal data.
create table private.client_retention_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  dry_run boolean not null,
  anonymised uuid[] not null default '{}',
  skipped text
);
revoke all on private.client_retention_runs from public, anon, authenticated, service_role;

-- Anonymises every client past its retention date. With p_dry_run, changes
-- nothing and returns what it would do. Returns
--   {"dryRun", "anonymised": [{"id", "studioId", "customer", "lastActivity", "retentionEnded"}]}
-- or {"skipped": "another run is in progress"}.
create function private.run_client_retention(p_dry_run boolean default false) returns jsonb
  language plpgsql set search_path = ''
  as $$
  declare
    v_due jsonb;
    v_ids uuid[];
    r record;
  begin
    if not pg_try_advisory_xact_lock(hashtextextended('studio_os.client_retention', 0)) then
      insert into private.client_retention_runs (dry_run, skipped) values (p_dry_run, 'another run is in progress');
      return jsonb_build_object('skipped', 'another run is in progress');
    end if;

    select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'studioId', d.studio_id, 'customer', d.became_customer_at is not null,
                                                 'lastActivity', d.last_activity, 'retentionEnded', d.ends)
                              order by d.ends, d.id), '[]'),
           coalesce(array_agg(d.id order by d.ends, d.id), '{}')
      into v_due, v_ids
      from (select c.id, c.studio_id, c.became_customer_at, private.client_last_activity(c.id) as last_activity,
                   private.client_retention_ends(c) as ends
              from public.clients c where c.anonymised_at is null) d
      where d.ends <= now();

    if not p_dry_run then
      -- Locks each client and checks it again, so activity or a hold a moment ago wins over a stale list.
      for r in select c.id from public.clients c where c.id = any (v_ids) order by c.id for update loop
        if private.client_retention_ends((select c from public.clients c where c.id = r.id)) <= now() then
          perform private.anonymise_client(r.id);
        else
          v_ids := array_remove(v_ids, r.id);
          v_due := (select coalesce(jsonb_agg(e), '[]') from jsonb_array_elements(v_due) e where (e ->> 'id')::uuid <> r.id);
        end if;
      end loop;
    end if;

    insert into private.client_retention_runs (dry_run, anonymised) values (p_dry_run, v_ids);
    return jsonb_build_object('dryRun', p_dry_run, 'anonymised', v_due);
  end $$;

revoke all on function private.anonymise_client(uuid, boolean), private.run_client_retention(boolean)
  from public, anon, authenticated, service_role;

/* ------------------------------------------------------------------------ */
/* Loading                                                                   */
/* ------------------------------------------------------------------------ */

-- As before, without anonymised clients and what belongs to them, plus each
-- client's retention dates and hold log.
create or replace function public.load_studio(p_studio uuid) returns jsonb
  language plpgsql stable set search_path = ''
  as $$
  begin
    if not private.is_member(p_studio) then
      raise exception 'You do not have access to this studio.' using errcode = '42501';
    end if;
    return jsonb_build_object(
      'studio', (select jsonb_build_object('id', s.id, 'name', s.name) from public.studios s where s.id = p_studio),
      'role', private.member_role(p_studio),
      'members', (select coalesce(jsonb_agg(jsonb_build_object('userId', m.user_id, 'displayName', m.display_name, 'role', m.role)
                    order by m.created_at), '[]') from public.studio_members m where m.studio_id = p_studio),
      'clients', (select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at desc), '[]') from public.clients c
                  where c.studio_id = p_studio and c.anonymised_at is null),
      'context_fields', (select coalesce(jsonb_agg(to_jsonb(f)), '[]') from public.client_context_fields f where f.studio_id = p_studio),
      'context_items', (select coalesce(jsonb_agg(to_jsonb(i) order by i.created_at), '[]') from public.client_context_items i where i.studio_id = p_studio),
      'sources', (select coalesce(jsonb_agg(to_jsonb(x) order by x.received_at desc), '[]') from public.client_sources x where x.studio_id = p_studio),
      'projects', (select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at desc), '[]') from public.projects p
                   where p.studio_id = p_studio and not private.client_is_anonymised(p.client_id)),
      'tasks', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]') from public.tasks t
                where t.studio_id = p_studio and not private.client_is_anonymised(private.entity_client('project', t.project_id))),
      'activity', (select coalesce(jsonb_agg(to_jsonb(e) order by e."timestamp" desc), '[]')
                   from (select * from public.activity_events a where a.studio_id = p_studio
                           and not private.client_is_anonymised(private.entity_client(a.entity_type, a.entity_id))
                         order by "timestamp" desc limit 2000) e),
      'agent_runs', (select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc), '[]')
                     from (select * from public.agent_runs where studio_id = p_studio and not private.client_is_anonymised(client_id)
                           order by created_at desc limit 200) r),
      'proposals', (select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at), '[]')
                    from public.agent_proposals p where p.studio_id = p_studio
                      and (p.status = 'pending' or p.run_id in (select id from public.agent_runs where studio_id = p_studio order by created_at desc limit 200))),
      'retention', (select coalesce(jsonb_agg(jsonb_build_object(
                       'clientId', c.id, 'customer', c.became_customer_at is not null,
                       'lastActivityAt', private.client_last_activity(c.id), 'endsAt', private.client_retention_ends(c))), '[]')
                    from public.clients c where c.studio_id = p_studio and c.anonymised_at is null),
      'retention_holds', (select coalesce(jsonb_agg(to_jsonb(h) order by h.created_at), '[]')
                          from public.client_retention_holds h where h.studio_id = p_studio
                            and not private.client_is_anonymised(h.client_id))
    );
  end $$;

/* ------------------------------------------------------------------------ */
/* Schedule                                                                  */
/* ------------------------------------------------------------------------ */

-- Daily at 03:27 UTC, ten minutes after the inquiry retention, as the owner.
select cron.schedule('client-retention', '27 3 * * *', 'select private.run_client_retention()');
