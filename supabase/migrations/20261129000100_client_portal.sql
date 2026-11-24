/* ------------------------------------------------------------------------ */
/* The client portal: one private link per client, from the brief to the    */
/* launch. On it the client sees where their website stands, answers the    */
/* brief's open questions, sends photos, logos and documents with written   */
/* answers about their rights, and finds the latest review link. Only the   */
/* link's hash is kept; it expires after 90 days and can be turned off.     */
/* Everything the client sends becomes the client's sources and material,   */
/* as if the studio had added it. Anonymising a client removes the portal.  */
/* ------------------------------------------------------------------------ */

create table public.client_portals (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null,
  client_id uuid not null,
  -- sha256 of the link's secret, in hex. The secret is shown once and never stored.
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by jsonb not null check (jsonb_typeof(created_by) = 'object'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  -- Questions answered on the portal, by their context item id, so they are not asked twice.
  answered jsonb not null default '[]'::jsonb check (jsonb_typeof(answered) = 'array'),
  -- A day's uploads, to keep a leaked link from filling the storage.
  upload_day date,
  upload_count int not null default 0,
  upload_bytes bigint not null default 0,
  foreign key (client_id, studio_id) references public.clients (id, studio_id) on delete cascade,
  constraint expires_after_creation check (expires_at > created_at)
);
create unique index client_portals_one_open on public.client_portals (client_id) where revoked_at is null;

revoke all on public.client_portals from public, anon, authenticated, service_role;
grant select (id, studio_id, client_id, created_by, created_at, expires_at, revoked_at, answered) on public.client_portals to authenticated;
alter table public.client_portals enable row level security;
create policy "members read" on public.client_portals for select to authenticated using (private.is_member(studio_id));

/* A writer makes a new portal link for a client; an earlier one stops working. Returns the secret once. */
create function public.create_client_portal(p_client uuid) returns text
  language plpgsql security definer set search_path = '' as $$
declare
  v_studio uuid;
  v_name text;
  v_token text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  select studio_id into v_studio from public.clients where id = p_client and anonymised_at is null;
  if v_studio is null or not private.can_write(v_studio) then
    raise exception 'This client does not exist, or you cannot change it.' using errcode = '42501';
  end if;
  select display_name into v_name from public.studio_members where studio_id = v_studio and user_id = auth.uid();
  update public.client_portals set revoked_at = now() where client_id = p_client and revoked_at is null;
  insert into public.client_portals (studio_id, client_id, token_hash, created_by, expires_at)
  values (v_studio, p_client, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'),
    jsonb_build_object('kind', 'human', 'name', coalesce(v_name, 'Studio member'), 'userId', auth.uid()), now() + interval '90 days');
  insert into public.activity_events (id, studio_id, entity_type, entity_id, event_type, description, actor)
  values (gen_random_uuid(), v_studio, 'client', p_client, 'client.portal_created', 'Made a client portal link',
    jsonb_build_object('kind', 'human', 'name', coalesce(v_name, 'Studio member'), 'userId', auth.uid()));
  return v_token;
end;
$$;

/* A writer turns the client's portal link off. */
create function public.revoke_client_portal(p_client uuid) returns void
  language plpgsql security definer set search_path = '' as $$
declare
  v_studio uuid;
begin
  select studio_id into v_studio from public.clients where id = p_client;
  if v_studio is null or not private.can_write(v_studio) then
    raise exception 'This client does not exist, or you cannot change it.' using errcode = '42501';
  end if;
  update public.client_portals set revoked_at = now() where client_id = p_client and revoked_at is null;
end;
$$;

/* The open portal a link belongs to, or nothing. */
create function private.open_portal(p_token text) returns public.client_portals
  language sql stable security definer set search_path = '' as $$
  select p.* from public.client_portals p join public.clients c on c.id = p.client_id
  where p_token ~ '^[0-9a-f]{64}$'
    and p.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
    and p.revoked_at is null and p.expires_at > now() and c.anonymised_at is null;
$$;

/* What the portal shows. Null for an unknown, turned-off or expired link. Service role only. */
create function public.client_portal_state(p_token text) returns jsonb
  language plpgsql stable security definer set search_path = '' as $$
declare
  v_portal public.client_portals;
  v_spec_id uuid;
  v_spec_version int;
  v_spec_status text;
  v_approved_at timestamptz;
  v_locale text;
  v_build jsonb;
begin
  v_portal := private.open_portal(p_token);
  if v_portal.id is null then return null; end if;
  select s.id, s.version, s.status::text, s.approved_at, s.spec -> 'locales' ->> 'default'
    into v_spec_id, v_spec_version, v_spec_status, v_approved_at, v_locale
    from public.site_specs s where s.client_id = v_portal.client_id and s.status <> 'superseded'
    order by s.version desc limit 1;
  if v_spec_id is not null then
    select jsonb_build_object('link', '/s/' || b.share_token || '/', 'expiresAt', b.expires_at,
        'approval', (select jsonb_build_object('name', a.approver_name, 'at', a.created_at) from public.site_approvals a where a.build_id = b.id))
      into v_build
      from public.site_builds b
      where b.spec_id = v_spec_id and b.revoked_at is null and b.expires_at > now()
        and (v_approved_at is null or b.created_at >= v_approved_at)
      order by b.created_at desc limit 1;
  end if;
  return jsonb_build_object(
    'client', (select c.name from public.clients c where c.id = v_portal.client_id),
    'studio', (select coalesce(nullif(s.brand ->> 'name', ''), s.name) from public.studios s where s.id = v_portal.studio_id),
    'studioEmail', (select nullif(s.brand ->> 'email', '') from public.studios s where s.id = v_portal.studio_id),
    'color', (select nullif(s.brand ->> 'color', '') from public.studios s where s.id = v_portal.studio_id),
    'locale', coalesce(v_locale, 'sv'),
    'spec', case when v_spec_id is null then null else jsonb_build_object('version', v_spec_version, 'status', v_spec_status) end,
    'build', v_build,
    'live', (select jsonb_build_object('domain', p.domain, 'url', coalesce('https://' || p.domain, p.deployment_url))
      from public.site_publications p where p.client_id = v_portal.client_id and p.status = 'live' order by p.created_at desc limit 1),
    'questions', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'text', i.text) order by i.created_at)
      from public.client_context_items i
      where i.client_id = v_portal.client_id and i.kind = 'question' and i.confidence <> 'superseded'
        and not (v_portal.answered ? i.id::text)), '[]'::jsonb),
    'expiresAt', v_portal.expires_at);
end;
$$;

/* The client answers some of the open questions. Stored as one source. Service role only. */
create function public.record_portal_answers(p_token text, p_answers jsonb) returns int
  language plpgsql security definer set search_path = '' as $$
declare
  v_portal public.client_portals;
  v_author text := btrim(coalesce(p_answers ->> 'author', ''));
  v_item jsonb;
  v_question text;
  v_answer text;
  v_text text := '';
  v_ids jsonb := '[]'::jsonb;
begin
  v_portal := private.open_portal(p_token);
  if v_portal.id is null then
    raise exception 'This link is not open.' using errcode = '42501';
  end if;
  if char_length(v_author) not between 1 and 120 or jsonb_typeof(p_answers -> 'answers') <> 'array' or jsonb_array_length(p_answers -> 'answers') > 30 then
    raise exception 'Write your name and at least one answer.' using errcode = '22023';
  end if;
  for v_item in select * from jsonb_array_elements(p_answers -> 'answers') loop
    v_answer := btrim(coalesce(v_item ->> 'answer', ''));
    if v_answer = '' then continue; end if;
    if char_length(v_answer) > 3000 then
      raise exception 'An answer is too long.' using errcode = '22023';
    end if;
    select i.text into v_question from public.client_context_items i
      where i.id::text = v_item ->> 'id' and i.client_id = v_portal.client_id and i.kind = 'question';
    if v_question is null then continue; end if;
    v_text := v_text || format(E'Fråga: %s\nSvar: %s\n\n', v_question, v_answer);
    v_ids := v_ids || to_jsonb(v_item ->> 'id');
  end loop;
  if jsonb_array_length(v_ids) = 0 then
    raise exception 'Write at least one answer.' using errcode = '22023';
  end if;
  insert into public.client_sources (id, studio_id, client_id, type, label, content, added_by)
  values (gen_random_uuid(), v_portal.studio_id, v_portal.client_id, 'other',
    left(format('Svar via kundportalen: %s', v_author), 160), btrim(v_text, E' \n'),
    jsonb_build_object('kind', 'human', 'name', left(v_author || ' (kunden, via portalen)', 160)));
  update public.client_portals set answered = answered || v_ids where id = v_portal.id;
  insert into public.activity_events (id, studio_id, entity_type, entity_id, event_type, description, actor)
  values (gen_random_uuid(), v_portal.studio_id, 'client', v_portal.client_id, 'client.portal_answered',
    left(format('The client answered %s questions on the portal: %s', jsonb_array_length(v_ids), v_author), 500), '{"kind":"system"}'::jsonb);
  return jsonb_array_length(v_ids);
end;
$$;

/*
 * Before a file is stored: counts it against the day's limit (40 files,
 * 100 MB) and says where it belongs. Raises when the link is closed or the
 * limit is reached. Service role only.
 */
create function public.claim_portal_upload(p_token text, p_bytes int) returns jsonb
  language plpgsql security definer set search_path = '' as $$
declare
  v_portal public.client_portals;
begin
  v_portal := private.open_portal(p_token);
  if v_portal.id is null then
    raise exception 'This link is not open.' using errcode = '42501';
  end if;
  if p_bytes not between 1 and 4194304 then
    raise exception 'The file is larger than 4 MB.' using errcode = '22023';
  end if;
  update public.client_portals set
      upload_count = case when upload_day = current_date then upload_count + 1 else 1 end,
      upload_bytes = case when upload_day = current_date then upload_bytes + p_bytes else p_bytes end,
      upload_day = current_date
    where id = v_portal.id
    returning * into v_portal;
  if v_portal.upload_count > 40 or v_portal.upload_bytes > 104857600 then
    raise exception 'That is all the files the link takes today. Try again tomorrow.' using errcode = '54000';
  end if;
  return jsonb_build_object('studioId', v_portal.studio_id, 'clientId', v_portal.client_id);
end;
$$;

/*
 * After the client's files are stored: what they said about them, in their
 * words, as the written record of rights and consent. Stored as a source,
 * so it stays with the client. Service role only.
 */
create function public.record_portal_files_note(p_token text, p_author text, p_note text) returns void
  language plpgsql security definer set search_path = '' as $$
declare
  v_portal public.client_portals;
begin
  v_portal := private.open_portal(p_token);
  if v_portal.id is null then
    raise exception 'This link is not open.' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_author, ''))) not between 1 and 120 or char_length(btrim(coalesce(p_note, ''))) not between 1 and 20000 then
    raise exception 'Write your name.' using errcode = '22023';
  end if;
  insert into public.client_sources (id, studio_id, client_id, type, label, content, added_by)
  values (gen_random_uuid(), v_portal.studio_id, v_portal.client_id, 'other',
    left(format('Filer via kundportalen: %s', btrim(p_author)), 160), btrim(p_note),
    jsonb_build_object('kind', 'human', 'name', left(btrim(p_author) || ' (kunden, via portalen)', 160)));
  insert into public.activity_events (id, studio_id, entity_type, entity_id, event_type, description, actor)
  values (gen_random_uuid(), v_portal.studio_id, 'client', v_portal.client_id, 'client.portal_files',
    left(format('The client sent files on the portal: %s', btrim(p_author)), 500), '{"kind":"system"}'::jsonb);
end;
$$;

/* Who to tell when a client answers or sends files on the portal. Service role only. */
create function public.portal_event_recipients(p_token text) returns jsonb
  language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('clientId', p.client_id, 'client', c.name, 'studio', s.name,
    'recipients', coalesce((select jsonb_agg(jsonb_build_object('userId', m.user_id, 'email', u.email))
      from public.studio_members m join auth.users u on u.id = m.user_id
      left join public.member_email_settings e on e.studio_id = m.studio_id and e.user_id = m.user_id
      where m.studio_id = p.studio_id and coalesce(e.client_events, true) and u.email is not null), '[]'::jsonb))
  from public.client_portals p join public.clients c on c.id = p.client_id join public.studios s on s.id = p.studio_id
  where p.id = (private.open_portal(p_token)).id;
$$;

revoke all on function public.create_client_portal(uuid), public.revoke_client_portal(uuid), public.client_portal_state(text),
  public.record_portal_answers(text, jsonb), public.claim_portal_upload(text, int), public.record_portal_files_note(text, text, text),
  public.portal_event_recipients(text) from public, anon, authenticated;
revoke all on function private.open_portal(text) from public, anon, authenticated;
grant execute on function public.create_client_portal(uuid), public.revoke_client_portal(uuid) to authenticated;
grant execute on function public.client_portal_state(text), public.record_portal_answers(text, jsonb), public.claim_portal_upload(text, int),
  public.record_portal_files_note(text, text, text), public.portal_event_recipients(text) to service_role;

-- As in 20261127000100_next_steps_calendar.sql, plus the client portal.
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
