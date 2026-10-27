-- Studio OS: the functions the app calls.
--
-- Writes go through apply_changes(), which applies one domain change (rows
-- plus their activity events) in a single transaction. It runs with the
-- caller's rights, so row-level security and the triggers from the security
-- migration apply to every statement. Updates carry the `updated_at` the
-- browser last saw, so two people editing the same record cannot silently
-- overwrite each other.
--
-- Error codes the app maps to messages: 42501 permission, SO404 not found,
-- SO409 changed by someone else.

/* ------------------------------------------------------------------------ */
/* Studios and members                                                       */
/* ------------------------------------------------------------------------ */

create function public.my_studios() returns table (studio_id uuid, name text, role public.member_role, display_name text)
  language sql stable set search_path = ''
  as $$
    select m.studio_id, s.name, m.role, m.display_name
    from public.studio_members m join public.studios s on s.id = m.studio_id
    where m.user_id = (select auth.uid())
    order by m.created_at
  $$;

-- Any signed-in person can start a studio and becomes its owner. Sign-ups are
-- disabled, so only accounts an administrator created can do this.
create function public.create_studio(p_name text, p_display_name text) returns uuid
  language plpgsql security definer set search_path = ''
  as $$
  declare v_studio uuid;
  begin
    if auth.uid() is null then
      raise exception 'Sign in first.' using errcode = '42501';
    end if;
    insert into public.studios (name) values (btrim(p_name)) returning id into v_studio;
    insert into public.studio_members (studio_id, user_id, display_name, role)
      values (v_studio, auth.uid(), btrim(p_display_name), 'owner');
    return v_studio;
  end $$;

-- Owners add people who already have an account.
create function public.add_studio_member(p_studio uuid, p_email text, p_display_name text, p_role public.member_role)
  returns void
  language plpgsql security definer set search_path = ''
  as $$
  declare v_user uuid;
  begin
    if not private.is_owner(p_studio) then
      raise exception 'Only a studio owner can add people.' using errcode = '42501';
    end if;
    select id into v_user from auth.users where lower(email) = lower(btrim(p_email));
    if v_user is null then
      raise exception 'No account uses that email. An administrator needs to create it first.' using errcode = 'SO404';
    end if;
    if v_user = auth.uid() then
      raise exception 'You cannot change your own access.' using errcode = '42501';
    end if;
    insert into public.studio_members (studio_id, user_id, display_name, role)
      values (p_studio, v_user, btrim(p_display_name), p_role)
      on conflict (studio_id, user_id) do update set display_name = excluded.display_name, role = excluded.role;
  end $$;

create function public.remove_studio_member(p_studio uuid, p_user uuid) returns void
  language plpgsql security definer set search_path = ''
  as $$
  begin
    if not private.is_owner(p_studio) then
      raise exception 'Only a studio owner can remove people.' using errcode = '42501';
    end if;
    if p_user = auth.uid() then
      raise exception 'You cannot remove yourself.' using errcode = '42501';
    end if;
    delete from public.studio_members where studio_id = p_studio and user_id = p_user;
  end $$;

/* ------------------------------------------------------------------------ */
/* Reading                                                                   */
/* ------------------------------------------------------------------------ */

-- Everything the app shows for one studio, in one round trip.
create function public.load_studio(p_studio uuid) returns jsonb
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
      'clients', (select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at desc), '[]') from public.clients c where c.studio_id = p_studio),
      'context_fields', (select coalesce(jsonb_agg(to_jsonb(f)), '[]') from public.client_context_fields f where f.studio_id = p_studio),
      'context_items', (select coalesce(jsonb_agg(to_jsonb(i) order by i.created_at), '[]') from public.client_context_items i where i.studio_id = p_studio),
      'sources', (select coalesce(jsonb_agg(to_jsonb(x) order by x.received_at desc), '[]') from public.client_sources x where x.studio_id = p_studio),
      'projects', (select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at desc), '[]') from public.projects p where p.studio_id = p_studio),
      'tasks', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]') from public.tasks t where t.studio_id = p_studio),
      'activity', (select coalesce(jsonb_agg(to_jsonb(e) order by e."timestamp" desc), '[]')
                   from (select * from public.activity_events where studio_id = p_studio order by "timestamp" desc limit 2000) e),
      'agent_runs', (select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc), '[]')
                     from (select * from public.agent_runs where studio_id = p_studio order by created_at desc limit 200) r),
      'proposals', (select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at), '[]')
                    from public.agent_proposals p where p.studio_id = p_studio
                      and (p.status = 'pending' or p.run_id in (select id from public.agent_runs where studio_id = p_studio order by created_at desc limit 200)))
    );
  end $$;

/* ------------------------------------------------------------------------ */
/* Writing                                                                   */
/* ------------------------------------------------------------------------ */

create function private.no_row(p_table regclass, p_where text, p_studio uuid) returns void
  language plpgsql set search_path = ''
  as $$
  declare v_exists boolean;
  begin
    execute format('select exists (select 1 from %s where %s and studio_id = $1)', p_table, p_where) into v_exists using p_studio;
    if v_exists then
      raise exception 'Someone else changed this in the meantime. Reload to see the latest version.' using errcode = 'SO409';
    end if;
    raise exception 'This record no longer exists.' using errcode = 'SO404';
  end $$;
grant execute on function private.no_row(regclass, text, uuid) to authenticated;

create function public.apply_changes(p_studio uuid, p_changes jsonb) returns void
  language plpgsql set search_path = ''
  as $$
  declare
    c jsonb;
    r jsonb;
    n int;
  begin
    if not private.can_write(p_studio) then
      raise exception 'You have read-only access to this studio.' using errcode = '42501';
    end if;

    for c in select * from jsonb_array_elements(coalesce(p_changes -> 'clients', '[]')) loop
      r := c -> 'row';
      if c ->> 'op' = 'insert' then
        insert into public.clients select * from jsonb_populate_record(null::public.clients, r || jsonb_build_object('studio_id', p_studio));
      else
        update public.clients t set name = x.name, contact_person = x.contact_person, email = x.email, website = x.website,
            status = x.status, project_type = x.project_type
          from jsonb_populate_record(null::public.clients, r) x
          where t.id = x.id and t.studio_id = p_studio and t.updated_at = (c ->> 'expected')::timestamptz;
        get diagnostics n = row_count;
        if n = 0 then perform private.no_row('public.clients', format('id = %L', r ->> 'id'), p_studio); end if;
      end if;
    end loop;

    for c in select * from jsonb_array_elements(coalesce(p_changes -> 'context_fields', '[]')) loop
      r := c -> 'row';
      if c ->> 'op' = 'insert' then
        insert into public.client_context_fields
          select * from jsonb_populate_record(null::public.client_context_fields, r || jsonb_build_object('studio_id', p_studio));
      else
        update public.client_context_fields t set value = x.value, confidence = x.confidence, source = x.source, note = x.note,
            recorded_by = x.recorded_by, confirmed_by = x.confirmed_by, history = x.history
          from jsonb_populate_record(null::public.client_context_fields, r) x
          where t.client_id = x.client_id and t.field_key = x.field_key and t.studio_id = p_studio
            and t.updated_at = (c ->> 'expected')::timestamptz;
        get diagnostics n = row_count;
        if n = 0 then
          perform private.no_row('public.client_context_fields',
            format('client_id = %L and field_key = %L', r ->> 'client_id', r ->> 'field_key'), p_studio);
        end if;
      end if;
    end loop;

    for c in select * from jsonb_array_elements(coalesce(p_changes -> 'context_items', '[]')) loop
      insert into public.client_context_items
        select * from jsonb_populate_record(null::public.client_context_items, (c -> 'row') || jsonb_build_object('studio_id', p_studio));
    end loop;

    for c in select * from jsonb_array_elements(coalesce(p_changes -> 'sources', '[]')) loop
      insert into public.client_sources
        select * from jsonb_populate_record(null::public.client_sources, (c -> 'row') || jsonb_build_object('studio_id', p_studio));
    end loop;

    for c in select * from jsonb_array_elements(coalesce(p_changes -> 'projects', '[]')) loop
      r := c -> 'row';
      if c ->> 'op' = 'insert' then
        insert into public.projects select * from jsonb_populate_record(null::public.projects, r || jsonb_build_object('studio_id', p_studio));
      else
        update public.projects t set name = x.name, status = x.status, stage = x.stage
          from jsonb_populate_record(null::public.projects, r) x
          where t.id = x.id and t.studio_id = p_studio and t.updated_at = (c ->> 'expected')::timestamptz;
        get diagnostics n = row_count;
        if n = 0 then perform private.no_row('public.projects', format('id = %L', r ->> 'id'), p_studio); end if;
      end if;
    end loop;

    for c in select * from jsonb_array_elements(coalesce(p_changes -> 'tasks', '[]')) loop
      r := c -> 'row';
      if c ->> 'op' = 'insert' then
        insert into public.tasks select * from jsonb_populate_record(null::public.tasks, r || jsonb_build_object('studio_id', p_studio));
      else
        update public.tasks t set title = x.title, status = x.status, assignee = x.assignee, blocked_reason = x.blocked_reason,
            due_date = x.due_date
          from jsonb_populate_record(null::public.tasks, r) x
          where t.id = x.id and t.studio_id = p_studio and t.updated_at = (c ->> 'expected')::timestamptz;
        get diagnostics n = row_count;
        if n = 0 then perform private.no_row('public.tasks', format('id = %L', r ->> 'id'), p_studio); end if;
      end if;
    end loop;

    for c in select * from jsonb_array_elements(coalesce(p_changes -> 'proposals', '[]')) loop
      update public.agent_proposals t set status = c ->> 'status',
          review_confidence = (c ->> 'review_confidence')::public.field_confidence,
          reviewed_by = c -> 'reviewed_by', reviewed_at = now()
        where t.id = (c ->> 'id')::uuid and t.studio_id = p_studio;
      get diagnostics n = row_count;
      if n = 0 then raise exception 'This proposal no longer exists.' using errcode = 'SO404'; end if;
    end loop;

    for c in select * from jsonb_array_elements(coalesce(p_changes -> 'events', '[]')) loop
      insert into public.activity_events
        select * from jsonb_populate_record(null::public.activity_events, c || jsonb_build_object('studio_id', p_studio));
    end loop;
  end $$;

/* ------------------------------------------------------------------------ */
/* One-time import from the browser demo                                     */
/* ------------------------------------------------------------------------ */

-- The browser validates and converts its local data, then sends it here. Rows
-- keep their identifiers (derived per studio), so importing again inserts
-- nothing; the content hash records that this data was imported.
create function public.import_browser_data(p_studio uuid, p_hash text, p_data jsonb) returns jsonb
  language plpgsql set search_path = ''
  as $$
  declare
    v_batch uuid := gen_random_uuid();
    v_existing public.import_batches;
    v_counts jsonb := '{}';
    n int;
  begin
    if not private.can_write(p_studio) then
      raise exception 'You have read-only access to this studio.' using errcode = '42501';
    end if;
    select * into v_existing from public.import_batches where studio_id = p_studio and content_hash = p_hash;
    if found then
      return jsonb_build_object('status', 'already_imported', 'batchId', v_existing.id, 'counts', v_existing.counts,
                                'importedAt', v_existing.created_at);
    end if;

    perform set_config('studio_os.importing', 'on', true);

    insert into public.clients
      select x.* from jsonb_array_elements(coalesce(p_data -> 'clients', '[]')) e,
        jsonb_populate_record(null::public.clients, e || jsonb_build_object('studio_id', p_studio)) x
      on conflict (id) do nothing;
    get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('clients', n);

    insert into public.client_context_fields
      select x.* from jsonb_array_elements(coalesce(p_data -> 'context_fields', '[]')) e,
        jsonb_populate_record(null::public.client_context_fields, e || jsonb_build_object('studio_id', p_studio)) x
      on conflict (client_id, field_key) do nothing;
    get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('context_fields', n);

    insert into public.client_context_items
      select x.* from jsonb_array_elements(coalesce(p_data -> 'context_items', '[]')) e,
        jsonb_populate_record(null::public.client_context_items, e || jsonb_build_object('studio_id', p_studio)) x
      on conflict (id) do nothing;
    get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('context_items', n);

    insert into public.client_sources
      select x.* from jsonb_array_elements(coalesce(p_data -> 'sources', '[]')) e,
        jsonb_populate_record(null::public.client_sources, e || jsonb_build_object('studio_id', p_studio)) x
      on conflict (id) do nothing;
    get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('sources', n);

    insert into public.projects
      select x.* from jsonb_array_elements(coalesce(p_data -> 'projects', '[]')) e,
        jsonb_populate_record(null::public.projects, e || jsonb_build_object('studio_id', p_studio)) x
      on conflict (id) do nothing;
    get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('projects', n);

    insert into public.tasks
      select x.* from jsonb_array_elements(coalesce(p_data -> 'tasks', '[]')) e,
        jsonb_populate_record(null::public.tasks, e || jsonb_build_object('studio_id', p_studio)) x
      on conflict (id) do nothing;
    get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('tasks', n);

    insert into public.activity_events
      select x.* from jsonb_array_elements(coalesce(p_data -> 'activity', '[]')) e,
        jsonb_populate_record(null::public.activity_events,
          e || jsonb_build_object('studio_id', p_studio, 'import_batch_id', v_batch)) x
      on conflict (id) do nothing;
    get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('activity', n);

    insert into public.import_batches (id, studio_id, content_hash, counts) values (v_batch, p_studio, p_hash, v_counts);
    return jsonb_build_object('status', 'imported', 'batchId', v_batch, 'counts', v_counts);
  end $$;

/* ------------------------------------------------------------------------ */
/* Who may call what                                                         */
/* ------------------------------------------------------------------------ */

revoke execute on all functions in schema public from public, anon;
grant execute on function public.my_studios(), public.create_studio(text, text),
  public.add_studio_member(uuid, text, text, public.member_role), public.remove_studio_member(uuid, uuid),
  public.load_studio(uuid), public.apply_changes(uuid, jsonb), public.import_browser_data(uuid, text, jsonb)
  to authenticated;
grant execute on function public.is_valid_actor(jsonb) to authenticated, service_role;
alter default privileges in schema public revoke execute on functions from public, anon;
