/**
 * Reviewing website inquiries against a local Supabase stack: approving as a
 * new client, adding to an existing one, rejecting, marking spam, and what
 * the database refuses whatever the app sends.
 *
 * Every value here is invented test data.
 */
import { createHash, randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import type { SupabaseRepository } from "@/lib/data/supabase-repository";
import { examplePayload } from "@/lib/inquiries/test-helpers";
import { addMember, admin, anonClient, asDatabaseOwner, createStudio, createUser, repositoryFor, type TestUser } from "./helpers";

let owner: TestUser;
let member: TestUser;
let viewer: TestUser;
let outsider: TestUser;
let studio: string;

beforeAll(async () => {
  owner = await createUser("review-owner");
  member = await createUser("review-member");
  viewer = await createUser("review-viewer");
  outsider = await createUser("review-outsider");
  studio = await createStudio(owner, "Axivo (review test)");
  await addMember(owner, studio, member, "member", "Sam Member");
  await addMember(owner, studio, viewer, "viewer");
  await createStudio(outsider, "Someone else's studio");
});

/** Stores one test inquiry the way /api/inquiries does, and returns its id. */
async function receive(overrides: Record<string, unknown> = {}): Promise<string> {
  const tag = randomUUID().slice(0, 8);
  const payload = examplePayload(
    { submissionId: randomUUID(), contact: { name: "Maja Lind", email: `maja-${tag}@example.test`, company: `Lumen Yoga ${tag} (test)`, website: `lumen-${tag}.example` }, ...overrides },
    new Date(),
  );
  const hash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  const { data, error } = await admin.rpc("receive_inquiry", { p_studio: studio, p_inquiry: payload, p_content_hash: hash, p_ip_hash: null });
  if (error) throw error;
  return (data as { id: string }).id;
}

async function loaded(user: TestUser): Promise<SupabaseRepository> {
  const repository = repositoryFor(user, studio);
  await repository.load();
  return repository;
}

async function clientCount(): Promise<number> {
  const { count, error } = await owner.client.from("clients").select("id", { count: "exact", head: true }).eq("studio_id", studio);
  if (error) throw error;
  return count ?? 0;
}

describe("approving as a new client", () => {
  it("creates one client, its brief values, source material and a draft onboarding, in the reviewer's name", async () => {
    const id = await receive();
    const repository = await loaded(member);
    const before = await clientCount();

    const decided = await repository.decideInquiry(id, { action: "approve", name: "Lumen Yoga" });
    expect(decided).toMatchObject({ status: "approved", createdClient: true, decidedBy: { kind: "human", userId: member.id, name: "Sam Member" } });
    expect(decided.decidedAt).not.toBeNull();
    expect(await clientCount()).toBe(before + 1);

    const snapshot = await repository.load();
    const client = snapshot.clients.find((c) => c.id === decided.clientId)!;
    expect(client).toMatchObject({ name: "Lumen Yoga", contactPerson: "Maja Lind", status: "onboarding", projectType: "website", source: { type: "contact_form" } });
    expect(client.context.budget).toMatchObject({ value: "€4,500", confidence: "observed", source: { type: "contact_form", inquiryId: id } });
    expect(client.context.deadline.value).toMatch(/^Within 3 months; desired date \d{4}-\d{2}-\d{2}$/);
    expect(client.context.goal.value).toBeNull();
    expect(snapshot.sources.filter((s) => s.clientId === client.id).map((s) => s.content)).toEqual([
      "Language: Swedish\n\nVi vill ha en ny webbplats med bokning av klasser.",
    ]);
    expect(snapshot.onboardings.filter((o) => o.clientId === client.id)).toMatchObject([{ status: "draft", projectId: null }]);
    const events = snapshot.activity.filter((e) => e.entityId === client.id);
    expect(events.map((e) => e.eventType).sort()).toEqual(["client.context_updated", "client.created", "onboarding.started", "source.received"]);
    expect(events.every((e) => e.actor?.kind === "human" && e.actor.userId === member.id)).toBe(true);
  });

  it("never creates a second client when two people approve at the same moment", async () => {
    const id = await receive();
    const [a, b] = await Promise.all([loaded(owner), loaded(member)]);
    const before = await clientCount();

    const results = await Promise.allSettled([
      a.decideInquiry(id, { action: "approve", name: "Twice Approved" }),
      b.decideInquiry(id, { action: "approve", name: "Twice Approved" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(failed.reason).toMatchObject({ code: "conflict", message: expect.stringContaining("already been decided") });
    expect(await clientCount()).toBe(before + 1);

    // Later attempts, from a stale screen or a fresh one, change nothing either.
    await expect(b.decideInquiry(id, { action: "reject" })).rejects.toMatchObject({ code: "conflict" });
    await expect((await loaded(owner)).decideInquiry(id, { action: "approve", name: "Again" })).rejects.toMatchObject({ code: "conflict" });
    expect(await clientCount()).toBe(before + 1);
  });
});

describe("adding to an existing client", () => {
  it("adds the message and fills only unknown values; creates no client and no onboarding", async () => {
    const repository = await loaded(member);
    const existing = await repository.createClient({ name: "Returning Customer", email: "info@returning.example", budget: "SEK 50,000" });
    const id = await receive({ budget: "5k_10k", budgetAmount: undefined });
    await repository.load();
    const before = await clientCount();

    const decided = await repository.decideInquiry(id, { action: "link", clientId: existing.id });
    expect(decided).toMatchObject({ status: "approved", clientId: existing.id, createdClient: false });
    expect(await clientCount()).toBe(before);

    const snapshot = await repository.load();
    const client = snapshot.clients.find((c) => c.id === existing.id)!;
    expect(client.email).toBe("info@returning.example");
    expect(client.contactPerson).toBe("Maja Lind");
    expect(client.context.budget).toMatchObject({ value: "SEK 50,000" });
    expect(client.context.deadline.source).toMatchObject({ inquiryId: id });
    expect(snapshot.sources.filter((s) => s.clientId === existing.id)).toHaveLength(1);
    expect(snapshot.onboardings.filter((o) => o.clientId === existing.id)).toHaveLength(0);
  });
});

describe("rejecting and spam", () => {
  it("rejects with an internal reason, or marks spam, and creates no client", async () => {
    const rejectedId = await receive();
    const spamId = await receive();
    const repository = await loaded(owner);
    const before = await clientCount();

    expect(await repository.decideInquiry(rejectedId, { action: "reject", reason: "  Outside what we do.  " })).toMatchObject({
      status: "rejected",
      clientId: null,
      decisionReason: "Outside what we do.",
    });
    expect(await repository.decideInquiry(spamId, { action: "spam" })).toMatchObject({ status: "spam", clientId: null, decisionReason: null });
    expect(await clientCount()).toBe(before);
  });

  it("refuses a rejection that tries to write anything else", async () => {
    const id = await receive();
    const { error } = await owner.client.rpc("decide_inquiry", {
      p_studio: studio,
      p_inquiry: id,
      p_decision: { status: "rejected", decided_by: { kind: "human", name: "Owner", userId: owner.id } },
      p_changes: { clients: [{ op: "insert", row: { id: randomUUID(), name: "Sneaked in" } }], events: [] },
      p_onboarding: null,
    });
    expect(error?.code).toBe("22023");
    expect((await owner.client.from("inquiries").select("status").eq("id", id).single()).data?.status).toBe("new");
  });
});

describe("who can decide", () => {
  it("viewers and other studios cannot decide", async () => {
    const id = await receive();
    const asViewer = await loaded(viewer);
    await expect(asViewer.decideInquiry(id, { action: "spam" })).rejects.toMatchObject({ code: "permission" });
    const direct = await viewer.client.rpc("decide_inquiry", {
      p_studio: studio, p_inquiry: id, p_decision: { status: "spam", decided_by: { kind: "human", name: "Viewer", userId: viewer.id } }, p_changes: null, p_onboarding: null,
    });
    expect(direct.error?.code).toBe("42501");
    const foreign = await outsider.client.rpc("decide_inquiry", {
      p_studio: studio, p_inquiry: id, p_decision: { status: "spam", decided_by: { kind: "human", name: "Outsider", userId: outsider.id } }, p_changes: null, p_onboarding: null,
    });
    expect(foreign.error?.code).toBe("42501");
    expect((await owner.client.from("inquiries").select("status").eq("id", id).single()).data?.status).toBe("new");
  });

  it("decisions are recorded in your own name", async () => {
    const id = await receive();
    const { error } = await member.client.rpc("decide_inquiry", {
      p_studio: studio, p_inquiry: id, p_decision: { status: "spam", decided_by: { kind: "human", name: "Owner", userId: owner.id } }, p_changes: null, p_onboarding: null,
    });
    expect(error?.code).toBe("42501");
  });

  it("an inquiry cannot be changed outside the review, and what the customer wrote never changes", async () => {
    const id = await receive();
    const direct = await member.client
      .from("inquiries")
      .update({ status: "spam", decided_by: { kind: "human", name: "Sam Member", userId: member.id } })
      .eq("id", id)
      .select("id");
    expect(direct.error?.code).toBe("42501");
    const edit = await member.client.from("inquiries").update({ message: "Edited by staff, which must not happen." }).eq("id", id);
    expect(edit.error?.code).toBe("42501");

    // Even the database owner, with every privilege, cannot rewrite a submission or skip the review.
    await asDatabaseOwner(async (db) => {
      await expect(db.query("update public.inquiries set status = 'spam' where id = $1", [id])).rejects.toThrow(/decided through the review/);
      await expect(
        db.query(
          `begin; select set_config('studio_os.deciding_inquiry', 'on', true);
           update public.inquiries set message = 'Rewritten by someone, which must not happen.' where id = '${id}'; commit;`,
        ),
      ).rejects.toThrow(/cannot be changed/);
      await db.query("rollback");
    });
  });

  it("only signed-in people may call decide_inquiry", async () => {
    const id = await receive();
    const anon = await anonClient().rpc("decide_inquiry", { p_studio: studio, p_inquiry: id, p_decision: { status: "spam" }, p_changes: null, p_onboarding: null });
    expect(anon.error?.code).toBe("42501");
    const privileges = await asDatabaseOwner(async (db) =>
      (
        await db.query<{ role: string; allowed: boolean }>(
          `select r as role, has_function_privilege(r, 'public.decide_inquiry(uuid, uuid, jsonb, jsonb, jsonb)', 'execute') as allowed
             from unnest(array['anon', 'authenticated', 'service_role']) r`,
        )
      ).rows,
    );
    expect(privileges).toEqual([
      { role: "anon", allowed: false },
      { role: "authenticated", allowed: true },
      { role: "service_role", allowed: false },
    ]);
    // The service role still has no table access to inquiries.
    expect((await admin.from("inquiries").select("id").limit(1)).error?.code).toBe("42501");
  });
});
