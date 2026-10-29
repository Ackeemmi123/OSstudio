/**
 * The monthly AI budget (migration 20261030000100_ai_budget.sql), against a
 * local Supabase stack: who may use it, that concurrent reservations never
 * pass the cap, and that every reservation is settled exactly once.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { INTAKE_PROMPT_VERSION } from "@/lib/agents/intake-prompt";
import { SupabaseIntakeStore } from "@/server/agents/supabase-intake-store";
import { admin, anonClient, asDatabaseOwner, createStudio, createUser, repositoryFor, type TestUser } from "./helpers";

vi.mock("server-only", () => ({}));

const AMOUNT = 870_000;
const CLIENTS = 12;

let owner: TestUser;
let studio: string;
let store: SupabaseIntakeStore;
const runIds: string[] = [];

async function ledger() {
  return asDatabaseOwner(async (db) => {
    const month = await db.query<{ spent: string; reserved: string }>(
      `select spent_micros as spent, reserved_micros as reserved from private.ai_budget_months
        where month = date_trunc('month', now() at time zone 'utc')::date`,
    );
    const open = await db.query<{ n: string }>(`select count(*) as n from private.ai_budget_reservations where settled_at is null`);
    return { spent: Number(month.rows[0]?.spent ?? 0), reserved: Number(month.rows[0]?.reserved ?? 0), open: Number(open.rows[0].n) };
  });
}

const reserve = (run: string, amount: number, cap: number) => admin.rpc("ai_budget_reserve", { p_run: run, p_amount: amount, p_cap: cap });

beforeAll(async () => {
  owner = await createUser("budget-owner");
  studio = await createStudio(owner, "Budget test");
  const repository = repositoryFor(owner, studio);
  await repository.load();
  store = new SupabaseIntakeStore(owner.client, admin, studio);
  for (let i = 0; i < CLIENTS; i++) {
    const client = await repository.createClient({ name: `Budget client ${i}` });
    const run = await store.insertRun({
      clientId: client.id, idempotencyKey: `budget-test:${client.id}`, attempt: 1, status: "running", requestedBy: owner.id,
      inputs: [], runner: "fixture", model: "test-fixture", promptVersion: INTAKE_PROMPT_VERSION, blocker: null,
    });
    runIds.push(run!.id);
  }
});

beforeEach(async () => {
  // The ledger is shared by the whole database; start each test from an empty month.
  await asDatabaseOwner(async (db) => {
    await db.query("delete from private.ai_budget_reservations");
    await db.query("delete from private.ai_budget_months");
  });
});

describe("the AI budget", () => {
  it("can be used only by the server's service role", async () => {
    for (const client of [owner.client, anonClient()]) {
      const reserved = await client.rpc("ai_budget_reserve", { p_run: runIds[0], p_amount: 0, p_cap: 1 });
      expect(reserved.error?.code).toBe("42501");
      const settled = await client.rpc("ai_budget_settle", { p_run: runIds[0], p_charged: 0 });
      expect(settled.error?.code).toBe("42501");
      const month = await client.rpc("ai_budget_month");
      expect(month.error?.code).toBe("42501");
    }
    expect((await ledger()).open).toBe(0);
    expect((await admin.rpc("ai_budget_month")).data).toMatchObject({ spent: 0, reserved: 0 });
  });

  it("does not let people change what a run cost", async () => {
    const update = await owner.client.from("agent_runs").update({ cost_micros: 0 }).eq("id", runIds[0]).select();
    expect(update.error?.code ?? (update.data?.length === 0 ? "no rows" : "changed")).not.toBe("changed");
  });

  it("keeps concurrent reservations within the cap", async () => {
    const results = await Promise.all(runIds.map((run) => reserve(run, AMOUNT, 5 * AMOUNT)));
    expect(results.map((r) => r.error)).toEqual(runIds.map(() => null));
    expect(results.filter((r) => (r.data as { ok: boolean }).ok)).toHaveLength(5);
    expect(await ledger()).toEqual({ spent: 0, reserved: 5 * AMOUNT, open: 5 });
  });

  it("settles each reservation once, at the cost given or in full when unknown", async () => {
    await reserve(runIds[0], AMOUNT, 25_000_000);
    await reserve(runIds[1], AMOUNT, 25_000_000);
    // Reserving again for the same run holds nothing more.
    expect((await reserve(runIds[0], AMOUNT, 25_000_000)).data).toEqual({ ok: true });
    expect(await ledger()).toEqual({ spent: 0, reserved: 2 * AMOUNT, open: 2 });

    await store.settleBudget(runIds[0], 92_000);
    await store.settleBudget(runIds[0], 50_000);
    await store.settleBudget(runIds[1], null);
    await store.settleBudget(runIds[2], 10_000); // never reserved
    expect(await ledger()).toEqual({ spent: 92_000 + AMOUNT, reserved: 0, open: 0 });
  });

  it("refuses everything once the month is at the cap, even a call that costs nothing", async () => {
    expect((await reserve(runIds[0], 1_000_000, 1_000_000)).data).toEqual({ ok: true });
    await store.settleBudget(runIds[0], 1_000_000);
    expect(await store.reserveBudget(runIds[1], 0, 1_000_000)).toEqual({ ok: false, spentMicros: 1_000_000, reservedMicros: 0 });
    expect(await store.reserveBudget(runIds[1], 0, 2_000_000)).toEqual({ ok: true });
  });

  it("refuses a reservation that would pass the cap", async () => {
    expect(await store.reserveBudget(runIds[0], 600_000, 1_000_000)).toEqual({ ok: true });
    expect(await store.reserveBudget(runIds[1], 600_000, 1_000_000)).toEqual({ ok: false, spentMicros: 0, reservedMicros: 600_000 });
  });

  it("charges a reservation abandoned by a stopped server in full", async () => {
    await reserve(runIds[0], AMOUNT, 25_000_000);
    await asDatabaseOwner((db) => db.query("update private.ai_budget_reservations set created_at = now() - interval '16 minutes' where run_id = $1", [runIds[0]]));
    await reserve(runIds[1], AMOUNT, 25_000_000);
    expect(await ledger()).toEqual({ spent: AMOUNT, reserved: AMOUNT, open: 1 });
    // A late settle of the abandoned run changes nothing.
    await store.settleBudget(runIds[0], 1);
    expect((await ledger()).spent).toBe(AMOUNT);
  });

  it("rejects bad input and runs that are not running", async () => {
    expect((await reserve(runIds[0], -1, 1_000)).error?.code).toBe("22023");
    expect((await reserve(runIds[0], 1, 0)).error?.code).toBe("22023");
    expect((await admin.rpc("ai_budget_settle", { p_run: runIds[0], p_charged: -5 })).error?.code).toBe("22023");
    await store.finishRun(runIds[CLIENTS - 1], { status: "failed", error: { message: "Test", retryable: true } });
    expect((await reserve(runIds[CLIENTS - 1], 1, 1_000)).error?.code).toBe("22023");
    expect((await ledger()).open).toBe(0);
  });

  it("records a run's usage, model and cost", async () => {
    const finished = await store.finishRun(runIds[CLIENTS - 2], {
      status: "succeeded",
      spend: { usage: { inputTokens: 3000, outputTokens: 4000, cacheReadTokens: 10, cacheWriteTokens: 0 }, servedBy: "claude-opus-5-5", costMicros: 92_002 },
    });
    expect(finished).toMatchObject({
      promptVersion: INTAKE_PROMPT_VERSION,
      servedBy: "claude-opus-5-5",
      usage: { inputTokens: 3000, outputTokens: 4000, cacheReadTokens: 10, cacheWriteTokens: 0 },
      costMicros: 92_002,
    });
  });
});
