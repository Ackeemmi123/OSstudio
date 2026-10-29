/**
 * The agent runner's database access, verified against a local Supabase stack.
 *
 * Hosted Supabase projects created after May 2026 give the service role no
 * table access by default, while local stacks still do. These tests pin the
 * grants the migrations give it, so a missing or extra grant fails here
 * instead of on staging.
 */
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { planResultOf, type PlanResult } from "@/lib/agents/contract";
import { INTAKE_PROMPT_VERSION } from "@/lib/agents/intake-prompt";
import { PLAN_PROMPT_VERSION } from "@/lib/agents/plan-prompt";
import { SupabaseIntakeStore } from "@/server/agents/supabase-intake-store";
import { admin, asDatabaseOwner, createStudio, createUser, repositoryFor, type TestUser } from "./helpers";

vi.mock("server-only", () => ({}));

/** What src/server/agents/supabase-intake-store.ts does with the service role, and nothing more. */
const RUNNER_PRIVILEGES = [
  "activity_events INSERT",
  "agent_proposals INSERT",
  "agent_proposals SELECT",
  "agent_proposals UPDATE (status)",
  "agent_runs INSERT",
  "agent_runs SELECT",
  "agent_runs UPDATE (cache_read_tokens, cache_write_tokens, cost_micros, error, finished_at, input_tokens, output_tokens, outputs, result, served_by, status)",
  // The activity guard checks the client is in the same studio.
  "clients SELECT (id, studio_id)",
];

let owner: TestUser;
let studio: string;
let clientId: string;

beforeAll(async () => {
  owner = await createUser("runner-owner");
  studio = await createStudio(owner, "Runner test");
  const repository = repositoryFor(owner, studio);
  await repository.load();
  clientId = (await repository.createClient({ name: "Runner Client" })).id;
});

describe("the agent runner", () => {
  it("has exactly the table access it needs", async () => {
    const granted = await asDatabaseOwner(async (db) => {
      const tables = await db.query<{ entry: string }>(
        `select table_name || ' ' || privilege_type as entry from information_schema.role_table_grants
          where grantee = 'service_role' and table_schema = 'public'`,
      );
      const columns = await db.query<{ entry: string }>(
        `select table_name || ' ' || privilege_type || ' (' || string_agg(column_name, ', ' order by column_name) || ')' as entry
           from information_schema.column_privileges
          where grantee = 'service_role' and table_schema = 'public'
            and (table_name, privilege_type) not in (
              select table_name, privilege_type from information_schema.role_table_grants
               where grantee = 'service_role' and table_schema = 'public')
          group by table_name, privilege_type`,
      );
      return [...tables.rows, ...columns.rows].map((r) => r.entry).sort();
    });
    expect(granted).toEqual(RUNNER_PRIVILEGES);
  });

  it("records, finishes and supersedes a run through the service role", async () => {
    const store = new SupabaseIntakeStore(owner.client, admin, studio);
    const key = `runner-test:${randomUUID()}`;

    expect(await store.loadClient(clientId)).toMatchObject({ client: { id: clientId } });
    const run = await store.insertRun({
      clientId, idempotencyKey: key, attempt: 1, status: "running", requestedBy: owner.id,
      inputs: [], runner: "fixture", model: null, promptVersion: INTAKE_PROMPT_VERSION, blocker: null,
    });
    expect(run).toMatchObject({ status: "running" });
    expect(await store.activeRun(clientId)).toMatchObject({ id: run!.id });
    expect(await store.runsFor(key)).toHaveLength(1);
    expect(await store.runsSince(new Date(Date.now() - 60_000).toISOString())).toBeGreaterThan(0);
    await store.recordEvent(clientId, "agent.run_started", "Test run started");

    const ids = await store.insertProposals(run!.id, clientId, [
      { target: "platform", value: "Shopify", evidence: [{ sourceId: randomUUID(), sourceLabel: "Email", quote: "Shopify" }], note: null },
    ]);
    expect(ids).toHaveLength(1);
    const finished = await store.finishRun(run!.id, { status: "needs_approval", outputs: [] });
    expect(finished.status).toBe("needs_approval");
    expect(await store.activeRun(clientId)).toBeNull();

    await store.supersedePending(clientId);
    const snapshot = await repositoryFor(owner, studio).load();
    expect(snapshot.proposals.find((p) => p.id === ids[0])?.status).toBe("superseded");
    expect(snapshot.activity.some((e) => e.eventType === "agent.run_started" && e.actor?.kind === "agent")).toBe(true);
  });

  it("records task suggestions as a coordination run, beside an intake run", async () => {
    const intake = new SupabaseIntakeStore(owner.client, admin, studio);
    const plan = new SupabaseIntakeStore(owner.client, admin, studio, { id: "coordination", taskType: "coordination.plan" });
    const newRun = (key: string, promptVersion: string) => ({
      clientId, idempotencyKey: key, attempt: 1, status: "running" as const, requestedBy: owner.id,
      inputs: [], runner: "fixture", model: "test-fixture", promptVersion, blocker: null,
    });
    const analysis = await intake.insertRun(newRun(`runner-test:${randomUUID()}`, INTAKE_PROMPT_VERSION));
    const suggestions = await plan.insertRun(newRun(`coordination.plan:${randomUUID()}`, PLAN_PROMPT_VERSION));
    expect(analysis).not.toBeNull();
    expect(suggestions).toMatchObject({ agentId: "coordination", taskType: "coordination.plan", status: "running" });
    // One active run per client and agent.
    expect(await plan.insertRun(newRun(`coordination.plan:${randomUUID()}`, PLAN_PROMPT_VERSION))).toBeNull();
    expect(await plan.activeRun(clientId)).toMatchObject({ id: suggestions!.id });

    const result: PlanResult = {
      kind: "plan", projectType: "website",
      add: [{ stage: "development", title: "Connect the booking system", reason: "The brief names one.", basedOn: "integrations" }],
      remove: [], discarded: 0, externalResearch: false,
    };
    await plan.finishRun(suggestions!.id, { status: "needs_approval", result });
    await intake.finishRun(analysis!.id, { status: "succeeded" });

    const snapshot = await repositoryFor(owner, studio).load();
    expect(planResultOf(snapshot.agentRuns.find((run) => run.id === suggestions!.id))).toEqual(result);
    // A coordination run creates no tasks and no proposals.
    expect(snapshot.tasks.filter((task) => task.title === "Connect the booking system")).toEqual([]);
    expect(snapshot.proposals.filter((p) => p.runId === suggestions!.id)).toEqual([]);
  });

  it("cannot read or change anything else", async () => {
    const read = await admin.from("clients").select("name").eq("id", clientId);
    expect(read.error?.code).toBe("42501");
    const write = await admin.from("client_sources").insert({ studio_id: studio, client_id: clientId, label: "Forged", content: "x" });
    expect(write.error?.code).toBe("42501");
  });
});
