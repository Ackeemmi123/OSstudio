# Website inquiries

The Axivo website's contact form forwards each inquiry, server to server, to
Studio OS. Studio OS verifies it, stores it once, and answers `202` only when
it is safely stored. This is the first slice of the plan
(https://claude.ai/artifact/KGWxAuoZXSfC8sy6zoS9Uu) and follows the handoff
contract v1, revision 3 (https://claude.ai/artifact/SS53XHpDBTYpWeWngFaK6M).

**Built:** the signed endpoint, storage, duplicate and conflict handling, rate
limits, and the review screen: staff approve an inquiry as a new client (with
a draft onboarding), add it to an existing client, reject it or mark it as
spam (see [Reviewing an inquiry](#reviewing-an-inquiry)).
**Not built yet:** grouping repeat submissions from one address (the `merged`
status), the retention job, and AI suggestions run from the inquiry page
(the intake agent can be run from the new client's workspace). Until the
retention job exists and is tested, **only test inquiries may be sent to
Studio OS.**

## How a request is handled

`POST /api/inquiries` (`src/app/api/inquiries/route.ts`,
`src/server/inquiries/receive.ts`):

1. **Configured?** Without `INQUIRY_SIGNING_KEYS`, `INQUIRY_STUDIO_ID`,
   `INQUIRY_HASH_KEY` and the service role key: `503 not_configured`.
2. **Size.** Over 16 KB: `413 too_large`.
3. **Signature.** HMAC-SHA256 over `"<Studio-Timestamp>.<raw body>"` with the
   secret for `Studio-Key-Id`; header `Studio-Signature: v1=<hex>`. More than
   5 minutes off, unknown key id, wrong or missing signature: `401
   unauthorized`. Compared in constant time. Checked before the body is parsed.
4. **Contract.** Strict schema (`src/lib/inquiries/contract.ts`): unknown keys,
   ids outside the contract, an amount without `budget: "custom"` (or the
   reverse), a desired date outside the window, a `submittedAt` more than a day
   off: `400 invalid` with field names only. `Idempotency-Key`, when sent,
   must equal `submissionId`.
5. **Store.** One call to `receive_inquiry()` (one transaction, see below).

| Database answer | Response |
| --------------- | -------- |
| stored now | `202 {"status":"received","reference":"inq_…","duplicate":false}` |
| this submission id is already stored with the same customer answers | `202 {"status":"received","reference":"<original>","duplicate":true}` |
| this submission id is already stored with different customer answers | `409 {"error":"conflict"}`; nothing changes |
| rate limited | `429 {"error":"rate_limited"}` with `Retry-After` |
| studio in `INQUIRY_STUDIO_ID` does not exist | `503 {"error":"not_configured"}` |
| any database or network error | `500 {"error":"failed"}`, never `202` |

Responses never contain submitted data. Logs name the status and reason only.
There are no CORS headers: browsers cannot use the endpoint.

## Duplicates and retries

- A submission is identified by `submissionId` alone, never by `submittedAt`.
- The content hash is SHA-256 over the **customer-entered fields only**:
  `contact.name`, `contact.email`, `contact.company`, `contact.website`,
  `locale`, `service`, `projectType`, `budget`, `budgetAmount`, `timeline`,
  `desiredDate`, `message`. Values after validation and trimming, absent keys
  left out, keys sorted. `submittedAt`, `meta.ip`, `test`, the envelope
  (`version`, `source`, `submissionId`, `privacyNoticeVersion`) and the
  headers are not part of it, so a retry always matches.
- `receive_inquiry()` takes a per-studio transaction lock, looks the
  submission id up, applies the rate limits, then inserts. Concurrent retries
  of one submission therefore store one row and all get `202` with the same
  reference; a retry is never refused as rate limited. A unique index on
  `(studio_id, source, submission_id)` backs this up.
- `202` is sent only after that function has returned, so the row is
  committed (or was already there).

## Rate limits

Counted in the database, so they hold across server instances:

- 5 per IP address per hour. Only a keyed hash (`INQUIRY_HASH_KEY`) of the
  address is kept, in `inquiry_rate_limits`, not linked to the inquiry. The
  address itself is never stored.
- 3 per email address per day.
- 200 per studio per day.

The budget never affects whether an inquiry is accepted.

## Reviewing an inquiry

New inquiries appear on **Today** under "Needs your decision" and at the top of
**Clients** under "New inquiries", newest first. Nothing sorts, filters or
decides by budget. Each opens `/inquiries/<id>`, which shows what the customer
sent, marked "From website inquiry · not reviewed", possible existing clients
(same email, website domain, company name or contact person) and other
inquiries from the same address (with a "Previously rejected" flag). Owners
and members decide; viewers only read. Nothing is ever sent to the customer.

| Decision | What it writes |
| -------- | -------------- |
| **Approve as new client** (the reviewer may change the name) | One client in status *onboarding* with contact person, email, website and project type; the message as source material (`contact_form`, "Website inquiry · 28 Oct 2026", first line "Language: Swedish") and as the client's initial notes; budget and timing as **observed** brief values whose source points back to the inquiry (`inquiryId`); "Discuss budget with the customer" as an open question when they were not sure; a **draft** onboarding, where those values show as "verify"; activity in the reviewer's name. The message is never turned into a goal or other value. |
| **Add to an existing client** | The message as source material. Contact details, budget and timing only where the client has none. No existing value changes (differences are listed before confirming), no client is created, no onboarding starts. |
| **Reject** (optional internal reason) | Only the inquiry: status, who, when, reason. |
| **Mark as spam** | Only the inquiry: status, who, when. |

Every decision goes through `decide_inquiry()`
(`supabase/migrations/20261028000300_inquiry_review.sql`), which runs as the
signed-in person. It locks the inquiry, refuses one that is already decided,
and for an approval applies the client, brief, source and onboarding through
`apply_onboarding_changes()` in the same transaction. Two people approving at
the same moment therefore create one client; the second is told the inquiry
was already decided. A guard trigger refuses any other update to an inquiry,
any change to what the customer sent, and a decision in someone else's name.

## Who can see what

| Who | `inquiries` | `inquiry_rate_limits` | `receive_inquiry()` | `decide_inquiry()` |
| --- | ----------- | --------------------- | ------------------- | ------------------ |
| Signed out (anon) | nothing | nothing | no | no |
| Studio owner, member | read their studio's rows; decide through `decide_inquiry()` | nothing | no | yes |
| Studio viewer | read their studio's rows | nothing | no | refused |
| Other signed-in people | nothing | nothing | no | refused |
| Service role | nothing | nothing | yes, the only way in | no |

Nobody can delete an inquiry or edit what the customer wrote.
`tests/db/inquiries.test.ts` and `tests/db/inquiry-review.test.ts` check
every row of this table, and `npm run staging:check` checks the function
privileges against staging.

## Configuration (server only)

| Variable | What |
| -------- | ---- |
| `INQUIRY_SIGNING_KEYS` | `keyId:secret`, comma-separated during a rotation. Secrets at least 32 characters (64 hex characters from `openssl rand -hex 32`). The same key id and secret go into the Axivo project as `STUDIO_OS_INQUIRY_KEY_ID` / `STUDIO_OS_INQUIRY_SECRET`. |
| `INQUIRY_STUDIO_ID` | The id of the studio that receives inquiries. |
| `INQUIRY_HASH_KEY` | At least 32 characters, different from every signing secret. Keys the IP hash. |
| `SUPABASE_SERVICE_ROLE_KEY` | Already needed for the intake agent. |

None has a `NEXT_PUBLIC_` prefix; CI builds with placeholder values and fails
if any reaches the browser bundle.

## Trying it against staging or a PR preview

`npm run staging:inquiry` sends one signed test inquiry the way the Axivo
server does, then a retry, a changed-content conflict and a forged signature,
and reports each answer. Run it from your own machine with the secret in your
shell only. See [staging.md](staging.md#8-website-inquiries).

## AI suggestions on inquiries: checks before real data

Once an inquiry is approved, staff can run the intake agent ("Analyze client
information") on the new client, whose source material is the inquiry
message. That sends the inquiry text to Anthropic. Before any **real** inquiry is analyzed:

- Confirm a data processing agreement with Anthropic covers this use, and
  where requests are processed.
- Name Anthropic in the Axivo privacy policy (the bracketed item in the
  handoff's privacy draft), with the transfer safeguards that apply.
- Confirm the legal basis for this processing (the policy's current Article
  6(1)(b)/(f) wording) still fits.
- Confirm Anthropic's retention of API inputs fits the 12-month inquiry
  retention promise.
- Keep using only test inquiries until all of the above is done and the
  retention job is live.
