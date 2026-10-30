-- Studio OS: website images (Website Factory WF-2).
--
-- 1. site_assets: one row per stored image of a client, with provenance and
--    a person's rights decision. Files live in the private Storage bucket
--    "site-assets" at {studio}/{client}/{asset}.{ext}.
-- 2. Nobody writes the table directly. People go through
--    begin_site_asset_upload (start an upload), review_site_asset (rights
--    decision) and delete_site_asset; the server's service role alone
--    marks an upload validated (finish_site_asset_upload), after checking
--    the file's bytes (src/server/site-assets/validate-image.ts). A file
--    uploaded around the server is never validated: it cannot be read,
--    reviewed or used, and the purge removes it.
-- 3. Storage policies go through the table: an object is readable by the
--    studio's people once validated and until deleted; it can be uploaded
--    only to the path of an upload the caller began in the last 15 minutes.
--    Nobody can change or delete an object; files are deleted through the
--    Storage API by the purge (src/server/storage/purge.ts), because Storage
--    refuses deletes from SQL.
-- 4. A website spec can be approved only when every image it uses is an
--    approved image of the same client (guard_site_spec).
-- 5. Anonymising a client marks its images deleted (hidden at once, purged
--    within a day).

/* ------------------------------------------------------------------------ */
/* Bucket                                                                    */
/* ------------------------------------------------------------------------ */

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('site-assets', 'site-assets', false, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

/* ------------------------------------------------------------------------ */
/* Table                                                                     */
/* ------------------------------------------------------------------------ */

create table public.site_assets (
  id uuid primary key,
  studio_id uuid not null,
  client_id uuid not null,
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  byte_size int not null check (byte_size between 1 and 3145728),
  width int not null check (width between 200 and 2560),
  height int not null check (height between 200 and 2560),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  -- What the image shows, in the studio's words (alt texts belong to the spec, per language).
  description text not null check (char_length(btrim(description)) between 1 and 500),
  source_note text check (char_length(source_note) <= 500),
  -- Copyright and licensing.
  rights_basis text check (rights_basis in ('client_owns', 'studio_created', 'licensed', 'other')),
  licence_note text check (char_length(licence_note) <= 500),
  -- Permission to use the image on this client's website.
  use_permitted boolean not null default false,
  use_permission_note text check (char_length(use_permission_note) <= 500),
  -- Identifiable people: the lawful basis the studio relies on, and where it is documented.
  identifiable_people boolean not null default false,
  people_basis text check (people_basis in ('consent', 'contract', 'legitimate_interests', 'other')),
  people_basis_note text check (char_length(people_basis_note) <= 500),
  status text not null default 'uploading' check (status in ('uploading', 'pending_review', 'approved', 'rejected', 'deleted')),
  validated_at timestamptz,
  uploaded_by jsonb not null check (jsonb_typeof(uploaded_by) = 'object'),
  reviewed_by jsonb,
  reviewed_at timestamptz,
  review_note text check (char_length(review_note) <= 1000),
  purge_requested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (client_id, studio_id) references public.clients (id, studio_id) on delete cascade,
  constraint validated_before_review check (status in ('uploading', 'deleted') or validated_at is not null),
  constraint deleted_has_purge check ((status = 'deleted') = (purge_requested_at is not null)),
  constraint approval_complete check (status <> 'approved' or (
    reviewed_by is not null and rights_basis is not null
    and use_permitted and coalesce(btrim(use_permission_note), '') <> ''
    and (rights_basis not in ('licensed', 'other') or coalesce(btrim(licence_note), '') <> '')
    and (not identifiable_people or (people_basis is not null and coalesce(btrim(people_basis_note), '') <> ''))
  ))
);
create unique index site_assets_client_sha_idx on public.site_assets (client_id, sha256)
  where status not in ('uploading', 'deleted');
create index site_assets_client_idx on public.site_assets (client_id);
create index site_assets_studio_idx on public.site_assets (studio_id);
create index site_assets_purge_idx on public.site_assets (purge_requested_at) where purge_requested_at is not null;

alter table public.site_assets enable row level security;
-- Read only; every write goes through the functions below.
revoke all on public.site_assets from public, anon, authenticated, service_role;
grant select on public.site_assets to authenticated;
create policy "members read" on public.site_assets for select to authenticated using (private.is_member(studio_id));

create trigger keep_studio before update on public.site_assets for each row execute function private.keep_studio();
create trigger stamp_times before insert or update on public.site_assets for each row execute function private.stamp_times();
create trigger refuse_anonymised_client before insert or update on public.site_assets
  for each row execute function private.refuse_anonymised_client();

/* ------------------------------------------------------------------------ */
/* Rules                                                                     */
/* ------------------------------------------------------------------------ */

create function private.guard_site_asset() returns trigger
  language plpgsql set search_path = ''
  as $$
  begin
    if tg_op = 'DELETE' then
      -- Only the purge forgets rows, once the file is gone (or never arrived).
      if old.purge_requested_at is not null or (old.status = 'uploading' and old.created_at < now() - interval '1 hour') then
        return old;
      end if;
      raise exception 'Images are deleted through the purge.' using errcode = '42501';
    end if;

    if tg_op = 'INSERT' then
      if new.status <> 'uploading' or new.validated_at is not null or new.reviewed_by is not null or new.purge_requested_at is not null then
        raise exception 'An image starts as an upload.' using errcode = '42501';
      end if;
      if auth.uid() is null or not private.acts_as_caller(new.uploaded_by) then
        raise exception 'Images are uploaded by a person, in their own name.' using errcode = '42501';
      end if;
      return new;
    end if;

    -- UPDATE
    if new.client_id <> old.client_id or new.storage_path <> old.storage_path or new.uploaded_by <> old.uploaded_by then
      raise exception 'An image''s origin cannot be rewritten.' using errcode = '42501';
    end if;
    if old.status = 'deleted' then
      raise exception 'This image was deleted.' using errcode = '42501';
    end if;

    if new.status = 'deleted' then
      if private.flagged_client('anonymising_client') is distinct from old.client_id and auth.uid() is null then
        raise exception 'Only a person deletes an image.' using errcode = '42501';
      end if;
      new.purge_requested_at := coalesce(old.purge_requested_at, now());
      return new;
    end if;

    if old.status = 'uploading' then
      if new.status <> 'pending_review' or coalesce(current_setting('studio_os.validating_asset', true), '') <> old.id::text then
        raise exception 'Only the server marks an upload as checked.' using errcode = '42501';
      end if;
      new.validated_at := now();
      return new;
    end if;

    -- Measured values and the checksum never change after validation.
    if new.mime_type <> old.mime_type or new.byte_size <> old.byte_size or new.width <> old.width
       or new.height <> old.height or new.sha256 <> old.sha256 or new.validated_at is distinct from old.validated_at then
      raise exception 'A checked image''s file details cannot change.' using errcode = '42501';
    end if;
    if old.status = 'approved' then
      raise exception 'An approved image cannot change. Upload it again to record other rights.' using errcode = '42501';
    end if;
    if new.status in ('approved', 'rejected') then
      if auth.uid() is null or not private.acts_as_caller(new.reviewed_by) then
        raise exception 'Image rights are decided by a person, in their own name.' using errcode = '42501';
      end if;
      new.reviewed_at := now();
      return new;
    end if;
    raise exception 'An image cannot go from % to %.', old.status, new.status using errcode = '42501';
  end $$;

create trigger guard_site_asset before insert or update or delete on public.site_assets
  for each row execute function private.guard_site_asset();

/* ------------------------------------------------------------------------ */
/* Storage policies                                                          */
/* ------------------------------------------------------------------------ */

create policy "site assets read" on storage.objects for select to authenticated
  using (bucket_id = 'site-assets' and exists (
    select 1 from public.site_assets a
    where a.storage_path = name and a.status in ('pending_review', 'approved', 'rejected')
      and private.is_member(a.studio_id)));

create policy "site assets upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'site-assets' and exists (
    select 1 from public.site_assets a
    where a.storage_path = name and a.status = 'uploading' and private.can_write(a.studio_id)
      and a.uploaded_by ->> 'userId' = (select auth.uid())::text
      and a.created_at > now() - interval '15 minutes'));

/* ------------------------------------------------------------------------ */
/* Functions                                                                 */
/* ------------------------------------------------------------------------ */

-- Starts an upload for a person. p_asset: {"mimeType", "byteSize", "width",
-- "height", "sha256", "description", "sourceNote", "rightsBasis",
-- "licenceNote", "usePermitted", "usePermissionNote", "identifiablePeople",
-- "peopleBasis", "peopleBasisNote"}. The same image (sha256) already
-- checked for this client is reused. Returns {"id", "storagePath",
-- "existing"}. Limits: 200 images and 300 MB per client, 2000 images and
-- 500 MB per studio.
create function public.begin_site_asset_upload(p_studio uuid, p_client uuid, p_asset jsonb, p_actor jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
  as $$
  declare
    v_existing uuid;
    v_id uuid := gen_random_uuid();
    v_mime text := p_asset ->> 'mimeType';
    v_size bigint := (p_asset ->> 'byteSize')::bigint;
    v_path text;
  begin
    if auth.uid() is null or not private.can_write(p_studio) then
      raise exception 'You have read-only access to this studio.' using errcode = '42501';
    end if;
    if not private.acts_as_caller(p_actor) then
      raise exception 'Images are uploaded in your own name.' using errcode = '42501';
    end if;
    perform 1 from public.clients where id = p_client and studio_id = p_studio;
    if not found then
      raise exception 'This client no longer exists, or you do not have access to it.' using errcode = 'SO404';
    end if;
    if v_mime is null or v_mime not in ('image/jpeg', 'image/png', 'image/webp') then
      raise exception 'Only JPEG, PNG and WebP images can be uploaded.' using errcode = '22023';
    end if;
    if v_size is null or v_size < 1 or v_size > 3145728 then
      raise exception 'An image can be at most 3 MB after processing.' using errcode = '22023';
    end if;

    select id into v_existing from public.site_assets
      where client_id = p_client and sha256 = p_asset ->> 'sha256' and status in ('pending_review', 'approved', 'rejected');
    if found then
      return jsonb_build_object('id', v_existing, 'storagePath', null, 'existing', true);
    end if;

    if (select count(*) from public.site_assets where client_id = p_client and status <> 'deleted') >= 200
       or (select coalesce(sum(byte_size), 0) from public.site_assets where client_id = p_client and status <> 'deleted') + v_size > 314572800 then
      raise exception 'This client already has the most images allowed (200 images or 300 MB).' using errcode = '53400';
    end if;
    if (select count(*) from public.site_assets where studio_id = p_studio and status <> 'deleted') >= 2000
       or (select coalesce(sum(byte_size), 0) from public.site_assets where studio_id = p_studio and status <> 'deleted') + v_size > 524288000 then
      raise exception 'The studio already stores the most images allowed (2000 images or 500 MB).' using errcode = '53400';
    end if;

    v_path := p_studio || '/' || p_client || '/' || v_id || case v_mime when 'image/png' then '.png' when 'image/jpeg' then '.jpg' else '.webp' end;
    insert into public.site_assets (id, studio_id, client_id, storage_path, mime_type, byte_size, width, height, sha256, description,
        source_note, rights_basis, licence_note, use_permitted, use_permission_note, identifiable_people, people_basis, people_basis_note,
        uploaded_by)
      values (v_id, p_studio, p_client, v_path, v_mime, v_size, (p_asset ->> 'width')::int, (p_asset ->> 'height')::int, p_asset ->> 'sha256',
        btrim(p_asset ->> 'description'), nullif(btrim(p_asset ->> 'sourceNote'), ''), p_asset ->> 'rightsBasis',
        nullif(btrim(p_asset ->> 'licenceNote'), ''), coalesce((p_asset ->> 'usePermitted')::boolean, false),
        nullif(btrim(p_asset ->> 'usePermissionNote'), ''), coalesce((p_asset ->> 'identifiablePeople')::boolean, false),
        p_asset ->> 'peopleBasis', nullif(btrim(p_asset ->> 'peopleBasisNote'), ''), p_actor);
    return jsonb_build_object('id', v_id, 'storagePath', v_path, 'existing', false);
  end $$;

-- The server, after checking the file's bytes: records what it measured and
-- marks the upload checked. The stored object must exist with that size.
-- p_measured: {"mimeType", "byteSize", "width", "height", "sha256"}.
create function public.finish_site_asset_upload(p_asset uuid, p_measured jsonb) returns void
  language plpgsql security definer set search_path = ''
  as $$
  declare
    v public.site_assets;
    v_size bigint;
  begin
    select * into v from public.site_assets where id = p_asset for update;
    if not found or v.status <> 'uploading' then
      raise exception 'This upload is not waiting to be checked.' using errcode = 'SO409';
    end if;
    select (metadata ->> 'size')::bigint into v_size from storage.objects where bucket_id = 'site-assets' and name = v.storage_path;
    if not found then
      raise exception 'The file was not stored.' using errcode = 'SO404';
    end if;
    if v_size is distinct from (p_measured ->> 'byteSize')::bigint then
      raise exception 'The stored file is not the file that was checked.' using errcode = '22023';
    end if;
    perform set_config('studio_os.validating_asset', v.id::text, true);
    update public.site_assets set status = 'pending_review', mime_type = p_measured ->> 'mimeType',
        byte_size = (p_measured ->> 'byteSize')::int, width = (p_measured ->> 'width')::int, height = (p_measured ->> 'height')::int,
        sha256 = p_measured ->> 'sha256'
      where id = v.id;
    perform set_config('studio_os.validating_asset', '', true);
  end $$;

-- A person's rights decision, with the answers it rests on. p_details as in
-- begin_site_asset_upload (provenance fields only). p_decision: approve, reject.
create function public.review_site_asset(p_studio uuid, p_asset uuid, p_decision text, p_details jsonb, p_note text, p_actor jsonb) returns void
  language plpgsql security definer set search_path = ''
  as $$
  declare v public.site_assets;
  begin
    if auth.uid() is null or not private.can_write(p_studio) then
      raise exception 'You have read-only access to this studio.' using errcode = '42501';
    end if;
    select * into v from public.site_assets where id = p_asset and studio_id = p_studio for update;
    if not found then
      raise exception 'This image no longer exists, or you do not have access to it.' using errcode = 'SO404';
    end if;
    if v.status not in ('pending_review', 'rejected') then
      raise exception 'Only an image waiting for a rights decision can be decided.' using errcode = 'SO409';
    end if;
    if p_decision not in ('approve', 'reject') then
      raise exception 'Unknown decision.' using errcode = '22023';
    end if;
    update public.site_assets set
        status = case p_decision when 'approve' then 'approved' else 'rejected' end,
        description = coalesce(nullif(btrim(p_details ->> 'description'), ''), description),
        source_note = nullif(btrim(p_details ->> 'sourceNote'), ''),
        rights_basis = p_details ->> 'rightsBasis',
        licence_note = nullif(btrim(p_details ->> 'licenceNote'), ''),
        use_permitted = coalesce((p_details ->> 'usePermitted')::boolean, false),
        use_permission_note = nullif(btrim(p_details ->> 'usePermissionNote'), ''),
        identifiable_people = coalesce((p_details ->> 'identifiablePeople')::boolean, false),
        people_basis = p_details ->> 'peopleBasis',
        people_basis_note = nullif(btrim(p_details ->> 'peopleBasisNote'), ''),
        reviewed_by = p_actor,
        review_note = nullif(btrim(p_note), '')
      where id = v.id;
    insert into public.activity_events (id, studio_id, entity_type, entity_id, event_type, description, actor)
      values (gen_random_uuid(), p_studio, 'client', v.client_id,
        case p_decision when 'approve' then 'site_asset.approved' else 'site_asset.rejected' end,
        case p_decision when 'approve' then 'Approved the rights for image: ' else 'Rejected the rights for image: ' end
          || left(coalesce(nullif(btrim(p_details ->> 'description'), ''), v.description), 120),
        p_actor);
  end $$;

-- A person deletes an image the client's website does not rely on: hidden at
-- once, purged from Storage within a day.
create function public.delete_site_asset(p_studio uuid, p_asset uuid, p_actor jsonb) returns void
  language plpgsql security definer set search_path = ''
  as $$
  declare v public.site_assets;
  begin
    if auth.uid() is null or not private.can_write(p_studio) then
      raise exception 'You have read-only access to this studio.' using errcode = '42501';
    end if;
    if not private.acts_as_caller(p_actor) then
      raise exception 'Images are deleted in your own name.' using errcode = '42501';
    end if;
    select * into v from public.site_assets where id = p_asset and studio_id = p_studio and status <> 'deleted' for update;
    if not found then
      raise exception 'This image no longer exists, or you do not have access to it.' using errcode = 'SO404';
    end if;
    if exists (select 1 from public.site_specs s where s.client_id = v.client_id and s.status in ('in_review', 'approved')
               and jsonb_path_exists(s.spec, '$.assets[*] ? (@.fileId == $id)', jsonb_build_object('id', v.id::text))) then
      raise exception 'This image is used by a website spec that is approved or waiting for approval.' using errcode = 'SO409';
    end if;
    update public.site_assets set status = 'deleted' where id = v.id;
    insert into public.activity_events (id, studio_id, entity_type, entity_id, event_type, description, actor)
      values (gen_random_uuid(), p_studio, 'client', v.client_id, 'site_asset.deleted', 'Deleted image: ' || left(v.description, 120), p_actor);
  end $$;

-- For the purge only: files to delete from Storage, oldest first. Deleted
-- images, and uploads never checked within an hour.
create function public.site_assets_due_for_purge(p_limit int default 100) returns table (id uuid, storage_path text)
  language sql stable security definer set search_path = ''
  as $$
    select a.id, a.storage_path from public.site_assets a
    where a.purge_requested_at is not null or (a.status = 'uploading' and a.created_at < now() - interval '1 hour')
    order by coalesce(a.purge_requested_at, a.created_at)
    limit greatest(1, least(p_limit, 500))
  $$;

-- For the purge only, after the files are gone from Storage.
create function public.forget_purged_site_assets(p_ids uuid[]) returns int
  language plpgsql security definer set search_path = ''
  as $$
  declare n int;
  begin
    delete from public.site_assets a
      where a.id = any (p_ids)
        and (a.purge_requested_at is not null or (a.status = 'uploading' and a.created_at < now() - interval '1 hour'));
    get diagnostics n = row_count;
    return n;
  end $$;

revoke execute on function public.begin_site_asset_upload(uuid, uuid, jsonb, jsonb), public.review_site_asset(uuid, uuid, text, jsonb, text, jsonb),
  public.delete_site_asset(uuid, uuid, jsonb), public.finish_site_asset_upload(uuid, jsonb),
  public.site_assets_due_for_purge(int), public.forget_purged_site_assets(uuid[]) from public, anon, authenticated, service_role;
grant execute on function public.begin_site_asset_upload(uuid, uuid, jsonb, jsonb), public.review_site_asset(uuid, uuid, text, jsonb, text, jsonb),
  public.delete_site_asset(uuid, uuid, jsonb) to authenticated;
grant execute on function public.finish_site_asset_upload(uuid, jsonb), public.site_assets_due_for_purge(int),
  public.forget_purged_site_assets(uuid[]) to service_role;

/* ------------------------------------------------------------------------ */
/* Website specs use approved images only                                    */
/* ------------------------------------------------------------------------ */

-- Every image a spec uses (assets[].fileId) is an approved image of its client.
create function private.site_spec_images_approved(p_spec jsonb, p_client uuid) returns boolean
  language sql stable set search_path = ''
  as $$
    select not exists (
      select 1 from jsonb_path_query(p_spec, 'lax $.assets[*].fileId') f
      where not exists (
        select 1 from public.site_assets a
        where a.id::text = f #>> '{}' and a.client_id = p_client and a.status = 'approved'))
  $$;
grant execute on function private.site_spec_images_approved(jsonb, uuid) to authenticated;

-- As in 20261030000200_site_specs.sql, plus: at approval, every image is an
-- approved image of the same client.
create or replace function private.guard_site_spec() returns trigger
  language plpgsql set search_path = ''
  as $$
  declare
    v_type public.project_type;
    v_next int;
  begin
    if tg_op = 'DELETE' then
      -- Only anonymising the client removes specs.
      if private.flagged_client('anonymising_client') = old.client_id then
        return old;
      end if;
      raise exception 'Website spec versions are kept.' using errcode = '42501';
    end if;

    if tg_op = 'INSERT' then
      if new.status <> 'draft' or new.submitted_by is not null or new.approved_by is not null or new.review_note is not null then
        raise exception 'A website spec version starts as a draft.' using errcode = '42501';
      end if;
      if auth.uid() is null or not private.acts_as_caller(new.created_by) then
        raise exception 'Website specs are started by a person, in their own name.' using errcode = '42501';
      end if;
      select project_type into v_type from public.projects
        where id = new.project_id and studio_id = new.studio_id and client_id = new.client_id;
      if not found then
        raise exception 'The project does not belong to this client.' using errcode = '23503';
      end if;
      if v_type = 'other' then
        raise exception 'Only website projects have a website spec.' using errcode = '42501';
      end if;
      select coalesce(max(version), 0) + 1 into v_next from public.site_specs where project_id = new.project_id;
      if new.version <> v_next then
        raise exception 'Someone else changed this in the meantime. Reload to see the latest version.' using errcode = 'SO409';
      end if;
      if new.based_on is not null then
        perform 1 from public.site_specs where id = new.based_on and project_id = new.project_id;
        if not found then
          raise exception 'A version can only start from a version of the same project.' using errcode = '23503';
        end if;
      end if;
      new.submitted_at := null;
      new.approved_at := null;
      return new;
    end if;

    -- UPDATE
    if new.client_id <> old.client_id or new.project_id <> old.project_id or new.version <> old.version
       or new.based_on is distinct from old.based_on or new.created_by <> old.created_by then
      raise exception 'Website spec history cannot be rewritten.' using errcode = '42501';
    end if;
    if auth.uid() is null then
      raise exception 'Only a person can change a website spec.' using errcode = '42501';
    end if;

    if new.status = old.status then
      if old.status <> 'draft' then
        raise exception 'Only a draft can be edited. Start a new version instead.' using errcode = '42501';
      end if;
      if new.submitted_by is distinct from old.submitted_by or new.approved_by is distinct from old.approved_by
         or new.review_note is distinct from old.review_note then
        raise exception 'Editing a draft cannot change its review.' using errcode = '42501';
      end if;
      new.submitted_at := old.submitted_at;
      new.approved_at := old.approved_at;
      return new;
    end if;

    if new.spec is distinct from old.spec then
      raise exception 'The content can only change while the version is a draft.' using errcode = '42501';
    end if;

    if old.status = 'draft' and new.status = 'in_review' then
      if not private.acts_as_caller(new.submitted_by) or new.approved_by is not null then
        raise exception 'Submit in your own name.' using errcode = '42501';
      end if;
      new.submitted_at := now();
      new.review_note := null;
    elsif old.status = 'in_review' and new.status = 'draft' then
      if new.submitted_by is not null or new.approved_by is not null then
        raise exception 'Sending a version back clears its submission.' using errcode = '42501';
      end if;
      new.submitted_at := null;
    elsif old.status = 'in_review' and new.status = 'approved' then
      if not private.acts_as_caller(new.approved_by) then
        raise exception 'Website specs are approved by a person, in their own name.' using errcode = '42501';
      end if;
      if new.submitted_by is distinct from old.submitted_by or new.review_note is distinct from old.review_note then
        raise exception 'Approving cannot change the submission.' using errcode = '42501';
      end if;
      if not private.site_spec_brief_confirmed(new.spec, new.client_id) then
        raise exception 'A value from the brief is no longer confirmed as it was. Check the spec again.' using errcode = '42501';
      end if;
      if not private.site_spec_images_approved(new.spec, new.client_id) then
        raise exception 'Every image in the spec must be an approved image of this client.' using errcode = '42501';
      end if;
      new.submitted_at := old.submitted_at;
      new.approved_at := now();
    elsif old.status = 'approved' and new.status = 'superseded' then
      if coalesce(current_setting('studio_os.superseding_spec', true), '') <> old.id::text then
        raise exception 'A version is replaced only by approving a newer one.' using errcode = '42501';
      end if;
      if new.approved_by is distinct from old.approved_by or new.submitted_by is distinct from old.submitted_by
         or new.review_note is distinct from old.review_note then
        raise exception 'Website spec history cannot be rewritten.' using errcode = '42501';
      end if;
      new.submitted_at := old.submitted_at;
      new.approved_at := old.approved_at;
    else
      raise exception 'A website spec cannot go from % to %.', old.status, new.status using errcode = '42501';
    end if;
    return new;
  end $$;

/* ------------------------------------------------------------------------ */
/* Retention                                                                 */
/* ------------------------------------------------------------------------ */

-- As in 20261030000200_site_specs.sql, plus: the client's images are marked
-- deleted (hidden at once; the purge removes the files from Storage).
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
