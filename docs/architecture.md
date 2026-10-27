# Architecture

Studio OS answers three questions: which clients and projects are we working
on, what needs to happen next, and what needs a person's decision. The code is
split so that AI agents can be added later without rewriting the app.

```
src/
  app/                 Routes. Thin pages. theme.css holds every design token.
  components/          UI only. Reads derived views, writes through the store.
    shell/             Top bar, search, brand mark
    today/             Today: decisions, next up, in progress, recent
    clients/           Client list, new client, the client workspace
    workspace/         Settings
    ui/                Buttons, fields, modal, toast, surfaces
  lib/
    domain/            Types, labels, validation and pure business rules (+ tests)
    data/              Repository interface, local demo repository, migration, store
    agents/            Agent run contract, permissions, planned-agent registry (+ tests)
```

## Layers

| Concern                     | Where                         | Status                  |
| --------------------------- | ----------------------------- | ----------------------- |
| UI components               | `src/components`              | Working                 |
| Domain model and rules      | `src/lib/domain`              | Working, unit tested    |
| Data access and persistence | `src/lib/data`                | Browser only            |
| Workflow events             | `ActivityEvent` in the domain | Recorded, nothing reacts yet |
| Agent execution contract    | `src/lib/agents/contract.ts`  | Types only              |
| Agent permissions           | `src/lib/agents/permissions.ts` | Enforced in code, no agents connected |
| AI provider integrations    | An `AgentRunner` per provider, server-side | Not started |

## Rules the domain enforces

- A client needs only a name. Everything else can be added later.
- Context values carry a confidence (confirmed, observed, proposed, unknown,
  superseded), a source and who recorded them. Replaced values are kept as
  history.
- **Only a person can confirm a value or approve work.** `setContextField` and
  `setTaskStatus` throw if an agent tries. The draft database schema repeats
  the first rule as a check constraint.
- Project status (planned, active, on hold, completed) is separate from its
  stage (intake to launch) and from task status.
- Every change returns activity events, stored with the change.

## How agents will plug in

1. **Shared data.** Agents read and write through the same repository as the
   UI. They receive `EntityRef`s, never their own copy of client context.
2. **Runs.** Each run is an `AgentRun` record: task type, client, project and
   task, inputs, outputs, status (`needs_input`, `needs_approval`, …), blocker,
   error, and an idempotency key so retries never duplicate work.
3. **Runners.** `AgentRunner` is the provider-independent seam. One
   implementation per model provider or framework, running server-side with
   credentials that never reach the browser.
4. **Triggers.** Each agent definition lists the activity events that start it
   (`client.created`, `source.received`, `task.completed`,
   `decision.approved`, …). A small server-side dispatcher reads new events,
   calls `agentsTriggeredBy`, and enqueues runs. Not built yet on purpose.
5. **Permissions.** `authorize(agent, action)` checks an explicit allow-list.
   Sending client messages or proposals, purchases, production changes, scope
   changes and launches always need a person's approval.
6. **In the UI.** Agent proposals appear under "Needs your decision" with who
   proposed them. Tasks can already be assigned to an agent in the data model.
   No agent dashboard exists until agents do.

## Testing

`npm test` runs the domain, data and permission tests. `npm run typecheck`,
`npm run lint` and `npm run build` must pass before merging.
