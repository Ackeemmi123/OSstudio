# Production: setup, gate and runbook (draft)

**Status on 29 Oct 2026: there is no production Studio OS.** Only staging
exists (Vercel project `studio-os-staging`, Supabase project
`szibblhsntvsefennmzq`), and it must hold test data only. The Axivo website's
production deployment does not forward to Studio OS. Nothing in this document
has been set up; it is the plan and the checklist for doing so.

Each item below is marked:

- **Verified (code)**: checked in this repository, with the test or file named.
- **Verified (staging)**: observed on the staging deployment (read-only), with the date.
- **Owner action**: needs a person with dashboard, legal or account access. Not verified by us.
- **Not built**: needs code.

## Environments

| | Local | Staging | Production |
| --- | --- | --- | --- |
| App | `npm run dev` / local stack | Vercel `studio-os-staging`, https://studio-os-staging-kappa.vercel.app | Not created |
| Database | Docker Supabase | Supabase `szibblhsntvsefennmzq` | Not created |
| Data | Invented | **Test data only** | Real clients |
| Inquiries from | `tests/fixtures/inquiries`, e2e tests | `npm run staging:inquiry`; Axivo **Preview** (if its variables are set) | Axivo production site (not connected) |
| AI | Test provider, no API calls | Real Anthropic key, person-started only, test data | Off at launch |
| Who may change it | Anyone | Owner; Claude reads only | Owner only, with a written change |

Rules: never point a staging key, URL or database at production or the
reverse; never copy production data to staging; production secrets are new
values, never the staging ones.

## Go-live gate

| # | Item | Status | Evidence / what to do |
| - | ---- | ------ | --------------------- |
| 1 | Separate production Supabase project, **EU region** | Owner action | Create; record the region. Apply all migrations with `supabase db push --dry-run` first (12 files, `20261027000100` … `20261030000100`). |
| 2 | Separate production Vercel project, EU function region | Owner action | New project; never reuse `studio-os-staging`. |
| 3 | Processor agreements (DPA): Supabase, Vercel, Resend, Microsoft 365, Anthropic if AI is used | Owner action | Accept/download each DPA; note transfer safeguards. |
| 4 | Privacy notice names Studio OS processing (Supabase, Vercel; Anthropic if AI) and the retention periods | Owner action (adviser) | The privacy text drafted in the handoff contract (section 12, https://claude.ai/artifact/SS53XHpDBTYpWeWngFaK6M) still has open brackets; the published Axivo policy does not mention Studio OS. **Blocking.** |
| 5 | Backups on a plan that has them, and a documented **restore test** | Owner action | See [Restore test](#restore-test). Not done for staging either. |
| 6 | Access control: no public sign-up, owners named, two owners | Verified (staging) for sign-up off (staging:check 29 Oct); Owner action for production | `npm run staging:check` style check against production before launch. |
| 7 | Account recovery | Not built in the app | No password reset or invite flow. Recovery = dashboard (Authentication → Users → send recovery / set password). Needs two people with dashboard access. |
| 8 | Secret separation and rotation | Verified (code); Owner action for values | No secrets in git (scan 29 Oct: only CI canaries and test placeholders); CI fails if a server secret reaches the browser bundle (`scripts/check-bundle-secrets.mjs`). New production values for `SUPABASE_SERVICE_ROLE_KEY`, `INQUIRY_SIGNING_KEYS`, `INQUIRY_HASH_KEY`. The staging bypass token that was exposed on 28 Oct should be rotated. |
| 9 | Monitoring and alert for failed inquiry delivery | Not built | Today a failed handoff alerts no one ([below](#inquiry-handoff-failure-fallback)). |
| 10 | Safe recovery path when the handoff fails | Not built (proposal ready) | Fallback patch for the Axivo site, not applied. |
| 11 | Retention jobs scheduled and checked | Verified (staging) by the owner 29 Oct (migrations applied, cron jobs listed); Verified (code) `tests/db/*retention*.test.ts` | Repeat the staging checks in production. |
| 12 | Deletion and access procedures | Written | [operations.md](operations.md#data-requests-access-correction-erasure); no export button. |
| 13 | Security headers | Verified (staging) 29 Oct: `frame-ancestors 'none'`, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, HSTS (Vercel). Pinned by `src/server/security-headers.test.ts` | Full CSP not set; [proposal](#content-security-policy-proposal). Not blocking for a small internal tool. |
| 14 | Founder-unavailability ownership | Owner action | [Below](#founder-unavailability). |
| 15 | AI on real client data | Off at launch (decision) | [Conditions](#ai-on-real-client-data). |
| 16 | Daily inquiry owner and backup named | Owner action | [operations.md](operations.md#roles). |

**Do not call production ready until items 1–5, 7–10, 14 and 16 are done
and checked.** A green build or a passing staging test is not that check.

## Setup order (when approved)

1. Supabase production project (EU), backups on, sign-up disabled, email
   sign-in only, Site URL = production app URL.
2. `supabase db push --db-url <production> --dry-run` (expect the 12
   migrations), review, push. Check `cron.job` lists `inquiry-retention` and
   `client-retention`.
3. Vercel production project: `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. **No**
   `ANTHROPIC_API_KEY` at launch. **No** `INQUIRY_*` until step 7.
4. Create the owner accounts in the dashboard; sign in; create the studio.
5. `npm run staging:check` pointed at production (read-only) passes.
6. Restore test (below), documented.
7. Inquiries: new signing secret and hash key, `INQUIRY_*` on the production
   Studio OS; signed test with `npm run staging:inquiry` against the
   production URL **only with the owner's approval** (it writes a test row);
   then the Axivo production variables, after the privacy notice is live.

## Restore test

Once before launch, then after any change to the backup plan:

1. Note a known record (a test client's name and its number of tasks).
2. Supabase → Database → Backups: restore the latest backup **into a new
   project** (never over production).
3. Point a local checkout at the restored project (read-only) and confirm the
   record, the migration list and the cron jobs.
4. Write down the date, the backup's age, how long it took, and who did it.
5. After any real restore over production: run both retention jobs
   (`select private.run_inquiry_retention(false); select private.run_client_retention(false);`)
   so nothing anonymised earlier comes back.

## Founder unavailability

- Two people with owner role in Studio OS and admin access to Supabase,
  Vercel (both projects) and the Axivo DNS/email.
- Passwords and recovery codes in a shared password manager vault; 2FA on
  every dashboard.
- The backup person knows: the daily check ([operations.md](operations.md)),
  how to turn the website back to email-only (remove the three
  `STUDIO_OS_INQUIRY_*` variables in the Axivo project), and where the
  restore steps are.

## Inquiry handoff failure fallback

**Today:** with Studio OS configured, any answer except `202` gives the
visitor "not sent" and sends **no email**, and nobody is alerted (Axivo
`src/lib/contact/process.server.ts`). A Studio OS outage silently loses
inquiries unless visitors retry.

**Proposed (not applied; needs the owner's approval and a change to the Axivo
repository):** when forwarding fails on the Studio OS side (`unavailable`:
timeout, network error or 5xx after the one retry; `not_configured`: 503;
`unauthorized`: 401, a key mismatch), send the notification email anyway,
subject prefixed "[Not in Studio OS]", with the line "NOT recorded in Studio
OS (<reason>). Enter this enquiry by hand.", and tell the visitor the message
was sent only if that email was accepted. Log
`[contact] Fallback email sent (<reason>)` so a log search or alert finds it.
Refusals of the enquiry itself (`invalid` 400/413, `conflict` 409) and
`rate_limited` keep today's behaviour: "not sent", no email.

- No duplicate success: the visitor sees success once, after a `202` or an
  accepted fallback email. Without email configured, or if the fallback email
  fails, the visitor sees "not sent" as today.
- One misleading case remains: if Studio OS stored the inquiry but its answer
  was lost (a timeout after the commit, then a failed retry), the email says
  "NOT recorded" although it is. So before entering a fallback inquiry by hand,
  search Studio OS (Clients and the inquiry list) for the sender's email.
- Observable: the subject prefix and warning line, the log line, and the
  inquiry missing from Studio OS.
- Recovery: the inquiry owner creates the client by hand from the email
  (Clients → New client, source type Contact form, paste the message) after
  the search above.

A related gap today: when the first attempt times out after Studio OS stored
the inquiry and the retry gets `202 duplicate`, the website sends **no
notification email** (duplicates are never emailed). The inquiry is in Studio
OS, so the daily check of Today still finds it.

The patch and its tests are in the project files
(`readiness/axivo-fallback.patch`, against Axivo commit `05777f4`; its 126
tests, typecheck and lint pass in a scratch copy). It is not applied to the
Axivo repository.

**Free alerting options** (owner decision; each is a new service account):
an uptime monitor that POSTs `{}` to `/api/inquiries` and expects `401`; or
Vercel log-based alerts on `Fallback email sent` / `Studio OS responded`
where the plan allows it.

## AI on real client data

AI stays **off for real client data at launch**: no `ANTHROPIC_API_KEY` in
production, no automatic triggers (none exist; every run is person-started),
monthly cap `STUDIO_AI_MONTHLY_BUDGET_USD` ([ai.md](ai.md)). Before turning it on:

1. Anthropic DPA accepted; processing region and transfer safeguards noted.
2. Anthropic named in the privacy notice with the purpose and legal basis.
3. Anthropic's API retention period checked against the 12-month inquiry and
   client retention promises.
4. A monthly budget cap set and the owner approves the cost.
5. A written rule for staff: what may be analysed, and that every proposal is
   reviewed by a person.

## Content-Security-Policy proposal

Not applied. Try it first as `Content-Security-Policy-Report-Only` on
staging, click through every page, then switch:

```
default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://<ref>.supabase.co wss://<ref>.supabase.co;
frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'
```

`'unsafe-inline'` for scripts is needed by Next.js without nonces; a nonce
setup removes it later. Update `src/server/security-headers.test.ts` with the
change.

## Minimal go-live checklist

Verified by us (code and staging, 29 Oct 2026):
- [x] Signed inquiry endpoint, duplicates, conflicts, rate limits (unit and DB tests; staging 28 Oct)
- [x] Review, approval to client and onboarding (DB and browser tests; staging)
- [x] Workflow from inquiry to completed project (`tests/e2e/dry-run.spec.ts`, local stack)
- [x] Retention jobs (DB tests; staging checks by the owner)
- [x] No secrets in the repository; bundle secret check in CI
- [x] Baseline security headers on staging
- [x] Staging configuration (`npm run staging:check`, 29 Oct: all pass)

Owner actions before real clients:
- [ ] Production Supabase (EU) and Vercel projects, separate secrets
- [ ] DPAs accepted
- [ ] Privacy notice updated and published (adviser)
- [ ] Backups on and one restore test written down
- [ ] Two owners with dashboard access and 2FA; recovery tested
- [ ] Inquiry owner and backup named; daily check started
- [ ] Decision on the handoff fallback and alerting (patch ready)
- [ ] Rotate the staging bypass token exposed on 28 Oct
- [ ] Dry run completed ([dry-run.md](dry-run.md)) and its notes reviewed
