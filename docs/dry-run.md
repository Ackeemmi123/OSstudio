# Dry run: one test customer, inquiry to delivered project

A rehearsal of the whole client workflow ([workflow.md](workflow.md)) with a
fictional customer, on **staging**. It needs no deployment, no migration, no
setting change, no AI and no email. Every record it creates is marked as a
test. It takes about 45 minutes.

The same path runs automatically on the local stack in
`tests/e2e/dry-run.spec.ts`; if that test passes, the screens and outcomes
below are the ones the code produces.

## The test customer

| | |
| --- | --- |
| Company | **Dry Run Bakery (TEST)** |
| Contact | **Testi Testinen (TEST)**, `dryrun.bakery+<run>@example.com` (reserved domain, never delivered) |
| Website | `dryrun-bakery.example.com` |
| Inquiry | Service Websites, project type Website, budget €3,000–€5,000, within 3 months, desired date about 60 days out, language English |
| Message | "TEST INQUIRY, invented for a dry run. We are a small bakery and want a new website…" |
| Second inquiry | **Minimi Testaaja (TEST)**, every optional field left out, language Finnish |

Both are in `tests/fixtures/inquiries/`. Do not use a real person, company,
address or email anywhere in the dry run, including in notes.

## Extra care: what could reach real people, cost money or touch production

| Where | Risk | Rule for the dry run |
| --- | --- | --- |
| **Analyze client information**, **Suggest answers from sources** (onboarding), **Suggest changes from the brief** (new project form) | Staging has a real Anthropic key: each click is a paid API call and sends the text to Anthropic | **Do not click them.** AI is not part of this dry run. |
| **Open in email** / **Draft message** on a client | Opens your mail app with the client's address | You may open the draft; **never press Send**. The test addresses are `@example.com` (reserved, undeliverable), but a hand-typed address would be real. |
| Route B, the Axivo **preview** form | With Resend configured, it emails the Axivo inbox (a real notification, internal) and leaves the test details in Resend's logs | Only if you decide that is fine. **Never use the live axivo.fi form**: it is not connected to Studio OS and emails the real inbox. |
| Typing names or notes | Real personal data in staging | Only the invented names below; no real people, phone numbers or logins, also not your own clients. Owners of tasks may be studio members (internal). |
| `STAGING_APP_URL` | Pointing at the wrong deployment | Must be https://studio-os-staging-kappa.vercel.app. The script refuses axivo.fi. There is no production Studio OS to hit by mistake. |
| Rate limits | 5 stored inquiries per IP address per hour | The three fixture commands store two. Do not also run the full `staging:inquiry` check in the same hour. |
| Cleanup option 3 (anonymise) | Irreversible | Only with the owner's explicit go-ahead, staging only. |

Nothing in steps 1–11 changes production, sends an email from Studio OS (it
cannot send any), or deletes anything.

## Before you start (owner, 10 minutes)

1. **Where:** the staging app, https://studio-os-staging-kappa.vercel.app.
   Never the Axivo production site or a production Studio OS.
2. **Who:** sign in with an account that is an **owner or member of "Axivo
   (staging)"**, the studio that receives staging inquiries
   (`INQUIRY_STUDIO_ID`). The automated smoke-test accounts are not members of
   it and will not see the inquiries. To check: Settings says "Stored on
   the server for Axivo (staging)" and "(owner)" or "(member)" after your
   email; "viewer" can read but not decide. If you belong to several studios,
   use "Switch studio" there.
3. **Pick roles** for the rehearsal: one person as the *inquiry owner* (reviews
   inquiries daily) and one as the *backup*. One person can play both.
4. **Choose how the inquiry arrives** (step 1 below): A, B or C.
5. Note the start time. Every record you make today is identifiable by
   "(TEST)" in its name and by being created after this time.

## Step by step

Each step lists what to do and what you should see. If what you see differs,
note it and continue with the fallback in the step.

### 1. The inquiry arrives

**A. Signed test request (recommended).** The `--fixture` option is on the
branch `claude/project-thread-tlcewf` until it is merged. The script uses only
Node's built-in modules, so it runs from a second copy of the folder without
`npm install`, and your usual folder stays exactly as it is. In Terminal, one
line at a time:

```bash
cd ~/osstudio                      # your usual folder; adjust the path
git fetch origin claude/project-thread-tlcewf
git worktree add ../osstudio-dryrun origin/claude/project-thread-tlcewf
cp .env.inquiry.local ../osstudio-dryrun/
cd ../osstudio-dryrun
node scripts/staging-inquiry.mjs --fixture dry-run-customer
node scripts/staging-inquiry.mjs --fixture dry-run-minimal
node scripts/staging-inquiry.mjs --fixture empty-optional-strings
```

`git worktree add` makes a separate folder and does not touch your branch,
uncommitted changes or settings file. Afterwards: `cd ../osstudio` and
`git worktree remove ../osstudio-dryrun` (this also removes the copied
settings file). `STAGING_APP_URL` in `.env.inquiry.local` must be the staging
domain above.

Expected: `Reached Studio OS, and website inquiries are configured.`, then
`PASS  Test inquiry "dry-run-customer" is confirmed (202)` with a reference
`inq_…`, the same for `dry-run-minimal`, and `PASS  Optional fields sent as ""
are refused (400)` for the third (nothing is stored for it). Write down both
references.

**B. The Axivo preview form.** Only if the Axivo **Preview** deployment has the
three `STUDIO_OS_INQUIRY_*` variables (staging.md §8 step 10; not verified by
us). Fill in the form with the test customer's details above. Expected: the
success message. Preview submissions are marked as tests. If the preview also
has Resend configured, **this sends a notification email to the Axivo inbox**;
decide beforehand whether that is wanted.

**C. Manual fallback (no integration).** In the staging app: Clients → New
client → name "Dry Run Bakery (TEST)", website, project type Website, "Add the
inquiry or notes" → paste the message. This skips steps 2 and 3 (there is no
inquiry to review) and starts at step 4 with the client in onboarding.

### 2. The inquiry is waiting

Open **Today**.

Expected:
- Under "Needs your decision": **"New inquiry from Dry Run Bakery (TEST)"**,
  marked "Test inquiry", and one from Minimi Testaaja (TEST).
- **Clients** shows both under "New inquiries", each with a **Test** tag.
- Nothing is in "Follow up" yet (that happens after 2 working days).

If it is missing: check you are in the "Axivo (staging)" studio (Settings), and
reload. If still missing, the request did not arrive; use fallback C and
record the failure ([what to do](#if-the-website-or-the-script-reports-a-failure)).

### 3. Review and approve

Open the bakery inquiry.

Expected on the page: "From website inquiry · not reviewed", **Test**, the
message, budget "€3,000–€5,000" with "Indicative. Not a price", timing,
"Possible existing clients" (none on the first run), and "Nothing is sent to
the customer either way."

Do: keep the client name **with "(TEST)"** and click **Approve as a new
client**.

Expected: the client page for "Dry Run Bakery (TEST)", status **Onboarding**,
budget "€3,000–€5,000 (indicative)" and the timing on the brief as observed
(not confirmed), the message under Source material ("Website inquiry · <date>",
"Language: English"), and "Added Dry Run Bakery (TEST) from a website inquiry"
in Activity. The inquiry is gone from Today.

Then open the Minimi Testaaja (TEST) inquiry and approve it. Expected: the
client is named after the person (there was no company), the brief says
"Nothing recorded yet" (nothing was sent for budget or timing, so nothing is
guessed), and the source material says "Language: Finnish".

*Optional:* send `dry-run-customer` again (step 1 A) and choose **Add to an
existing client** → Dry Run Bakery (TEST): only the message is added; no
second client, no onboarding.

### 4. Reply and consultation (outside Studio OS, simulated)

Do not email anyone. Pretend the reply was sent and a call took place.

Do: Source material → **Add** → type **Meeting**, text: "TEST. Kickoff call
simulated. Wants menu, opening hours, cake order page. Copy by the client."

Expected: the note under Source material and in Activity. Never type a
password or login in a note.

### 5. Onboarding

Client page → **Continue onboarding**.

Do: go through the steps. On **Budget & timing**, click **Confirm** on the
budget (pretend the client confirmed it). Answer or skip the rest. Add one
open question, e.g. "Who writes the copy?". On **Review**, click **Mark ready**
(or "Mark ready, with gaps").

Expected: the budget shows as confirmed, the brief is "Ready for review", and
"What's next" now says **Start the first project for Dry Run Bakery (TEST)**.

### 6. Proposal and acceptance (outside Studio OS, simulated)

Do: Source material → **Add** → type **Document**: "TEST. Proposal v1 sent
<date>, accepted <date>. Signed copy: <where you would keep it>." Studio OS has
no proposal record; this note is the record.

### 7. First project and tasks

Do: click **Start the first project…**. Name "New website (TEST)". Keep the
type Website. Look at the ticked tasks; untick one you would not need. Keep
"Add a task to ask the client the open question" and "Mark Dry Run Bakery
(TEST) as an active client" ticked. Click **Create project with N tasks**.

Expected: the project with the playbook tasks (Kickoff call with the client,
Confirm scope…, Collect logins and access…, … Launch and handover) plus "Ask
the client the open question"; the client status is now **Active**.

### 8. Ownership and next steps

Do, on three tasks: **Assign or schedule** → owner (a studio member, or a
typed name) and a due date.
- "Kickoff call with the client": owner = inquiry owner, due in 2 days.
- "Collect content and brand material": owner = backup, due in 7 days.
- "Page designs": owner = inquiry owner, due in 14 days.

Expected: each row shows the owner and "Due <date>". **Today → Next up** lists
the client's next task.

### 9. Delivery

Do, in order:
1. Kickoff call → **Done**. Expected: "1 completed".
2. Collect content → **Blocked**, reason "TEST: waiting for photos from the
   client". Expected: the reason shows on the row; Today lists it under Next up
   as blocked first.
3. Collect content → **In progress** (unblocked).
4. Page designs → **Awaiting approval**. Expected: it appears on Today under
   "Needs your decision". Click **Approve** (pretend the client approved by
   email). Expected: "Approved Page designs" in Activity.
5. Project **Stage** → Design, then Development, then Review.

### 10. Sign-off, launch, close

Do: "Review with the client" → Awaiting approval → **Approve**. Stage →
**Launch**. "Launch and handover" → Done. Project status → **Completed**.

Expected: after a reload the project shows Completed and Launch; Activity
lists every step in your name. Completed projects no longer appear in "In
progress" or Follow up.

Optional: client → Edit details → Status **Archived**. Expected: the client is
tucked away under archived clients, and its Data retention date is 3 years
out (it was a customer). This is reversible: set the status back.

### 11. Check the warnings (optional, read-only)

Open Today and the client page. Expected: no follow-ups for the completed
project. Follow-ups are computed on page load; set a task's due date to
yesterday to see "Overdue" appear, then change it back.

## Expected end state

| Record | State |
| --- | --- |
| Inquiry, bakery | approved, `is_test`, linked to the client |
| Inquiry, minimal | approved, `is_test` |
| Inquiry, empty strings | never stored (400) |
| Client "Dry Run Bakery (TEST)" | Active (or Archived), budget confirmed, 2–3 notes |
| Client "Minimi Testaaja (TEST)" | Onboarding, empty brief |
| Project "New website (TEST)" | Completed, stage Launch, about 14 tasks |

## If the website or the script reports a failure

| What you see | Meaning | Do |
| --- | --- | --- |
| Script: "Could not reach…" | Network or wrong URL | Check `STAGING_APP_URL`; use fallback C |
| Script: "Vercel Deployment Protection blocked…" | Wrong address | Use the staging domain above |
| Script: "not configured" / form: "Online enquiries aren't connected yet" | `INQUIRY_*` missing on that deployment | Fallback C; owner checks Vercel settings later |
| Script: `401` from Studio OS | Wrong signing secret or clock off | Re-copy `INQUIRY_SIGNING_KEYS`; fallback C |
| Script: `429` / form: "Too many messages…" | Rate limit (5 per hour per IP, 3 per day per email) | Wait an hour, or fallback C |
| Script: `500` / form: "Something went wrong and your message was not sent" | Studio OS could not store it | Fallback C. Note the time; the owner checks the Vercel logs (`[inquiries]`) |

**With the website configured for Studio OS, a failed handoff sends no email
and nothing alerts the studio.** The only traces are the visitor's error
message and the server logs (`[contact] Studio OS responded <status>` /
`timed out` / `unreachable` in the Axivo project; `[inquiries] …` in Studio
OS). In the dry run, treat any failure as a real one: write down what the
visitor would have seen, then enter the inquiry by hand (fallback C) as
described in [operations.md](operations.md#inquiry-delivery-failures).

## How test data is told apart

- **Inquiries**: `is_test` is set by the script and by Axivo non-production
  deployments, and the app shows a **Test** tag.
- **Clients, projects, tasks: there is no test flag.** A client approved from
  a test inquiry is an ordinary client. The marker is the name: keep
  **"(TEST)"** in every client and project name and start every note with
  "TEST". Emails are `@example.com`.
- Read-only check afterwards (Supabase SQL editor, staging):

  ```sql
  select id, name, status, created_at from clients
  where name like '%(TEST)%' order by created_at desc;
  select id, status, is_test, contact_name, received_at from inquiries
  where is_test order by received_at desc limit 20;
  ```

## Cleaning up afterwards

Nothing in the app deletes data, by design. **Do not delete or anonymise
anything without the owner's explicit go-ahead.** In order of preference:

1. **Leave it on staging.** Staging holds only test data. Archive the test
   clients (Edit details → Archived) so they are out of the way. Reversible.
2. **Let retention handle it.** Minimi Testaaja (never Active) is anonymised
   12 months after its last activity; the bakery (Active once) 3 years after
   it was archived. Test inquiries that were not approved, 12 months after the
   decision.
3. **Anonymise now (irreversible, staging only, owner approval required).** In
   the staging SQL editor, per client:
   `select private.anonymise_client('<client id>', true);` (this also
   anonymises the inquiries approved into it). For an inquiry that was
   rejected or marked spam: `select private.anonymise_inquiry('<inquiry id>', true);`.
   Check the ids with the read-only queries above first. The rows stay, emptied
   ([retention.md](retention.md#what-anonymising-does)).
