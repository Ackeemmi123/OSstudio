# Architecture

Studio OS answers three questions: which clients and projects are we working
on, what needs to happen next, and what needs a person's decision.

```
src/
  app/                 Routes. Thin pages. theme.css holds every design token.
    api/agents/        Server routes: run the intake agent, report agent status
    api/inquiries/     Signed endpoint for Axivo website inquiries (docs/inquiries.md)
  components/          UI only. Reads derived views, writes through the store.
    shell/             Top bar, search, brand mark
    today/             Today: follow-ups, decisions, next up, in progress, recent
    auth/              Sign-in, create a studio, configuration errors
    providers/         Workspace gate (local demo or Supabase), studio store
    clients/           Client list, workspace, brief, source material, intake review
    onboarding/        Guided onboarding (see docs/onboarding.md)
    workspace/         Settings: data, import, people, connections, agents
    ui/                Buttons, fields, modal, toast, surfaces
  lib/
    config.ts          Which data mode is configured (never falls back silently)
    domain/            Types, labels, validation and pure business rules (+ tests)
    data/              Repository interface; local demo and Supabase repositories;
                       browser import; row mappers; error mapping
    agents/            Run contract, permissions, registry, intake contract (+ tests)
  server/              Server-only: configuration, model providers, intake runner
supabase/migrations/   Schema, row-level security, triggers, functions
tests/db/              Database tests against a local Supabase stack
tests/e2e/             Playwright journeys
```

## Layers

| Concern | Where | Status |
| ------- | ----- | ------ |
| Domain model and rules | `src/lib/domain` | Working, unit tested |
| Data access | `StudioRepository`: `LocalDemoRepository`, `SupabaseRepository` | Both working; Supabase tested against a local stack |
| Database rules | `supabase/migrations` | Row-level security and triggers, database tests in `tests/db` |
| Agent contract and permissions | `src/lib/agents` | Enforced in code and in the database |
| Intake agent | `src/server/agents`, `/api/agents/intake` | Person-started only. The test provider runs in tests and the local demo; the Anthropic provider was called on staging with test data (smoke test, 28 Oct 2026). Spend is capped monthly ([ai.md](ai.md)). Not for real client data until the conditions in [production.md](production.md#ai-on-real-client-data) are met |
| Task suggestions | `src/server/agents/plan-runner.ts`, `/api/agents/plan` | Person-started, when starting a project; same budget and data conditions as the intake agent ([ai.md](ai.md#task-suggestions-for-a-new-project)) |
| Follow-ups | `src/lib/domain/followups.ts` | Computed on Today and per client, stores nothing ([follow-ups.md](follow-ups.md)) |
| Website inquiries | `src/lib/inquiries`, `src/server/inquiries`, `/api/inquiries` | Receiving, review (approve, add to a client, reject, spam) and the daily 12-month retention job, verified on staging with test inquiries; repeat submissions grouped with the first inquiry ([inquiries.md](inquiries.md)) |
| Website specs (WF-1) | `src/lib/site-spec`, `src/lib/domain/site-specs.ts`, `site_specs` table | Platform-neutral SiteSpec v1, versioned per project, approved only by a person on confirmed brief values; editor at `/clients/<client>/projects/<project>/site`. Not on staging yet; no renderer ([site-spec.md](site-spec.md)) |
| Website images (WF-2) | `src/lib/site-assets`, `src/server/site-assets`, `/api/site-assets/upload`, `/api/storage/purge`, private bucket `site-assets` | Per-client image library; bytes checked on the server before storing; rights decided per image by a person; specs approve only with approved images of their client; deleted images purged within a day ([site-images.md](site-images.md)) |
| Website preview (WF-3) | `src/lib/site-render`, `/clients/<client>/projects/<project>/site/preview` | Any saved spec version as a working website in a sandboxed frame: platform-neutral render model, no scripts, no external requests, nothing written ([site-preview.md](site-preview.md)) |
| Client retention | `supabase/migrations/20261029000200_client_retention.sql`, `src/lib/domain/retention.ts` | Daily job, owner holds and Today warnings; migration applied to staging and checked there with the rolled-back staging check; periods provisional until an adviser's review ([retention.md](retention.md)) |

## Rules

- A client needs only a name.
- Brief values carry a confidence (confirmed, observed, proposed, unknown,
  superseded), a source and who recorded them. Replaced values are kept.
- **Only a person can confirm a value or approve work.** The domain functions
  refuse it for agents, and database triggers refuse it for anyone who is not
  the signed-in person.
- Every change returns activity events, written in the same transaction.

## The Client Intake & Research agent

A person selects **Analyze client information** in a client's workspace.

1. The browser calls `POST /api/agents/intake` with the person's session token.
   The route checks the token, the person's membership and role (viewers get
   403; non-members get 404), and that a model is configured.
2. The runner (`src/server/agents/intake-runner.ts`) reads the client and its
   source material **as that person**, so row-level security applies. The
   model gets only that text: no tools, no database, no web.
3. The model returns structured output validated with zod. Every proposed
   value must quote its source; quotes are checked verbatim against the
   source, and proposals without a valid quote are dropped and counted.
4. The result is stored as an agent run plus pending proposals, using the
   service role, which can write only runs, proposals and agent activity.
   The database still forbids it from confirming anything.
5. In **Intake analysis**, a person adds each value to the brief (observed or
   confirmed), or dismisses it. They can also add the suggested questions to
   open questions. Still unknown, unclear, summary and next steps are shown,
   with "No external research was performed".

Safeguards: identical material reuses the earlier run (an idempotency key from
a fingerprint of the input); one active run per client; stale runs close
after 3 minutes; temporary failures can be retried, permanent ones are not
retried automatically; 30 runs per studio per hour; at most 60,000 characters
and 20 sources, refused rather than cut; a 90-second timeout by default.

Providers (`src/server/config.ts`):

- `anthropic`: Claude with structured output, default model
  `claude-opus-5-5`, with the API's server-side fallback enabled in case the
  model declines a request.
- `fixture`: a deterministic test provider with no AI, used by Playwright.
  It needs `STUDIO_ALLOW_TEST_PROVIDER=1`, and its runs are labeled as test
  output in the UI.

## Testing

| Command | What it covers |
| ------- | -------------- |
| `npm test` | Domain, data, import planning, agent contract, intake runner |
| `npm run test:db` | Row-level security, triggers, import, against local Supabase |
| `npm run test:e2e` | Playwright: sign-in, session expiry, viewers, other studios, clients, brief, projects, tasks, approvals, intake agent, import, local demo |
| `npm run staging:check` / `staging:smoke` | A hosted staging project and deployment: configuration, migrations, grants, one real pass including the intake agent (see [staging.md](staging.md)) |

CI (`.github/workflows/ci.yml`) runs all of them on every pull request,
together with typecheck, lint and build. It also runs the database tests a
second time with the publishable and secret keys newer hosted projects use,
runs the staging check and smoke test against the local stack, and builds
with placeholder secrets to prove none reaches the browser bundle.
