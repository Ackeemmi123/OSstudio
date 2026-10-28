# Website inquiries

The Axivo website's contact form forwards each inquiry, server to server, to
Studio OS. Studio OS verifies it, stores it once, and answers `202` only when
it is safely stored. This is the first slice of the plan
(https://claude.ai/artifact/KGWxAuoZXSfC8sy6zoS9Uu) and follows the handoff
contract v1, revision 3 (https://claude.ai/artifact/SS53XHpDBTYpWeWngFaK6M).

**Built:** the signed endpoint, storage, duplicate and conflict handling, rate
limits, and read access for studio members (database only).
**Not built yet:** the review screen (approve, link, reject, spam), turning an
approved inquiry into a client and onboarding, AI suggestions on inquiries,
and the retention job. Until the retention job exists and is tested, **only
test inquiries may be sent to Studio OS.**

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

## Who can see what

| Who | `inquiries` | `inquiry_rate_limits` | `receive_inquiry()` |
| --- | ----------- | --------------------- | ------------------- |
| Signed out (anon) | nothing | nothing | no |
| Studio owner, member, viewer | read their studio's rows | nothing | no |
| Other signed-in people | nothing | nothing | no |
| Service role | nothing | nothing | yes, the only way in |

Nobody can edit or delete an inquiry; what the customer wrote stays as written.
`tests/db/inquiries.test.ts` checks every row of this table, and
`npm run staging:check` checks the same against staging.

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

Staff will be able to ask the intake agent for suggestions from an inquiry
once inquiries become clients (next slice). That sends the inquiry text to
Anthropic. Before any **real** inquiry is analyzed:

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
