-- Studio OS: access control.
--
-- Three layers, so that no single mistake exposes or corrupts data:
--   1. Grants: the anonymous role gets nothing; signed-in users get only the
--      operations the app needs (no deletes; append-only history).
--   2. Row-level security: every row is visible only to members of its
--      studio, and writable only by owners and members (not viewers).
--   3. Triggers: rules that hold whatever a client sends. People cannot act
--      in someone else's name, only a person can confirm a client fact or
--      approve work, history cannot be rewritten, and rows cannot move
--      between studios.
--
-- The server-side agent runner uses the service role, which bypasses row-level
-- security. The triggers still apply to it: it cannot confirm, approve, or
-- pose as a person.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

/* ------------------------------------------------------------------------ */
/* Membership helpers                                                        */
/* ------------------------------------------------------------------------ */

-- security definer so policies can read studio_members without recursing
-- into its own policies. Each only ever answers for the calling user.
create function private.member_role(p_studio uuid) returns public.member_role
  language sql stable security definer set search_path = ''
  as $$ select role from public.studio_members where studio_id = p_studio and user_id = (select auth.uid()) $$;

create function private.is_member(p_studio uuid) returns boolean
  language sql stable security definer set search_path = ''
  as $$ select private.member_role(p_studio) is not null $$;

create function private.can_write(p_studio uuid) returns boolean
  language sql stable security definer set search_path = ''
  as $$ select coalesce(private.member_role(p_studio) in ('owner', 'member'), false) $$;

create function private.is_owner(p_studio uuid) returns boolean
  language sql stable security definer set search_path = ''
  as $$ select coalesce(private.member_role(p_studio) = 'owner', false) $$;

revoke all on all functions in schema private from public;
grant execute on function private.member_role(uuid), private.is_member(uuid), private.can_write(uuid), private.is_owner(uuid)
  to authenticated, service_role;

-- True only inside import_browser_data() (see the functions migration), which
-- sets it for its own transaction. Imported rows keep their original
-- timestamps and are marked as imported instead of naming the importer.
create function private.importing() returns boolean
  language sql stable set search_path = ''
  as $$ select coalesce(current_setting('studio_os.importing', true), '') = 'on' $$;

create function private.ends_with(arr jsonb, tail jsonb) returns boolean
  language sql immutable set search_path = ''
  as $$
    select jsonb_array_length(arr) >= jsonb_array_length(tail)
      and coalesce(
        (select jsonb_agg(e order by i) from jsonb_array_elements(arr) with ordinality t(e, i)
          where i > jsonb_array_length(arr) - jsonb_array_length(tail)),
        '[]'::jsonb
      ) = tail
  $$;

grant execute on function private.importing(), private.ends_with(jsonb, jsonb) to authenticated, service_role;

-- The calling person's actor id, or null for the service role.
create function private.acts_as_caller(actor jsonb) returns boolean
  language sql stable set search_path = ''
  as $$ select actor ->> 'kind' = 'human' and actor ->> 'userId' = (select auth.uid())::text $$;
grant execute on function private.acts_as_caller(jsonb) to authenticated, service_role;

/* ------------------------------------------------------------------------ */
/* Grants                                                                    */
/* ------------------------------------------------------------------------ */

revoke all on all tables in schema public from anon, authenticated;
grant select on all tables in schema public to authenticated;
grant insert, update on public.clients, public.client_context_fields, public.projects, public.tasks to authenticated;
-- Questions, source material and activity are append-only for people.
grant insert on public.client_context_items, public.client_sources, public.activity_events, public.import_batches to authenticated;
-- People review proposals; they cannot edit what the agent proposed.
grant update (status, review_confidence, reviewed_by, reviewed_at) on public.agent_proposals to authenticated;

-- Tables added later get no access until a migration grants it.
alter default privileges in schema public revoke all on tables from anon, authenticated;

/* ------------------------------------------------------------------------ */
/* Row-level security                                                        */
/* ------------------------------------------------------------------------ */

alter table public.studios enable row level security;
alter table public.studio_members enable row level security;
alter table public.clients enable row level security;
alter table public.client_context_fields enable row level security;
alter table public.client_context_items enable row level security;
alter table public.client_sources enable row level security;
alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.import_batches enable row level security;
alter table public.activity_events enable row level security;
alter table public.agent_runs enable row level security;
alter table public.agent_proposals enable row level security;

create policy "members read" on public.studios for select to authenticated using (private.is_member(id));
create policy "members read" on public.studio_members for select to authenticated using (private.is_member(studio_id));

do $$
declare t text;
begin
  foreach t in array array['clients', 'client_context_fields', 'client_context_items', 'client_sources', 'projects', 'tasks',
                           'import_batches', 'activity_events', 'agent_runs', 'agent_proposals'] loop
    execute format('create policy "members read" on public.%I for select to authenticated using (private.is_member(studio_id))', t);
  end loop;
  foreach t in array array['clients', 'client_context_fields', 'client_context_items', 'client_sources', 'projects', 'tasks',
                           'activity_events'] loop
    execute format('create policy "writers insert" on public.%I for insert to authenticated with check (private.can_write(studio_id))', t);
  end loop;
  foreach t in array array['clients', 'client_context_fields', 'projects', 'tasks', 'agent_proposals'] loop
    execute format(
      'create policy "writers update" on public.%I for update to authenticated using (private.can_write(studio_id)) with check (private.can_write(studio_id))', t);
  end loop;
end $$;

create policy "writers import" on public.import_batches for insert to authenticated
  with check (private.can_write(studio_id) and imported_by = (select auth.uid()));

/* ------------------------------------------------------------------------ */
/* Triggers                                                                  */
/* ------------------------------------------------------------------------ */

-- Rows never move between studios.
create function private.keep_studio() returns trigger
  language plpgsql set search_path = ''
  as $$
  begin
    if new.studio_id is distinct from old.studio_id then
      raise exception 'Records cannot be moved to another studio.' using errcode = '42501';
    end if;
    return new;
  end $$;

-- Timestamps come from the database clock, not the browser's.
create function private.stamp_times() returns trigger
  language plpgsql set search_path = ''
  as $$
  begin
    if tg_op = 'INSERT' then
      if not private.importing() then
        new := jsonb_populate_record(new, jsonb_build_object('created_at', now(), 'updated_at', now()));
      end if;
    else
      new := jsonb_populate_record(new, jsonb_build_object('updated_at', now()));
    end if;
    return new;
  end $$;

do $$
declare t text;
begin
  foreach t in array array['clients', 'client_context_fields', 'client_context_items', 'client_sources', 'projects', 'tasks',
                           'agent_runs', 'agent_proposals'] loop
    execute format('create trigger keep_studio before update on public.%I for each row execute function private.keep_studio()', t);
  end loop;
  foreach t in array array['clients', 'client_context_fields', 'projects', 'tasks', 'client_context_items', 'client_sources'] loop
    execute format('create trigger stamp_times before insert or update on public.%I for each row execute function private.stamp_times()', t);
  end loop;
end $$;

-- Activity: append-only, attributed to whoever is actually signed in.
create function private.guard_activity() returns trigger
  language plpgsql set search_path = ''
  as $$
  begin
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

    new.recorded_at := now();
    return new;
  end $$;

create trigger guard_activity before insert or update or delete on public.activity_events
  for each row execute function private.guard_activity();

-- Brief values: recorded in your own name, confirmed only by a person,
-- history only ever grows.
create function private.guard_context_field() returns trigger
  language plpgsql set search_path = ''
  as $$
  declare
    value_changed boolean := tg_op = 'INSERT' or new.value is distinct from old.value;
    newly_confirmed boolean := new.confidence = 'confirmed'
      and (tg_op = 'INSERT' or old.confidence <> 'confirmed' or new.value is distinct from old.value);
  begin
    if tg_op = 'UPDATE' and not private.ends_with(new.history, old.history) then
      raise exception 'Earlier values cannot be removed from history.' using errcode = '42501';
    end if;
    if private.importing() then
      return new;
    end if;

    if auth.uid() is not null then
      if value_changed and new.value is not null and not private.acts_as_caller(new.recorded_by) then
        raise exception 'Values must be recorded in your own name.' using errcode = '42501';
      end if;
      if newly_confirmed and not private.acts_as_caller(new.confirmed_by) then
        raise exception 'Values must be confirmed in your own name.' using errcode = '42501';
      end if;
    elsif newly_confirmed then
      raise exception 'Only a person can confirm client information.' using errcode = '42501';
    end if;

    if newly_confirmed then
      new.confirmed_at := now();
    elsif new.confidence = 'confirmed' then
      new.confirmed_by := old.confirmed_by;
      new.confirmed_at := old.confirmed_at;
    else
      new.confirmed_by := null;
      new.confirmed_at := null;
    end if;
    return new;
  end $$;

create trigger guard_context_field before insert or update on public.client_context_fields
  for each row execute function private.guard_context_field();

-- Approving work (awaiting approval → done) is a person's decision.
create function private.guard_task() returns trigger
  language plpgsql set search_path = ''
  as $$
  begin
    if old.status = 'awaiting_approval' and new.status = 'done' and auth.uid() is null and not private.importing() then
      raise exception 'Only a person can approve work.' using errcode = '42501';
    end if;
    return new;
  end $$;

create trigger guard_task before update on public.tasks for each row execute function private.guard_task();

-- Source material is added in your own name.
create function private.guard_source() returns trigger
  language plpgsql set search_path = ''
  as $$
  begin
    if auth.uid() is not null and not private.importing() and not private.acts_as_caller(new.added_by) then
      raise exception 'Source material must be added in your own name.' using errcode = '42501';
    end if;
    return new;
  end $$;

create trigger guard_source before insert on public.client_sources for each row execute function private.guard_source();

-- Proposals: a person accepts or dismisses a pending proposal once, in their
-- own name. The runner may only mark a pending proposal superseded.
create function private.guard_proposal() returns trigger
  language plpgsql set search_path = ''
  as $$
  begin
    if auth.uid() is not null then
      if old.status <> 'pending' then
        raise exception 'This proposal has already been reviewed.' using errcode = 'SO409';
      end if;
      if new.status not in ('accepted', 'dismissed') or not private.acts_as_caller(new.reviewed_by) then
        raise exception 'Proposals are reviewed in your own name.' using errcode = '42501';
      end if;
      new.reviewed_at := now();
    elsif not (old.status = 'pending' and new.status = 'superseded'
               and (to_jsonb(new) - 'status') = (to_jsonb(old) - 'status')) then
      raise exception 'Only a person can review a proposal.' using errcode = '42501';
    end if;
    return new;
  end $$;

create trigger guard_proposal before update on public.agent_proposals for each row execute function private.guard_proposal();
