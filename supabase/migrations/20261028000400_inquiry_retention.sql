-- Studio OS: retention for website inquiries (decided 28 Oct 2026).
--
-- Inquiries that do not become clients are kept for 12 months, then
-- anonymised: every field that identifies or describes the person is
-- cleared, and the row stays so counts and audits still add up. The clock
-- starts when a person decided the inquiry (rejected, spam), or when it was
-- received if nobody ever decided it. Approved inquiries became clients and
-- are never touched here; client retention is a separate decision.
-- Rate-limit rows (keyed IP hashes) are deleted after 24 hours.
--
--   private.anonymise_inquiry(id)          clears one eligible inquiry
--   private.run_inquiry_retention(dry_run) finds every eligible inquiry and
--                                          anonymises it (or, in a dry run,
--                                          only lists it), prunes rate limits,
--                                          and records the run
--
-- Both live in the private schema, which the API does not expose, and only
-- the database owner may execute them: not visitors, not signed-in people,
-- not the service role. pg_cron runs the retention daily as the owner.
--
-- Safe to retry: a run only selects rows that are not anonymised yet, an
-- anonymised row cannot be anonymised again, and two runs never overlap.

/* ------------------------------------------------------------------------ */
/* Columns that may be cleared                                               */
/* ------------------------------------------------------------------------ */

alter table public.inquiries add column anonymised_at timestamptz;

-- What the customer wrote stays required, and within its limits, until the
-- inquiry is anonymised; after that it is all empty.
alter table public.inquiries
  alter column contact_name drop not null,
  alter column email drop not null,
  alter column message drop not null,
  alter column content_hash drop not null,
  drop constraint inquiries_contact_name_check,
  drop constraint inquiries_email_check,
  drop constraint inquiries_message_check,
  drop constraint inquiries_content_hash_check,
  drop constraint amount_only_with_custom,
  add constraint inquiries_contact_name_check check (contact_name is null or char_length(btrim(contact_name)) between 1 and 100),
  add constraint inquiries_email_check check (email is null or char_length(email) between 3 and 254),
  add constraint inquiries_message_check check (message is null or char_length(message) between 20 and 4000),
  add constraint inquiries_content_hash_check check (content_hash is null or content_hash ~ '^[0-9a-f]{64}$'),
  add constraint submitted_until_anonymised check (
    anonymised_at is not null
    or (contact_name is not null and email is not null and message is not null and content_hash is not null)),
  add constraint empty_once_anonymised check (
    anonymised_at is null
    or (contact_name is null and email is null and company is null and website is null and message is null
        and content_hash is null and budget_amount_eur is null and desired_date is null
        and privacy_notice_version is null and decision_reason is null)),
  -- The custom amount is personal detail and is cleared; the range ("custom") is kept.
  add constraint amount_only_with_custom check (
    anonymised_at is not null or ((budget_amount_eur is not null) = (budget_range is not distinct from 'custom'))),
  add constraint only_unconverted_anonymised check (anonymised_at is null or status in ('new', 'rejected', 'spam'));

create index inquiries_retention_idx on public.inquiries (coalesce(decided_at, received_at)) where anonymised_at is null;
create index inquiry_rate_limits_created_idx on public.inquiry_rate_limits (created_at);

/* ------------------------------------------------------------------------ */
/* Guard                                                                     */
/* ------------------------------------------------------------------------ */

-- True only inside private.anonymise_inquiry(), which sets it for its own transaction.
create function private.anonymising_inquiry() returns boolean
  language sql stable set search_path = ''
  as $$ select coalesce(current_setting('studio_os.anonymising_inquiry', true), '') = 'on' $$;
revoke all on function private.anonymising_inquiry() from public, anon, service_role;
-- The guard below runs as whoever updates an inquiry, so people deciding one need to read the flag.
grant execute on function private.anonymising_inquiry() to authenticated;

-- Same rules as before for decisions, plus: an anonymised inquiry can no
-- longer be decided, and anonymising may only clear the personal fields of
-- an unconverted inquiry, once.
create or replace function private.guard_inquiry() returns trigger
  language plpgsql set search_path = ''
  as $$
  declare
    -- email_normalized is generated: a before trigger sees it as null in the new row. It follows email.
    v_decision text[] := array['status', 'client_id', 'created_client', 'decided_by', 'decided_at', 'decision_reason', 'email_normalized'];
    v_personal text[] := array['contact_name', 'email', 'company', 'website', 'message', 'content_hash', 'budget_amount_eur',
                               'desired_date', 'privacy_notice_version', 'decision_reason', 'anonymised_at', 'email_normalized'];
  begin
    if private.anonymising_inquiry() then
      if old.anonymised_at is not null then
        raise exception 'This inquiry is already anonymised.' using errcode = 'SO409';
      end if;
      if old.status not in ('new', 'rejected', 'spam') then
        raise exception 'Only inquiries that did not become clients are anonymised.' using errcode = '42501';
      end if;
      if (to_jsonb(new) - v_personal) <> (to_jsonb(old) - v_personal)
         or num_nonnulls(new.contact_name, new.email, new.company, new.website, new.message, new.content_hash,
                         new.budget_amount_eur, new.desired_date, new.privacy_notice_version, new.decision_reason) > 0 then
        raise exception 'Anonymising only clears personal details.' using errcode = '42501';
      end if;
      new.anonymised_at := now();
      return new;
    end if;

    if not private.deciding_inquiry() then
      raise exception 'Inquiries are decided through the review in Studio OS.' using errcode = '42501';
    end if;
    if old.anonymised_at is not null then
      raise exception 'This inquiry was anonymised and can no longer be decided.' using errcode = 'SO409';
    end if;
    if old.status <> 'new' then
      raise exception 'This inquiry has already been decided. Reload to see the decision.' using errcode = 'SO409';
    end if;
    if (to_jsonb(new) - v_decision) <> (to_jsonb(old) - v_decision) then
      raise exception 'What the customer sent cannot be changed.' using errcode = '42501';
    end if;
    if new.status not in ('approved', 'rejected', 'spam') then
      raise exception 'Unknown decision.' using errcode = '22023';
    end if;
    if auth.uid() is null or not private.acts_as_caller(new.decided_by) then
      raise exception 'Only a person can decide an inquiry, in their own name.' using errcode = '42501';
    end if;
    new.decided_at := now();
    return new;
  end $$;

/* ------------------------------------------------------------------------ */
/* Anonymising                                                               */
/* ------------------------------------------------------------------------ */

-- When an inquiry stops being kept: 12 months after the decision, or after
-- it arrived if nobody decided it. Null for inquiries that are kept.
create function private.inquiry_retention_ends(p_status text, p_received timestamptz, p_decided timestamptz)
  returns timestamptz
  language sql immutable set search_path = ''
  as $$ select case when p_status in ('new', 'rejected', 'spam') then coalesce(p_decided, p_received) + interval '12 months' end $$;

-- Clears one inquiry. Refuses one that is kept (approved, merged), one that
-- is not old enough yet, and one that is already anonymised. Also used for
-- an erasure request, by the owner, with p_force (skips only the age check).
create function private.anonymise_inquiry(p_id uuid, p_force boolean default false) returns void
  language plpgsql set search_path = ''
  as $$
  declare v public.inquiries;
  begin
    select * into v from public.inquiries where id = p_id for update;
    if not found then
      raise exception 'No such inquiry.' using errcode = 'SO404';
    end if;
    if v.anonymised_at is not null then
      raise exception 'This inquiry is already anonymised.' using errcode = 'SO409';
    end if;
    if private.inquiry_retention_ends(v.status, v.received_at, v.decided_at) is null then
      raise exception 'Only inquiries that did not become clients are anonymised.' using errcode = '42501';
    end if;
    if not p_force and private.inquiry_retention_ends(v.status, v.received_at, v.decided_at) > now() then
      raise exception 'This inquiry is still within its 12 months.' using errcode = '42501';
    end if;

    perform set_config('studio_os.anonymising_inquiry', 'on', true);
    update public.inquiries set
        contact_name = null, email = null, company = null, website = null, message = null, content_hash = null,
        budget_amount_eur = null, desired_date = null, privacy_notice_version = null, decision_reason = null
      where id = p_id;
    perform set_config('studio_os.anonymising_inquiry', 'off', true);
  end $$;

/* ------------------------------------------------------------------------ */
/* The daily run                                                             */
/* ------------------------------------------------------------------------ */

-- One row per run, dry runs included, so anyone with database access can see
-- that the schedule runs and what it did. Ids only, never personal data.
create table private.inquiry_retention_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  dry_run boolean not null,
  anonymised uuid[] not null default '{}',
  rate_limits_deleted int not null default 0,
  skipped text
);
revoke all on private.inquiry_retention_runs from public, anon, authenticated, service_role;

-- Anonymises every inquiry past its retention date and deletes rate-limit
-- rows older than 24 hours. With p_dry_run, changes nothing and returns what
-- it would do. Returns
--   {"dryRun", "anonymised": [{"id", "status", "isTest", "retentionEnded"}], "rateLimitsDeleted"}
-- or {"skipped": "another run is in progress"}.
create function private.run_inquiry_retention(p_dry_run boolean default false) returns jsonb
  language plpgsql set search_path = ''
  as $$
  declare
    v_due jsonb;
    v_ids uuid[];
    v_rate int;
    r record;
  begin
    -- Never two runs at once (a retry while the scheduled run is still going).
    if not pg_try_advisory_xact_lock(hashtextextended('studio_os.inquiry_retention', 0)) then
      insert into private.inquiry_retention_runs (dry_run, skipped) values (p_dry_run, 'another run is in progress');
      return jsonb_build_object('skipped', 'another run is in progress');
    end if;

    select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'status', i.status, 'isTest', i.is_test,
                                                 'retentionEnded', private.inquiry_retention_ends(i.status, i.received_at, i.decided_at))
                              order by i.received_at), '[]'),
           coalesce(array_agg(i.id order by i.received_at), '{}')
      into v_due, v_ids
      from public.inquiries i
      where i.anonymised_at is null
        and private.inquiry_retention_ends(i.status, i.received_at, i.decided_at) <= now();

    if p_dry_run then
      select count(*) into v_rate from public.inquiry_rate_limits where created_at < now() - interval '24 hours';
    else
      -- Locks each row and checks it again, so a decision made a moment ago wins over a stale list.
      for r in
        select i.id from public.inquiries i
          where i.id = any (v_ids) and i.anonymised_at is null
            and private.inquiry_retention_ends(i.status, i.received_at, i.decided_at) <= now()
          order by i.id
          for update
      loop
        perform private.anonymise_inquiry(r.id);
      end loop;
      delete from public.inquiry_rate_limits where created_at < now() - interval '24 hours';
      get diagnostics v_rate = row_count;
    end if;

    insert into private.inquiry_retention_runs (dry_run, anonymised, rate_limits_deleted) values (p_dry_run, v_ids, v_rate);
    return jsonb_build_object('dryRun', p_dry_run, 'anonymised', v_due, 'rateLimitsDeleted', v_rate);
  end $$;

revoke all on function private.inquiry_retention_ends(text, timestamptz, timestamptz) from public, anon, authenticated, service_role;
revoke all on function private.anonymise_inquiry(uuid, boolean) from public, anon, authenticated, service_role;
revoke all on function private.run_inquiry_retention(boolean) from public, anon, authenticated, service_role;

/* ------------------------------------------------------------------------ */
/* Schedule                                                                  */
/* ------------------------------------------------------------------------ */

-- Daily at 03:17 UTC, as the database owner. Scheduling again under the same
-- name replaces the job, so applying this twice leaves one job.
create extension if not exists pg_cron;
select cron.schedule('inquiry-retention', '17 3 * * *', 'select private.run_inquiry_retention()');
