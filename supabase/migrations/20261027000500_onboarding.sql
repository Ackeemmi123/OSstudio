-- Studio OS: guided client onboarding.
--
-- 1. The brief gains values for the business, current setup, scope and timing.
--    Existing clients get an "unknown" row for each new value, so the app can
--    update them like any other.
-- 2. client_onboardings tracks progress through the guided onboarding: status,
--    current step and questions marked "not known yet". It holds no answers;
--    those are brief values and client details, stored where they always were.
-- 3. apply_onboarding_changes() writes one onboarding step (brief values,
--    details, questions, events and progress) in a single transaction.
-- 4. import_browser_data() also imports onboarding progress from the browser.

/* ------------------------------------------------------------------------ */
/* Brief values                                                              */
/* ------------------------------------------------------------------------ */

alter table public.client_context_fields drop constraint client_context_fields_field_key_check;
alter table public.client_context_fields add constraint client_context_fields_field_key_check check (field_key in (
  'industry', 'offering',
  'salesChannels', 'platform', 'storeUrl', 'integrations',
  'goal', 'targetAudience', 'challenges', 'outcomes',
  'requirements', 'designPreferences', 'content', 'technicalConstraints', 'existingMaterials',
  'budget', 'deadline', 'dependencies'
));

alter table public.agent_proposals drop constraint agent_proposals_target_check;
alter table public.agent_proposals add constraint agent_proposals_target_check check (target in (
  'industry', 'offering',
  'salesChannels', 'platform', 'storeUrl', 'integrations',
  'goal', 'targetAudience', 'challenges', 'outcomes',
  'requirements', 'designPreferences', 'content', 'technicalConstraints', 'existingMaterials',
  'budget', 'deadline', 'dependencies',
  'companyName', 'contactPerson', 'email', 'website'
));

insert into public.client_context_fields (studio_id, client_id, field_key)
  select c.studio_id, c.id, k.field_key
  from public.clients c
  cross join unnest(array[
    'industry', 'offering', 'salesChannels', 'storeUrl', 'integrations', 'challenges', 'outcomes',
    'designPreferences', 'content', 'technicalConstraints', 'existingMaterials', 'dependencies'
  ]) as k(field_key)
  on conflict (client_id, field_key) do nothing;

/* ------------------------------------------------------------------------ */
/* Onboarding progress                                                       */
/* ------------------------------------------------------------------------ */

create table public.client_onboardings (
  id uuid primary key,
  studio_id uuid not null,
  client_id uuid not null,
  -- Set when a project gets its own onboarding path. Null: the client's first one.
  project_id uuid,
  status text not null default 'draft' check (status in ('draft', 'in_progress', 'ready_for_review')),
  current_step text not null default 'business'
    check (current_step in ('business', 'setup', 'goals', 'scope', 'timeline', 'review')),
  -- Brief keys a person marked as not known yet.
  skipped jsonb not null default '[]' check (jsonb_typeof(skipped) = 'array' and jsonb_array_length(skipped) <= 50),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  foreign key (client_id, studio_id) references public.clients (id, studio_id) on delete cascade,
  foreign key (project_id, studio_id) references public.projects (id, studio_id) on delete cascade,
  constraint completed_when_ready check ((status = 'ready_for_review') = (completed_at is not null))
);
-- One onboarding per client (and, later, per project): double submits cannot start two.
create unique index client_onboardings_client_idx on public.client_onboardings (client_id) where project_id is null;
create unique index client_onboardings_project_idx on public.client_onboardings (project_id) where project_id is not null;
create index client_onboardings_studio_idx on public.client_onboardings (studio_id);

alter table public.client_onboardings enable row level security;
grant select, insert, update on public.client_onboardings to authenticated;
create policy "members read" on public.client_onboardings for select to authenticated using (private.is_member(studio_id));
create policy "writers insert" on public.client_onboardings for insert to authenticated with check (private.can_write(studio_id));
create policy "writers update" on public.client_onboardings for update to authenticated
  using (private.can_write(studio_id)) with check (private.can_write(studio_id));

create trigger keep_studio before update on public.client_onboardings for each row execute function private.keep_studio();
create trigger stamp_times before insert or update on public.client_onboardings for each row execute function private.stamp_times();

/* ------------------------------------------------------------------------ */
/* Writing                                                                   */
/* ------------------------------------------------------------------------ */

-- Applies the domain change through apply_changes() (same checks, same
-- transaction), then inserts or updates the onboarding row. Updates carry the
-- updated_at the browser last saw, like every other update.
create function public.apply_onboarding_changes(p_studio uuid, p_changes jsonb, p_onboarding jsonb) returns void
  language plpgsql set search_path = ''
  as $$
  declare
    r jsonb := p_onboarding -> 'row';
    n int;
  begin
    perform public.apply_changes(p_studio, p_changes);
    if p_onboarding is null or p_onboarding = 'null'::jsonb then
      return;
    end if;
    if p_onboarding ->> 'op' = 'insert' then
      insert into public.client_onboardings
        select * from jsonb_populate_record(null::public.client_onboardings, r || jsonb_build_object('studio_id', p_studio));
    else
      update public.client_onboardings t set status = x.status, current_step = x.current_step, skipped = x.skipped,
          completed_at = x.completed_at
        from jsonb_populate_record(null::public.client_onboardings, r) x
        where t.id = x.id and t.studio_id = p_studio and t.updated_at = (p_onboarding ->> 'expected')::timestamptz;
      get diagnostics n = row_count;
      if n = 0 then perform private.no_row('public.client_onboardings', format('id = %L', r ->> 'id'), p_studio); end if;
    end if;
  end $$;

revoke execute on function public.apply_onboarding_changes(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.apply_onboarding_changes(uuid, jsonb, jsonb) to authenticated;

/* ------------------------------------------------------------------------ */
/* Import from the browser demo                                              */
/* ------------------------------------------------------------------------ */

-- Same as in the functions migration, plus onboarding progress, so a person
-- can continue an onboarding they started in the browser demo.
create or replace function public.import_browser_data(p_studio uuid, p_hash text, p_data jsonb) returns jsonb
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

    -- Onboarding progress (added by the onboarding migration). Skipped when the
    -- client already has an onboarding on the server, whatever its id.
    insert into public.client_onboardings
      select x.* from jsonb_array_elements(coalesce(p_data -> 'onboardings', '[]')) e,
        jsonb_populate_record(null::public.client_onboardings, e || jsonb_build_object('studio_id', p_studio, 'project_id', null)) x
      on conflict do nothing;
    get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('onboardings', n);

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

revoke execute on function public.import_browser_data(uuid, text, jsonb) from public, anon;
grant execute on function public.import_browser_data(uuid, text, jsonb) to authenticated;
