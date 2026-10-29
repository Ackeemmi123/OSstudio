# Operating procedures

The manual routine that runs Studio OS for real clients, with what happens
**in Studio OS** and what happens **outside it**. The workflow these
procedures support is in [workflow.md](workflow.md). Production setup and the
go-live gate are in [production.md](production.md).

Studio OS sends nothing and notifies no one. Everything below that says
"check" is a person opening the app.

## Roles

| Role | Who (fill in) | Covers |
| ---- | ------------- | ------ |
| Inquiry owner | | Daily inquiry check, first reply within 1 working day |
| Backup | | The same, when the owner is away more than 1 working day |
| Studio owner (Studio OS role *owner*) | | Accounts, retention holds, erasure and access requests, the go-live gate |
| Technical contact | | Vercel and Supabase dashboards, logs, restore |

At least two people must be able to sign in as owners, and at least two must
have dashboard access, so that one person's absence never blocks a restore, a
locked-out account or an erasure request
([production.md](production.md#founder-unavailability)).

## Every working day (10 minutes, inquiry owner)

1. Open **Today**.
2. **Needs your decision → New inquiry**: open each one and decide (see
   below). Aim to decide the same day; after 2 working days it moves to
   **Follow up**.
3. **Follow up**: act on each item or leave a note why it waits.
4. Open the **Axivo inbox**: compare the notification emails ("Studio OS:
   recorded (inq_…)") with the inquiries in Studio OS. An email without a
   Studio OS inquiry, or an inquiry without an email, is worth a look but not
   an incident (the email is sent after the inquiry is stored, and can fail on
   its own).
5. Once a week: the Axivo project's Vercel logs, search `[contact]` for
   `Studio OS responded`, `timed out` or `unreachable`
   ([Inquiry delivery failures](#inquiry-delivery-failures)).

## Deciding an inquiry

| Situation | In Studio OS | Outside |
| --------- | ------------ | ------- |
| A real prospect, new | **Approve as a new client** (fix the name if needed) | Reply from the studio mailbox within 1 working day |
| From an existing client | **Add to an existing client** | Reply |
| Not a fit | **Reject** with an internal reason (never shown to the customer) | Optionally a polite reply |
| Spam | **Mark as spam** | Nothing |
| A repeat ("Sent 2 times") | Decide the first; repeats follow it | One reply |

Budget never decides; it is indicative. Never copy the inquiry into tasks.

## Qualifying and consultation

Outside: email or call the customer. In Studio OS: add the call or meeting
notes as **source material** (type Meeting or Phone call). Optionally run the
intake agent on the client's source material (test data only until the AI
conditions are met, [production.md](production.md#ai-on-real-client-data)).
If the prospect drops out, set the client to **Archived**.

## Proposal, acceptance and status

Studio OS has no proposal, price or contract record.

- Write, send and sign the proposal outside (document tool, email, e-signature).
  Keep the signed copy in the studio's document storage.
- In Studio OS: add a **Document** source with a one-line summary, dates and
  where the signed copy is kept. Confirm the agreed scope, budget and deadline
  on the brief.
- On acceptance: **Start the first project** (marks the client Active).

## Onboarding and project setup

1. Client page → **Continue onboarding**; confirm what the client confirmed;
   skip what is unknown; add open questions; **Mark ready**.
2. **Start the first project**; untick playbook tasks that do not apply; keep
   the open-questions task.
3. Give the first tasks an **owner** and a **due date**. Unowned tasks show as
   "Unassigned" in follow-ups.

## Delivery, decisions and approvals

- Keep task statuses current; a **Blocked** task needs a reason.
- Work the client must approve: set **Awaiting approval**; when the client
  approves (by email or in a meeting), a person clicks **Approve**. Record
  where the approval came from in a note if it matters later.
- Move the project **stage** as the work moves.
- **On hold** silences every follow-up for that client. Use it only with a
  date to look again, kept in your calendar.

## Sign-off and closure

Approve "Review with the client" after the client's written sign-off. Stage
**Launch**, "Launch and handover" **Done**, project **Completed**. Archive the
client when the relationship ends (starts the 3-year retention clock).

## Invoices and money

Outside Studio OS entirely: invoices, payments, reminders and bookkeeping.
Studio OS has no money fields; do not put prices or bank details in notes.

## Support after launch (optional)

A new piece of work is a new project on the same client. Small support
requests can be tasks on a "Support (year)" project.

## Credentials and sensitive data

- Never put passwords, API keys, logins or access codes in Studio OS (notes,
  source material, tasks, brief). Use the password manager; a task may say
  "Collect logins (in password manager)".
- Avoid health, financial or other sensitive personal details in notes.
- If a credential was pasted by mistake: edit it out (the brief keeps history,
  so ask the technical contact to remove it from the database), and rotate the
  credential.

## Data requests (access, correction, erasure)

Answer within one month. Check the requester's identity by replying to the
email address on record.

| Request | Studio OS | Outside |
| ------- | --------- | ------- |
| Access (what do you hold) | Open the client: details, brief, source material, projects. Copy into a reply. There is no export button. | Mailbox, documents, accounting |
| Correction | Edit the details or brief value (history is kept) | Same in other tools |
| Erasure | Owner: check for a retention hold, then in the Supabase SQL editor `select private.anonymise_client('<id>', true);` for a client, or `select private.anonymise_inquiry('<id>', true);` for an inquiry that never became a client. Then search for the name and email in other clients' notes ([retention.md](retention.md#what-studio-os-cannot-anonymise-or-delete-by-itself)). Irreversible. | Delete the inbox emails, documents; accounting records follow their legal retention |

Keep a short log of each request (date, type, what was done), outside Studio
OS and without the personal data itself.

## Inquiry delivery failures

**How it fails today.** When the website is configured to forward to Studio OS
and Studio OS does not answer `202` (down, misconfigured, timed out after one
retry), the visitor sees "Something went wrong and your message was not sent.
Please try again in a moment." **No notification email is sent, and nothing
alerts the studio.** The inquiry exists only if the visitor retries
successfully. A `429` tells the visitor to wait a few minutes.

**How to notice.**
- A visitor tells you (by email or phone) that the form failed.
- The Axivo project's Vercel logs: `[contact] Studio OS responded <status>`,
  `[contact] Studio OS timed out`, `[contact] Studio OS unreachable`. Studio OS's
  own logs: `[inquiries] Refused: …` (signature, contract) and `500` answers.
- A gap in the daily comparison of inbox and Studio OS (step 4 above) does
  **not** show these failures, because no email is sent.

**What to do.**
1. If the visitor reached you another way: create the client by hand (Clients
   → New client, source type Contact form, paste their message) and reply.
2. Check the Studio OS deployment: `npm run staging:inquiry` style unsigned
   check (`curl -X POST <url>/api/inquiries -d '{}'` should answer `401
   unauthorized`); `503 not_configured` means the variables are missing.
3. Check Vercel and Supabase status pages; check that the Supabase project is
   not paused.
4. Until fixed, the owner may decide to remove the three `STUDIO_OS_INQUIRY_*`
   variables from the Axivo project: the site then goes back to email-only
   delivery. This is a production change and needs the owner's approval.
5. Write down what happened (time, cause, how many visitors may have been
   affected).

A proposed improvement (an email fallback with a "not recorded in Studio OS"
warning, so no inquiry is lost silently) is described in
[production.md](production.md#inquiry-handoff-failure-fallback). It is not
built or deployed.
