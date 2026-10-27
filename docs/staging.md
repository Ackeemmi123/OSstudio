# Staging

How to stand up a staging copy of Studio OS against a hosted Supabase project
and the real Anthropic API, check it, and run one end-to-end pass through it.

Use a **dedicated staging project**. Nothing here is meant for production, and
the smoke test writes test data.

## What staging needs

| What | Where it is set | Used for |
| ---- | --------------- | -------- |
| `NEXT_PUBLIC_SUPABASE_URL` | App host (build and runtime) | Browser and server: the Supabase project |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | App host (build and runtime) | Browser: the anon key or a publishable key (`sb_publishable_…`). Public by design; row-level security protects the data |
| `SUPABASE_SERVICE_ROLE_KEY` | App host, **server only** | Recording agent runs and proposals. The service_role key or a secret key (`sb_secret_…`) |
| `ANTHROPIC_API_KEY` | App host, **server only** | The intake agent. Without it, "Analyze client information" is shown as unavailable |
| `STUDIO_AGENT_MODEL` | App host, optional | Defaults to `claude-opus-5-5` |
| `STUDIO_AGENT_TIMEOUT_MS` | App host, optional | 10000–110000, default 90000 |

Leave `NEXT_PUBLIC_STUDIO_DATA_MODE` empty (or `supabase`). Never set
`STUDIO_AGENT_PROVIDER=fixture` or `STUDIO_ALLOW_TEST_PROVIDER`: the test
provider is refused against any Supabase that is not a local stack anyway.
`SUPABASE_URL` and `SUPABASE_ANON_KEY` are optional server-side overrides; if
`SUPABASE_URL` is set it must be the same project as
`NEXT_PUBLIC_SUPABASE_URL`, or the agent endpoint reports a configuration
error. The Anthropic key is only ever sent to `https://api.anthropic.com`;
`ANTHROPIC_BASE_URL` in the environment is ignored.

The agent endpoint allows itself 120 seconds (`maxDuration`). The host must
allow server functions to run that long, or long analyses are cut off.

## 1. Create the Supabase project

1. Create a project at supabase.com (Postgres 17, the version the local stack
   uses).
2. **Authentication → Sign In / Providers**: keep **Email** enabled, turn
   **off** "Allow new users to sign up". There is no sign-up in the app;
   people are created by an administrator. Email confirmation can stay on;
   accounts created in the dashboard with "Auto confirm" skip it.
3. **Authentication → URL Configuration**: set the Site URL to the staging
   app's URL. The app signs in with email and password only and sends no
   magic links, so no redirect URLs are needed.
4. Note the project URL, the anon or publishable key, the service_role or
   secret key, and the database connection string (Connect → session pooler).

## 2. Apply the migrations

The migrations create tables, row-level security, triggers and functions.
They drop nothing. Review what will run first:

```bash
npx supabase db push --db-url "$STAGING_DATABASE_URL" --dry-run
```

Exactly these five should be listed, in this order, on a new project:
`20261027000100_core_schema`, `…000200_agents`, `…000300_security`,
`…000400_functions`, `…000500_onboarding`. If anything else is listed, stop:
the database is not the empty staging project you think it is. Then:

```bash
npx supabase db push --db-url "$STAGING_DATABASE_URL"
```

(`npx supabase link --project-ref <ref>` followed by `npx supabase db push`
works too.)

## 3. Check the configuration

Put the staging values in `.env.staging` (see `.env.staging.example`; the
file is ignored by git) or in the environment, then:

```bash
set -a; . ./.env.staging; set +a
npm run staging:check
```

It changes no data and prints no keys; it prints the project ref, which is
part of the public URL. It checks that:

- the keys are of the right kind and the service key is not the public one,
  no secret sits in a `NEXT_PUBLIC_` variable, and the test provider is off;
- the project is reachable, sign-ups are disabled and email sign-in is on;
- signed out, tables and functions refuse every request;
- all 13 tables exist: with the service role key if it is set, otherwise
  as the owner test account. Without the service role key it also signs in
  to all three smoke test accounts, checks that the five app functions
  exist and refuse a studio nobody belongs to (so nothing is written), and
  signs the accounts out again;
- with `STAGING_DATABASE_URL`: the applied migrations match
  `supabase/migrations`, every table has row-level security, the anonymous
  role has no table grants, people cannot delete rows, no app function is
  callable signed out, and the agent runner can record runs;
- with `STAGING_ANTHROPIC_API_KEY`: the key is accepted and the model is
  available to it (a model lookup, no tokens).

Behind an HTTPS proxy (for example a Claude Code cloud environment), Node's
`fetch` ignores `HTTPS_PROXY` unless `NODE_USE_ENV_PROXY=1` is set, and the
proxy's certificate must be trusted with `NODE_EXTRA_CA_CERTS`. Run both
staging commands with them, for example
`NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt npm run staging:check`.

Run it with the app host's variables too (for example after `vercel env pull`)
to check the deployment's own configuration.

## 4. Deploy the app

Set the variables from the table above on the host, then deploy. After the
build, make sure no secret reached the browser bundle. CI does this on every
build with placeholder secrets; for the real build:

```bash
node scripts/check-bundle-secrets.mjs .next
```

It reads the secret values from the environment and fails if any of them, or
anything shaped like a secret key, appears under `.next/static`.

## 5. Run the smoke test

```bash
STAGING_SMOKE=1 STAGING_APP_URL=https://<staging app> npm run staging:smoke
```

`STAGING_SMOKE=1` confirms it may write to the project. It creates one studio
"Smoke test <run>" and one client with a short made-up email as source
material, and deletes nothing. It needs the project URL and anon key, plus one
of two ways to get people:

- **Existing test accounts (recommended)**: create three different accounts
  in the staging project (Authentication → Users → Add user, auto confirm).
  They need no Studio OS role: on each run the owner account creates a new
  "Smoke test" studio (becoming its owner) and adds the viewer account as a
  viewer, and the outsider account is never added. Set
  `STAGING_SMOKE_OWNER_EMAIL`, `STAGING_SMOKE_VIEWER_EMAIL`,
  `STAGING_SMOKE_OUTSIDER_EMAIL`, and either one shared
  `STAGING_SMOKE_PASSWORD` or `STAGING_SMOKE_OWNER_PASSWORD`,
  `STAGING_SMOKE_VIEWER_PASSWORD` and `STAGING_SMOKE_OUTSIDER_PASSWORD` (each
  falls back to the shared one). These can only
  act as those test users, under row-level security, so they are safe to keep
  where the service role key is not (for example a Claude Code cloud
  environment, whose environment variables are readable by anyone who uses it).
- **The service role key**: the test then creates three throwaway accounts
  (`staging-smoke+<run>-owner|viewer|outsider@example.com`) and also checks
  that the service role cannot confirm a client fact.

It checks, against the real services:

1. Sign-in for all three, creating a studio (the owner gets the owner role)
   and adding the viewer (who gets the viewer role).
2. Creating a client and source material through the app's repository, and
   reading them back.
3. Privacy: signed out and outside the studio, nothing is visible; the viewer
   can read but not change.
4. With the service role key: the service role cannot confirm a client fact.
5. With `STAGING_APP_URL`: the deployed app reports the Anthropic provider
   (not the test provider); viewers get 403 and outsiders 404 from the agent
   endpoint; one real analysis produces pending proposals whose quotes appear
   verbatim in the source; nothing in the brief is confirmed; unchanged
   material reuses the run; accepting a proposal adds it as observed, not
   confirmed.

The Anthropic call in step 5 runs inside the deployed app with the app host's
key, so the machine running the test never needs the Anthropic key. One
analysis costs one model request.

### Where each credential lives

| Value | Secret? | App host | Machine running the staging scripts |
| ----- | ------- | -------- | ----------------------------------- |
| Supabase URL, anon or publishable key | No | Yes (`NEXT_PUBLIC_…`) | Yes (`STAGING_…`) |
| Smoke test accounts and password | Low risk: staging test users only | No | Yes |
| Service role or secret key | Yes: bypasses row-level security | Yes, server only | Optional |
| Database connection string | Yes: database owner | No | Only where migrations are applied |
| Anthropic API key | Yes | Yes, server only | Optional (model lookup in the check) |

## 6. Check by hand

These need a person in a browser:

1. Sign in as the smoke test owner (or a real account), open the "Smoke test"
   studio and the client. The proposals from step 5 are shown with their
   quotes and "No external research was performed".
2. Sign in as the viewer: "Read only" in the top bar, no edit controls, no
   "Analyze" button.
3. Onboarding: start onboarding for a client, save two steps, then resume in
   another browser. While a step is open in one session, confirm a value in a
   second session. Saving the first session shows the conflict message, and
   the confirmed value remains.
4. Errors: deploy once with a wrong `ANTHROPIC_API_KEY` (or
   `STUDIO_AGENT_TIMEOUT_MS=10000` and long material). The analysis shows a
   clear error, and the brief and onboarding answers stay intact.
5. Import: in the local demo, enter a client, then sign in to staging and use
   Settings → Import from this browser. A second import reports "already
   imported"; history shows as imported.
6. Sign out, and let a session expire (or revoke it in Supabase): the app asks
   to sign in again rather than failing silently.

## Cleaning up

The smoke test's studios (and accounts it created) are clearly named and can stay. Nothing
in the app deletes data, by design. An administrator can remove them in the
Supabase dashboard: first the "Smoke test …" studios (SQL editor), then the
`staging-smoke+…` accounts (Authentication → Users). An account that requested
an analysis cannot be deleted while its agent runs still exist.
