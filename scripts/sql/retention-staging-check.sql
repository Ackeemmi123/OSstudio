-- Studio OS: retention check on staging. TEST DATA ONLY, NOTHING IS KEPT.
--
-- Run in the Supabase SQL editor of the staging project, as one script, only
-- after a dry run (`select private.run_inquiry_retention(true);`) or the
-- read-only check in docs/staging.md listed no inquiries.
--
-- Everything the test writes happens inside one block that is rolled back
-- at the end: the test inquiries, a temporary test client for the approved
-- case, the rate-limit rows the job deletes, and the job's run records. Only
-- the results survive, in a temporary table that disappears when the editor
-- session ends. The last rows check that nothing was left behind.
--
-- The test:
--   1. adds a temporary client "Retention check client (test)" and six test
--      inquiries (is_test, company "Retention check (test)"), dated as they
--      will be a year from now; the approved one is linked to that client;
--   2. runs the retention as a dry run, for real, and again (a retry);
--   3. records what happened to each, then rolls all of it back;
--   4. shows one row per check: every "result" should be PASS.

create temp table retention_result (label text, expected text, named_by_dry_run boolean, anonymised boolean,
  personal_fields_left int, touched_by_retry boolean, result text);

do $$
declare
  v_studio uuid := (select studio_id from public.inquiries order by received_at desc limit 1);
  v_client uuid := gen_random_uuid();
  v_before jsonb;
  v_rows jsonb;
  v_dry jsonb;
  v_run jsonb;
  v_retry jsonb;
begin
  if v_studio is null then
    raise exception 'No inquiry yet, so there is no studio that receives inquiries to test in.';
  end if;
  -- What must look exactly the same afterwards.
  v_before := jsonb_build_object(
    'inquiries', (select count(*) from public.inquiries),
    'anonymised', (select count(*) from public.inquiries where anonymised_at is not null),
    'clients', (select count(*) from public.clients),
    'rateLimits', (select count(*) from public.inquiry_rate_limits),
    'runs', (select count(*) from private.inquiry_retention_runs));

  begin
    create temp table retention_check (label text, status text, received interval, decided interval, expected text, id uuid default gen_random_uuid())
      on commit drop;
    insert into retention_check (label, status, received, decided, expected) values
      ('Rejected 12 months + 1 day ago', 'rejected', '13 months', '12 months 1 day', 'anonymised'),
      ('Spam 12 months + 1 day ago', 'spam', '12 months 2 days', '12 months 1 day', 'anonymised'),
      ('Undecided, received 12 months + 1 day ago', 'new', '12 months 1 day', null, 'anonymised'),
      ('Rejected 1 day short of 12 months', 'rejected', '13 months', '12 months -1 day', 'unchanged'),
      ('Undecided, 1 day short of 12 months', 'new', '12 months -1 day', null, 'unchanged'),
      ('Approved 2 years ago (temporary test client)', 'approved', '2 years', '2 years', 'unchanged');

    insert into public.clients (id, studio_id, name, status, source_type)
      values (v_client, v_studio, 'Retention check client (test)', 'onboarding', 'contact_form');

    insert into public.inquiries (id, studio_id, source, submission_id, content_hash, status, is_test, locale, contact_name, email,
      company, service, message, submitted_at, received_at, decided_at, decided_by, client_id, created_client)
    select c.id, v_studio, 'axivo_website', gen_random_uuid(), repeat('0', 64), c.status, true, 'en', 'Retention Check',
      'retention-check-' || c.id || '@example.com', 'Retention check (test)', 'other',
      'Test inquiry for the retention check. Not a real customer.', now() - c.received, now() - c.received,
      now() - c.decided, case when c.status <> 'new' then '{"kind":"system"}'::jsonb end,
      case when c.status = 'approved' then v_client end, c.status = 'approved'
    from retention_check c;

    v_dry := private.run_inquiry_retention(true);
    v_run := private.run_inquiry_retention(false);
    v_retry := private.run_inquiry_retention(false);

    select jsonb_agg(jsonb_build_object(
        'label', c.label, 'expected', c.expected,
        'named_by_dry_run', exists (select 1 from jsonb_array_elements(v_dry -> 'anonymised') e where (e ->> 'id')::uuid = c.id),
        'anonymised', i.anonymised_at is not null,
        'personal_fields_left', num_nonnulls(i.contact_name, i.email, i.company, i.message),
        'touched_by_retry', exists (select 1 from jsonb_array_elements(v_retry -> 'anonymised') e where (e ->> 'id')::uuid = c.id))
        order by c.expected, c.label)
      || jsonb_build_array(
        jsonb_build_object('label', 'Dry run names only these test inquiries', 'expected', 'nothing else',
          'personal_fields_left', (select count(*) from jsonb_array_elements(v_dry -> 'anonymised') e
                                     where (e ->> 'id')::uuid not in (select id from retention_check))),
        jsonb_build_object('label', 'Retry anonymises nothing new', 'expected', 'nothing',
          'personal_fields_left', jsonb_array_length(v_retry -> 'anonymised')))
      into v_rows
      from retention_check c join public.inquiries i on i.id = c.id;

    -- Undo everything above. Local variables keep their values.
    raise exception using errcode = 'RC001', message = 'roll back the test data';
  exception when sqlstate 'RC001' then
    null;
  end;

  insert into retention_result (label, expected, named_by_dry_run, anonymised, personal_fields_left, touched_by_retry)
  select r.label, r.expected, r.named_by_dry_run, r.anonymised, r.personal_fields_left, r.touched_by_retry
  from jsonb_to_recordset(v_rows) as r(label text, expected text, named_by_dry_run boolean, anonymised boolean,
                                       personal_fields_left int, touched_by_retry boolean);

  insert into retention_result (label, expected, personal_fields_left)
  values ('Nothing left behind (inquiries, clients, rate limits, runs)', 'same as before',
    case when jsonb_build_object(
        'inquiries', (select count(*) from public.inquiries),
        'anonymised', (select count(*) from public.inquiries where anonymised_at is not null),
        'clients', (select count(*) from public.clients),
        'rateLimits', (select count(*) from public.inquiry_rate_limits),
        'runs', (select count(*) from private.inquiry_retention_runs)) = v_before then 0 else 1 end);
end $$;

select label, expected, named_by_dry_run, anonymised, personal_fields_left, touched_by_retry,
  case when expected in ('anonymised', 'unchanged') then
         case when named_by_dry_run = (expected = 'anonymised') and anonymised = (expected = 'anonymised')
                and personal_fields_left = case when expected = 'anonymised' then 0 else 4 end and not touched_by_retry
              then 'PASS' else 'FAIL' end
       else case when personal_fields_left = 0 then 'PASS' else 'FAIL' end
  end as result
from retention_result;
