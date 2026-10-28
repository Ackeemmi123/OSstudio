-- Studio OS: inquiries from the Axivo website (handoff contract v1).
--
-- The Axivo website's server forwards each contact-form submission to
-- POST /api/inquiries, signed with a shared secret. That route verifies the
-- signature and the payload, then calls receive_inquiry() below with the
-- service role. Nothing else writes inquiries.
--
-- Access:
--   - anon: nothing. Visitors never read inquiries, not even their own.
--   - authenticated: members read their own studio's inquiries (row-level
--     security). Nobody can insert, edit or delete them; what the customer
--     wrote stays as they wrote it. Review and approval come in a later
--     migration.
--   - service_role: no table access at all, only execute on receive_inquiry().
--
-- Receipt: receive_inquiry() finds an earlier copy of the same submission,
-- applies the rate limits and stores the inquiry in one transaction. The route
-- answers 202 only after it returns, so a 202 always means the row is
-- committed (or was already there).
--
-- Retention (12 months for inquiries that do not become clients, then
-- anonymised) is NOT implemented here. Until the retention job exists and is
-- tested, only test inquiries may be sent to Studio OS.

/* ------------------------------------------------------------------------ */
/* Tables                                                                    */
/* ------------------------------------------------------------------------ */

create table public.inquiries (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios (id) on delete restrict,
  source text not null check (source in ('axivo_website')),
  -- The sender's id for this submission. A retry carries the same id.
  submission_id uuid not null,
  -- SHA-256 of the customer-entered fields only (src/lib/inquiries/contract.ts),
  -- so a retry with a new submittedAt, IP or test flag still matches.
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'new' check (status in ('new', 'approved', 'rejected', 'spam', 'merged')),
  is_test boolean not null default false,
  locale text not null check (locale in ('en', 'sv', 'fi')),
  contact_name text not null check (char_length(btrim(contact_name)) between 1 and 100),
  email text not null check (char_length(email) between 3 and 254),
  email_normalized text generated always as (lower(btrim(email))) stored,
  company text check (char_length(company) <= 120),
  website text check (char_length(website) <= 254),
  service text not null check (service in ('websites', 'marketing', 'other')),
  project_type text check (project_type in ('website', 'ecommerce', 'website_ecommerce', 'brand_website', 'not_sure')),
  budget_range text check (budget_range in ('under_1k', '1k_3k', '3k_5k', '5k_10k', 'over_10k', 'not_sure', 'custom')),
  budget_amount_eur integer check (budget_amount_eur between 100 and 10000000),
  timeline text check (timeline in ('asap', 'within_3_months', '3_6_months', 'flexible')),
  desired_date date,
  message text not null check (char_length(message) between 20 and 4000),
  privacy_notice_version text check (char_length(privacy_notice_version) <= 40),
  -- When the website says it was sent, and when Studio OS stored it.
  submitted_at timestamptz not null,
  received_at timestamptz not null default now(),
  unique (studio_id, source, submission_id),
  -- An amount only with "custom", and "custom" only with an amount.
  constraint amount_only_with_custom check ((budget_amount_eur is not null) = (budget_range is not distinct from 'custom')),
  -- A project type only describes website inquiries.
  constraint project_type_only_for_websites check (project_type is null or service = 'websites')
);
create index inquiries_studio_received_idx on public.inquiries (studio_id, received_at desc);
create index inquiries_studio_email_idx on public.inquiries (studio_id, email_normalized, received_at desc);

-- One row per stored inquiry that carried an IP address: a keyed hash of the
-- address (never the address), used only for the per-IP rate limit. Not linked
-- to the inquiry. Meant to be pruned after 24 hours by the retention job,
-- which does not exist yet.
create table public.inquiry_rate_limits (
  id bigint generated always as identity primary key,
  studio_id uuid not null references public.studios (id) on delete cascade,
  ip_hash text not null check (ip_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);
create index inquiry_rate_limits_lookup_idx on public.inquiry_rate_limits (studio_id, ip_hash, created_at desc);

/* ------------------------------------------------------------------------ */
/* Access                                                                    */
/* ------------------------------------------------------------------------ */

alter table public.inquiries enable row level security;
alter table public.inquiry_rate_limits enable row level security;

revoke all on public.inquiries, public.inquiry_rate_limits from public, anon, authenticated, service_role;
grant select on public.inquiries to authenticated;
create policy "members read" on public.inquiries for select to authenticated using (private.is_member(studio_id));
-- inquiry_rate_limits: no grants and no policies for anyone but the owner.

/* ------------------------------------------------------------------------ */
/* Receiving                                                                 */
/* ------------------------------------------------------------------------ */

-- Stores one inquiry, or recognizes a retry. Called only by /api/inquiries
-- (service role) after it has verified the signature and validated the
-- payload. Returns {"result": ...}:
--   received      stored now; "id" is the new inquiry
--   duplicate     this submission id was already stored with the same content hash; "id" is the original
--   conflict      this submission id was already stored with different customer answers; nothing changed
--   rate_limited  too many recent inquiries; nothing stored; "retryAfter" in seconds
--
-- All inquiries for a studio are received one at a time (a transaction-level
-- advisory lock), so two concurrent retries of one submission store one row,
-- and the rate-limit counts are exact. The earlier-copy lookup comes before
-- the limits, so a retry is never refused as rate limited.
create function public.receive_inquiry(p_studio uuid, p_inquiry jsonb, p_content_hash text, p_ip_hash text)
  returns jsonb
  language plpgsql security definer set search_path = ''
  as $$
  declare
    v_source text := p_inquiry ->> 'source';
    v_submission uuid := (p_inquiry ->> 'submissionId')::uuid;
    v_email text := lower(btrim(p_inquiry -> 'contact' ->> 'email'));
    v_existing record;
    v_id uuid;
    v_oldest timestamptz;
  begin
    if p_content_hash is null or p_content_hash !~ '^[0-9a-f]{64}$' then
      raise exception 'A content hash is required.' using errcode = '22023';
    end if;
    if p_ip_hash is not null and p_ip_hash !~ '^[0-9a-f]{64}$' then
      raise exception 'The IP hash is not valid.' using errcode = '22023';
    end if;
    if not exists (select 1 from public.studios where id = p_studio) then
      raise exception 'The studio that receives inquiries does not exist.' using errcode = 'SO404';
    end if;

    perform pg_advisory_xact_lock(hashtextextended('studio_os.inquiries:' || p_studio::text, 0));

    select id, content_hash into v_existing from public.inquiries
      where studio_id = p_studio and source = v_source and submission_id = v_submission;
    if found then
      if v_existing.content_hash = p_content_hash then
        return jsonb_build_object('result', 'duplicate', 'id', v_existing.id);
      end if;
      return jsonb_build_object('result', 'conflict');
    end if;

    -- 5 per IP per hour.
    if p_ip_hash is not null then
      select min(created_at) into v_oldest from (
        select created_at from public.inquiry_rate_limits
          where studio_id = p_studio and ip_hash = p_ip_hash and created_at > now() - interval '1 hour'
          order by created_at desc limit 5) recent
        having count(*) >= 5;
      if v_oldest is not null then
        return jsonb_build_object('result', 'rate_limited',
          'retryAfter', greatest(1, ceil(extract(epoch from v_oldest + interval '1 hour' - now())))::int);
      end if;
    end if;

    -- 3 per email address per day.
    select min(received_at) into v_oldest from (
      select received_at from public.inquiries
        where studio_id = p_studio and email_normalized = v_email and received_at > now() - interval '1 day'
        order by received_at desc limit 3) recent
      having count(*) >= 3;
    if v_oldest is not null then
      return jsonb_build_object('result', 'rate_limited',
        'retryAfter', greatest(1, ceil(extract(epoch from v_oldest + interval '1 day' - now())))::int);
    end if;

    -- 200 per studio per day.
    select min(received_at) into v_oldest from (
      select received_at from public.inquiries
        where studio_id = p_studio and received_at > now() - interval '1 day'
        order by received_at desc limit 200) recent
      having count(*) >= 200;
    if v_oldest is not null then
      return jsonb_build_object('result', 'rate_limited',
        'retryAfter', greatest(1, ceil(extract(epoch from v_oldest + interval '1 day' - now())))::int);
    end if;

    insert into public.inquiries (
      studio_id, source, submission_id, content_hash, is_test, locale,
      contact_name, email, company, website, service, project_type,
      budget_range, budget_amount_eur, timeline, desired_date, message,
      privacy_notice_version, submitted_at
    ) values (
      p_studio, v_source, v_submission, p_content_hash, coalesce((p_inquiry ->> 'test')::boolean, false), p_inquiry ->> 'locale',
      p_inquiry -> 'contact' ->> 'name', p_inquiry -> 'contact' ->> 'email', p_inquiry -> 'contact' ->> 'company',
      p_inquiry -> 'contact' ->> 'website', p_inquiry ->> 'service', p_inquiry ->> 'projectType',
      p_inquiry ->> 'budget', (p_inquiry ->> 'budgetAmount')::int, p_inquiry ->> 'timeline',
      (p_inquiry ->> 'desiredDate')::date, p_inquiry ->> 'message',
      p_inquiry ->> 'privacyNoticeVersion', (p_inquiry ->> 'submittedAt')::timestamptz
    )
    on conflict (studio_id, source, submission_id) do nothing
    returning id into v_id;

    if v_id is null then
      -- Not reachable while the lock is held; kept so a retry can never become a second row.
      select id, content_hash into v_existing from public.inquiries
        where studio_id = p_studio and source = v_source and submission_id = v_submission;
      return case when v_existing.content_hash = p_content_hash
        then jsonb_build_object('result', 'duplicate', 'id', v_existing.id)
        else jsonb_build_object('result', 'conflict') end;
    end if;

    if p_ip_hash is not null then
      insert into public.inquiry_rate_limits (studio_id, ip_hash) values (p_studio, p_ip_hash);
    end if;
    return jsonb_build_object('result', 'received', 'id', v_id);
  end $$;

revoke execute on function public.receive_inquiry(uuid, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.receive_inquiry(uuid, jsonb, text, text) to service_role;
