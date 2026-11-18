/* ------------------------------------------------------------------------ */
/* Client materials: files a client sent (PDFs, images) kept as files, so   */
/* an AI draft can read them as they are. Word documents and web pages are  */
/* read into text and stored as ordinary client_sources instead.            */
/*                                                                           */
/* The server stores a file after checking it (src/server/client-materials) */
/* and records it with record_client_material, which only the service role  */
/* may call. Studio members read the records; nobody reads the files except */
/* through the server.                                                       */
/* ------------------------------------------------------------------------ */

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('client-materials', 'client-materials', false, 4194304,
    array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table public.client_materials (
  id uuid primary key,
  studio_id uuid not null,
  client_id uuid not null,
  storage_path text not null unique,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  byte_size int not null check (byte_size between 1 and 4194304),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  deleted_at timestamptz,
  added_by jsonb not null check (jsonb_typeof(added_by) = 'object'),
  created_at timestamptz not null default now(),
  foreign key (client_id, studio_id) references public.clients (id, studio_id) on delete cascade
);

create index client_materials_client on public.client_materials (client_id, created_at desc);

-- Every role starts with nothing; the service role keeps no table rights (tests/db/agent-runner.test.ts).
revoke all on public.client_materials from public, anon, authenticated, service_role;
grant select on public.client_materials to authenticated;

alter table public.client_materials enable row level security;
create policy "members read" on public.client_materials for select to authenticated using (private.is_member(studio_id));

create trigger keep_studio before update on public.client_materials for each row execute function private.keep_studio();

/* The server records a file after storing it. Service role only. */
create function public.record_client_material(p_material jsonb) returns void
  language plpgsql security definer set search_path = '' as $$
begin
  insert into public.client_materials (id, studio_id, client_id, storage_path, title, mime_type, byte_size, sha256, added_by)
  values ((p_material ->> 'id')::uuid, (p_material ->> 'studio_id')::uuid, (p_material ->> 'client_id')::uuid,
    p_material ->> 'storage_path', p_material ->> 'title', p_material ->> 'mime_type',
    (p_material ->> 'byte_size')::int, p_material ->> 'sha256', p_material -> 'added_by');
end;
$$;

/* A writer hides a file; it is then left out of every AI draft. */
create function public.delete_client_material(p_material uuid) returns timestamptz
  language plpgsql security definer set search_path = '' as $$
declare
  v_studio uuid;
  v_deleted timestamptz;
begin
  select studio_id, deleted_at into v_studio, v_deleted from public.client_materials where id = p_material;
  if v_studio is null or not private.can_write(v_studio) then
    raise exception 'This file does not exist, or you cannot change it.' using errcode = '42501';
  end if;
  if v_deleted is not null then return v_deleted; end if;
  update public.client_materials set deleted_at = now() where id = p_material returning deleted_at into v_deleted;
  return v_deleted;
end;
$$;

revoke all on function public.record_client_material(jsonb), public.delete_client_material(uuid) from public, anon, authenticated;
grant execute on function public.record_client_material(jsonb) to service_role;
grant execute on function public.delete_client_material(uuid) to authenticated;
