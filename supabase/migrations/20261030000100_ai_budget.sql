-- Studio OS: what each agent run cost, and a monthly cap on AI spend.
--
-- Every run records the tokens the provider reported, the model that
-- answered, an estimated cost and the prompt version. Before a model call the
-- server reserves the most that call could cost against the month's budget;
-- afterwards it settles the reservation to what the call actually cost. A
-- reservation that would take the month over the cap is refused, so the cap
-- holds under concurrent requests: the month's row is locked while a
-- reservation is checked and made.
--
-- The cap is set on the server (STUDIO_AI_MONTHLY_BUDGET_USD) and applies to
-- every agent together, because they share one provider account. Months are
-- calendar months in UTC. Amounts are whole micro-dollars.
--
-- Nothing here holds personal data: ledger rows are amounts keyed by run id.
-- The usage columns on agent_runs are numbers and identifiers, which client
-- anonymisation can keep.

alter table public.agent_runs
  add column prompt_version text check (prompt_version ~ '^[a-z0-9._-]{1,64}$'),
  add column served_by text check (char_length(served_by) between 1 and 100),
  add column input_tokens integer check (input_tokens >= 0),
  add column output_tokens integer check (output_tokens >= 0),
  add column cache_read_tokens integer check (cache_read_tokens >= 0),
  add column cache_write_tokens integer check (cache_write_tokens >= 0),
  add column cost_micros bigint check (cost_micros >= 0);

-- The runner records usage when it finishes a run.
grant update (served_by, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_micros)
  on public.agent_runs to service_role;

create table private.ai_budget_months (
  month date primary key check (month = date_trunc('month', month)::date),
  -- Settled cost of finished calls.
  spent_micros bigint not null default 0 check (spent_micros >= 0),
  -- Held for calls in flight, at the most each could cost.
  reserved_micros bigint not null default 0 check (reserved_micros >= 0)
);

create table private.ai_budget_reservations (
  run_id uuid primary key,
  month date not null references private.ai_budget_months (month),
  reserved_micros bigint not null check (reserved_micros >= 0),
  charged_micros bigint check (charged_micros >= 0),
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  constraint settled_is_complete check ((settled_at is null) = (charged_micros is null))
);
create index ai_budget_reservations_open_idx on private.ai_budget_reservations (month, created_at) where settled_at is null;

revoke all on private.ai_budget_months, private.ai_budget_reservations from public, anon, authenticated, service_role;

-- A reservation open this long belongs to a server that stopped mid-call.
-- It is charged in full: the call may have been billed.
create function private.ai_budget_charge_abandoned(p_month date)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_charged bigint;
begin
  with abandoned as (
    update private.ai_budget_reservations
       set charged_micros = reserved_micros, settled_at = now()
     where month = p_month and settled_at is null and created_at < now() - interval '15 minutes'
    returning reserved_micros
  )
  select coalesce(sum(reserved_micros), 0) into v_charged from abandoned;
  if v_charged > 0 then
    update private.ai_budget_months
       set spent_micros = spent_micros + v_charged, reserved_micros = reserved_micros - v_charged
     where month = p_month;
  end if;
end;
$$;
revoke all on function private.ai_budget_charge_abandoned(date) from public;

/**
 * Reserves p_amount for run p_run if the month stays within p_cap.
 * Returns {"ok": true} or {"ok": false, "spent": …, "reserved": …}.
 * Refuses when the month is already at the cap, even for a call that costs
 * nothing, so "budget used up" means no agent runs at all. Reserving twice
 * for the same run is a no-op.
 */
create function public.ai_budget_reserve(p_run uuid, p_amount bigint, p_cap bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_month date := date_trunc('month', now() at time zone 'utc')::date;
  v_spent bigint;
  v_reserved bigint;
begin
  if p_run is null or p_amount is null or p_amount < 0 or p_cap is null or p_cap <= 0 then
    raise exception 'A reservation needs a run, an amount of at least 0 and a positive cap.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.agent_runs where id = p_run and status = 'running') then
    raise exception 'Only a running agent run can reserve budget.' using errcode = '22023';
  end if;

  insert into private.ai_budget_months (month) values (v_month) on conflict do nothing;
  -- One reservation at a time per month: the check and the reservation below
  -- see the same totals.
  perform 1 from private.ai_budget_months where month = v_month for update;
  perform private.ai_budget_charge_abandoned(v_month);

  if exists (select 1 from private.ai_budget_reservations where run_id = p_run) then
    return jsonb_build_object('ok', true);
  end if;

  select spent_micros, reserved_micros into v_spent, v_reserved from private.ai_budget_months where month = v_month;
  if v_spent + v_reserved >= p_cap or v_spent + v_reserved + p_amount > p_cap then
    return jsonb_build_object('ok', false, 'spent', v_spent, 'reserved', v_reserved);
  end if;

  insert into private.ai_budget_reservations (run_id, month, reserved_micros) values (p_run, v_month, p_amount);
  update private.ai_budget_months set reserved_micros = reserved_micros + p_amount where month = v_month;
  return jsonb_build_object('ok', true);
end;
$$;

/**
 * Settles run p_run's reservation at p_charged, or at the full reservation
 * when p_charged is null (the cost is unknown). Settling twice, or a run
 * that never reserved, changes nothing.
 */
create function public.ai_budget_settle(p_run uuid, p_charged bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_month date;
  v_reserved bigint;
  v_charged bigint;
begin
  if p_charged < 0 then
    raise exception 'A charge cannot be negative.' using errcode = '22023';
  end if;
  select month into v_month from private.ai_budget_reservations where run_id = p_run;
  if v_month is null then
    return;
  end if;
  -- Lock in the same order as reserving (month, then reservation).
  perform 1 from private.ai_budget_months where month = v_month for update;
  update private.ai_budget_reservations
     set charged_micros = coalesce(p_charged, reserved_micros), settled_at = now()
   where run_id = p_run and settled_at is null
  returning reserved_micros, charged_micros into v_reserved, v_charged;
  if v_reserved is null then
    return;
  end if;
  update private.ai_budget_months
     set spent_micros = spent_micros + v_charged, reserved_micros = reserved_micros - v_reserved
   where month = v_month;
end;
$$;

/** This month's totals, for the owner's view in Settings. */
create function public.ai_budget_month()
returns jsonb
language sql
security definer
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'month', to_char(date_trunc('month', now() at time zone 'utc'), 'YYYY-MM-DD'),
    'spent', coalesce((select spent_micros from private.ai_budget_months where month = date_trunc('month', now() at time zone 'utc')::date), 0),
    'reserved', coalesce((select reserved_micros from private.ai_budget_months where month = date_trunc('month', now() at time zone 'utc')::date), 0)
  );
$$;

revoke execute on function public.ai_budget_reserve(uuid, bigint, bigint), public.ai_budget_settle(uuid, bigint), public.ai_budget_month()
  from public, anon, authenticated;
grant execute on function public.ai_budget_reserve(uuid, bigint, bigint), public.ai_budget_settle(uuid, bigint), public.ai_budget_month()
  to service_role;
