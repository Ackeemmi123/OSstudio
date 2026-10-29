-- Studio OS: client retention check on staging. TEST DATA ONLY, NOTHING IS KEPT.
--
-- Run in the Supabase SQL editor of the staging project, as one script, after
-- 20261029000200_client_retention.sql is applied.
--
-- Everything the test writes happens inside one block that is rolled back at
-- the end: eleven test clients with their projects, tasks, activity, brief,
-- source material, onboarding, agent runs, proposals, inquiries and hold log,
-- the import batch that dates their history in the past, and the job's run
-- records. Only the results survive, in a temporary table that disappears
-- when the editor session ends.
--
-- The test:
--   1. adds eleven test clients to the oldest studio, each with a unique
--      marker word ("Retcheck…") written into every text it owns, dated the
--      way they will look years from now (history marked as imported, so
--      the database keeps its dates);
--   2. runs the client retention as a dry run, for real, and again (a retry);
--   3. checks, per client: named by the dry run or not, anonymised or not,
--      how many rows anywhere in the public schema still contain its marker,
--      and that everything it keeps (or, if not due, everything) is unchanged;
--   4. checks the dry run changed nothing, every other client's records are
--      unchanged (every column), and the retry did nothing;
--   5. rolls all of it back and checks every column of every table it
--      touched is as before;
--   6. shows one row per check: every "result" should be PASS.

create temp table client_retention_result (label text, expected text, named_by_dry_run boolean, anonymised boolean,
  marker_rows_left int, kept_unchanged boolean, touched_by_retry boolean, result text);

-- Everything that belongs to one client, as one fingerprint (every column).
create or replace function pg_temp.client_world(p_client uuid) returns text
  language sql stable
  as $$
    select concat_ws('|',
      (select md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) from public.clients x where x.id = p_client),
      (select md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.field_key), '')) from public.client_context_fields x where x.client_id = p_client),
      (select md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) from public.client_context_items x where x.client_id = p_client),
      (select md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) from public.client_sources x where x.client_id = p_client),
      (select md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) from public.client_onboardings x where x.client_id = p_client),
      (select md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) from public.projects x where x.client_id = p_client),
      (select md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) from public.tasks x
         where private.entity_client('project', x.project_id) = p_client),
      (select md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) from public.activity_events x
         where private.entity_client(x.entity_type, x.entity_id) = p_client),
      (select md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) from public.agent_runs x where x.client_id = p_client),
      (select md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) from public.agent_proposals x where x.client_id = p_client),
      (select md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) from public.inquiries x where x.client_id = p_client),
      (select md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) from public.client_retention_holds x where x.client_id = p_client))
  $$;

-- What anonymising keeps: the client row without the cleared columns, and
-- the shape of its history (ids, types, times, who on the team).
create or replace function pg_temp.client_kept(p_client uuid) returns text
  language sql stable
  as $$
    select concat_ws('|',
      (select (to_jsonb(x) - array['name', 'contact_person', 'email', 'website', 'initial_notes', 'status', 'archived_at',
                                   'anonymised_at', 'updated_at'])::text from public.clients x where x.id = p_client),
      (select md5(coalesce(string_agg(concat_ws(',', x.id, x.status, x.stage, x.created_at), ';' order by x.id), '')) from public.projects x where x.client_id = p_client),
      (select md5(coalesce(string_agg(concat_ws(',', x.id, x.status, x.created_at), ';' order by x.id), '')) from public.tasks x
         where private.entity_client('project', x.project_id) = p_client),
      (select md5(coalesce(string_agg(concat_ws(',', x.id, x.event_type, x.actor, x."timestamp", x.recorded_at), ';' order by x.id), ''))
         from public.activity_events x where private.entity_client(x.entity_type, x.entity_id) = p_client),
      (select md5(coalesce(string_agg(concat_ws(',', x.id, x.agent, x.status, x.created_at, x.finished_at), ';' order by x.id), ''))
         from public.agent_runs x where x.client_id = p_client),
      (select md5(coalesce(string_agg(concat_ws(',', x.id, x.status, x.decided_by, x.decided_at), ';' order by x.id), ''))
         from public.inquiries x where x.client_id = p_client),
      (select md5(coalesce(string_agg(concat_ws(',', x.id, x.action, x.actor, x.created_at), ';' order by x.id), ''))
         from public.client_retention_holds x where x.client_id = p_client))
  $$;

-- Rows, in any table of the public schema, that contain the text.
create or replace function pg_temp.marker_rows(p_marker text) returns int
  language plpgsql stable
  as $$
  declare t text; n int; total int := 0;
  begin
    for t in select tablename from pg_tables where schemaname = 'public' loop
      execute format('select count(*)::int from public.%I x where to_jsonb(x)::text ilike $1', t) into n using '%' || p_marker || '%';
      total := total + n;
    end loop;
    return total;
  end $$;

-- Tables of the public schema with no row that contains the text.
create or replace function pg_temp.tables_without(p_marker text, p_tables text[]) returns text[]
  language plpgsql stable
  as $$
  declare t text; n int; missing text[] := '{}';
  begin
    foreach t in array p_tables loop
      execute format('select count(*)::int from public.%I x where to_jsonb(x)::text ilike $1', t) into n using '%' || p_marker || '%';
      if n = 0 then missing := missing || t; end if;
    end loop;
    return missing;
  end $$;

-- Every row of every table the test touches, as one fingerprint.
create or replace function pg_temp.everything() returns text
  language sql stable
  as $$
    select concat_ws('|',
      (select md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) from public.clients x),
      (select md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.client_id, x.field_key), '')) from public.client_context_fields x),
      (select md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) from public.client_context_items x),
      (select md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) from public.client_sources x),
      (select md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) from public.client_onboardings x),
      (select md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) from public.projects x),
      (select md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) from public.tasks x),
      (select md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) from public.activity_events x),
      (select md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) from public.import_batches x),
      (select md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) from public.agent_runs x),
      (select md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) from public.agent_proposals x),
      (select md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) from public.inquiries x),
      (select md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) from public.client_retention_holds x),
      (select md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) from private.client_retention_runs x))
  $$;

do $$
declare
  v_studio uuid := (select id from public.studios order by created_at limit 1);
  v_user uuid;
  v_batch uuid := gen_random_uuid();
  -- Where a client's details can live. Onboarding progress holds no text of its own.
  v_tables text[] := array['clients', 'client_context_fields', 'client_context_items', 'client_sources', 'projects', 'tasks',
                           'activity_events', 'agent_runs', 'agent_proposals', 'inquiries', 'client_retention_holds'];
  v_actor jsonb := '{"kind":"human","name":"Retention check (test)","imported":true}';
  v_before text;
  v_after text;
  v_pre_dry text;
  v_post_dry text;
  v_others_before text;
  v_others_after text;
  v_missing text[];
  v_rows jsonb;
  v_dry jsonb;
  v_retry jsonb;
  c record;
  v_project uuid;
  v_task uuid;
  v_run uuid;
  v_first uuid;
begin
  if v_studio is null then
    raise exception 'No studio yet, so there is nowhere to test in.';
  end if;
  v_user := (select user_id from public.studio_members where studio_id = v_studio order by created_at limit 1);

  v_before := pg_temp.everything();

  begin
    create temp table crc (n int, label text, expected text, customer boolean, created interval, archived interval,
      last_human interval, last_on text, automated boolean, hold text, released interval, full_record boolean,
      id uuid default gen_random_uuid(), marker text, inserted text, kept text);
    insert into crc (n, label, expected, customer, created, archived, last_human, last_on, automated, hold, released, full_record) values
      (1, 'Never a customer, last activity 12 months + 1 day ago', 'anonymised', false, '2 years', null, '12 months 1 day', 'client', false, null, null, false),
      (2, 'Never a customer, last activity 1 day short of 12 months', 'unchanged', false, '2 years', null, '12 months -1 day', 'client', false, null, null, false),
      (3, 'Never a customer, idle 2 years, agent and system activity today', 'anonymised', false, '2 years', null, null, null, true, null, null, false),
      (4, 'Never a customer, idle 2 years, a person changed its task yesterday', 'unchanged', false, '2 years', null, '1 day', 'task', false, null, null, false),
      (5, 'Customer archived 3 years + 1 day ago', 'anonymised', true, '5 years', '3 years 1 day', '3 years 1 day', 'client', false, null, null, false),
      (6, 'Customer archived 1 day short of 3 years', 'unchanged', true, '5 years', '3 years -1 day', '3 years -1 day', 'client', false, null, null, false),
      (7, 'Customer, still active, idle 4 years + 1 day', 'anonymised', true, '6 years', null, '4 years 1 day', 'client', false, null, null, false),
      (8, 'Customer, still active, idle 1 day short of 4 years', 'unchanged', true, '6 years', null, '4 years -1 day', 'client', false, null, null, false),
      (9, 'On a retention hold, otherwise due', 'unchanged', false, '3 years', null, null, null, false, 'Open dispute (test)', null, false),
      (10, 'Hold released 10 days ago, otherwise due', 'unchanged', false, '3 years', null, null, null, false, 'Legal request (test)', '10 days', false),
      (11, 'Every kind of record, idle 2 years (full coverage)', 'anonymised', false, '2 years', null, null, null, false, null, null, true);
    update crc set marker = 'Retcheck' || substr(replace(id::text, '-', ''), 1, 10);

    -- History is written as imported, so the database keeps the dates in the past.
    perform set_config('studio_os.importing', 'on', true);
    insert into public.import_batches (id, studio_id, content_hash, imported_by, counts)
      values (v_batch, v_studio, encode(extensions.digest(v_batch::text, 'sha256'), 'hex'), v_user, '{}');

    -- The retention dates are set by the database and never from outside; for
    -- the test, its guard is off while the aged clients are written.
    alter table public.clients disable trigger guard_client;
    for c in select * from crc order by n loop
      insert into public.clients (id, studio_id, name, contact_person, email, website, status, source_type, initial_notes,
          source_received_at, created_at, updated_at, became_customer_at, archived_at)
        values (c.id, v_studio, c.marker || ' AB (test)', c.marker || ' Ek', lower(c.marker) || '@example.com',
          lower(c.marker) || '.example', (case when c.archived is not null then 'archived' when c.customer then 'active' else 'onboarding' end)::public.client_status,
          'contact_form'::public.source_type, 'First call with ' || c.marker || ' (test).', now() - c.created, now() - c.created, now() - c.created,
          case when c.customer then now() - c.created + interval '1 day' end, now() - c.archived);
    end loop;
    alter table public.clients enable trigger guard_client;

    for c in select * from crc order by n loop
      v_project := gen_random_uuid();
      v_task := gen_random_uuid();
      insert into public.projects (id, studio_id, client_id, name, project_type, created_at, updated_at)
        values (v_project, v_studio, c.id, c.marker || ' website', 'website', now() - c.created, now() - c.created);
      insert into public.tasks (id, studio_id, project_id, title, status, blocked_reason, created_at, updated_at)
        values (v_task, v_studio, v_project, 'Photos of ' || c.marker, 'blocked', 'Waiting for ' || c.marker, now() - c.created, now() - c.created);
      insert into public.activity_events (id, studio_id, entity_type, entity_id, event_type, description, actor, "timestamp", import_batch_id)
        values (gen_random_uuid(), v_studio, 'client', c.id, 'client.created', 'Created ' || c.marker || ' AB', v_actor, now() - c.created, v_batch);
      if c.last_human is not null then
        insert into public.activity_events (id, studio_id, entity_type, entity_id, event_type, description, actor, "timestamp", import_batch_id)
          values (gen_random_uuid(), v_studio, c.last_on::public.entity_type, case when c.last_on = 'task' then v_task else c.id end,
            case when c.last_on = 'task' then 'task.status_changed' else 'client.updated' end,
            'Changed ' || c.marker || ' details', v_actor, now() - c.last_human, v_batch);
      end if;

      if c.full_record then
        insert into public.client_context_fields (studio_id, client_id, field_key, value, confidence, note, recorded_by, history)
          values (v_studio, c.id, 'goal', 'More bookings for ' || c.marker, 'observed', 'Said by ' || c.marker, v_actor,
                  jsonb_build_array(jsonb_build_object('value', 'Bookings for ' || c.marker, 'confidence', 'proposed')));
        insert into public.client_context_fields (studio_id, client_id, field_key, value, confidence, recorded_by)
          values (v_studio, c.id, 'industry', c.marker || '''s yoga studio', 'observed', v_actor);
        insert into public.client_context_items (id, studio_id, client_id, kind, text)
          values (gen_random_uuid(), v_studio, c.id, 'question', 'Does ' || c.marker || ' have a logo?');
        insert into public.client_sources (id, studio_id, client_id, type, label, content, added_by, received_at, created_at)
          values (gen_random_uuid(), v_studio, c.id, 'meeting', 'Call with ' || c.marker, c.marker || ' lives in Turku and has two studios.',
                  v_actor, now() - c.created, now() - c.created);
        insert into public.client_onboardings (id, studio_id, client_id, status, current_step, created_at, updated_at)
          values (gen_random_uuid(), v_studio, c.id, 'in_progress', 'setup', now() - c.created, now() - c.created);
        v_run := gen_random_uuid();
        insert into public.agent_runs (id, studio_id, client_id, agent, task_type, idempotency_key, status, "trigger", inputs, outputs,
            result, blocker, error, created_at, finished_at)
          values (v_run, v_studio, c.id, 'research', 'research.intake', 'retention-check:' || v_run, 'needs_approval',
            jsonb_build_object('kind', 'manual', 'note', c.marker), jsonb_build_array(jsonb_build_object('label', 'Call with ' || c.marker)),
            jsonb_build_array(jsonb_build_object('text', c.marker)), jsonb_build_object('summary', c.marker || ' runs two studios'),
            'Ask ' || c.marker, jsonb_build_object('message', c.marker), now() - c.created, now() - c.created);
        insert into public.agent_proposals (studio_id, run_id, client_id, target, value, evidence, created_at)
          values (v_studio, v_run, c.id, 'contactPerson', c.marker || ' Ek',
            jsonb_build_array(jsonb_build_object('sourceId', gen_random_uuid(), 'sourceLabel', 'Call with ' || c.marker, 'quote', c.marker || ' lives in Turku')),
            now() - c.created);
        -- The inquiry that became this client, and a repeat merged into it.
        v_first := gen_random_uuid();
        insert into public.inquiries (id, studio_id, source, submission_id, content_hash, status, is_test, locale, contact_name, email,
            company, website, service, budget_range, budget_amount_eur, message, privacy_notice_version, submitted_at, received_at,
            decided_at, decided_by, client_id, created_client, repeat_of)
          values
            (v_first, v_studio, 'axivo_website', gen_random_uuid(), repeat('0', 64), 'approved', true, 'en', c.marker || ' Ek',
             lower(c.marker) || '@example.com', c.marker || ' AB (test)', lower(c.marker) || '.example', 'websites', 'custom', 5000,
             'Hello, ' || c.marker || ' here. We need a new website with booking.', 'test-2026-10', now() - c.created, now() - c.created,
             now() - c.created, v_actor, c.id, true, null),
            (gen_random_uuid(), v_studio, 'axivo_website', gen_random_uuid(), repeat('1', 64), 'merged', true, 'en', c.marker || ' Ek',
             lower(c.marker) || '@example.com', c.marker || ' AB (test)', lower(c.marker) || '.example', 'websites', 'custom', 5000,
             'Forgot to say: ' || c.marker || ' also needs a gift card shop.', 'test-2026-10', now() - c.created, now() - c.created,
             now() - c.created, v_actor, c.id, false, v_first);
        insert into public.client_retention_holds (studio_id, client_id, action, reason, actor, created_at) values
          (v_studio, c.id, 'hold', 'Dispute with ' || c.marker || ' (test)', v_actor, now() - c.created + interval '1 month'),
          (v_studio, c.id, 'release', null, v_actor, now() - c.created + interval '2 months');
      end if;

      if c.hold is not null and c.released is null then
        perform set_config('studio_os.setting_retention_hold', c.id::text, true);
        update public.clients set retention_hold_reason = c.hold || ' ' || c.marker, retention_hold_by = v_actor, retention_held_at = now() - interval '1 month'
          where id = c.id;
        perform set_config('studio_os.setting_retention_hold', '', true);
        insert into public.client_retention_holds (studio_id, client_id, action, reason, actor, created_at)
          values (v_studio, c.id, 'hold', c.hold || ' ' || c.marker, v_actor, now() - interval '1 month');
      elsif c.hold is not null then
        insert into public.client_retention_holds (studio_id, client_id, action, reason, actor, created_at) values
          (v_studio, c.id, 'hold', c.hold || ' ' || c.marker, v_actor, now() - c.released - interval '20 days'),
          (v_studio, c.id, 'release', null, v_actor, now() - c.released);
      end if;
    end loop;
    perform set_config('studio_os.importing', 'off', true);

    -- Automated activity today: the agent runner and the system. It must not count.
    for c in select * from crc where automated loop
      insert into public.activity_events (id, studio_id, entity_type, entity_id, event_type, description, actor) values
        (gen_random_uuid(), v_studio, 'client', c.id, 'agent.run_completed', 'Analysed ' || c.marker, '{"kind":"agent","agentId":"research"}'),
        (gen_random_uuid(), v_studio, 'client', c.id, 'client.updated', 'System note on ' || c.marker, '{"kind":"system"}');
    end loop;

    update crc set inserted = pg_temp.client_world(id), kept = pg_temp.client_kept(id);
    v_missing := pg_temp.tables_without((select marker from crc where full_record), v_tables);
    v_others_before := (select md5(string_agg(pg_temp.client_world(x.id), ',' order by x.id)) from public.clients x
                          where x.id not in (select id from crc));

    v_pre_dry := pg_temp.everything();
    v_dry := private.run_client_retention(true);
    -- The dry run's own run record is the only change it may make.
    delete from private.client_retention_runs where id = (select max(id) from private.client_retention_runs);
    v_post_dry := pg_temp.everything();

    perform private.run_client_retention(false);
    v_retry := private.run_client_retention(false);

    v_others_after := (select md5(string_agg(pg_temp.client_world(x.id), ',' order by x.id)) from public.clients x
                         where x.id not in (select id from crc));

    select jsonb_agg(jsonb_build_object(
        'label', t.label, 'expected', t.expected,
        'named_by_dry_run', exists (select 1 from jsonb_array_elements(v_dry -> 'anonymised') e where (e ->> 'id')::uuid = t.id),
        'anonymised', x.anonymised_at is not null,
        'marker_rows_left', pg_temp.marker_rows(t.marker),
        -- Anonymised: what is kept is as inserted. Not due: every column of everything it owns is as inserted.
        'kept_unchanged', case when t.expected = 'anonymised' then pg_temp.client_kept(t.id) = t.kept
                               else pg_temp.client_world(t.id) = t.inserted end,
        'touched_by_retry', exists (select 1 from jsonb_array_elements(v_retry -> 'anonymised') e where (e ->> 'id')::uuid = t.id))
        order by t.n)
      || jsonb_build_array(
        jsonb_build_object('label', 'Before the run, the full client''s details were in every table where they can live', 'expected', 'all',
          'marker_rows_left', coalesce(array_length(v_missing, 1), 0), 'kept_unchanged', true),
        jsonb_build_object('label', 'Dry run changed nothing (every column, every table)', 'expected', 'identical',
          'marker_rows_left', 0, 'kept_unchanged', v_pre_dry = v_post_dry),
        jsonb_build_object('label', 'Dry run names only these test clients', 'expected', 'nothing else',
          'marker_rows_left', (select count(*) from jsonb_array_elements(v_dry -> 'anonymised') e
                                 where (e ->> 'id')::uuid not in (select id from crc)), 'kept_unchanged', true),
        jsonb_build_object('label', 'Retry anonymises nothing', 'expected', 'nothing',
          'marker_rows_left', jsonb_array_length(v_retry -> 'anonymised'), 'kept_unchanged', true),
        jsonb_build_object('label', 'Every other client and its records unchanged by the runs (every column)', 'expected', 'identical',
          'marker_rows_left', 0, 'kept_unchanged', v_others_before is not distinct from v_others_after))
      into v_rows
      from crc t join public.clients x on x.id = t.id;

    -- Undo everything above. Local variables keep their values.
    raise exception using errcode = 'RC001', message = 'roll back the test data';
  exception when sqlstate 'RC001' then
    null;
  end;

  v_after := pg_temp.everything();

  insert into client_retention_result (label, expected, named_by_dry_run, anonymised, marker_rows_left, kept_unchanged, touched_by_retry)
  select r.label, r.expected, r.named_by_dry_run, r.anonymised, r.marker_rows_left, r.kept_unchanged, r.touched_by_retry
  from jsonb_to_recordset(v_rows) as r(label text, expected text, named_by_dry_run boolean, anonymised boolean,
                                       marker_rows_left int, kept_unchanged boolean, touched_by_retry boolean);

  insert into client_retention_result (label, expected, marker_rows_left, kept_unchanged)
  values ('Nothing left behind: clients, everything they own, inquiries, imports, runs (every column)', 'identical', 0, v_after = v_before);
end $$;

select label, expected, named_by_dry_run, anonymised, marker_rows_left, kept_unchanged, touched_by_retry,
  case when expected = 'anonymised' then
         case when named_by_dry_run and anonymised and marker_rows_left = 0 and kept_unchanged and not touched_by_retry
              then 'PASS' else 'FAIL' end
       when expected = 'unchanged' then
         case when not named_by_dry_run and not anonymised and marker_rows_left > 0 and kept_unchanged and not touched_by_retry
              then 'PASS' else 'FAIL' end
       else case when marker_rows_left = 0 and kept_unchanged then 'PASS' else 'FAIL' end
  end as result
from client_retention_result;
