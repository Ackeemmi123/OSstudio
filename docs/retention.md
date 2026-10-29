# Client retention

How long Studio OS keeps a client's records, what happens afterwards, and what
it cannot clean up by itself. Inquiries that never became clients have their
own rule ([inquiries.md](inquiries.md#retention)).

The periods are the working decisions of 28 Oct 2026. The 3 years for former
customers stay provisional until an adviser has reviewed them, and none of
this goes into the privacy policy before that review.

## The rule

| Client | Kept until | Then |
| --- | --- | --- |
| Never a customer (never reached **Active**) | 12 months after the last client activity | Anonymised |
| Former customer (reached **Active** at least once) | 3 years after the relationship ended: when it was archived, or 12 months after the last client activity, whichever comes first | Anonymised |
| On a retention hold | Until an owner releases the hold | The rule above, with at least 30 days' notice after the release |

**Client activity** is a change a signed-in person made to the client, its
projects or its tasks, as recorded in the activity log (actor kind `human`):
editing details, status or brief values, adding source material or notes,
onboarding answers, projects and tasks, accepting or dismissing proposals,
approving or adding an inquiry to the client. These never count: opening or
reading anything, agent runs and their proposals, anything the system or a
scheduled job does (including the retention jobs), and placing or releasing a
hold. Each event counts at the earlier of when it happened and when the
database stored it, so neither a device clock nor an import can push the date
forward. With no activity at all, the client's creation counts. In the app this is
`lastClientActivity()` in `src/lib/domain/client-activity.ts`, the one
definition follow-ups also use; the database's `private.client_last_activity()`
decides retention, and a database test checks the two agree.

The database sets three dates itself and ignores anything the app or the API
sends for them: `became_customer_at` (the first time the status became
Active), `archived_at` (set when archived, cleared when reopened) and
`anonymised_at`.

## What anonymising does

`supabase/migrations/20261029000200_client_retention.sql`,
`private.anonymise_client(id, force)`:

| Record | After anonymising |
| --- | --- |
| Client | Name "Former client", contact person, email, website and first-contact notes cleared, status Archived. Project type, source type and dates kept. |
| Brief values and their history, assumptions and questions | Deleted |
| Source material (inquiry messages, notes, pasted text) | Deleted |
| Onboarding progress | Deleted (the answers are brief values) |
| Inquiries approved into the client, and repeats merged into them | Anonymised like unconverted inquiries, marked `anonymised_with_client` |
| Agent proposals (they quote the sources) | Deleted |
| Agent runs | Trigger, inputs, outputs, result, blocker and error emptied; agent, status and timing kept |
| Projects and tasks | Titles replaced ("Former project", "Task"), blocked reasons cleared; status, stage and dates kept |
| Activity | Every summary replaced with "Details removed when the client was anonymised."; type, time and the team member kept |
| Hold log | Reasons cleared; who held or released it, and when, kept |

After that the client is gone from the app, and the database refuses anything
new about it: no edits, sources, projects, tasks, activity, agent runs, holds,
or inquiries added to it.

## How it runs

- `private.run_client_retention(dry_run boolean default false)` finds every
  client past its date and anonymises it, or with `true` only lists them. It
  returns `{"dryRun", "anonymised": [{"id", "studioId", "customer",
  "lastActivity", "retentionEnded"}]}`. Every run, dry runs included, is
  recorded in `private.client_retention_runs` (ids only).
- Only the database owner can run either function; `anon`, `authenticated`
  and `service_role` cannot, and the `private` schema is not exposed by the
  API.
- pg_cron job `client-retention`, daily at 03:27 UTC, ten minutes after the
  inquiry retention. Applying the migration to a project schedules it there.
- Safe to retry: an advisory lock keeps two runs apart, and each client is
  locked and checked again before it is anonymised, so activity or a hold a
  moment earlier wins.
- The app shows each client's date under **Data retention** on the client
  page, and lists clients 30 days before their date on Today, under "Needs
  your decision", so the team can archive, hold or let it run.

## Holds

An owner places a hold on the client page with a reason (an open dispute, a
legal requirement), through `public.set_client_retention_hold()`. Members and
viewers cannot. Every hold and release is logged in
`public.client_retention_holds`, which members can read and nobody can write
or change directly. A held client is never anonymised, even on request, until
the hold is released.

## Erasure on request

1. Check the client page: if it is on hold, decide with the owner whether the
   reason still applies, and release it.
2. In the Supabase SQL editor: `select private.anonymise_client('<client id>', true);`
3. Do the manual steps below for this client.

## What Studio OS cannot anonymise or delete by itself

| Where | Why not automatically | What to do |
| --- | --- | --- |
| Supabase backups | Backups cannot be edited. Daily backups roll off after 7 days on the Pro plan; point-in-time recovery, if ever turned on, keeps longer. | Nothing; state the window in the privacy policy. A restore must be followed by a retention run. |
| Axivo inbox notification emails (sent through Resend) | They live in the mailbox, outside Studio OS. | Keep at most 12 months, then delete, unless a specific legal need applies. Use the mail provider's retention policy if it has one, otherwise delete by hand monthly. |
| Resend's delivery logs | Kept by Resend for the period of its plan. | Check the plan's log retention once; nothing to do per client. |
| Anthropic API | Source material sent for analysis is kept by Anthropic under its API data retention policy. | Check the current period in Anthropic's commercial terms; list it in the privacy policy. |
| Vercel logs | Kept by Vercel for the plan's log period. The app does not log inquiry or client contents. | Nothing per client. |
| Text about this client in another client's records | The anonymiser follows ownership (this client's rows), not text. A note like "referred by …" in another client stays. | On an erasure request, search the database (SQL editor) for the name and email, and edit those mentions by hand. |
| Inquiries from the same person that did not become this client | They belong to no client. | They follow the inquiry rule (12 months). |
| Copies outside Studio OS | Staff email, exports, screenshots, the local demo in a browser. | Covered by staff practice, not by the app. |
| What the minimal record keeps | Dates, status, project type, source type, project stages, task statuses and due dates, event types and times, and team members' names stay so counts and history add up. None identifies the client alone, but combined with outside knowledge (the only e-commerce client that started in a given month) they could. | Accepted as the minimal record; for the adviser to confirm. |

## Not done yet

- The proposal's 12-month limit on agent run logs: runs are emptied when
  their client is anonymised, but old runs of current clients are not deleted.
- The privacy policy text, after the adviser's review.

Tests: `tests/db/client-retention.test.ts` (database),
`src/lib/domain/retention.test.ts` (warnings and holds),
`tests/e2e/retention.spec.ts` (client page, Today, holds). On staging,
`scripts/sql/client-retention-staging-check.sql` (see [staging.md](staging.md) §8).
