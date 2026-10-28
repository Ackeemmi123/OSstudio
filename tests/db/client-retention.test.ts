/**
 * Client retention against a local Supabase stack: what counts as client
 * activity, the two clocks (never a customer, former customer), owner holds
 * and their log, that anonymising reaches every place a client's details
 * live (directly or indirectly), that nothing else changes, that a run is
 * safe to retry, and that only the database owner can run it.
 *
 * Clients are made the way the app makes them, then "aged": every date of the
 * client and its history is moved back, the way it will look later. Every
 * value is invented.
 */
import { createHash, randomUUID } from "node:crypto";
import type pg from "pg";
import { beforeAll, describe, expect, it } from "vitest";
import type { SupabaseRepository } from "@/lib/data/supabase-repository";
import { examplePayload } from "@/lib/inquiries/test-helpers";
import { addMember, admin, anonClient, asDatabaseOwner, createStudio, createUser, repositoryFor, type TestUser } from "./helpers";

let owner: TestUser;
let member: TestUser;
let viewer: TestUser;
let studio: string;

beforeAll(async () => {
  owner = await createUser("client-retention-owner");
  member = await createUser("client-retention-member");
  viewer = await createUser("client-retention-viewer");
  studio = await createStudio(owner, "Client retention test");
  await addMember(owner, studio, member, "member", "Sam Member");
  await addMember(owner, studio, viewer, "viewer", "Vera Viewer");
});

async function loaded(user: TestUser): Promise<SupabaseRepository> {
  const repository = repositoryFor(user, studio);
  await repository.load();
  return repository;
}

async function newClient(name = "Aged Client (test)"): Promise<string> {
  return (await (await loaded(owner)).createClient({ name })).id;
}

/** Moves every date of the client and its history back by a Postgres interval. */
async function age(clientId: string, interval: string): Promise<void> {
  await asDatabaseOwner(async (db) => {
    await db.query("begin");
    // Triggers off for this transaction only: the dates are rewritten, nothing else.
    await db.query("set local session_replication_role = replica");
    await db.query(
      `update public.clients set created_at = created_at - $2::interval, updated_at = updated_at - $2::interval,
         source_received_at = source_received_at - $2::interval, became_customer_at = became_customer_at - $2::interval,
         archived_at = archived_at - $2::interval where id = $1`,
      [clientId, interval],
    );
    await db.query(
      `update public.activity_events set "timestamp" = "timestamp" - $2::interval, recorded_at = recorded_at - $2::interval
         where private.entity_client(entity_type, entity_id) = $1`,
      [clientId, interval],
    );
    await db.query("update public.client_retention_holds set created_at = created_at - $2::interval where client_id = $1", [clientId, interval]);
    await db.query("commit");
  });
}

/** The client's last activity and retention date, as the database works them out. */
async function dates(clientId: string): Promise<{ last: Date; ends: Date | null }> {
  return asDatabaseOwner(async (db) =>
    (await db.query<{ last: Date; ends: Date | null }>(
      "select private.client_last_activity(c.id) as last, private.client_retention_ends(c) as ends from public.clients c where c.id = $1",
      [clientId],
    )).rows[0],
  );
}

const MONTH = 30 * 24 * 3600 * 1000;
function monthsFromNow(date: Date | null): number {
  return date ? (date.getTime() - Date.now()) / MONTH : NaN;
}

type Report = { dryRun: boolean; anonymised: { id: string; customer: boolean }[]; skipped?: string };
async function run(db: pg.Client, dryRun = false): Promise<Report> {
  return (await db.query<{ report: Report }>("select private.run_client_retention($1) as report", [dryRun])).rows[0].report;
}

async function clientRow(clientId: string): Promise<Record<string, unknown>> {
  return asDatabaseOwner(async (db) => (await db.query("select to_jsonb(c) as row from public.clients c where id = $1", [clientId])).rows[0].row);
}

function human(user: TestUser, name: string) {
  return { kind: "human", name, userId: user.id };
}

describe("what counts as client activity", () => {
  it("a person's change to the client, its projects or its tasks moves the date; agents, the system and holds do not", async () => {
    const id = await newClient();
    const project = await (await loaded(owner)).createProject(id, { name: "Website" });
    await age(id, "13 months");
    expect(monthsFromNow((await dates(id)).ends)).toBeLessThan(0);

    // The agent runner and the system record activity too. It does not count.
    for (const actor of [{ kind: "agent", agentId: "research" }, { kind: "system" }]) {
      const { error } = await admin.from("activity_events").insert({
        id: randomUUID(), studio_id: studio, entity_type: "client", entity_id: id, event_type: "agent.run_completed", description: "Analysis finished", actor,
      });
      expect(error).toBeNull();
    }
    // A hold and its release are logged separately and do not count either.
    expect((await owner.client.rpc("set_client_retention_hold", { p_studio: studio, p_client: id, p_reason: "Checking (test)", p_actor: human(owner, "Owner") })).error).toBeNull();
    expect((await owner.client.rpc("set_client_retention_hold", { p_studio: studio, p_client: id, p_reason: null, p_actor: human(owner, "Owner") })).error).toBeNull();
    const before = await dates(id);
    expect(monthsFromNow(before.last)).toBeLessThan(-12);

    // A person adding a task to the client's project does count.
    await (await loaded(member)).createTask(project.id, { title: "Collect photos" });
    const after = await dates(id);
    expect(Date.now() - after.last.getTime()).toBeLessThan(60_000);
    expect(monthsFromNow(after.ends)).toBeGreaterThan(11.5);
  });

  it("history imported later counts at its original date, never at the date it was stored", async () => {
    const id = await newClient();
    await age(id, "13 months");
    await asDatabaseOwner(async (db) => {
      await db.query("begin");
      await db.query("set local session_replication_role = replica");
      await db.query(
        `insert into public.activity_events (id, studio_id, entity_type, entity_id, event_type, description, actor, "timestamp", recorded_at)
         values (gen_random_uuid(), $1, 'client', $2, 'note.added', 'Imported note', '{"kind":"human","name":"Owner","imported":true}',
                 now() - interval '14 months', now())`,
        [studio, id],
      );
      await db.query("commit");
    });
    expect(monthsFromNow((await dates(id)).last)).toBeLessThan(-12);
  });
});

describe("the two clocks", () => {
  it("never a customer: 12 months after the last activity", async () => {
    const id = await newClient();
    await (await loaded(owner)).updateClient(id, { name: "Aged Client (test)", contactPerson: "", email: "", website: "", status: "onboarding", projectType: "" });
    await age(id, "11 months");
    expect(monthsFromNow((await dates(id)).ends)).toBeCloseTo(1, 0);
    expect((await clientRow(id)).became_customer_at).toBeNull();
  });

  it("a customer: 3 years after archiving, or after 12 months without activity, whichever comes first", async () => {
    const active = await newClient();
    const repository = await loaded(owner);
    await repository.updateClient(active, { name: "Aged Client (test)", contactPerson: "", email: "", website: "", status: "active", projectType: "" });
    expect((await clientRow(active)).became_customer_at).not.toBeNull();
    // Idle for 13 months: the relationship ended 1 month ago, so 35 months remain.
    await age(active, "13 months");
    expect(monthsFromNow((await dates(active)).ends)).toBeGreaterThan(34);
    expect(monthsFromNow((await dates(active)).ends)).toBeLessThan(36);

    const archived = await newClient();
    await (await loaded(owner)).updateClient(archived, { name: "Aged Client (test)", contactPerson: "", email: "", website: "", status: "active", projectType: "" });
    await (await loaded(owner)).updateClient(archived, { name: "Aged Client (test)", contactPerson: "", email: "", website: "", status: "archived", projectType: "" });
    const row = await clientRow(archived);
    expect(row.archived_at).not.toBeNull();
    // Archived today: 36 months from now.
    expect(monthsFromNow((await dates(archived)).ends)).toBeCloseTo(36.5, 0);

    // Reopening clears the archive date; becoming a customer stays.
    await (await loaded(owner)).updateClient(archived, { name: "Aged Client (test)", contactPerson: "", email: "", website: "", status: "on_hold", projectType: "" });
    const reopened = await clientRow(archived);
    expect(reopened.archived_at).toBeNull();
    expect(reopened.became_customer_at).toEqual(row.became_customer_at);
  });

  it("the run anonymises exactly the clients past their date, by either clock", async () => {
    const lead = await newClient();
    const leadYoung = await newClient();
    const customerArchived = await newClient();
    const customerArchivedYoung = await newClient();
    const customerIdle = await newClient();
    for (const id of [customerArchived, customerArchivedYoung, customerIdle]) {
      await (await loaded(owner)).updateClient(id, { name: "Aged Client (test)", contactPerson: "", email: "", website: "", status: "active", projectType: "" });
    }
    for (const id of [customerArchived, customerArchivedYoung]) {
      await (await loaded(owner)).updateClient(id, { name: "Aged Client (test)", contactPerson: "", email: "", website: "", status: "archived", projectType: "" });
    }
    await age(lead, "12 months 1 day");
    await age(leadYoung, "12 months -1 day");
    await age(customerArchived, "3 years 1 day");
    await age(customerArchivedYoung, "3 years -1 day");
    await age(customerIdle, "4 years 1 day");

    const ids = [lead, leadYoung, customerArchived, customerArchivedYoung, customerIdle];
    const due = [lead, customerArchived, customerIdle].sort();
    await asDatabaseOwner(async (db) => {
      const preview = await run(db, true);
      expect(preview.anonymised.filter((c) => ids.includes(c.id)).map((c) => c.id).sort()).toEqual(due);
      expect(preview.anonymised.find((c) => c.id === lead)?.customer).toBe(false);
      expect(preview.anonymised.find((c) => c.id === customerIdle)?.customer).toBe(true);
    });
    for (const id of ids) expect((await clientRow(id)).anonymised_at).toBeNull();

    await asDatabaseOwner(async (db) => {
      const report = await run(db);
      expect(report.anonymised.filter((c) => ids.includes(c.id)).map((c) => c.id).sort()).toEqual(due);
    });
    for (const id of ids) expect((await clientRow(id)).anonymised_at !== null).toBe(due.includes(id));
  });
});

describe("holds", () => {
  it("an owner pauses retention with a reason; every hold and release is logged; a release gives 30 days' notice", async () => {
    const id = await newClient();
    await age(id, "2 years");
    expect(monthsFromNow((await dates(id)).ends)).toBeLessThan(0);

    const hold = await owner.client.rpc("set_client_retention_hold", {
      p_studio: studio, p_client: id, p_reason: "Open invoice dispute (test)", p_actor: human(owner, "Owner"),
    });
    expect(hold.error).toBeNull();
    expect((await dates(id)).ends).toBeNull();
    await asDatabaseOwner(async (db) => {
      expect((await run(db, true)).anonymised.map((c) => c.id)).not.toContain(id);
      await expect(db.query("select private.anonymise_client($1, true)", [id])).rejects.toThrow(/on a retention hold/);
    });

    const release = await owner.client.rpc("set_client_retention_hold", { p_studio: studio, p_client: id, p_reason: null, p_actor: human(owner, "Owner") });
    expect(release.error).toBeNull();
    // Past its date, but never sooner than 30 days after the release.
    expect(monthsFromNow((await dates(id)).ends)).toBeCloseTo(1, 0);

    const { data: log } = await member.client.from("client_retention_holds").select("action, reason, actor").eq("client_id", id).order("created_at");
    expect(log).toEqual([
      { action: "hold", reason: "Open invoice dispute (test)", actor: human(owner, "Owner") },
      { action: "release", reason: null, actor: human(owner, "Owner") },
    ]);
  });

  it("only an owner, in their own name, through the function; the log cannot be written or changed", async () => {
    const id = await newClient();
    for (const user of [member, viewer]) {
      const { error } = await user.client.rpc("set_client_retention_hold", { p_studio: studio, p_client: id, p_reason: "Hold (test)", p_actor: human(user, "Someone") });
      expect(error).toMatchObject({ code: "42501" });
    }
    const forged = await owner.client.rpc("set_client_retention_hold", { p_studio: studio, p_client: id, p_reason: "Hold (test)", p_actor: human(member, "Sam Member") });
    expect(forged.error).toMatchObject({ code: "42501" });
    expect((await anonClient().rpc("set_client_retention_hold", { p_studio: studio, p_client: id, p_reason: "Hold (test)", p_actor: { kind: "system" } })).error).not.toBeNull();
    const releaseNothing = await owner.client.rpc("set_client_retention_hold", { p_studio: studio, p_client: id, p_reason: null, p_actor: human(owner, "Owner") });
    expect(releaseNothing.error).toMatchObject({ code: "SO409" });

    // The retention columns cannot be written directly, whatever the role.
    for (const client of [owner.client, admin]) {
      await client.from("clients").update({ retention_hold_reason: "Forged", retention_hold_by: { kind: "system" }, retention_held_at: new Date().toISOString(),
        became_customer_at: "2000-01-01T00:00:00Z", anonymised_at: "2000-01-01T00:00:00Z" }).eq("id", id);
    }
    const row = await clientRow(id);
    expect([row.retention_hold_reason, row.retention_hold_by, row.retention_held_at, row.became_customer_at, row.anonymised_at]).toEqual([null, null, null, null, null]);

    for (const client of [owner.client, admin]) {
      expect((await client.from("client_retention_holds").insert({ studio_id: studio, client_id: id, action: "hold", reason: "Forged", actor: human(owner, "Owner") })).error).not.toBeNull();
    }
    await owner.client.rpc("set_client_retention_hold", { p_studio: studio, p_client: id, p_reason: "Hold (test)", p_actor: human(owner, "Owner") });
    await owner.client.from("client_retention_holds").update({ reason: "Changed" }).eq("client_id", id);
    await owner.client.from("client_retention_holds").delete().eq("client_id", id);
    const { data } = await owner.client.from("client_retention_holds").select("reason").eq("client_id", id);
    expect(data).toEqual([{ reason: "Hold (test)" }]);
    const outsider = await createUser("client-retention-outsider");
    expect((await outsider.client.from("client_retention_holds").select("id").eq("client_id", id)).data).toEqual([]);
  });
});

describe("anonymising", () => {
  /** Distinctive text written into every place a client's details can live. */
  const MARK = `Zephyrine${Array.from({ length: 4 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join("")}`;

  async function receive(email: string, message: string): Promise<string> {
    const payload = examplePayload(
      { submissionId: randomUUID(), contact: { name: `${MARK} Ek`, email, company: `${MARK} AB (test)`, website: `${MARK.toLowerCase()}.example` }, message },
      new Date(),
    );
    const hash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
    const { data, error } = await admin.rpc("receive_inquiry", { p_studio: studio, p_inquiry: payload, p_content_hash: hash, p_ip_hash: null });
    if (error) throw error;
    return (data as { id: string }).id;
  }

  /** Every row, in every table of the public schema, that still mentions the client. */
  async function mentions(db: pg.Client): Promise<string[]> {
    const tables = (await db.query<{ t: string }>("select tablename as t from pg_tables where schemaname = 'public'")).rows.map((r) => r.t);
    const found: string[] = [];
    for (const t of tables) {
      const n = (await db.query<{ n: number }>(`select count(*)::int as n from public.${t} x where to_jsonb(x)::text ilike $1`, [`%${MARK}%`])).rows[0].n;
      if (n) found.push(`${t}: ${n}`);
    }
    return found;
  }

  async function fingerprint(db: pg.Client, clientId: string): Promise<string> {
    const r = await db.query<{ f: string }>(
      `select concat_ws('|',
         (select md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) from public.clients x where x.id = $1),
         (select md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.field_key), '')) from public.client_context_fields x where x.client_id = $1),
         (select md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) from public.client_sources x where x.client_id = $1),
         (select md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) from public.projects x where x.client_id = $1),
         (select md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) from public.activity_events x
            where private.entity_client(x.entity_type, x.entity_id) = $1),
         (select md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) from public.inquiries x where x.client_id = $1)) as f`,
      [clientId],
    );
    return r.rows[0].f;
  }

  it("reaches every place the client's details live, directly or indirectly, and changes nothing else", async () => {
    // A bystander client in the same studio, with its own history, that must not change.
    const bystander = await newClient("Bystander Client (test)");
    await (await loaded(owner)).addSource(bystander, { type: "email", label: "Hello", content: "Bystander source material (test)." });

    // An inquiry and a repeat from the same address, approved into a new client.
    const email = `${MARK.toLowerCase()}-${randomUUID().slice(0, 8)}@example.test`;
    const first = await receive(email, `Hej! ${MARK} Ek here, we need a new website with booking.`);
    const repeat = await receive(email, `Forgot to say: ${MARK} also needs a gift card shop.`);
    const repository = await loaded(member);
    await repository.decideInquiry(first, { action: "approve", name: `${MARK} AB` });
    const snapshot = await repository.load();
    const id = snapshot.clients.find((c) => c.name === `${MARK} AB`)!.id;

    // Details, brief values with history, notes, questions, sources, onboarding answers, projects, tasks.
    let r = await loaded(member);
    await r.updateClient(id, { name: `${MARK} AB`, contactPerson: `${MARK} Ek`, email, website: `https://${MARK.toLowerCase()}.example`, status: "active", projectType: "website" });
    r = await loaded(member);
    await r.setContextField(id, "goal", { value: `Bookings for ${MARK}'s classes`, confidence: "observed", note: `Said by ${MARK}` });
    r = await loaded(member);
    await r.setContextField(id, "goal", { value: `More bookings for ${MARK}`, confidence: "confirmed" });
    r = await loaded(member);
    await r.addContextItem(id, { kind: "question", text: `Does ${MARK} have a logo?` });
    r = await loaded(member);
    await r.addSource(id, { type: "meeting", label: `Call with ${MARK}`, content: `${MARK} lives in Turku and has two studios.` });
    r = await loaded(member);
    const onboarding = await r.startOnboarding(id);
    r = await loaded(member);
    await r.saveOnboardingStep(onboarding.id, { nextStep: "setup", answers: { industry: `${MARK}'s yoga studio`, offering: `Classes by ${MARK}` } });
    r = await loaded(member);
    const project = await r.createProject(id, { name: `${MARK} website` });
    r = await loaded(member);
    const task = await r.createTask(project.id, { title: `Photos of ${MARK}` });
    await asDatabaseOwner((db) => db.query("update public.tasks set status = 'blocked', blocked_reason = $2 where id = $1", [task.id, `Waiting for ${MARK}`]));

    // An agent run with its inputs, outputs and a proposal quoting the source.
    const runId = randomUUID();
    expect((await admin.from("agent_runs").insert({
      id: runId, studio_id: studio, client_id: id, agent: "research", task_type: "research.intake", idempotency_key: `test:${runId}`,
      status: "needs_approval", trigger: { kind: "manual", note: MARK }, inputs: [{ label: `Call with ${MARK}` }], outputs: [{ text: MARK }],
      result: { summary: `${MARK} runs two studios` }, blocker: `Ask ${MARK}`, error: { message: MARK },
    })).error).toBeNull();
    expect((await admin.from("agent_proposals").insert({
      studio_id: studio, run_id: runId, client_id: id, target: "contactPerson", value: `${MARK} Ek`,
      evidence: [{ sourceId: randomUUID(), sourceLabel: `Call with ${MARK}`, quote: `${MARK} lives in Turku` }],
    })).error).toBeNull();

    // A hold placed and released, with a reason naming the client.
    await owner.client.rpc("set_client_retention_hold", { p_studio: studio, p_client: id, p_reason: `Dispute with ${MARK} (test)`, p_actor: human(owner, "Owner") });
    await owner.client.rpc("set_client_retention_hold", { p_studio: studio, p_client: id, p_reason: null, p_actor: human(owner, "Owner") });

    await asDatabaseOwner(async (db) => {
      const found = await mentions(db);
      // The client's details really are in all of these before.
      for (const t of ["clients", "client_context_fields", "client_context_items", "client_sources", "client_onboardings", "projects", "tasks",
                       "activity_events", "agent_runs", "agent_proposals", "inquiries", "client_retention_holds"]) {
        if (t === "client_onboardings") continue; // progress only; the answers are brief values
        expect(found.some((f) => f.startsWith(`${t}:`)), t).toBe(true);
      }
    });

    await age(id, "5 years");
    const keep = await asDatabaseOwner(async (db) => {
      const counts = await db.query(
        `select (select count(*)::int from public.projects where client_id = $1) as projects,
                (select count(*)::int from public.tasks t join public.projects p on p.id = t.project_id where p.client_id = $1) as tasks,
                (select count(*)::int from public.activity_events where private.entity_client(entity_type, entity_id) = $1) as events,
                (select count(*)::int from public.agent_runs where client_id = $1) as runs,
                (select count(*)::int from public.client_retention_holds where client_id = $1) as holds`,
        [id],
      );
      const events = await db.query("select id, event_type, actor, \"timestamp\", recorded_at from public.activity_events where private.entity_client(entity_type, entity_id) = $1 order by id", [id]);
      const runs = await db.query("select id, agent, task_type, status, created_at, finished_at from public.agent_runs where client_id = $1 order by id", [id]);
      return { counts: counts.rows[0], events: events.rows, runs: runs.rows, before: await clientRow(id), bystander: await fingerprint(db, bystander) };
    });

    await asDatabaseOwner(async (db) => {
      const report = await run(db);
      expect(report.anonymised.map((c) => c.id)).toContain(id);
      expect(report.anonymised.map((c) => c.id)).not.toContain(bystander);

      // Nothing anywhere still mentions the client.
      expect(await mentions(db)).toEqual([]);

      // The minimal record: same row, counts and history shape, nothing identifying.
      const after = await clientRow(id);
      expect(after).toMatchObject({ name: "Former client", contact_person: null, email: null, website: null, initial_notes: null, status: "archived" });
      expect(after.anonymised_at).not.toBeNull();
      const unchanged = (row: Record<string, unknown>) => {
        const { name, contact_person, email: e, website, initial_notes, status, archived_at, anonymised_at, updated_at, ...rest } = row;
        void [name, contact_person, e, website, initial_notes, status, archived_at, anonymised_at, updated_at];
        return rest;
      };
      expect(unchanged(after)).toEqual(unchanged(keep.before));

      const counts = await db.query(
        `select (select count(*)::int from public.projects where client_id = $1) as projects,
                (select count(*)::int from public.tasks t join public.projects p on p.id = t.project_id where p.client_id = $1) as tasks,
                (select count(*)::int from public.activity_events where private.entity_client(entity_type, entity_id) = $1) as events,
                (select count(*)::int from public.agent_runs where client_id = $1) as runs,
                (select count(*)::int from public.client_retention_holds where client_id = $1) as holds`,
        [id],
      );
      expect(counts.rows[0]).toEqual(keep.counts);
      const gone = await db.query(
        `select (select count(*)::int from public.client_context_fields where client_id = $1) +
                (select count(*)::int from public.client_context_items where client_id = $1) +
                (select count(*)::int from public.client_sources where client_id = $1) +
                (select count(*)::int from public.client_onboardings where client_id = $1) +
                (select count(*)::int from public.agent_proposals where client_id = $1) as n`,
        [id],
      );
      expect(gone.rows[0].n).toBe(0);
      expect((await db.query("select id, event_type, actor, \"timestamp\", recorded_at from public.activity_events where private.entity_client(entity_type, entity_id) = $1 order by id", [id])).rows).toEqual(keep.events);
      expect((await db.query("select distinct description from public.activity_events where private.entity_client(entity_type, entity_id) = $1", [id])).rows)
        .toEqual([{ description: "Details removed when the client was anonymised." }]);
      expect((await db.query("select id, agent, task_type, status, created_at, finished_at from public.agent_runs where client_id = $1 order by id", [id])).rows).toEqual(keep.runs);
      expect((await db.query("select distinct name from public.projects where client_id = $1", [id])).rows).toEqual([{ name: "Former project" }]);
      expect((await db.query("select distinct t.title, t.blocked_reason, t.status from public.tasks t join public.projects p on p.id = t.project_id where p.client_id = $1", [id])).rows)
        .toEqual([{ title: "Task", blocked_reason: null, status: "blocked" }]);

      // Both inquiries: anonymised with the client, decisions kept.
      const inquiries = await db.query("select id, status, anonymised_at is not null as anonymised, anonymised_with_client, email_normalized from public.inquiries where id = any($1) order by received_at", [[first, repeat]]);
      expect(inquiries.rows).toEqual([
        { id: first, status: "approved", anonymised: true, anonymised_with_client: true, email_normalized: null },
        { id: repeat, status: "merged", anonymised: true, anonymised_with_client: true, email_normalized: null },
      ]);

      // The hold log keeps who and when, not why.
      expect((await db.query("select action, reason from public.client_retention_holds where client_id = $1 order by created_at", [id])).rows)
        .toEqual([{ action: "hold", reason: null }, { action: "release", reason: null }]);

      // The bystander is identical, every column.
      expect(await fingerprint(db, bystander)).toBe(keep.bystander);

      // Retry: nothing new, nothing changes.
      const once = await fingerprint(db, id);
      expect((await run(db)).anonymised.map((c) => c.id)).not.toContain(id);
      expect(await fingerprint(db, id)).toBe(once);
      await expect(db.query("select private.anonymise_client($1, true)", [id])).rejects.toThrow(/already anonymised/);
    });

    // The app no longer shows it, and nothing can be added back to it.
    const after = await (await loaded(owner)).load();
    expect(after.clients.map((c) => c.id)).not.toContain(id);
    expect(after.projects.map((p) => p.clientId)).not.toContain(id);
    expect(after.activity.map((e) => e.entityId)).not.toContain(id);
    expect(after.clients.map((c) => c.id)).toContain(bystander);

    const refused = [
      await owner.client.from("clients").update({ name: `${MARK} again` }).eq("id", id),
      await owner.client.from("client_sources").insert({ id: randomUUID(), studio_id: studio, client_id: id, type: "email", label: "Again", content: `${MARK} again`, added_by: human(owner, "Owner") }),
      await owner.client.from("projects").insert({ id: randomUUID(), studio_id: studio, client_id: id, name: `${MARK} again`, project_type: "website" }),
      await owner.client.from("projects").update({ name: `${MARK} again` }).eq("id", project.id),
      await owner.client.from("tasks").update({ title: `${MARK} again` }).eq("id", task.id),
      await owner.client.from("activity_events").insert({ id: randomUUID(), studio_id: studio, entity_type: "client", entity_id: id, event_type: "note.added", description: `${MARK} again`, actor: human(owner, "Owner") }),
      await admin.from("agent_runs").insert({ studio_id: studio, client_id: id, agent: "research", task_type: "research.intake", idempotency_key: `again:${randomUUID()}`, status: "queued", trigger: {} }),
      await owner.client.rpc("set_client_retention_hold", { p_studio: studio, p_client: id, p_reason: "Again", p_actor: human(owner, "Owner") }),
    ];
    for (const result of refused) expect(result.error, JSON.stringify(result.error)).not.toBeNull();
    await asDatabaseOwner(async (db) => expect(await mentions(db)).toEqual([]));

    // A new inquiry from the same address cannot be linked to the anonymised client.
    const again = await receive(email, `${MARK} again, about a new project this time.`);
    await expect((await loaded(owner)).decideInquiry(again, { action: "link", clientId: id })).rejects.toBeTruthy();
    await asDatabaseOwner((db) => db.query("select private.anonymise_inquiry($1, true)", [again]));
  });

  it("even the owner cannot use the anonymising flag to change anything else", async () => {
    const id = await newClient();
    await asDatabaseOwner(async (db) => {
      await expect(db.query(
        `begin; select set_config('studio_os.anonymising_client', '${id}', true);
         update public.clients set name = 'Former client', source_type = 'phone' where id = '${id}'; commit;`,
      )).rejects.toThrow(/only clears the client's details/);
      await db.query("rollback");
      await expect(db.query("select private.anonymise_client($1)", [id])).rejects.toThrow(/still within its retention period/);
    });
  });

  it("is safe to retry while another run holds the lock", async () => {
    await asDatabaseOwner(async (db) => {
      await asDatabaseOwner(async (other) => {
        await db.query("begin");
        await run(db, true);
        expect((await run(other, true)).skipped).toBe("another run is in progress");
        await db.query("commit");
      });
      const recorded = await db.query<{ dry_run: boolean; skipped: string | null }>("select dry_run, skipped from private.client_retention_runs order by id desc limit 2");
      expect(recorded.rows).toEqual([{ dry_run: true, skipped: "another run is in progress" }, { dry_run: true, skipped: null }]);
    });
  });
});

describe("who can run it", () => {
  it("only the database owner: not visitors, signed-in people or the service role", async () => {
    const privileges = await asDatabaseOwner(async (db) =>
      (await db.query<{ fn: string; role: string; allowed: boolean }>(
        `select f as fn, r as role, has_function_privilege(r, f, 'execute') as allowed
           from unnest(array['private.run_client_retention(boolean)', 'private.anonymise_client(uuid, boolean)']) f,
                unnest(array['anon', 'authenticated', 'service_role']) r`,
      )).rows,
    );
    expect(privileges).toHaveLength(6);
    expect(privileges.filter((p) => p.allowed)).toEqual([]);
    const runs = await asDatabaseOwner(async (db) =>
      (await db.query<{ allowed: boolean }>(
        "select has_table_privilege(r, 'private.client_retention_runs', 'select') as allowed from unnest(array['anon', 'authenticated', 'service_role']) r",
      )).rows,
    );
    expect(runs.filter((r) => r.allowed)).toEqual([]);
    for (const client of [anonClient(), member.client, admin]) {
      expect((await client.schema("private").rpc("run_client_retention", { p_dry_run: true })).error).not.toBeNull();
      expect((await client.rpc("run_client_retention", { p_dry_run: true })).error).not.toBeNull();
    }
  });

  it("is scheduled daily as the database owner", async () => {
    const jobs = await asDatabaseOwner(async (db) =>
      (await db.query("select schedule, command, username, active from cron.job where jobname = 'client-retention'")).rows,
    );
    expect(jobs).toEqual([{ schedule: "27 3 * * *", command: "select private.run_client_retention()", username: "postgres", active: true }]);
  });
});
