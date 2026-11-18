/* ------------------------------------------------------------------------ */
/* Client review on the link: the client comments on a built site and       */
/* approves it in writing, without signing in. The link's token is the key; */
/* the server checks it and records what the client wrote through the      */
/* functions below (service role only). Studio members read comments and   */
/* approvals, answer and resolve comments, and can turn review off.        */
/* An approval is for one build: a new build needs a new approval.         */
/* ------------------------------------------------------------------------ */

alter table public.site_builds add column reviews_enabled boolean not null default true;

create table public.site_review_comments (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null,
  client_id uuid not null,
  build_id uuid not null references public.site_builds (id) on delete cascade,
  page_path text not null check (char_length(page_path) between 1 and 200),
  -- What the client clicked: an element's kind and the start of its words.
  target text not null default '' check (char_length(target) <= 300),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  author_name text not null check (char_length(btrim(author_name)) between 1 and 120),
  status text not null default 'open' check (status in ('open', 'resolved')),
  reply text check (reply is null or char_length(reply) <= 2000),
  replied_by jsonb check (replied_by is null or jsonb_typeof(replied_by) = 'object'),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  foreign key (client_id, studio_id) references public.clients (id, studio_id) on delete cascade
);
create index site_review_comments_build on public.site_review_comments (build_id, created_at);

create table public.site_approvals (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null,
  client_id uuid not null,
  build_id uuid not null unique references public.site_builds (id) on delete cascade,
  approver_name text not null check (char_length(btrim(approver_name)) between 1 and 120),
  approver_role text not null default '' check (char_length(approver_role) <= 120),
  approver_email text not null check (char_length(approver_email) <= 200 and approver_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  -- The exact words the client agreed to.
  statement text not null check (char_length(statement) between 1 and 500),
  created_at timestamptz not null default now(),
  foreign key (client_id, studio_id) references public.clients (id, studio_id) on delete cascade
);

revoke all on public.site_review_comments, public.site_approvals from public, anon, authenticated, service_role;
grant select on public.site_review_comments, public.site_approvals to authenticated;
alter table public.site_review_comments enable row level security;
alter table public.site_approvals enable row level security;
create policy "members read" on public.site_review_comments for select to authenticated using (private.is_member(studio_id));
create policy "members read" on public.site_approvals for select to authenticated using (private.is_member(studio_id));
create trigger keep_studio before update on public.site_review_comments for each row execute function private.keep_studio();

/* The build behind a link, if it is open for review: not expired, not turned off, review on. */
create function private.reviewable_build(p_token text) returns public.site_builds
  language sql stable security definer set search_path = '' as $$
  select b.* from public.site_builds b
   where b.share_token = p_token and b.revoked_at is null and b.expires_at > now() and b.reviews_enabled;
$$;
revoke all on function private.reviewable_build(text) from public;

/* What the review bar shows. Service role only. Null when the link is not open for review. */
create function public.site_review_state(p_token text) returns jsonb
  language plpgsql stable security definer set search_path = '' as $$
declare
  v_build public.site_builds;
begin
  v_build := private.reviewable_build(p_token);
  if v_build.id is null then return null; end if;
  return jsonb_build_object(
    'buildId', v_build.id,
    'studioId', v_build.studio_id,
    'comments', coalesce((select jsonb_agg(jsonb_build_object('page', c.page_path, 'target', c.target, 'body', c.body,
        'author', c.author_name, 'status', c.status, 'reply', c.reply, 'at', c.created_at) order by c.created_at)
      from public.site_review_comments c where c.build_id = v_build.id), '[]'::jsonb),
    'approval', (select jsonb_build_object('name', a.approver_name, 'role', a.approver_role, 'at', a.created_at)
      from public.site_approvals a where a.build_id = v_build.id));
end;
$$;

/* The client comments. Service role only; at most 60 comments an hour on one build. */
create function public.record_review_comment(p_token text, p_comment jsonb) returns void
  language plpgsql security definer set search_path = '' as $$
declare
  v_build public.site_builds;
begin
  v_build := private.reviewable_build(p_token);
  if v_build.id is null then
    raise exception 'This link is not open for review.' using errcode = '42501';
  end if;
  if (select count(*) from public.site_review_comments where build_id = v_build.id and created_at > now() - interval '1 hour') >= 60 then
    raise exception 'Too many comments in a short time. Try again later.' using errcode = '54000';
  end if;
  insert into public.site_review_comments (studio_id, client_id, build_id, page_path, target, body, author_name)
  values (v_build.studio_id, v_build.client_id, v_build.id, p_comment ->> 'page', coalesce(p_comment ->> 'target', ''),
    btrim(p_comment ->> 'body'), btrim(p_comment ->> 'author'));
end;
$$;

/* The client approves the build in writing. Service role only; once per build. */
create function public.record_site_approval(p_token text, p_approval jsonb) returns void
  language plpgsql security definer set search_path = '' as $$
declare
  v_build public.site_builds;
begin
  v_build := private.reviewable_build(p_token);
  if v_build.id is null then
    raise exception 'This link is not open for review.' using errcode = '42501';
  end if;
  if exists (select 1 from public.site_approvals where build_id = v_build.id) then
    raise exception 'This version is already approved.' using errcode = '23505';
  end if;
  insert into public.site_approvals (studio_id, client_id, build_id, approver_name, approver_role, approver_email, statement)
  values (v_build.studio_id, v_build.client_id, v_build.id, btrim(p_approval ->> 'name'), btrim(coalesce(p_approval ->> 'role', '')),
    btrim(p_approval ->> 'email'), p_approval ->> 'statement');
  insert into public.activity_events (id, studio_id, entity_type, entity_id, event_type, description, actor)
  values (gen_random_uuid(), v_build.studio_id, 'client', v_build.client_id, 'site_spec.client_approved',
    left(format('The client approved the site (version %s) on the review link: %s', v_build.spec_version, btrim(p_approval ->> 'name')), 500),
    '{"kind":"system"}'::jsonb);
end;
$$;

/* A writer answers or resolves a comment. */
create function public.answer_review_comment(p_comment uuid, p_reply text, p_resolve boolean, p_actor jsonb) returns void
  language plpgsql security definer set search_path = '' as $$
declare
  v_studio uuid;
begin
  select studio_id into v_studio from public.site_review_comments where id = p_comment;
  if v_studio is null or not private.can_write(v_studio) or not private.acts_as_caller(p_actor) then
    raise exception 'This comment does not exist, or you cannot change it.' using errcode = '42501';
  end if;
  update public.site_review_comments
     set reply = case when p_reply is null then reply else nullif(btrim(p_reply), '') end,
         replied_by = case when p_reply is null then replied_by else p_actor end,
         status = case when p_resolve then 'resolved' else 'open' end,
         resolved_at = case when p_resolve then coalesce(resolved_at, now()) else null end
   where id = p_comment;
end;
$$;

/* A writer turns review on a link on or off. */
create function public.set_build_reviews(p_build uuid, p_enabled boolean) returns void
  language plpgsql security definer set search_path = '' as $$
declare
  v_studio uuid;
begin
  select studio_id into v_studio from public.site_builds where id = p_build;
  if v_studio is null or not private.can_write(v_studio) then
    raise exception 'This build does not exist, or you cannot change it.' using errcode = '42501';
  end if;
  update public.site_builds set reviews_enabled = p_enabled where id = p_build;
end;
$$;

revoke all on function public.site_review_state(text), public.record_review_comment(text, jsonb), public.record_site_approval(text, jsonb),
  public.answer_review_comment(uuid, text, boolean, jsonb), public.set_build_reviews(uuid, boolean) from public, anon, authenticated;
grant execute on function public.site_review_state(text), public.record_review_comment(text, jsonb), public.record_site_approval(text, jsonb) to service_role;
grant execute on function public.answer_review_comment(uuid, text, boolean, jsonb), public.set_build_reviews(uuid, boolean) to authenticated;
