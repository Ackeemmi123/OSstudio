# Guided client onboarding

"New client" asks for a name (plus, optionally, the website, project type and
the inquiry) and then opens a short guided onboarding at
`/clients/[clientId]/onboarding`. It fills in the client's brief step by step:
Business, Current setup, Goals, Scope, Budget & timing, Review. Every question
can be skipped, and the person can leave at any step and continue later.

## One source of truth

The onboarding record (`Onboarding` in `src/lib/domain/types.ts`) holds only
progress: status (`draft`, `in_progress`, `ready_for_review`), the current
step, and the questions marked "not known yet". Every answer is written to the
client's details or to its brief values (`client.context`), with the same
provenance and history rules as editing the brief by hand. The brief on the
client workspace is therefore always the onboarding result, and stays
editable after onboarding.

## Adding or changing questions

All questions live in `BRIEF_FIELDS` (`src/lib/domain/brief.ts`). Each entry
names its step, its input (text, long text, URL or sales channels), its
wording, and `appliesTo`, which decides from the project type and earlier
answers whether it is asked. Examples: sales channels only for e-commerce
projects; the store address only once an active channel is chosen; the
platform question only when the store is custom or "other". A new brief value
needs a key in `CONTEXT_FIELD_KEYS`, a label, a catalog entry and a migration
that adds it to the database checks (see `20261027000500_onboarding.sql`).

## Rules the domain enforces (`src/lib/domain/onboarding.ts`)

- Only a person answers onboarding questions. An agent actor is refused.
- Only values that differ from the brief are written. An observed value or an
  agent proposal the person did not touch keeps its confidence.
- Typed answers are saved as observed, unless the person ticks "the client
  confirmed the answers I typed on this step". Existing values are confirmed
  only by an explicit Confirm.
- "Not selling online yet" cannot be combined with an active sales channel.
- Corrected values keep the earlier value in history.
- A partial brief can be marked ready for review. Unknown values stay unknown.
- One onboarding per client (per project later): a double click or two tabs
  cannot start two.

## Persistence

- Local demo: stored with the rest of the workspace in this browser only.
  Older browser data gets the new brief values as "unknown" on load.
- Supabase: `client_onboardings` with row-level security (members read,
  owners and members write), and `apply_onboarding_changes()`, which writes a
  step's brief values, details, questions, events and progress in one
  transaction with the usual concurrent-edit check. Verified against a local
  Supabase stack (`tests/db/onboarding.test.ts`), not against a hosted project.
- Not yet: the browser-data import does not carry onboarding progress (the
  answers themselves are imported, since they are brief values).

## Where the intake agent connects

The Client Intake & Research agent (server-side, see `src/lib/agents`) reads
the client's source material and stores `AgentProposal`s with quoted
evidence. Onboarding already shows them:

- a pending proposal appears on its question as "Suggested by intake
  analysis", with the quote, to use as observed or dismiss (`reviewProposal`);
- follow-up questions from the latest run's result are offered on the Review
  step, to add to the open questions;
- in a signed-in workspace the source panel has "Suggest answers from
  sources", which calls `requestIntakeAnalysis`.

In the local demo none of this runs and the panel says so. No AI output is
simulated.
