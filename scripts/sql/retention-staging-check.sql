-- Studio OS: retention check on staging. TEST DATA ONLY.
--
-- Run in the Supabase SQL editor of the staging project, as one script, only
-- after a dry run (`select private.run_inquiry_retention(true);`) listed no
-- inquiries. It:
--   1. adds six test inquiries to the studio that receives website inquiries,
--      dated as they will be a year from now (all marked is_test, company
--      "Retention check (test)");
--   2. runs the retention as a dry run, for real, and again (a retry);
--   3. records what happened to each, then erases the leftover test rows so
--      none shows up for review (the approved one is linked to a client and
--      is kept, as approved inquiries always are);
--   4. shows one row per check: every "result" should be PASS.

create temp table retention_check (label text, status text, received interval, decided interval, expected text, id uuid default gen_random_uuid());
insert into retention_check (label, status, received, decided, expected) values
  ('Rejected 12 months + 1 day ago', 'rejected', '13 months', '12 months 1 day', 'anonymised'),
  ('Spam 12 months + 1 day ago', 'spam', '12 months 2 days', '12 months 1 day', 'anonymised'),
  ('Undecided, received 12 months + 1 day ago', 'new', '12 months 1 day', null, 'anonymised'),
  ('Rejected 1 day short of 12 months', 'rejected', '13 months', '12 months -1 day', 'unchanged'),
  ('Undecided, 1 day short of 12 months', 'new', '12 months -1 day', null, 'unchanged'),
  ('Approved 2 years ago', 'approved', '2 years', '2 years', 'unchanged');

-- The studio that receives website inquiries, and any client of it for the approved row.
create temp table retention_target as
  select i.studio_id, (select c.id from public.clients c where c.studio_id = i.studio_id order by c.created_at limit 1) as client_id
  from public.inquiries i order by i.received_at desc limit 1;

insert into public.inquiries (id, studio_id, source, submission_id, content_hash, status, is_test, locale, contact_name, email,
  company, service, message, submitted_at, received_at, decided_at, decided_by, client_id, created_client)
select c.id, t.studio_id, 'axivo_website', gen_random_uuid(), repeat('0', 64), c.status, true, 'en', 'Retention Check',
  'retention-check-' || c.id || '@example.com', 'Retention check (test)', 'other',
  'Test inquiry for the retention check. Not a real customer.', now() - c.received, now() - c.received,
  now() - c.decided, case when c.status <> 'new' then '{"kind":"system"}'::jsonb end,
  case when c.status = 'approved' then t.client_id end, c.status = 'approved'
from retention_check c cross join retention_target t
where c.status <> 'approved' or t.client_id is not null;

create temp table retention_dry as select private.run_inquiry_retention(true) as report;
create temp table retention_run as select private.run_inquiry_retention(false) as report;
create temp table retention_retry as select private.run_inquiry_retention(false) as report;

create temp table retention_result as
select c.label, c.expected,
  exists (select 1 from jsonb_array_elements((select report -> 'anonymised' from retention_dry)) e where (e ->> 'id')::uuid = c.id) as named_by_dry_run,
  i.anonymised_at is not null as anonymised,
  num_nonnulls(i.contact_name, i.email, i.company, i.message) as personal_fields_left,
  exists (select 1 from jsonb_array_elements((select report -> 'anonymised' from retention_retry)) e where (e ->> 'id')::uuid = c.id) as touched_by_retry
from retention_check c join public.inquiries i on i.id = c.id;

-- Without a client in the studio there is no approved test row; say so instead of leaving it out.
insert into retention_result (label, expected)
select c.label, 'unchanged (no client in this studio to approve into, so not tested)'
from retention_check c where not exists (select 1 from public.inquiries i where i.id = c.id);

-- Clean up: erase the test rows that were (correctly) left alone, so none waits for review.
select private.anonymise_inquiry(c.id, true)
from retention_check c join public.inquiries i on i.id = c.id
where i.anonymised_at is null and i.status <> 'approved';

select label, expected, named_by_dry_run, anonymised, personal_fields_left, touched_by_retry,
  case when anonymised is null then 'SKIPPED'
       when named_by_dry_run = (expected = 'anonymised') and anonymised = (expected = 'anonymised')
         and personal_fields_left = case when expected = 'anonymised' then 0 else 4 end and not touched_by_retry
       then 'PASS' else 'FAIL' end as result
from retention_result
union all
select 'Dry run names only these test inquiries', 'nothing else', null, null,
  (select count(*)::int from jsonb_array_elements((select report -> 'anonymised' from retention_dry)) e
    where (e ->> 'id')::uuid not in (select id from retention_check)), null,
  case when (select count(*) from jsonb_array_elements((select report -> 'anonymised' from retention_dry)) e
              where (e ->> 'id')::uuid not in (select id from retention_check)) = 0 then 'PASS' else 'FAIL' end
union all
select 'Retry anonymises nothing new', 'nothing', null, null,
  (select jsonb_array_length(report -> 'anonymised') from retention_retry), null,
  case when (select jsonb_array_length(report -> 'anonymised') from retention_retry) = 0 then 'PASS' else 'FAIL' end;
