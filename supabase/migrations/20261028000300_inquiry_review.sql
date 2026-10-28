-- Studio OS: reviewing website inquiries.
--
-- Staff decide each inquiry once: approve it as a new client, add it to an
-- existing client, reject it, or mark it as spam. Every decision goes through
-- decide_inquiry(), which runs as the signed-in person (security invoker), so
-- row-level security, grants and the guard triggers apply as for any other
-- change. Approving writes the client, brief values, source material and
-- onboarding through apply_onboarding_changes() in the same transaction as the
-- decision, so an inquiry is never approved without its client, and a client
-- is never created twice from one inquiry.
--
-- Access added here:
--   - authenticated: update only the decision columns, only as an owner or
--     member, and only through decide_inquiry() (a guard trigger refuses any
--     other update). What the customer wrote stays unchanged.
--   - anon and service_role: nothing new.
--
-- Retention (12 months from decided_at for inquiries that do not become
-- clients, then anonymised) is still NOT implemented. Only test inquiries.

/* ------------------------------------------------------------------------ */
/* Decision columns                                                          */
/* ------------------------------------------------------------------------ */

alter table public.inquiries
  -- The client an approved inquiry became, or was added to.
  add column client_id uuid,
  -- True when approving created that client; false when it was added to an existing one.
  add column created_client boolean not null default false,
  add column decided_by jsonb check (public.is_valid_actor(decided_by)),
  add column decided_at timestamptz,
  -- Why it was rejected. Internal: never sent to the customer or the website.
  add column decision_reason text check (char_length(decision_reason) <= 1000),
  add constraint inquiries_client_fk foreign key (client_id, studio_id) references public.clients (id, studio_id),
  add constraint decided_when_final check ((status = 'new') = (decided_at is null) and (status = 'new') = (decided_by is null)),
  add constraint client_when_approved check ((status = 'approved') <= (client_id is not null) and (client_id is null or status in ('approved', 'merged'))),
  add constraint created_client_when_approved check (not created_client or status = 'approved'),
  add constraint reason_when_rejected check (decision_reason is null or status in ('rejected', 'spam'));

create index inquiries_client_idx on public.inquiries (client_id) where client_id is not null;

/* ------------------------------------------------------------------------ */
/* Guard                                                                     */
/* ------------------------------------------------------------------------ */

-- True only inside decide_inquiry(), which sets it for its own transaction.
create function private.deciding_inquiry() returns boolean
  language sql stable set search_path = ''
  as $$ select coalesce(current_setting('studio_os.deciding_inquiry', true), '') = 'on' $$;

revoke all on function private.deciding_inquiry() from public;
grant execute on function private.deciding_inquiry() to authenticated;

-- An inquiry is decided once, by a person, in their own name, and only its
-- decision columns change. Holds for anyone with update rights, whatever they send.
create function private.guard_inquiry() returns trigger
  language plpgsql set search_path = ''
  as $$
  declare
    -- The decision columns, plus email_normalized: a generated column, which a
    -- before trigger sees as null in the new row. It follows email, which is compared.
    v_decision text[] := array['status', 'client_id', 'created_client', 'decided_by', 'decided_at', 'decision_reason', 'email_normalized'];
  begin
    if not private.deciding_inquiry() then
      raise exception 'Inquiries are decided through the review in Studio OS.' using errcode = '42501';
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

create trigger guard_inquiry before update on public.inquiries for each row execute function private.guard_inquiry();

-- Inquiries are never deleted by people (the retention job will anonymise them instead).
create trigger keep_studio before update on public.inquiries for each row execute function private.keep_studio();

/* ------------------------------------------------------------------------ */
/* Access                                                                    */
/* ------------------------------------------------------------------------ */

grant update (status, client_id, created_client, decided_by, decided_at, decision_reason) on public.inquiries to authenticated;
create policy "writers decide" on public.inquiries for update to authenticated
  using (private.can_write(studio_id)) with check (private.can_write(studio_id));

/* ------------------------------------------------------------------------ */
/* Deciding                                                                  */
/* ------------------------------------------------------------------------ */

-- Records one decision. p_decision is
--   {"status": "approved" | "rejected" | "spam", "client_id": uuid (approved only),
--    "reason": text (rejected only, optional), "decided_by": the caller's actor}.
-- For an approval, p_changes and p_onboarding are what the app's domain
-- functions built (the new client and its brief, or what is added to an
-- existing client), applied exactly like any other change. A rejection or
-- spam changes nothing but the inquiry.
--
-- The inquiry row is locked first, so two people deciding at the same moment
-- get one decision: the second is told it was already decided, and nothing
-- of theirs is written.
create function public.decide_inquiry(p_studio uuid, p_inquiry uuid, p_decision jsonb, p_changes jsonb, p_onboarding jsonb)
  returns void
  language plpgsql set search_path = ''
  as $$
  declare
    v_status text := p_decision ->> 'status';
    v_client uuid;
    v_created boolean := false;
    v_current text;
  begin
    if not private.can_write(p_studio) then
      raise exception 'You have read-only access to this studio.' using errcode = '42501';
    end if;
    if v_status is null or v_status not in ('approved', 'rejected', 'spam') then
      raise exception 'Unknown decision.' using errcode = '22023';
    end if;

    select status into v_current from public.inquiries where id = p_inquiry and studio_id = p_studio for update;
    if not found then
      raise exception 'This inquiry no longer exists, or you do not have access to it.' using errcode = 'SO404';
    end if;
    if v_current <> 'new' then
      raise exception 'This inquiry has already been decided. Reload to see the decision.' using errcode = 'SO409';
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
    perform set_config('studio_os.deciding_inquiry', 'off', true);
  end $$;

revoke execute on function public.decide_inquiry(uuid, uuid, jsonb, jsonb, jsonb) from public, anon, service_role;
grant execute on function public.decide_inquiry(uuid, uuid, jsonb, jsonb, jsonb) to authenticated;
