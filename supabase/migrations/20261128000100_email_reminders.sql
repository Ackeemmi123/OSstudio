/* ------------------------------------------------------------------------ */
/* E-mail reminders. Each morning a member gets one e-mail with the studio's */
/* next steps and dated tasks that are due today or tomorrow, or overdue by  */
/* up to two weeks. When a client comments, approves or answers questions on */
/* a review link, members get an e-mail at once. Both are on by default;     */
/* each member turns them off for themselves under Settings. A log keeps the */
/* same e-mail from going out twice; it holds no client details.            */
/* ------------------------------------------------------------------------ */

create table public.member_email_settings (
  studio_id uuid not null references public.studios (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  daily_digest boolean not null default true,
  client_events boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (studio_id, user_id)
);

revoke all on public.member_email_settings from public, anon, authenticated, service_role;
grant select on public.member_email_settings to authenticated;
alter table public.member_email_settings enable row level security;
create policy "own settings" on public.member_email_settings for select to authenticated
  using (user_id = (select auth.uid()) and private.is_member(studio_id));

/* A member chooses which e-mails they get from this studio. */
create function public.set_email_settings(p_studio uuid, p_daily boolean, p_events boolean) returns void
  language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.is_member(p_studio) then
    raise exception 'You are not a member of this studio.' using errcode = '42501';
  end if;
  insert into public.member_email_settings (studio_id, user_id, daily_digest, client_events)
  values (p_studio, auth.uid(), coalesce(p_daily, true), coalesce(p_events, true))
  on conflict (studio_id, user_id) do update
    set daily_digest = excluded.daily_digest, client_events = excluded.client_events, updated_at = now();
end;
$$;

create table public.email_log (
  kind text not null check (kind in ('daily', 'client_event')),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The day for a daily e-mail; the event's id for a client event.
  ref text not null check (char_length(ref) between 1 and 200),
  sent_at timestamptz not null default now(),
  primary key (kind, user_id, ref)
);
create index email_log_sent on public.email_log (sent_at);

revoke all on public.email_log from public, anon, authenticated, service_role;
alter table public.email_log enable row level security;

/* Claims an e-mail before it is sent: true the first time, false if it was already claimed. Service role only. */
create function public.claim_email(p_kind text, p_user uuid, p_ref text) returns boolean
  language plpgsql security definer set search_path = '' as $$
declare
  v_claimed int;
begin
  insert into public.email_log (kind, user_id, ref) values (p_kind, p_user, p_ref) on conflict do nothing;
  get diagnostics v_claimed = row_count;
  -- The log only needs to stop repeats; old rows go.
  delete from public.email_log where sent_at < now() - interval '60 days';
  return v_claimed = 1;
end;
$$;

/* Each member's morning e-mail for a day: who, where to, and what is due. Members with nothing due are left out. Service role only. */
create function public.daily_digest(p_day date) returns jsonb
  language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(d), '[]'::jsonb) from (
    select m.user_id as "userId", u.email, m.display_name as name, s.name as studio,
      coalesce((select jsonb_agg(jsonb_build_object('title', n.title, 'client', c.name, 'clientId', c.id, 'dueOn', n.due_on,
          'dueTime', to_char(n.due_time, 'HH24:MI'), 'assignee', n.assignee ->> 'name', 'mine', (n.assignee ->> 'userId') = m.user_id::text)
          order by n.due_on, n.due_time nulls last)
        from public.client_next_steps n join public.clients c on c.id = n.client_id
        where n.studio_id = m.studio_id and n.status = 'open' and n.due_on between p_day - 14 and p_day + 1), '[]'::jsonb) as steps,
      coalesce((select jsonb_agg(jsonb_build_object('title', t.title, 'project', p.name, 'client', c.name, 'clientId', c.id, 'dueOn', t.due_date)
          order by t.due_date)
        from public.tasks t join public.projects p on p.id = t.project_id join public.clients c on c.id = p.client_id
        where t.studio_id = m.studio_id and t.status <> 'done' and not t.is_demo and t.due_date between p_day - 14 and p_day + 1), '[]'::jsonb) as tasks
    from public.studio_members m
    join public.studios s on s.id = m.studio_id
    join auth.users u on u.id = m.user_id
    left join public.member_email_settings e on e.studio_id = m.studio_id and e.user_id = m.user_id
    where coalesce(e.daily_digest, true) and u.email is not null
  ) d
  where jsonb_array_length(d.steps) + jsonb_array_length(d.tasks) > 0;
$$;

/* Who to tell about a client's comment, approval or answers on a review link, and about which client. Null for an unknown link. Service role only. */
create function public.review_event_recipients(p_token text) returns jsonb
  language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('clientId', b.client_id, 'client', c.name, 'projectId', b.project_id, 'version', b.spec_version, 'studio', s.name,
    'recipients', coalesce((select jsonb_agg(jsonb_build_object('userId', m.user_id, 'email', u.email))
      from public.studio_members m join auth.users u on u.id = m.user_id
      left join public.member_email_settings e on e.studio_id = m.studio_id and e.user_id = m.user_id
      where m.studio_id = b.studio_id and coalesce(e.client_events, true) and u.email is not null), '[]'::jsonb))
  from public.site_builds b join public.clients c on c.id = b.client_id join public.studios s on s.id = b.studio_id
  where b.share_token = p_token;
$$;

revoke all on function public.set_email_settings(uuid, boolean, boolean), public.claim_email(text, uuid, text),
  public.daily_digest(date), public.review_event_recipients(text) from public, anon, authenticated;
grant execute on function public.set_email_settings(uuid, boolean, boolean) to authenticated;
grant execute on function public.claim_email(text, uuid, text), public.daily_digest(date), public.review_event_recipients(text) to service_role;
