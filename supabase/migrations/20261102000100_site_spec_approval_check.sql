-- A website spec is approved only after the server has checked it.
--
-- The rules for what blocks an approval live in one place, in TypeScript
-- (approvalBlockers in src/lib/site-spec/validate.ts). The browser cannot be
-- trusted to run them, so POST /api/site-specs/approve runs them on the server
-- and records a pass here; the guard refuses an approval without one.
--
-- A pass is for one person and the spec's exact content, and lasts 5 minutes:
-- the route records it and approves straight away. The approval itself is
-- still written as the signed-in person, with every existing check (their own
-- name, confirmed brief values, approved images). A pass holds no client
-- material, and goes when the spec goes.
--
-- Only the service role can record a pass; nobody can read or change the table
-- through the API. There is no override.

create table private.site_spec_checks (
  spec_id uuid not null references public.site_specs (id) on delete cascade,
  person uuid not null,
  spec_hash text not null,
  checked_at timestamptz not null default now(),
  primary key (spec_id, person)
);
revoke all on private.site_spec_checks from public, anon, authenticated, service_role;

create function private.site_spec_hash(p_spec jsonb) returns text
  language sql immutable set search_path = ''
  as $$ select encode(sha256(convert_to(p_spec::text, 'UTF8')), 'hex') $$;

-- The server has just checked this content for the signed-in person.
create function private.site_spec_check_passed(p_id uuid, p_spec jsonb) returns boolean
  language sql stable security definer set search_path = ''
  as $$
    select exists (
      select 1 from private.site_spec_checks c
      where c.spec_id = p_id and c.person = (select auth.uid())
        and c.spec_hash = private.site_spec_hash(p_spec)
        and c.checked_at > now() - interval '5 minutes')
  $$;
revoke all on function private.site_spec_check_passed(uuid, jsonb) from public, anon, service_role;
grant execute on function private.site_spec_check_passed(uuid, jsonb) to authenticated;

-- Called by the server after approvalBlockers finds nothing. The content is
-- read here, so a pass is always for what is stored.
create function public.record_site_spec_check(p_spec uuid, p_person uuid) returns void
  language plpgsql security definer set search_path = ''
  as $$
  declare v public.site_specs;
  begin
    select * into v from public.site_specs where id = p_spec;
    if not found or v.status <> 'in_review' then
      raise exception 'Only a version waiting for approval can be checked.' using errcode = 'SO409';
    end if;
    if not exists (select 1 from public.studio_members m
                   where m.studio_id = v.studio_id and m.user_id = p_person and m.role in ('owner', 'member')) then
      raise exception 'You have read-only access to this studio.' using errcode = '42501';
    end if;
    insert into private.site_spec_checks (spec_id, person, spec_hash)
      values (v.id, p_person, private.site_spec_hash(v.spec))
      on conflict (spec_id, person) do update set spec_hash = excluded.spec_hash, checked_at = now();
  end $$;
revoke all on function public.record_site_spec_check(uuid, uuid) from public, anon, authenticated;
grant execute on function public.record_site_spec_check(uuid, uuid) to service_role;

-- As in 20261031000100_site_assets.sql, plus: an approval needs a pass.
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
      if not private.site_spec_check_passed(new.id, new.spec) then
        raise exception 'A website spec can only be approved through Studio OS, which checks it first. Try again from the website spec page.' using errcode = '42501';
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
