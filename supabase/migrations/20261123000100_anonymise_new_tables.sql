/* ------------------------------------------------------------------------ */
/* Anonymising a client also removes what later parts of Studio OS keep     */
/* about it: its own files (client_materials), the documents its site       */
/* offered (site_documents), its built sites (site_builds and their files), */
/* and the comments and approvals from the review link. Before this, those  */
/* stayed after the client was anonymised.                                  */
/*                                                                          */
/* Storage refuses deletes from SQL, so files go into a queue that the      */
/* nightly purge (/api/storage/purge) empties through the Storage API, as   */
/* it already does for images. A person deleting a client file or a site    */
/* document now queues its file the same way, instead of keeping it.        */
/* ------------------------------------------------------------------------ */

create table public.storage_purge_queue (
  id bigint generated always as identity primary key,
  bucket text not null check (bucket in ('client-materials', 'site-documents', 'site-builds')),
  -- A file, or with is_prefix a folder whose files all go (a built site).
  path text not null check (char_length(path) between 1 and 400),
  is_prefix boolean not null default false,
  requested_at timestamptz not null default now()
);

revoke all on public.storage_purge_queue from public, anon, authenticated, service_role;
alter table public.storage_purge_queue enable row level security;

/* For the purge only: what to remove, oldest first. */
create function public.storage_files_due_for_purge(p_limit int default 100) returns table (id bigint, bucket text, path text, is_prefix boolean)
  language sql stable security definer set search_path = '' as $$
  select q.id, q.bucket, q.path, q.is_prefix from public.storage_purge_queue q
   order by q.requested_at limit greatest(1, least(p_limit, 500));
$$;

/* For the purge only, after the files are gone from Storage. */
create function public.forget_purged_storage_files(p_ids bigint[]) returns int
  language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  delete from public.storage_purge_queue where id = any (p_ids);
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.storage_files_due_for_purge(int), public.forget_purged_storage_files(bigint[]) from public, anon, authenticated;
grant execute on function public.storage_files_due_for_purge(int), public.forget_purged_storage_files(bigint[]) to service_role;

/* A writer hides a client file; its file is queued for the purge. */
create or replace function public.delete_client_material(p_material uuid) returns timestamptz
  language plpgsql security definer set search_path = '' as $$
declare
  v_studio uuid;
  v_deleted timestamptz;
  v_path text;
begin
  select studio_id, deleted_at, storage_path into v_studio, v_deleted, v_path from public.client_materials where id = p_material;
  if v_studio is null or not private.can_write(v_studio) then
    raise exception 'This file does not exist, or you cannot change it.' using errcode = '42501';
  end if;
  if v_deleted is not null then return v_deleted; end if;
  update public.client_materials set deleted_at = now() where id = p_material returning deleted_at into v_deleted;
  insert into public.storage_purge_queue (bucket, path) values ('client-materials', v_path);
  return v_deleted;
end;
$$;

/* A writer deletes a site document; its file is queued for the purge. Sites already built keep their own copy. */
create or replace function public.delete_site_document(p_document uuid) returns timestamptz
  language plpgsql security definer set search_path = '' as $$
declare
  v_studio uuid;
  v_deleted timestamptz;
  v_path text;
begin
  select studio_id, deleted_at, storage_path into v_studio, v_deleted, v_path from public.site_documents where id = p_document;
  if v_studio is null or not private.can_write(v_studio) then
    raise exception 'This document does not exist, or you cannot change it.' using errcode = '42501';
  end if;
  if v_deleted is not null then return v_deleted; end if;
  update public.site_documents set deleted_at = now() where id = p_document returning deleted_at into v_deleted;
  insert into public.storage_purge_queue (bucket, path) values ('site-documents', v_path);
  return v_deleted;
end;
$$;

-- As in 20261031000100_site_assets.sql, plus the client's files, documents,
-- built sites, review comments and approvals.
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
    update public.site_assets set status = 'deleted' where client_id = p_id and status <> 'deleted';

    -- The client's own files, the documents its site offered, and every built
    -- site: the files are queued for the nightly purge (Storage refuses deletes
    -- from SQL), the links are turned off, and the records are removed. Comments
    -- and approvals from the review link name the client's people, so they go too.
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
    update public.site_builds set revoked_at = coalesce(revoked_at, now()), reviews_enabled = false, checks = '[]'
      where client_id = p_id;

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
