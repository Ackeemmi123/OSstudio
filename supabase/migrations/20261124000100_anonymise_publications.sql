/* ------------------------------------------------------------------------ */
/* Anonymising a client also clears its publications: where the site's      */
/* forms were mailed and the site's name. The rows stay, so the agency can  */
/* see that a site was published and take it down at the hosting by hand.  */
/* ------------------------------------------------------------------------ */

-- As in 20261123000100_anonymise_new_tables.sql, plus publications.
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
