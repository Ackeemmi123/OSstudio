#!/usr/bin/env node
/**
 * TEMPORARY: measures public.load_studio on the runner's throwaway Supabase
 * stack. It TRUNCATES studios, so it refuses to run outside GitHub Actions or
 * against anything but localhost. Candidate fixes are applied inside a
 * transaction and rolled back; no migration is added.
 *
 *   node scripts/with-local-supabase.mjs node scripts/load-studio-probe.mjs
 *
 * Runs in place of `npm run test:db` on the temporary branch, and exits 1 on
 * purpose so the rest of the job does not run against the emptied database.
 */
import { appendFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

const DB = process.env.STAGING_DATABASE_URL ?? "";
const API = process.env.SUPABASE_URL ?? "";
if (process.env.GITHUB_ACTIONS !== "true") throw new Error("Only runs in GitHub Actions.");
if (!/@(127\.0\.0\.1|localhost):/.test(DB) || !/^http:\/\/(127\.0\.0\.1|localhost)/.test(API)) throw new Error("Only runs against the local stack.");

const STATEMENT_TIMEOUT_MS = 120_000;
const DEADLINE = performance.now() + 20 * 60_000; // the job's limit is 30 minutes
const TIME_BUDGET_MS = 15_000; // keeps repeating a measurement until this is spent, at least once

const out = [];
const say = (line = "") => { out.push(line); console.log(line); };
const flush = () => { if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, out.splice(0).join("\n") + "\n"); };
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const ms = (x) => (x == null ? "n/a" : x >= 100 ? x.toFixed(0) : x.toFixed(1));

const admin = createClient(API, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = createClient(API, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const email = `probe-${Date.now()}@example.test`;
const password = randomBytes(18).toString("base64url");
const { data: created, error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (createError) throw createError;
const userId = created.user.id;
const { error: signInError } = await anon.auth.signInWithPassword({ email, password });
if (signInError) throw signInError;

// Shaped like a real token's claims: auth.uid() parses this on every call.
const claims = JSON.stringify({
  aud: "authenticated", exp: 4102444800, iat: 1700000000, iss: `${API}/auth/v1`, sub: userId, email, phone: "", role: "authenticated", aal: "aal1",
  app_metadata: { provider: "email", providers: ["email"] }, user_metadata: { email, email_verified: true, phone_verified: false, sub: userId },
  amr: [{ method: "password", timestamp: 1700000000 }], session_id: "00000000-0000-4000-8000-000000000000", is_anonymous: false,
});

async function connect() {
  const db = new pg.Client({ connectionString: DB });
  await db.connect();
  await db.query(`set statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
  await db.query("select set_config('request.jwt.claims', $1, false)", [claims]);
  return db;
}

async function timed(db, sql, params = []) {
  const start = performance.now();
  await db.query(sql, params);
  return performance.now() - start;
}

/** Cold first call, then the median of repeats until the budget is spent. */
async function measure(db, sql, params = []) {
  try {
    const cold = await timed(db, sql, params);
    if (cold > TIME_BUDGET_MS) return { cold, med: cold, n: 1 };
    const runs = [];
    const until = performance.now() + TIME_BUDGET_MS;
    while (runs.length < 2 || (runs.length < 7 && performance.now() + cold < until)) {
      runs.push(await timed(db, sql, params));
    }
    return { cold, med: median(runs), n: runs.length };
  } catch (error) {
    return { cold: null, med: null, n: 0, error: error.code ?? error.message };
  }
}

const LOAD = "select length(public.load_studio($1)::text)";
const HUMAN = (uid) => JSON.stringify({ kind: "human", name: "Probe Person", userId: uid });

async function reset(db) {
  await db.query("truncate public.studios cascade");
}

/** C live clients plus one anonymised per 12, and P/T/E rows spread across them. */
async function seed(db, { C, P, T, E, X }) {
  await reset(db);
  const human = HUMAN(userId);
  const studio = (await db.query("insert into public.studios (name) values ('Probe') returning id")).rows[0].id;
  await db.query("insert into public.studio_members (studio_id, user_id, display_name, role) values ($1, $2, 'Probe Person', 'owner')", [studio, userId]);
  const gone = Math.ceil(C / 12);
  await db.query(
    `insert into public.clients (id, studio_id, name, status, archived_at, became_customer_at, anonymised_at, created_at, updated_at, source_received_at)
     select gen_random_uuid(), $1::uuid,
            case when i > $2::int then 'Former client' else 'Client ' || i end,
            (case when i > $2::int or i % 10 = 0 then 'archived' else 'active' end)::public.client_status,
            case when i > $2::int or i % 10 = 0 then now() - interval '3 days' end,
            case when i % 8 = 0 then now() - interval '30 days' end,
            case when i > $2::int then now() - interval '1 day' end,
            now() - make_interval(hours => i), now(), now()
       from generate_series(1, $2::int + $3::int) i`,
    [studio, C, gone],
  );
  await db.query(
    `insert into public.client_context_fields (studio_id, client_id, field_key)
     select $1::uuid, c.id, k from public.clients c, unnest(array['industry', 'offering', 'salesChannels', 'platform', 'storeUrl', 'integrations', 'goal', 'targetAudience', 'challenges', 'outcomes', 'requirements', 'designPreferences', 'content', 'technicalConstraints', 'existingMaterials', 'budget', 'deadline', 'dependencies']) k where c.studio_id = $1::uuid`,
    [studio],
  );
  await db.query(
    `insert into public.projects (id, studio_id, client_id, name, project_type, created_at, updated_at)
     select gen_random_uuid(), $1::uuid, ids[1 + (i % array_length(ids, 1))], 'Project ' || i, 'website'::public.project_type, now() - make_interval(mins => i), now()
       from generate_series(1, $2::int) i, (select array_agg(id order by id) ids from public.clients where studio_id = $1::uuid) c`,
    [studio, P],
  );
  await db.query(
    `insert into public.tasks (id, studio_id, project_id, title, created_at, updated_at)
     select gen_random_uuid(), $1::uuid, ids[1 + (i % array_length(ids, 1))], 'Task ' || i, now() - make_interval(secs => i), now()
       from generate_series(1, $2::int) i, (select array_agg(id order by id) ids from public.projects where studio_id = $1::uuid) p`,
    [studio, T],
  );
  // Events on all three kinds of record, by people (8 in 10), agents and nobody.
  await db.query(
    `with entities as (
       select 'client'::public.entity_type t, id from public.clients where studio_id = $1::uuid
       union all select 'project', id from public.projects where studio_id = $1::uuid
       union all select 'task', id from public.tasks where studio_id = $1::uuid),
     numbered as (select t, id, row_number() over (order by random()) - 1 n, count(*) over () total from entities)
     insert into public.activity_events (id, studio_id, entity_type, entity_id, event_type, description, actor, "timestamp", recorded_at)
     select gen_random_uuid(), $1::uuid, e.t, e.id, 'client.updated', 'Probe event ' || i,
            case i % 10 when 8 then '{"kind":"agent","agentId":"research"}'::jsonb when 9 then null else $3::jsonb end,
            now() - make_interval(secs => i), now() - make_interval(secs => i)
       from generate_series(1, $2::int) i join numbered e on e.n = i % e.total`,
    [studio, E, human],
  );
  // A hold and a release on the first client, so the release's 30 days count.
  await db.query(
    `insert into public.client_retention_holds (studio_id, client_id, action, reason, actor, created_at)
     select $1::uuid, c.id, a, 'Probe', $2::jsonb, now() - interval '2 days'
       from (select id from public.clients where studio_id = $1::uuid and anonymised_at is null order by created_at limit 1) c, unnest(array['hold', 'release']) a`,
    [studio, human],
  );
  // Another studio's events: what the current client_last_activity also reads.
  if (X > 0) {
    const other = (await db.query("insert into public.studios (name) values ('Other') returning id")).rows[0].id;
    const client = (await db.query(
      "insert into public.clients (id, studio_id, name, status) values (gen_random_uuid(), $1, 'Other client', 'active') returning id",
      [other],
    )).rows[0].id;
    await db.query(
      `insert into public.activity_events (id, studio_id, entity_type, entity_id, event_type, description, actor, "timestamp", recorded_at)
       select gen_random_uuid(), $1::uuid, 'client'::public.entity_type, $2::uuid, 'client.updated', 'Other event ' || i, $4::jsonb, now() - make_interval(secs => i), now() - make_interval(secs => i)
         from generate_series(1, $3::int) i`,
      [other, client, X, human],
    );
  }
  return studio;
}

const asPerson = (db) => db.query("set role authenticated");
const asOwner = (db) => db.query("reset role");

/** Each key of load_studio on its own, as the signed-in person. */
const PARTS = {
  members: `select coalesce(jsonb_agg(jsonb_build_object('userId', m.user_id, 'displayName', m.display_name, 'role', m.role) order by m.created_at), '[]') from public.studio_members m where m.studio_id = $1`,
  clients: `select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at desc), '[]') from public.clients c where c.studio_id = $1 and c.anonymised_at is null`,
  context_fields: `select coalesce(jsonb_agg(to_jsonb(f)), '[]') from public.client_context_fields f where f.studio_id = $1`,
  projects: `select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at desc), '[]') from public.projects p where p.studio_id = $1 and not private.client_is_anonymised(p.client_id)`,
  tasks: `select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]') from public.tasks t where t.studio_id = $1 and not private.client_is_anonymised(private.entity_client('project', t.project_id))`,
  activity: `select coalesce(jsonb_agg(to_jsonb(e) order by e."timestamp" desc), '[]') from (select * from public.activity_events a where a.studio_id = $1 and not private.client_is_anonymised(private.entity_client(a.entity_type, a.entity_id)) order by "timestamp" desc limit 2000) e`,
  retention_holds: `select coalesce(jsonb_agg(to_jsonb(h) order by h.created_at), '[]') from public.client_retention_holds h where h.studio_id = $1 and not private.client_is_anonymised(h.client_id)`,
  "retention (whole key)": `select coalesce(jsonb_agg(jsonb_build_object('clientId', c.id, 'customer', c.became_customer_at is not null, 'lastActivityAt', private.client_last_activity(c.id), 'endsAt', private.client_retention_ends(c))), '[]') from public.clients c where c.studio_id = $1 and c.anonymised_at is null`,
  "retention: last_activity only": `select count(private.client_last_activity(c.id)) from public.clients c where c.studio_id = $1 and c.anonymised_at is null`,
  "retention: ends only": `select count(private.client_retention_ends(c)) from public.clients c where c.studio_id = $1 and c.anonymised_at is null`,
};

// The body of client_last_activity, for its plan. force_generic_plan matches
// how a SQL function plans: without knowing the client.
const LAST_ACTIVITY_V0 = `select greatest(
  (select created_at from public.clients where id = $1),
  (select max(least(e."timestamp", e.recorded_at)) from public.activity_events e
    where e.actor ->> 'kind' = 'human'
      and ((e.entity_type = 'client' and e.entity_id = $1)
        or (e.entity_type = 'project' and e.entity_id in (select id from public.projects where client_id = $1))
        or (e.entity_type = 'task' and e.entity_id in (
              select t.id from public.tasks t join public.projects p on p.id = t.project_id where p.client_id = $1)))))`;
const LAST_ACTIVITY_V1 = `select greatest(
  (select created_at from public.clients where id = $1),
  (select max(least(e."timestamp", e.recorded_at)) from public.activity_events e
    where e.actor ->> 'kind' = 'human'
      and (e.entity_type, e.entity_id) in (
        select 'client'::public.entity_type, $1
        union all select 'project', id from public.projects where client_id = $1
        union all select 'task', t.id from public.tasks t join public.projects p on p.id = t.project_id where p.client_id = $1)))`;

async function explain(db, name, sql, client) {
  await db.query("set plan_cache_mode = force_generic_plan");
  await db.query(`prepare ${name}(uuid) as ${sql}`);
  const plan = await db.query(`explain (analyze, buffers, costs off, summary on) execute ${name}('${client}')`);
  await db.query(`deallocate ${name}`);
  await db.query("reset plan_cache_mode");
  say("```");
  plan.rows.forEach((r) => say(r["QUERY PLAN"]));
  say("```");
}

/* Candidate fixes, cumulative. Each is SQL run inside a rolled-back transaction. */

const V1 = `create or replace function private.client_last_activity(p_client uuid) returns timestamptz
  language sql stable set search_path = '' as $fn$ ${LAST_ACTIVITY_V1.replaceAll("$1", "p_client")} $fn$;`;

const V2 = `
create function private.retention_end_from(p_client public.clients, p_last_activity timestamptz, p_released timestamptz) returns timestamptz
  language sql stable set search_path = '' as $fn$
    select case when p_client.anonymised_at is null and p_client.retention_hold_reason is null then
      greatest(
        case when p_client.became_customer_at is null
             then p_last_activity + interval '12 months'
             else least(p_client.archived_at, p_last_activity + interval '12 months') + interval '3 years' end,
        p_released + interval '30 days')
    end $fn$;
grant execute on function private.retention_end_from(public.clients, timestamptz, timestamptz) to authenticated;
create function private.studio_retention(p_studio uuid) returns jsonb
  language sql stable set search_path = '' as $fn$
    with entities as (
      select 'client'::public.entity_type as entity_type, id as entity_id, id as client_id from public.clients where studio_id = p_studio
      union all select 'project', id, client_id from public.projects where studio_id = p_studio
      union all select 'task', t.id, p.client_id from public.tasks t join public.projects p on p.id = t.project_id where t.studio_id = p_studio
    ), activity as (
      select en.client_id, max(least(e."timestamp", e.recorded_at)) as at
        from public.activity_events e join entities en on en.entity_type = e.entity_type and en.entity_id = e.entity_id
       where e.studio_id = p_studio and e.actor ->> 'kind' = 'human'
       group by en.client_id
    ), released as (
      select client_id, max(created_at) as at from public.client_retention_holds
       where studio_id = p_studio and action = 'release' group by client_id
    )
    select coalesce(jsonb_agg(jsonb_build_object(
             'clientId', c.id, 'customer', c.became_customer_at is not null,
             'lastActivityAt', greatest(c.created_at, a.at),
             'endsAt', private.retention_end_from(c, greatest(c.created_at, a.at), r.at))), '[]')
      from public.clients c
      left join activity a on a.client_id = c.id
      left join released r on r.client_id = c.id
     where c.studio_id = p_studio and c.anonymised_at is null
  $fn$;
grant execute on function private.studio_retention(uuid) to authenticated;`;

const V4 = `
create function private.my_studios() returns setof uuid
  language sql stable security definer set search_path = '' as $fn$
    select studio_id from public.studio_members where user_id = (select auth.uid()) $fn$;
grant execute on function private.my_studios() to authenticated;
do $do$
declare r record;
begin
  for r in select tablename from pg_policies
            where schemaname = 'public' and policyname = 'members read' and qual like '%is_member(studio_id)%' and tablename <> 'studio_members' loop
    execute format('alter policy "members read" on public.%I using (studio_id in (select private.my_studios()))', r.tablename);
  end loop;
end $do$;`;

function swap(text, from, to) {
  const next = text.replace(from, () => to);
  if (next === text) throw new Error(`Fragment not found in load_studio: ${from}`);
  return next;
}

function loadStudioV2(def) {
  return swap(def, /'retention', \(select[\s\S]*?c\.anonymised_at is null\),(\s*)'retention_holds'/, `'retention', private.studio_retention(p_studio),\n      'retention_holds'`);
}

// The anonymised filter from lists read once, so scans keep the index order
// and the LIMIT, instead of a helper call on every row.
function loadStudioV3(def) {
  let d = loadStudioV2(def);
  d = swap(d, "begin\n    if not private.is_member(p_studio)", `declare
    v_gone uuid[]; v_gone_projects uuid[]; v_gone_tasks uuid[];
  begin
    if not private.is_member(p_studio)`);
  d = swap(d, "return jsonb_build_object(", `select coalesce(array_agg(id), '{}') into v_gone from public.clients where studio_id = p_studio and anonymised_at is not null;
    select coalesce(array_agg(id), '{}') into v_gone_projects from public.projects where studio_id = p_studio and client_id = any (v_gone);
    select coalesce(array_agg(id), '{}') into v_gone_tasks from public.tasks where studio_id = p_studio and project_id = any (v_gone_projects);
    return jsonb_build_object(`);
  d = swap(d, "not private.client_is_anonymised(p.client_id)", "p.client_id <> all (v_gone)");
  d = swap(d, "not private.client_is_anonymised(private.entity_client('project', t.project_id))", "t.project_id <> all (v_gone_projects)");
  d = swap(d, "not private.client_is_anonymised(private.entity_client(a.entity_type, a.entity_id))", "a.entity_id <> all (v_gone || v_gone_projects || v_gone_tasks)");
  d = swap(d, "not private.client_is_anonymised(client_id)", "client_id <> all (v_gone)");
  d = swap(d, "not private.client_is_anonymised(h.client_id)", "h.client_id <> all (v_gone)");
  return d;
}

/** Comparable output: retention has no defined order. */
function canonical(load) {
  const copy = { ...load, retention: [...load.retention].sort((a, b) => a.clientId.localeCompare(b.clientId)) };
  return JSON.stringify(copy);
}

async function compareVariants(label, spec, def) {
  const db = await connect();
  const studio = await seed(db, spec);
  await db.query("analyze");
  await asPerson(db);
  await db.query("set statement_timeout = 600000");
  const started = performance.now();
  const base = (await db.query("select public.load_studio($1) as r", [studio])).rows[0].r;
  const once = performance.now() - started;
  await db.query(`set statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
  const baseTime = once > TIME_BUDGET_MS ? { cold: once, med: once, n: 1 } : await measure(db, LOAD, [studio]);
  await asOwner(db);

  say(`\n### Candidate fixes on ${label}: C=${spec.C} P=${spec.P} T=${spec.T} E=${spec.E} other-studio events=${spec.X}\n`);
  say("| Variant | Cold ms | Median ms | Runs | Same output as today |");
  say("|---|---|---|---|---|");
  say(`| V0 today | ${ms(baseTime.cold)} | ${ms(baseTime.med)} | ${baseTime.n} | n/a |`);

  const variants = [
    ["V1 (repeat)", [V1]],
    ["V4 alone", [V4]],
    ["V1 + V4", [V1, V4]],
    ["V1 + V2 + V3 + V4 (repeat)", [V1, V2, loadStudioV3(def), V4]],
  ];
  for (const [name, statements] of variants) {
    try {
      await db.query("begin");
      for (const s of statements) await db.query(s);
      await db.query("set local role authenticated");
      const result = await measure(db, LOAD, [studio]);
      const load = (await db.query("select public.load_studio($1) as r", [studio])).rows[0].r;
      const same = canonical(load) === canonical(base);
      say(`| ${name} | ${ms(result.cold)} | ${ms(result.med)} | ${result.n} | ${same ? "yes" : "NO"} |`);
      if (!same) {
        const [a, b] = [JSON.parse(canonical(base)), JSON.parse(canonical(load))];
        const diff = Object.keys(a).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
        say(`| differing keys | ${diff.join(", ")} | | | |`);
      }
    } catch (error) {
      say(`| ${name} | failed: ${String(error.message).replaceAll("|", "/").slice(0, 200)} | | | |`);
    } finally {
      await db.query("rollback");
    }
  }

  // The retention job calls the same function as the table owner.
  await db.query("begin");
  await db.query(V1);
  await db.query(V4);
  await db.query("set local role authenticated");
  const client = (await db.query("select id from public.clients where studio_id = $1 and anonymised_at is null order by created_at limit 1", [studio])).rows[0].id;
  say(`\nPlan of client_last_activity with V1 + V4 (${label}):\n`);
  await explain(db, "v1", LAST_ACTIVITY_V1, client);
  await db.query("rollback");
  await db.end();
}

/* ---------------------------------------------------------------------- */

const REFERENCE = { C: 24, P: 9, T: 70, E: 140, X: 0 };
const BIG = { C: 100, P: 40, T: 300, E: 2000, X: 1000 };

say("# load_studio probe\n");
const setup = await connect();
for (const table of ["studio_members", "clients", "client_context_fields", "projects", "tasks", "activity_events", "client_retention_holds"]) {
  await setup.query(`alter table public.${table} disable trigger user`);
}
say(`- ${(await setup.query("select version()")).rows[0].version}`);
say(`- role settings: ${JSON.stringify((await setup.query("select rolname, rolconfig from pg_roles where rolname in ('authenticated', 'anon', 'authenticator', 'postgres')")).rows)}`);
say(`- postgres: bypassrls=${(await setup.query("select rolbypassrls from pg_roles where rolname = 'postgres'")).rows[0].rolbypassrls}`);
const def = (await setup.query("select pg_get_functiondef('public.load_studio(uuid)'::regprocedure) as d")).rows[0].d;

// 3. Candidate fixes, with the output checked against today's.
await compareVariants("reference size", REFERENCE, def);
flush();
await compareVariants("large studio", BIG, def);
flush();
await compareVariants("large studio past the limit", { C: 24, P: 9, T: 70, E: 8960, X: 0 }, def);
flush();

await compareVariants("other studios' events", { C: 24, P: 9, T: 70, E: 140, X: 8000 }, def);
flush();
flush();
console.log("Finished. Exiting 1 on purpose: the rest of this job must not run on the emptied database.");
process.exit(1);
