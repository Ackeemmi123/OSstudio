-- Studio OS: retention check on staging. TEST DATA ONLY, NOTHING IS KEPT.
--
-- Run in the Supabase SQL editor of the staging project, as one script, only
-- after the read-only check in docs/staging.md listed no inquiries due.
--
-- Everything the test writes happens inside one block that is rolled back
-- at the end: the test inquiries, a temporary test client for the approved
-- case, the rate-limit rows the job deletes, and the job's run records. Only
-- the results survive, in a temporary table that disappears when the editor
-- session ends.
--
-- The test:
--   1. adds a temporary client "Retention check client (test)" and six test
--      inquiries (is_test, company "Retention check (test)") with every
--      personal field filled in, dated as they will be a year from now; the
--      approved one is linked to that client;
--   2. runs the retention as a dry run, for real, and again (a retry);
--   3. compares every column of every test row with what was inserted, and
--      every column of every other inquiry with how it was before the runs;
--   4. rolls all of it back, then checks every column of every inquiry,
--      client, rate-limit row and run record is as before the test;
--   5. shows one row per check: every "result" should be PASS.

create temp table retention_result (label text, expected text, named_by_dry_run boolean, anonymised boolean,
  personal_fields_left int, other_columns_unchanged boolean, touched_by_retry boolean, result text);

do $$
declare
  -- What private.anonymise_inquiry() must clear (email_normalized is generated from email).
  v_personal text[] := array['contact_name', 'email', 'email_normalized', 'company', 'website', 'message', 'content_hash',
                             'budget_amount_eur', 'desired_date', 'privacy_notice_version', 'decision_reason'];
  v_studio uuid := (select studio_id from public.inquiries order by received_at desc limit 1);
  v_client uuid := gen_random_uuid();
  v_before text;
  v_after text;
  v_others_before text;
  v_others_after text;
  v_rows jsonb;
  v_dry jsonb;
  v_retry jsonb;
begin
  if v_studio is null then
    raise exception 'No inquiry yet, so there is no studio that receives inquiries to test in.';
  end if;

  -- A fingerprint of every column of every row the test could affect.
  v_before := concat_ws('|',
    (select md5(coalesce(string_agg(to_jsonb(i)::text, ',' order by i.id), '')) from public.inquiries i),
    (select md5(coalesce(string_agg(to_jsonb(c)::text, ',' order by c.id), '')) from public.clients c),
    (select md5(coalesce(string_agg(to_jsonb(r)::text, ',' order by r::text), '')) from public.inquiry_rate_limits r),
    (select md5(coalesce(string_agg(to_jsonb(r)::text, ',' order by r.id), '')) from private.inquiry_retention_runs r));

  begin
    create temp table retention_check (label text, status text, received interval, decided interval, expected text,
      id uuid default gen_random_uuid(), inserted jsonb);
    insert into retention_check (label, status, received, decided, expected) values
      ('Rejected 12 months + 1 day ago', 'rejected', '13 months', '12 months 1 day', 'anonymised'),
      ('Spam 12 months + 1 day ago', 'spam', '12 months 2 days', '12 months 1 day', 'anonymised'),
      ('Undecided, received 12 months + 1 day ago', 'new', '12 months 1 day', null, 'anonymised'),
      ('Rejected 1 day short of 12 months', 'rejected', '13 months', '12 months -1 day', 'unchanged'),
      ('Undecided, 1 day short of 12 months', 'new', '12 months -1 day', null, 'unchanged'),
      ('Approved 2 years ago (temporary test client)', 'approved', '2 years', '2 years', 'unchanged');

    v_others_before := (select md5(coalesce(string_agg(to_jsonb(i)::text, ',' order by i.id), '')) from public.inquiries i);

    insert into public.clients (id, studio_id, name, status, source_type)
      values (v_client, v_studio, 'Retention check client (test)', 'onboarding', 'contact_form');

    -- Every personal field filled in (the reason only where the status allows one).
    insert into public.inquiries (id, studio_id, source, submission_id, content_hash, status, is_test, locale,
      contact_name, email, company, website, service, project_type, budget_range, budget_amount_eur, timeline,
      desired_date, message, privacy_notice_version, submitted_at, received_at, decided_at, decided_by,
      client_id, created_client, decision_reason)
    select c.id, v_studio, 'axivo_website', gen_random_uuid(), repeat('0', 64), c.status, true, 'en',
      'Retention Check', 'retention-check-' || c.id || '@example.com', 'Retention check (test)',
      'retention-check.example', 'websites', 'website', 'custom', 5000, 'flexible',
      (now() - c.received)::date + 90, 'Test inquiry for the retention check. Not a real customer.', 'test-2026-10',
      now() - c.received, now() - c.received, now() - c.decided,
      case when c.status <> 'new' then '{"kind":"system"}'::jsonb end,
      case when c.status = 'approved' then v_client end, c.status = 'approved',
      case when c.status in ('rejected', 'spam') then 'Retention check (test)' end
    from retention_check c;

    update retention_check c set inserted = to_jsonb(i) from public.inquiries i where i.id = c.id;

    v_dry := private.run_inquiry_retention(true);
    perform private.run_inquiry_retention(false);
    v_retry := private.run_inquiry_retention(false);

    v_others_after := (select md5(coalesce(string_agg(to_jsonb(i)::text, ',' order by i.id), '')) from public.inquiries i
                         where i.id not in (select id from retention_check));

    select jsonb_agg(jsonb_build_object(
        'label', c.label, 'expected', c.expected,
        'named_by_dry_run', exists (select 1 from jsonb_array_elements(v_dry -> 'anonymised') e where (e ->> 'id')::uuid = c.id),
        'anonymised', i.anonymised_at is not null,
        'personal_fields_left', (select count(*) from jsonb_each(to_jsonb(i)) f where f.key = any (v_personal) and f.value <> 'null'),
        -- Anonymised rows: everything but the personal fields and anonymised_at is as inserted.
        -- Unchanged rows: every column is as inserted.
        'other_columns_unchanged', case when c.expected = 'anonymised'
                                        then (to_jsonb(i) - v_personal - 'anonymised_at') = (c.inserted - v_personal - 'anonymised_at')
                                        else to_jsonb(i) = c.inserted end,
        'touched_by_retry', exists (select 1 from jsonb_array_elements(v_retry -> 'anonymised') e where (e ->> 'id')::uuid = c.id))
        order by c.expected, c.label)
      || jsonb_build_array(
        jsonb_build_object('label', 'Every personal field was filled in on each test row', 'expected', 'all filled',
          'personal_fields_left', (select count(*) from retention_check c, unnest(v_personal) p
                                     where c.inserted -> p = 'null' and not (p = 'decision_reason' and c.status not in ('rejected', 'spam'))),
          'other_columns_unchanged', true),
        jsonb_build_object('label', 'Dry run names only these test inquiries', 'expected', 'nothing else',
          'personal_fields_left', (select count(*) from jsonb_array_elements(v_dry -> 'anonymised') e
                                     where (e ->> 'id')::uuid not in (select id from retention_check)),
          'other_columns_unchanged', true),
        jsonb_build_object('label', 'Retry anonymises nothing new', 'expected', 'nothing',
          'personal_fields_left', jsonb_array_length(v_retry -> 'anonymised'), 'other_columns_unchanged', true),
        jsonb_build_object('label', 'Every other inquiry unchanged by the runs (every column)', 'expected', 'identical',
          'personal_fields_left', 0, 'other_columns_unchanged', v_others_before = v_others_after))
      into v_rows
      from retention_check c join public.inquiries i on i.id = c.id;

    -- Undo everything above. Local variables keep their values.
    raise exception using errcode = 'RC001', message = 'roll back the test data';
  exception when sqlstate 'RC001' then
    null;
  end;

  v_after := concat_ws('|',
    (select md5(coalesce(string_agg(to_jsonb(i)::text, ',' order by i.id), '')) from public.inquiries i),
    (select md5(coalesce(string_agg(to_jsonb(c)::text, ',' order by c.id), '')) from public.clients c),
    (select md5(coalesce(string_agg(to_jsonb(r)::text, ',' order by r::text), '')) from public.inquiry_rate_limits r),
    (select md5(coalesce(string_agg(to_jsonb(r)::text, ',' order by r.id), '')) from private.inquiry_retention_runs r));

  insert into retention_result (label, expected, named_by_dry_run, anonymised, personal_fields_left, other_columns_unchanged, touched_by_retry)
  select r.label, r.expected, r.named_by_dry_run, r.anonymised, r.personal_fields_left, r.other_columns_unchanged, r.touched_by_retry
  from jsonb_to_recordset(v_rows) as r(label text, expected text, named_by_dry_run boolean, anonymised boolean,
                                       personal_fields_left int, other_columns_unchanged boolean, touched_by_retry boolean);

  insert into retention_result (label, expected, personal_fields_left, other_columns_unchanged)
  values ('Nothing left behind: inquiries, clients, rate limits, runs (every column)', 'identical', 0, v_after = v_before);
end $$;

-- Unchanged test rows keep all 11 personal fields (10 for the undecided and approved
-- ones, which have no rejection reason).
select label, expected, named_by_dry_run, anonymised, personal_fields_left, other_columns_unchanged, touched_by_retry,
  case when expected = 'anonymised' then
         case when named_by_dry_run and anonymised and personal_fields_left = 0 and other_columns_unchanged and not touched_by_retry
              then 'PASS' else 'FAIL' end
       when expected = 'unchanged' then
         case when not named_by_dry_run and not anonymised and personal_fields_left >= 10 and other_columns_unchanged and not touched_by_retry
              then 'PASS' else 'FAIL' end
       else case when personal_fields_left = 0 and other_columns_unchanged then 'PASS' else 'FAIL' end
  end as result
from retention_result;
