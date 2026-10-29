# AI agents: cost, limits and data

Studio OS agents read, propose and draft. A person accepts or dismisses
everything they produce. No agent can send anything to a client, spend money,
change a live site, approve work or start on its own.

## What a run costs

Every run records the tokens the provider reported, the model that answered,
an estimated cost and the prompt version (`agent_runs.input_tokens`,
`output_tokens`, `cache_read_tokens`, `cache_write_tokens`, `served_by`,
`cost_micros`, `prompt_version`). Costs are estimated from Anthropic's list
prices in `src/lib/agents/pricing.ts` and shown under each analysis. A model
that is not listed there cannot run, because its cost could not be capped.

## The monthly cap

All agents share one monthly budget: `STUDIO_AI_MONTHLY_BUDGET_USD`, $25 when
unset (the amount Alexander approved on 28 Oct 2026). An invalid value turns
the agents off rather than running uncapped. Months are calendar months in UTC.

Before a model call the server reserves the most the call could cost: every
byte of the request (instructions, the whole message with client details,
brief and sources, and the answer format) counted as a token, plus 4 000 tokens
of framing, the full output allowance, all doubled in case a fallback model
answers after a refusal, at the highest listed price. A token is never shorter
than a byte, so text in any script or with emoji cannot be under-counted. After
the call it settles the reservation to the real cost:

- the provider reported usage: that cost. After a fallback the API lists every
  attempt in `usage.iterations`, including the one that declined; each is
  charged at the price of the model that ran it (the top-level usage covers
  only the answer);
- the provider refused the request before doing any work (bad key, bad
  request, rate limit): nothing;
- unknown (timeout, lost connection, a server that stopped mid-call): the
  whole reservation. A reservation left open for 15 minutes is charged in full.

The real cost is recorded even when it is higher than the reservation (only
possible if the provider tried more than two models in one call), so the
month can end slightly over the cap; the next run is then refused.

A reservation that would take the month over the cap is refused, and once the
month is at the cap no agent runs at all. The run is recorded as failed with a
plain explanation, and nothing is sent to the model. The month's row is locked
while a reservation is checked and made, so concurrent requests cannot pass the
cap together (`tests/db/ai-budget.test.ts`).

Owners see the month's spend in Settings. The budget is one per deployment,
so the total covers every studio on it: with more than one studio, each owner
would see the combined spend. That is fine while the deployment serves one
studio; a per-studio budget is needed before opening sign-ups. The ledger lives in
`private.ai_budget_months` and `private.ai_budget_reservations` and is used
only through `public.ai_budget_reserve`, `ai_budget_settle` and
`ai_budget_month`, which only the service role may call.

## Automatic runs

`src/lib/agents/triggers.ts` lists the events that start an agent without a
person asking. It is empty. Adding a rule needs Alexander's explicit approval,
recorded on the rule.

## What is sent to the model

The intake agent is sent the client's name, contact person and website, the
current brief (without the email address) and the source material. Nothing
else: no tools, no database access, no web. Anthropic processes this as a
provider; copies it holds are outside Studio OS's anonymisation.

Server logs for a failed analysis record only an error code and message, never
database details, which can quote client material.

## Retention

Client anonymisation (the client-retention work) clears what AI stores about a
client: `agent_runs.result`, `inputs`, `outputs`, `trigger`, `blocker` and
`error`, and deletes the client's `agent_proposals`. Usage and cost columns,
the prompt version and the budget ledger hold no personal data and are kept.
Agent events are recorded with the agent as actor, so they never count as
client activity; a person accepting a proposal does.

## Evaluation set

`npm run eval:intake` runs the intake agent on eight synthetic inquiries
(`src/lib/agents/eval/intake-cases.ts`: a clear shop, vague wording,
conflicting budgets, a prompt injection, Swedish, an almost empty message, a
brief that changes, and personal data in a signature) and grades the output
the way a person would see it:

- **Safety** checks must always pass: nothing proposed that the material does
  not state, no injected text in the agent's own words, every proposal quoted.
- **Recall** checks measure quality: the stated facts found, gaps reported,
  ambiguities flagged.

It uses the free test provider by default, which proves the harness and the
safety rules but says nothing about the model's quality. A run against Claude
costs about $1 and needs `EVAL_PROVIDER=anthropic`, `ANTHROPIC_API_KEY` and
`EVAL_SPEND_APPROVED=yes`, set only after Alexander approves the spend. Before
each case it stops if that case's worst cost could take the run past
`EVAL_MAX_USD` (default 2), so it never spends more than the limit. These runs
are not recorded in the studio's monthly budget: they use the evaluator's own
key and limit, and are counted in the Anthropic console.

## Questions per brief field

From prompt version `intake-2026-10-31`, each suggested question names the
brief field it would fill. Guided onboarding shows it on that question,
together with "found nothing about this in the material", and "Ask the client"
adds it to the client's open questions when the step is saved. Analyses made
earlier still show their questions in the client workspace and on the review
step.
