-- Studio OS: repeat submissions from one address.
--
-- When someone sends a new inquiry while an earlier one from the same email
-- address is still waiting for a decision (received within the last 30
-- days), the new one is stored as a repeat of the first (repeat_of). The
-- team sees them together and decides once: deciding the first resolves its
-- open repeats as "merged", with the same client when it was approved. A
-- repeat cannot be decided on its own while its first inquiry is open.
--
-- Retention follows the outcome: a repeat merged into an approved inquiry is
-- kept with the client; one merged into a rejected or spam inquiry is
-- anonymised 12 months after that decision, like the inquiry it was merged
-- into.
--
-- Access is unchanged: repeat_of is set only when the row is stored, and
-- nobody can change it afterwards (the guard compares it on every update).

/* ------------------------------------------------------------------------ */
/* Column                                                                    */
/* ------------------------------------------------------------------------ */

alter table public.inquiries
  add constraint inquiries_id_studio_key unique (id, studio_id),
  add column repeat_of uuid,
  add constraint inquiries_repeat_fk foreign key (repeat_of, studio_id) references public.inquiries (id, studio_id),
  add constraint repeat_not_self check (repeat_of is distinct from id),
  add constraint merged_only_repeats check (status <> 'merged' or repeat_of is not null);

create index inquiries_repeat_idx on public.inquiries (repeat_of) where repeat_of is not null;

-- Links a new inquiry to the first open inquiry from the same address. Runs
-- inside receive_inquiry(), which receives a studio's inquiries one at a
-- time, so two repeats arriving together link to the same first inquiry.
-- email_normalized is generated and not yet set in a before trigger, so the
-- same expression is used here.
create function private.link_repeat_inquiry() returns trigger
  language plpgsql set search_path = ''
  as $$
  begin
    if new.repeat_of is null and new.status = 'new' then
      new.repeat_of := (
        select i.id from public.inquiries i
          where i.studio_id = new.studio_id
            and i.email_normalized = lower(btrim(new.email))
            and i.is_test = new.is_test
            and i.status = 'new' and i.repeat_of is null and i.anonymised_at is null
            and i.received_at > now() - interval '30 days'
          order by i.received_at
          limit 1);
    end if;
    return new;
  end $$;
revoke all on function private.link_repeat_inquiry() from public, anon, authenticated, service_role;

create trigger link_repeat before insert on public.inquiries
  for each row execute function private.link_repeat_inquiry();

/* ------------------------------------------------------------------------ */
/* Retention: who is anonymised                                              */
/* ------------------------------------------------------------------------ */

-- When an inquiry stops being kept: 12 months after the decision, or after
-- it arrived if nobody decided it. Null for inquiries that are kept: approved
-- ones, and repeats merged into an approved inquiry (they have its client).
create function private.inquiry_retention_ends(p_status text, p_client uuid, p_received timestamptz, p_decided timestamptz)
  returns timestamptz
  language sql immutable set search_path = ''
  as $$
    select case when p_status in ('new', 'rejected', 'spam') or (p_status = 'merged' and p_client is null)
                then coalesce(p_decided, p_received) + interval '12 months' end
  $$;
revoke all on function private.inquiry_retention_ends(text, uuid, timestamptz, timestamptz) from public, anon, authenticated, service_role;

alter table public.inquiries
  drop constraint only_unconverted_anonymised,
  add constraint only_unconverted_anonymised check (
    anonymised_at is null or status in ('new', 'rejected', 'spam') or (status = 'merged' and client_id is null));

/* ------------------------------------------------------------------------ */
/* Guard                                                                     */
/* ------------------------------------------------------------------------ */

-- As before, plus: deciding an inquiry may resolve its repeats as merged,
-- and a repeat merged into a rejected or spam inquiry may be anonymised.
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
      if private.inquiry_retention_ends(old.status, old.client_id, old.received_at, old.decided_at) is null then
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
    if new.status not in ('approved', 'rejected', 'spam', 'merged') or (new.status = 'merged' and old.repeat_of is null) then
      raise exception 'Unknown decision.' using errcode = '22023';
    end if;
    if auth.uid() is null or not private.acts_as_caller(new.decided_by) then
      raise exception 'Only a person can decide an inquiry, in their own name.' using errcode = '42501';
    end if;
    new.decided_at := now();
    return new;
  end $$;

/* ------------------------------------------------------------------------ */
/* Deciding                                                                  */
/* ------------------------------------------------------------------------ */

-- As before, plus repeats. Deciding an inquiry resolves its open repeats as
-- merged, in the same transaction and in the same person's name; when it is
-- approved they get the same client (the app adds each repeat's message to
-- that client as source material in p_changes). A repeat whose first inquiry
-- is still open is refused: it is decided together with that one. A repeat
-- whose first inquiry is no longer open (decided before the repeat was
-- stored, or anonymised) is decided on its own.
--
-- Locks: the first inquiry before the repeat, the same order as deciding the
-- first inquiry (it, then its repeats), so two people never wait on each other.
create or replace function public.decide_inquiry(p_studio uuid, p_inquiry uuid, p_decision jsonb, p_changes jsonb, p_onboarding jsonb)
  returns void
  language plpgsql set search_path = ''
  as $$
  declare
    v_status text := p_decision ->> 'status';
    v_client uuid;
    v_created boolean := false;
    v_current text;
    v_first uuid;
    v_first_open boolean;
  begin
    if not private.can_write(p_studio) then
      raise exception 'You have read-only access to this studio.' using errcode = '42501';
    end if;
    if v_status is null or v_status not in ('approved', 'rejected', 'spam') then
      raise exception 'Unknown decision.' using errcode = '22023';
    end if;

    select repeat_of into v_first from public.inquiries where id = p_inquiry and studio_id = p_studio;
    if v_first is not null then
      select status = 'new' and anonymised_at is null into v_first_open
        from public.inquiries where id = v_first for update;
    end if;

    select status into v_current from public.inquiries where id = p_inquiry and studio_id = p_studio for update;
    if not found then
      raise exception 'This inquiry no longer exists, or you do not have access to it.' using errcode = 'SO404';
    end if;
    if v_current <> 'new' then
      raise exception 'This inquiry has already been decided. Reload to see the decision.' using errcode = 'SO409';
    end if;
    if v_first_open then
      raise exception 'This inquiry was sent again by the same address. Decide the first inquiry; this one is resolved with it.'
        using errcode = 'SO409';
    end if;

    if v_status = 'approved' then
      v_client := (p_decision ->> 'client_id')::uuid;
      if v_client is null then
        raise exception 'Choose the client this inquiry belongs to.' using errcode = '22023';
      end if;
      v_created := exists (
        select 1 from jsonb_array_elements(coalesce(p_changes -> 'clients', '[]')) c
        where c ->> 'op' = 'insert' and c -> 'row' ->> 'id' = v_client::text);
      perform public.apply_onboarding_changes(p_studio, coalesce(p_changes, '{}'), p_onboarding);
    elsif coalesce(p_changes, 'null') <> 'null' or coalesce(p_onboarding, 'null') <> 'null' then
      raise exception 'Rejecting an inquiry changes nothing else.' using errcode = '22023';
    end if;

    perform set_config('studio_os.deciding_inquiry', 'on', true);
    update public.inquiries set
        status = v_status,
        client_id = v_client,
        created_client = v_created,
        decided_by = p_decision -> 'decided_by',
        decision_reason = case when v_status = 'rejected' then nullif(btrim(p_decision ->> 'reason'), '') end
      where id = p_inquiry and studio_id = p_studio;
    update public.inquiries set
        status = 'merged',
        client_id = v_client,
        decided_by = p_decision -> 'decided_by'
      where repeat_of = p_inquiry and studio_id = p_studio and status = 'new' and anonymised_at is null;
    perform set_config('studio_os.deciding_inquiry', 'off', true);
  end $$;

/* ------------------------------------------------------------------------ */
/* Retention: the functions, now with merged repeats                         */
/* ------------------------------------------------------------------------ */

-- As in 20261028000400, with the client taken into account (see inquiry_retention_ends).
create or replace function private.anonymise_inquiry(p_id uuid, p_force boolean default false) returns void
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
    if private.inquiry_retention_ends(v.status, v.client_id, v.received_at, v.decided_at) is null then
      raise exception 'Only inquiries that did not become clients are anonymised.' using errcode = '42501';
    end if;
    if not p_force and private.inquiry_retention_ends(v.status, v.client_id, v.received_at, v.decided_at) > now() then
      raise exception 'This inquiry is still within its 12 months.' using errcode = '42501';
    end if;

    perform set_config('studio_os.anonymising_inquiry', 'on', true);
    update public.inquiries set
        contact_name = null, email = null, company = null, website = null, message = null, content_hash = null,
        budget_amount_eur = null, desired_date = null, privacy_notice_version = null, decision_reason = null
      where id = p_id;
    perform set_config('studio_os.anonymising_inquiry', 'off', true);
  end $$;

create or replace function private.run_inquiry_retention(p_dry_run boolean default false) returns jsonb
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
                                                 'retentionEnded', private.inquiry_retention_ends(i.status, i.client_id, i.received_at, i.decided_at))
                              order by i.received_at), '[]'),
           coalesce(array_agg(i.id order by i.received_at), '{}')
      into v_due, v_ids
      from public.inquiries i
      where i.anonymised_at is null
        and private.inquiry_retention_ends(i.status, i.client_id, i.received_at, i.decided_at) <= now();

    if p_dry_run then
      select count(*) into v_rate from public.inquiry_rate_limits where created_at < now() - interval '24 hours';
    else
      -- Locks each row and checks it again, so a decision made a moment ago wins over a stale list.
      for r in
        select i.id from public.inquiries i
          where i.id = any (v_ids) and i.anonymised_at is null
            and private.inquiry_retention_ends(i.status, i.client_id, i.received_at, i.decided_at) <= now()
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

drop function private.inquiry_retention_ends(text, timestamptz, timestamptz);
