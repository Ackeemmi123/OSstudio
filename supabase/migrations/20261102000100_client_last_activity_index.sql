-- Studio OS: find a client's activity through activity_events_entity_idx.
--
-- load_studio() calls this twice per client. With its conditions joined by OR
-- it could not use the index, so each call read every studio's events and
-- checked row-level security on each. Same answers, same grants; no data changes.
-- The daily client retention run reads this function too.
create or replace function private.client_last_activity(p_client uuid) returns timestamptz
  language sql stable set search_path = ''
  as $$
    select greatest(
      (select created_at from public.clients where id = p_client),
      (select max(least(e."timestamp", e.recorded_at)) from public.activity_events e
        where e.actor ->> 'kind' = 'human'
          and (e.entity_type, e.entity_id) in (
            select 'client'::public.entity_type, p_client
            union all select 'project', id from public.projects where client_id = p_client
            union all select 'task', t.id from public.tasks t join public.projects p on p.id = t.project_id where p.client_id = p_client)))
  $$;
