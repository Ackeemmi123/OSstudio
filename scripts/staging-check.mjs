#!/usr/bin/env node
/**
 * Checks a staging (or any hosted) Studio OS configuration without changing
 * anything. It reads values as described in scripts/staging-env.mjs, prints
 * what it checked, and never prints a key.
 *
 *   npm run staging:check                       # configuration, Supabase, Anthropic
 *   set -a; . ./.env.staging; set +a; npm run staging:check
 *
 * What it checks:
 *   - the configuration itself: keys of the right kind, no secret in a
 *     NEXT_PUBLIC_ variable, the test provider off;
 *   - Supabase: sign-ups disabled, email sign-in on, nothing readable or
 *     callable without signing in, and the migrations' tables and functions
 *     present (checked with the service role key, or else by signing in to
 *     the smoke test accounts, which only reads and is signed out again);
 *   - with STAGING_DATABASE_URL: applied migrations match supabase/migrations,
 *     row-level security on every table, no grants to the anonymous role;
 *   - Anthropic: the key is accepted and the configured model is available
 *     (a model lookup, which uses no tokens).
 *
 * Exits with 1 if anything failed.
 */
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ANTHROPIC_API_URL, isLocalUrl, keyKind, stagingEnv } from "./staging-env.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const config = stagingEnv();
const results = [];
const record = (status, label, detail = "") => results.push({ status, label, detail });
const pass = (label, detail) => record("pass", label, detail);
const fail = (label, detail) => record("fail", label, detail);
const skip = (label, detail) => record("skip", label, detail);

const TABLES = [
  "studios", "studio_members", "clients", "client_context_fields", "client_context_items", "client_sources",
  "projects", "tasks", "import_batches", "activity_events", "agent_runs", "agent_proposals", "client_onboardings",
  "inquiries", "inquiry_rate_limits",
];
const FUNCTIONS = ["my_studios", "create_studio", "load_studio", "apply_changes", "apply_onboarding_changes", "import_browser_data", "receive_inquiry"];

checkConfiguration();
if (config.url && config.anonKey) await checkSupabase();
if (config.databaseUrl) await checkDatabase();
else skip("Database checks", "STAGING_DATABASE_URL is not set");
await checkAnthropic();
report();

function checkConfiguration() {
  if (!config.url) fail("Supabase URL", "STAGING_SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) is not set");
  else if (isLocalUrl(config.url)) pass("Supabase URL", `${config.url} (local stack)`);
  else if (!config.url.startsWith("https://")) fail("Supabase URL", "must use https");
  else pass("Supabase URL", `project ref ${projectRef(config.url) ?? "(custom domain)"}`);

  const anon = keyKind(config.anonKey);
  if (anon === "legacy anon" || anon === "publishable") pass("Public (anon) key", anon);
  else fail("Public (anon) key", anon === "missing" ? "not set" : `expected an anon or publishable key, found: ${anon}`);

  const service = keyKind(config.serviceKey);
  if (service === "legacy service_role" || service === "secret") pass("Service role key", service);
  else if (service === "missing") skip("Service role key", "not set (not needed here: the app host holds it)");
  else fail("Service role key", `expected a service_role or secret key, found: ${service}`);

  // A secret in a NEXT_PUBLIC_ variable is built into the browser bundle.
  const secrets = [config.serviceKey, config.anthropicKey].filter(Boolean);
  const exposed = Object.entries(process.env)
    .filter(([name, value]) => name.startsWith("NEXT_PUBLIC_") && value && secrets.some((secret) => value.includes(secret)))
    .map(([name]) => name);
  const sbSecretPublic = Object.entries(process.env).filter(([name, value]) => name.startsWith("NEXT_PUBLIC_") && /sb_secret_|sk-ant-/.test(value ?? ""));
  if (exposed.length || sbSecretPublic.length) fail("No secret in a NEXT_PUBLIC_ variable", [...new Set([...exposed, ...sbSecretPublic.map(([n]) => n)])].join(", "));
  else pass("No secret in a NEXT_PUBLIC_ variable");

  const provider = process.env.STUDIO_AGENT_PROVIDER?.trim();
  if (process.env.STUDIO_ALLOW_TEST_PROVIDER?.trim() || provider === "fixture") {
    fail("Test provider off", "unset STUDIO_AGENT_PROVIDER=fixture and STUDIO_ALLOW_TEST_PROVIDER");
  } else if (provider && provider !== "anthropic") {
    fail("Agent provider", `unknown STUDIO_AGENT_PROVIDER "${provider}"`);
  } else {
    pass("Test provider off");
  }

  const timeout = process.env.STUDIO_AGENT_TIMEOUT_MS?.trim();
  if (timeout && !(Number(timeout) >= 10_000 && Number(timeout) <= 110_000)) {
    fail("Agent timeout", `STUDIO_AGENT_TIMEOUT_MS=${timeout} is outside 10000–110000 and will be clamped`);
  }
}

async function checkSupabase() {
  const anonHeaders = headersFor(config.anonKey);

  const settings = await request(`${config.url}/auth/v1/settings`, { headers: anonHeaders });
  if (!settings.ok) {
    fail("Supabase reachable", settings.error);
    return;
  }
  pass("Supabase reachable");
  if (settings.body?.disable_signup === true) pass("Public sign-up disabled");
  else fail("Public sign-up disabled", "turn off “Allow new users to sign up” under Authentication → Sign In / Providers");
  if (settings.body?.external?.email === true) pass("Email sign-in enabled");
  else fail("Email sign-in enabled", "enable the Email provider");

  // Signed out, every table and function must refuse.
  const table = await request(`${config.url}/rest/v1/clients?select=id&limit=1`, { headers: anonHeaders });
  if (table.status === 404 || table.body?.code === "PGRST205") fail("Migrations applied", "table public.clients does not exist");
  else if (!table.ok && (table.body?.code === "42501" || table.status === 401)) pass("Signed-out table reads refused");
  else fail("Signed-out table reads refused", `got HTTP ${table.status}`);

  // Website inquiries hold what visitors wrote: never readable signed out.
  const inquiries = await request(`${config.url}/rest/v1/inquiries?select=id&limit=1`, { headers: anonHeaders });
  if (inquiries.status === 404 || inquiries.body?.code === "PGRST205") fail("Migrations applied", "table public.inquiries does not exist");
  else if (!inquiries.ok && (inquiries.body?.code === "42501" || inquiries.status === 401)) pass("Signed-out inquiry reads refused");
  else fail("Signed-out inquiry reads refused", `got HTTP ${inquiries.status}`);

  const rpc = await request(`${config.url}/rest/v1/rpc/my_studios`, { method: "POST", headers: { ...anonHeaders, "content-type": "application/json" }, body: "{}" });
  if (rpc.body?.code === "PGRST202") fail("Migrations applied", "function my_studios does not exist");
  else if (!rpc.ok && (rpc.body?.code === "42501" || rpc.status === 401)) pass("Signed-out function calls refused");
  else fail("Signed-out function calls refused", `got HTTP ${rpc.status}`);

  if (config.serviceKey) {
    await checkTables(headersFor(config.serviceKey), "service role");
    return;
  }
  await checkTestAccounts(anonHeaders);
}

async function checkTables(headers, as) {
  const missing = [];
  for (const name of TABLES) {
    const response = await request(`${config.url}/rest/v1/${name}?select=*&limit=0`, { headers });
    // The service role may read only the agent tables; "permission denied" still means the table exists.
    if (!response.ok && response.body?.code !== "42501") missing.push(`${name} (HTTP ${response.status})`);
  }
  if (missing.length) fail("Tables present", missing.join(", "));
  else pass("Tables present", `${TABLES.length} tables, as ${as}`);
}

/**
 * Without the service role key: sign in to the smoke test accounts, check the
 * tables and functions as the owner account, and sign out again. Function
 * calls target a random studio nobody belongs to, so each is refused before
 * it can write anything.
 */
async function checkTestAccounts(anonHeaders) {
  const accounts = config.smokeAccounts;
  const roles = ["owner", "viewer", "outsider"];
  if (!roles.every((role) => accounts[role] && accounts[`${role}Password`])) {
    skip("Test accounts", "STAGING_SMOKE_*_EMAIL and passwords are not all set; tables and functions not checked");
    return;
  }
  const tokens = {};
  for (const role of roles) {
    const response = await request(`${config.url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { ...anonHeaders, "content-type": "application/json" },
      body: JSON.stringify({ email: accounts[role], password: accounts[`${role}Password`] }),
    });
    if (response.ok && response.body?.access_token) {
      tokens[role] = response.body.access_token;
      pass(`Test account signs in: ${role}`);
    } else {
      fail(`Test account signs in: ${role}`, response.body?.error_code ?? response.body?.msg ?? `HTTP ${response.status}`);
    }
  }
  const owner = tokens.owner;
  if (owner) {
    const headers = { apikey: config.anonKey, authorization: `Bearer ${owner}` };
    await checkTables(headers, "the owner test account");
    const nobody = crypto.randomUUID();
    const calls = {
      my_studios: {},
      load_studio: { p_studio: nobody },
      apply_changes: { p_studio: nobody, p_changes: {} },
      apply_onboarding_changes: { p_studio: nobody, p_changes: {}, p_onboarding: {} },
      import_browser_data: { p_studio: nobody, p_hash: "staging-check", p_data: {} },
    };
    const problems = [];
    for (const [name, args] of Object.entries(calls)) {
      const response = await request(`${config.url}/rest/v1/rpc/${name}`, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify(args),
      });
      const expected = name === "my_studios" ? response.ok : response.body?.code === "42501";
      if (response.body?.code === "PGRST202") problems.push(`${name} missing`);
      else if (!expected) problems.push(`${name} (HTTP ${response.status}${response.body?.code ? `, ${response.body.code}` : ""})`);
    }
    if (problems.length) fail("Functions present and refusing other studios", problems.join(", "));
    else pass("Functions present and refusing other studios", `${Object.keys(calls).length} functions`);
  }
  for (const token of Object.values(tokens)) {
    await request(`${config.url}/auth/v1/logout`, { method: "POST", headers: { apikey: config.anonKey, authorization: `Bearer ${token}` } });
  }
}

async function checkDatabase() {
  let pg;
  try {
    pg = (await import("pg")).default;
  } catch {
    skip("Database checks", "the pg package is not installed (npm ci)");
    return;
  }
  const db = new pg.Client({ connectionString: config.databaseUrl, ssl: isLocalUrl(config.databaseUrl.replace(/^postgres(ql)?:/, "http:")) ? false : { rejectUnauthorized: false } });
  try {
    await db.connect();
  } catch (error) {
    fail("Database reachable", error.code ?? "connection failed");
    return;
  }
  try {
    pass("Database reachable");
    const local = readdirSync(path.join(root, "supabase", "migrations")).filter((f) => f.endsWith(".sql")).map((f) => f.split("_")[0]).sort();
    const applied = await db
      .query("select version from supabase_migrations.schema_migrations order by version")
      .then((r) => r.rows.map((row) => row.version))
      .catch(() => []);
    const notApplied = local.filter((v) => !applied.includes(v));
    const unknown = applied.filter((v) => !local.includes(v));
    if (notApplied.length) fail("Migrations applied", `not applied: ${notApplied.join(", ")}`);
    else if (unknown.length) fail("Migrations applied", `applied but not in this repository: ${unknown.join(", ")}`);
    else pass("Migrations applied", `${local.length} of ${local.length}`);

    const noRls = await db.query(
      "select c.relname from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and not c.relrowsecurity order by 1",
    );
    if (noRls.rows.length) fail("Row-level security on every table", noRls.rows.map((r) => r.relname).join(", "));
    else pass("Row-level security on every table");

    const anonGrants = await db.query(
      "select distinct table_name from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public' order by 1",
    );
    if (anonGrants.rows.length) fail("No table access when signed out", anonGrants.rows.map((r) => r.table_name).join(", "));
    else pass("No table access when signed out");

    const deletes = await db.query(
      "select distinct table_name from information_schema.role_table_grants where grantee = 'authenticated' and table_schema = 'public' and privilege_type in ('DELETE', 'TRUNCATE') order by 1",
    );
    if (deletes.rows.length) fail("People cannot delete rows", deletes.rows.map((r) => r.table_name).join(", "));
    else pass("People cannot delete rows");

    const anonFunctions = await db.query(
      `select p.proname from pg_proc p where p.pronamespace = 'public'::regnamespace and has_function_privilege('anon', p.oid, 'execute')
         and p.proname = any($1) order by 1`,
      [FUNCTIONS],
    );
    if (anonFunctions.rows.length) fail("No functions callable when signed out", anonFunctions.rows.map((r) => r.proname).join(", "));
    else pass("No functions callable when signed out");

    // What the agent runner does with the service role (src/server/agents/supabase-intake-store.ts).
    const runner = await db.query(
      `select need from (values
         ('agent_runs', 'select', null), ('agent_runs', 'insert', null), ('agent_runs', 'update', 'status'),
         ('agent_runs', 'update', 'finished_at'), ('agent_proposals', 'select', null), ('agent_proposals', 'insert', null),
         ('agent_proposals', 'update', 'status'), ('activity_events', 'insert', null), ('clients', 'select', 'studio_id')
       ) as v(t, privilege, col), lateral (select t || ' ' || privilege || coalesce(' ' || col, '') as need) n
       where not case when col is null then has_table_privilege('service_role', 'public.' || t, privilege)
                      else has_column_privilege('service_role', 'public.' || t, col, privilege) end`,
    );
    if (runner.rows.length) fail("Agent runner can record runs", `service_role lacks: ${runner.rows.map((r) => r.need).join(", ")}`);
    else pass("Agent runner can record runs");

    // Inquiries arrive only through receive_inquiry(), called by /api/inquiries with the service role.
    const receive = await db.query(
      `select has_function_privilege('service_role', 'public.receive_inquiry(uuid, jsonb, text, text)', 'execute') as service,
              has_function_privilege('authenticated', 'public.receive_inquiry(uuid, jsonb, text, text)', 'execute') as people,
              has_function_privilege('anon', 'public.receive_inquiry(uuid, jsonb, text, text)', 'execute') as visitors`,
    ).catch(() => null);
    const row = receive?.rows[0];
    if (!row) fail("Inquiries are received only by the server", "function receive_inquiry does not exist");
    else if (!row.service || row.people || row.visitors) fail("Inquiries are received only by the server", "receive_inquiry must be executable by service_role only");
    else pass("Inquiries are received only by the server");
  } finally {
    await db.end();
  }
}

async function checkAnthropic() {
  if (!config.anthropicKey) {
    skip("Anthropic", "STAGING_ANTHROPIC_API_KEY is not set; analysis will be unavailable");
    return;
  }
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: config.anthropicKey, baseURL: ANTHROPIC_API_URL, maxRetries: 1, timeout: 20_000 });
  try {
    const model = await client.models.retrieve(config.model);
    pass("Anthropic key and model", model.id);
  } catch (error) {
    const status = error?.status;
    if (status === 401 || status === 403) fail("Anthropic key and model", "the key was rejected");
    else if (status === 404) fail("Anthropic key and model", `model ${config.model} is not available to this key`);
    else fail("Anthropic key and model", status ? `HTTP ${status}` : "the API could not be reached (check the network policy)");
  }
}

/** The project ref of a supabase.co URL. Not a secret: it is part of the public URL. */
function projectRef(url) {
  const match = /^([a-z0-9]+)\.supabase\.co$/.exec(new URL(url).hostname);
  return match ? match[1] : null;
}

function headersFor(key) {
  // Legacy keys are JWTs and also go in Authorization; new keys go in apikey only.
  return key.startsWith("sb_") ? { apikey: key } : { apikey: key, authorization: `Bearer ${key}` };
}

async function request(url, init) {
  try {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
    const text = await response.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      // not JSON
    }
    return { ok: response.ok, status: response.status, body };
  } catch (error) {
    const reason = error?.cause?.code || error?.cause?.message || error?.message || "request failed";
    // Node's fetch ignores HTTPS_PROXY unless told to use it.
    const proxyHint = (process.env.HTTPS_PROXY || process.env.https_proxy) && process.env.NODE_USE_ENV_PROXY !== "1"
      ? " (HTTPS_PROXY is set but Node ignores it: rerun with NODE_USE_ENV_PROXY=1)"
      : "";
    return { ok: false, status: 0, body: null, error: `${reason}${proxyHint}` };
  }
}

function report() {
  const mark = { pass: "✓", fail: "✗", skip: "–" };
  for (const r of results) console.log(`${mark[r.status]} ${r.label}${r.detail ? `: ${r.detail}` : ""}`);
  const failed = results.filter((r) => r.status === "fail").length;
  console.log(failed ? `\n${failed} check(s) failed.` : "\nAll checks passed.");
  process.exit(failed ? 1 : 0);
}
