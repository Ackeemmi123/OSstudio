/* ------------------------------------------------------------------------ */
/* Next steps and reminders. A next step is something a person at the studio */
/* will do for a client on a given day, at a time if it has one ("Call back  */
/* Mikko, Tuesday 10:00"). Studio members read them; writers add, change and */
/* tick them off. Each member can have one private calendar feed: a long     */
/* random link their calendar app subscribes to, listing the studio's open   */
/* next steps and dated tasks with reminders. Only the link's hash is kept;  */
/* the feed stops working when it is turned off or the person leaves the     */
/* studio. Anonymising a client removes its next steps.                      */
/* ------------------------------------------------------------------------ */

create table public.client_next_steps (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null,
  client_id uuid not null,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  note text not null default '' check (char_length(note) <= 1000),
  due_on date not null,
  -- Empty: any time that day.
  due_time time,
  -- Who does it: a studio member, or nobody yet.
  assignee jsonb check (assignee is null or (public.is_valid_actor(assignee) and assignee ->> 'kind' = 'human')),
  status text not null default 'open' check (status in ('open', 'done')),
  done_at timestamptz,
  created_by jsonb not null check (public.is_valid_actor(created_by)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (client_id, studio_id) references public.clients (id, studio_id) on delete cascade
);
create index client_next_steps_due on public.client_next_steps (studio_id, status, due_on);
create index client_next_steps_client on public.client_next_steps (client_id);

revoke all on public.client_next_steps from public, anon, authenticated, service_role;
grant select, insert, update on public.client_next_steps to authenticated;
alter table public.client_next_steps enable row level security;
create policy "members read" on public.client_next_steps for select to authenticated using (private.is_member(studio_id));
create policy "writers insert" on public.client_next_steps for insert to authenticated
  with check (private.can_write(studio_id) and private.acts_as_caller(created_by));
create policy "writers update" on public.client_next_steps for update to authenticated
  using (private.can_write(studio_id)) with check (private.can_write(studio_id));
create trigger keep_studio before update on public.client_next_steps for each row execute function private.keep_studio();

/* A writer deletes a next step made by mistake. People never delete rows directly; this checks who may. */
create function public.delete_next_step(p_step uuid) returns void
  language plpgsql security definer set search_path = '' as $$
declare
  v_studio uuid;
begin
  select studio_id into v_studio from public.client_next_steps where id = p_step;
  if v_studio is null or not private.can_write(v_studio) then
    raise exception 'This next step does not exist, or you cannot delete it.' using errcode = '42501';
  end if;
  delete from public.client_next_steps where id = p_step;
end;
$$;
revoke all on function public.delete_next_step(uuid) from public, anon, authenticated;
grant execute on function public.delete_next_step(uuid) to authenticated;

create table public.calendar_feeds (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- sha256 of the link's secret, in hex. The secret itself is shown once and never stored.
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create unique index calendar_feeds_one_active on public.calendar_feeds (studio_id, user_id) where revoked_at is null;

revoke all on public.calendar_feeds from public, anon, authenticated, service_role;
grant select on public.calendar_feeds to authenticated;
alter table public.calendar_feeds enable row level security;
create policy "own feed" on public.calendar_feeds for select to authenticated using (user_id = (select auth.uid()) and private.is_member(studio_id));

/* A member makes a new feed link for themselves; any earlier one stops working. Returns the secret once. */
create function public.create_calendar_feed(p_studio uuid) returns text
  language plpgsql security definer set search_path = '' as $$
declare
  v_token text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  if auth.uid() is null or not private.is_member(p_studio) then
    raise exception 'You are not a member of this studio.' using errcode = '42501';
  end if;
  update public.calendar_feeds set revoked_at = now() where studio_id = p_studio and user_id = auth.uid() and revoked_at is null;
  insert into public.calendar_feeds (studio_id, user_id, token_hash)
  values (p_studio, auth.uid(), encode(sha256(convert_to(v_token, 'UTF8')), 'hex'));
  return v_token;
end;
$$;

/* A member turns their feed link off. */
create function public.revoke_calendar_feed(p_studio uuid) returns void
  language plpgsql security definer set search_path = '' as $$
begin
  update public.calendar_feeds set revoked_at = now() where studio_id = p_studio and user_id = auth.uid() and revoked_at is null;
end;
$$;

/* What a feed shows: the studio's open next steps and the open tasks with a date. Service role only. Null for an unknown, turned-off or orphaned link. */
create function public.calendar_feed_items(p_token text) returns jsonb
  language plpgsql stable security definer set search_path = '' as $$
declare
  v_feed public.calendar_feeds;
begin
  if p_token !~ '^[0-9a-f]{64}$' then return null; end if;
  select * into v_feed from public.calendar_feeds
   where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') and revoked_at is null;
  if v_feed.id is null or not exists (select 1 from public.studio_members m where m.studio_id = v_feed.studio_id and m.user_id = v_feed.user_id) then
    return null;
  end if;
  return jsonb_build_object(
    'studio', (select s.name from public.studios s where s.id = v_feed.studio_id),
    'steps', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'title', n.title, 'client', c.name, 'clientId', c.id,
        'dueOn', n.due_on, 'dueTime', n.due_time, 'assignee', n.assignee ->> 'name', 'updatedAt', n.updated_at) order by n.due_on, n.due_time)
      from public.client_next_steps n join public.clients c on c.id = n.client_id
      where n.studio_id = v_feed.studio_id and n.status = 'open' and n.due_on >= current_date - 60), '[]'::jsonb),
    'tasks', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'project', p.name, 'client', c.name, 'clientId', c.id,
        'dueOn', t.due_date, 'updatedAt', t.updated_at) order by t.due_date)
      from public.tasks t join public.projects p on p.id = t.project_id join public.clients c on c.id = p.client_id
      where t.studio_id = v_feed.studio_id and t.status <> 'done' and t.due_date is not null and t.due_date >= current_date - 60 and not t.is_demo), '[]'::jsonb));
end;
$$;

revoke all on function public.create_calendar_feed(uuid), public.revoke_calendar_feed(uuid), public.calendar_feed_items(text) from public, anon, authenticated;
grant execute on function public.create_calendar_feed(uuid), public.revoke_calendar_feed(uuid) to authenticated;
grant execute on function public.calendar_feed_items(text) to service_role;

-- As in 20261124000100_anonymise_publications.sql, plus next steps.
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
