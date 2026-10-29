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

Before a model call the server reserves the most the call could cost (every
input character counted as a token, the full output allowance, doubled in case
a fallback model answers after a refusal, at the highest listed price). After
the call it settles the reservation to the real cost:

- the provider reported usage: that cost;
- the provider refused the request before doing any work (bad key, bad
  request, rate limit): nothing;
- unknown (timeout, lost connection, a server that stopped mid-call): the
  whole reservation. A reservation left open for 15 minutes is charged in full.

A reservation that would take the month over the cap is refused, and once the
month is at the cap no agent runs at all. The run is recorded as failed with a
plain explanation, and nothing is sent to the model. The month's row is locked
while a reservation is checked and made, so concurrent requests cannot pass the
cap together (`tests/db/ai-budget.test.ts`).

Owners see the month's spend in Settings. The ledger lives in
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
