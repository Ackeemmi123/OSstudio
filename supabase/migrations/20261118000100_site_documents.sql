/* ------------------------------------------------------------------------ */
/* Site documents: PDFs a client's website offers for download (statutes,   */
/* minutes, price lists). A list item in a website spec points at one.      */
/*                                                                           */
/* The server stores a document after checking it is a PDF of at most 4 MB  */
/* (src/server/site-documents), and records it with record_site_document,    */
/* which only the service role may call. Studio members read the records;    */
/* nobody reads the files except through the server.                         */
/* ------------------------------------------------------------------------ */

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('site-documents', 'site-documents', false, 4194304, array['application/pdf'])
  on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table public.site_documents (
  id uuid primary key,
  studio_id uuid not null,
  client_id uuid not null,
  storage_path text not null unique,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  byte_size int not null check (byte_size between 1 and 4194304),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  deleted_at timestamptz,
  uploaded_by jsonb not null check (jsonb_typeof(uploaded_by) = 'object'),
  created_at timestamptz not null default now(),
  foreign key (client_id, studio_id) references public.clients (id, studio_id) on delete cascade
);

create index site_documents_client on public.site_documents (client_id, created_at desc);

-- Every role starts with nothing; the service role keeps no table rights (tests/db/agent-runner.test.ts).
revoke all on public.site_documents from public, anon, authenticated, service_role;
grant select on public.site_documents to authenticated;

alter table public.site_documents enable row level security;
create policy "members read" on public.site_documents for select to authenticated using (private.is_member(studio_id));

create trigger keep_studio before update on public.site_documents for each row execute function private.keep_studio();

/* The server records a document after storing its file. Service role only. */
create function public.record_site_document(p_document jsonb) returns void
  language plpgsql security definer set search_path = '' as $$
begin
  insert into public.site_documents (id, studio_id, client_id, storage_path, title, byte_size, sha256, uploaded_by)
  values ((p_document ->> 'id')::uuid, (p_document ->> 'studio_id')::uuid, (p_document ->> 'client_id')::uuid,
    p_document ->> 'storage_path', p_document ->> 'title', (p_document ->> 'byte_size')::int,
    p_document ->> 'sha256', p_document -> 'uploaded_by');
end;
$$;

/* A writer hides a document; the spec items that point at it then build without a download. */
create function public.delete_site_document(p_document uuid) returns timestamptz
  language plpgsql security definer set search_path = '' as $$
declare
  v_studio uuid;
  v_deleted timestamptz;
begin
  select studio_id, deleted_at into v_studio, v_deleted from public.site_documents where id = p_document;
  if v_studio is null or not private.can_write(v_studio) then
    raise exception 'This document does not exist, or you cannot change it.' using errcode = '42501';
  end if;
  if v_deleted is not null then return v_deleted; end if;
  update public.site_documents set deleted_at = now() where id = p_document returning deleted_at into v_deleted;
  return v_deleted;
end;
$$;

revoke all on function public.record_site_document(jsonb), public.delete_site_document(uuid) from public, anon, authenticated;
grant execute on function public.record_site_document(jsonb) to service_role;
grant execute on function public.delete_site_document(uuid) to authenticated;
