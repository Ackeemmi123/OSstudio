# The client workflow, as built

How an Axivo engagement moves from a website inquiry to a finished project,
using only what Studio OS does today (main at 29 Oct 2026). Each step says
what happens **in Studio OS**, what happens **outside it**, and what is **not
built**. The manual procedures around these steps are in
[operations.md](operations.md); a rehearsal of the whole path is in
[dry-run.md](dry-run.md).

## At a glance

| # | Step | Where | Client status | Recorded as |
| - | ---- | ----- | ------------- | ----------- |
| 1 | Inquiry arrives | Axivo website → Studio OS `POST /api/inquiries` | (no client yet) | `inquiries` row, status `new` |
| 2 | Review: approve, add to a client, reject, spam | Studio OS, `/inquiries/<id>` | Onboarding (approve) | `decide_inquiry()`: client, brief values, source, draft onboarding |
| 3 | First reply and consultation | **Outside**: email, phone, video call | Onboarding | By hand: source material (Meeting, Phone call, Email) |
| 4 | Onboarding (the brief) | Studio OS, `/clients/<id>/onboarding` | Onboarding | Brief values with confidence and history |
| 5 | Proposal and acceptance | **Outside**: document, email, signature | Onboarding | By hand: source material (Document) and a confirmed brief |
| 6 | First project and its tasks | Studio OS, client page → "Start the first project" | Active (ticked by default) | Project, playbook tasks, activity |
| 7 | Delivery | Studio OS tasks; the work itself outside | Active | Task status, owner, due date, blocked reason, approvals |
| 8 | Sign-off and launch | Studio OS approval; sign-off itself outside | Active | Task "Review with the client" approved, stage Launch |
| 9 | Close | Studio OS | Active, later Archived | Project status Completed; client Archived when the relationship ends |
| 10 | Invoice, contract, payment | **Outside**: accounting tool | – | Not in Studio OS |
| 11 | Retention | Studio OS database, daily jobs | – | Anonymised after the retention period ([retention.md](retention.md)) |

## 1. Inquiry arrives

The Axivo website's server validates the form, signs the request and sends it
to Studio OS ([inquiries.md](inquiries.md)). Studio OS answers `202` only
after the inquiry is stored. Empty optional fields are left out of the request
(sending `""` is refused with `400`); with nothing optional filled in, the
inquiry still arrives with the name, email, service, language and message.

- **The website and Studio OS are not connected in production.** On staging,
  inquiries come from `npm run staging:inquiry` (signed, marked as tests) and,
  once its Preview variables are set, from an Axivo preview deployment.
- When Studio OS is configured on the website and does not answer `202`, the
  visitor sees "not sent" and **no notification email is sent**. Nothing
  alerts the studio. See [Inquiry delivery failures](operations.md#inquiry-delivery-failures).
- An inquiry from the website's non-production deployments is marked as a test
  (`test: !production` on the website).

## 2. Review

New inquiries are listed on **Today** under "Needs your decision" and on
**Clients** under "New inquiries". After 2 working days without a decision,
one moves to **Follow up**. Owners and members decide; viewers read.

- **Approve as new client**: the client gets the company name (or the
  person's name when no company was given; the reviewer can change it),
  status **Onboarding**, the contact person, email and website, the project
  type, budget and timing as **observed** brief values, the message as source
  material, and a **draft** onboarding. "Not sure" about budget becomes the open
  question "Discuss budget with the customer". Nothing is guessed from the
  message.
- **Add to an existing client**: the message as source material; contact
  details and brief values only where the client has none.
- **Reject** (internal reason) or **Mark as spam**: only the inquiry changes.
- **Nothing is sent to the customer.** The reply is written and sent from the
  studio's own email.

## 3. First reply and consultation

**Not built:** there is no consultation, meeting or proposal record and no
"won/lost" state. Do this outside Studio OS and record it by hand:

- Reply from the studio mailbox. Studio OS can draft a check-in for a client
  whose brief is unfinished ("Draft message" on the client page); it never
  sends it.
- After a call, add the notes as source material (type **Meeting** or
  **Phone call**). Never paste passwords or access credentials.
- If the inquiry goes nowhere, archive the client (client page → Edit
  details → Status Archived). A client that never reached **Active** is
  anonymised 12 months after the last activity.

## 4. Onboarding (the brief)

Six steps: Business, Current setup, Goals, Scope, Budget & timing, Review
([onboarding.md](onboarding.md)). Values from the inquiry show as "verify";
**Confirm** marks a value as confirmed by the client. Every question can be
skipped, and a brief with gaps can still be marked **ready for review**.
Open questions are listed on the brief.

A person can run the intake agent ("Analyze client information") on the
source material. It is **person-started only**, sends the text to Anthropic,
and its proposals change nothing until accepted. On real client data it stays
off until the conditions in [production.md](production.md#ai-on-real-client-data)
are met.

## 5. Proposal and acceptance

**Not built:** no proposal, quote, price or signed-agreement record, and no
money fields anywhere. Write and send the proposal outside Studio OS. Record
in Studio OS:

- the agreed scope, budget and deadline as **confirmed** brief values;
- the proposal or agreement as source material (type **Document**): a short
  summary and where the signed copy is kept, not the file itself (file uploads
  are not built).

## 6. First project and its tasks

When the brief is ready, the client's "What's next" offers **Start the first
project**. The form proposes the playbook tasks for the project type
(`src/lib/domain/playbooks.ts`); for a website: kickoff call, scope in
writing, collect access and content, sitemap, design direction, page designs,
build, copy and images, forms/analytics/SEO, review with the client, launch
checklist, launch and handover. Untick what does not apply. Open questions can
become one task. "Mark the client active" is ticked for the first project.

A person may instead use "Suggest changes from the brief" (AI, person-started;
same conditions as the intake agent).

## 7. Delivery

Per task: status (To do, In progress, Blocked with a reason, In review,
Awaiting approval, Done), an **owner** (a studio member or a typed name) and a
**due date**. Per project: stage (Intake → Discovery → Strategy → Design →
Development → Review → Launch) and status (Planned, Active, On hold,
Completed).

Today shows: decisions (approvals, reviews), "Next up" per client, and
**Follow up** for work that waited too long (task awaiting approval or in
review 2 working days, blocked 3 days, overdue 1 day, onboarding untouched 5
days, brief ready without a project 3 days, active project quiet 10 days;
[follow-ups.md](follow-ups.md)). These are computed when someone opens the
app: **nothing notifies anyone**, so someone has to open Today every working
day.

Only a person can approve work or confirm a value.

## 8. Sign-off and launch

Set "Review with the client" to **Awaiting approval**; a person clicks
**Approve** after the client's sign-off (which arrives outside, by email or
call). Record the sign-off email's date and sender as source material if it
matters later. Move the stage to **Launch**.

## 9. Close

Set the project status to **Completed**. Completed projects produce no
follow-ups. When the relationship ends, archive the client: a former customer
(one that reached Active) is anonymised 3 years after archiving
([retention.md](retention.md)).

## 10. Outside Studio OS entirely

Invoices, payments, contracts and signatures, file storage, the email
conversation, calendar, hosting and domain accounts, and passwords (keep them
in the password manager; never in notes, source material or tasks).

## What changes a client's status

| Status | Set by |
| ------ | ------ |
| Lead | "New client" without onboarding answers (manual entry) |
| Onboarding | Approving an inquiry; starting onboarding |
| Active | Starting the first project (ticked by default), or Edit details |
| On hold | Edit details. **Hides all of the client's follow-ups.** |
| Archived | Edit details. Starts the former-customer clock if the client was ever Active |
