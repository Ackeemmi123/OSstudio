/**
 * Access control and integrity, verified against a real Supabase stack.
 *
 * Each test acts through the same channels a browser or the agent runner
 * would: the public API with a user's session, or the service role.
 */
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { RepositoryError } from "@/lib/data/repository";
import { addMember, admin, anonClient, asDatabaseOwner, createStudio, createUser, repositoryFor, type TestUser } from "./helpers";

let owner: TestUser;
let member: TestUser;
let viewer: TestUser;
let outsider: TestUser;
let studio: string;
let otherStudio: string;
let clientId: string;

beforeAll(async () => {
  [owner, member, viewer, outsider] = await Promise.all([createUser("owner"), createUser("member"), createUser("viewer"), createUser("outsider")]);
  studio = await createStudio(owner, "Axivo test");
  otherStudio = await createStudio(outsider, "Someone else");
  await addMember(owner, studio, member, "member", "Mia Member");
  await addMember(owner, studio, viewer, "viewer", "Vera Viewer");

  const repository = repositoryFor(owner, studio);
  await repository.load();
  clientId = (await repository.createClient({ name: "Ateljé Test", budget: "About 100k", email: "hello@atelje.test" })).id;
});

async function expectRepositoryError(promise: Promise<unknown>, code: RepositoryError["code"]) {
  const error = await promise.then(() => null, (e: unknown) => e);
  expect(error).toBeInstanceOf(RepositoryError);
  expect((error as RepositoryError).code).toBe(code);
}

describe("persistence through the repository", () => {
  it("stores changes and returns them after a fresh load", async () => {
    const repository = repositoryFor(member, studio);
    await repository.load();
    await repository.setContextField(clientId, "goal", { value: "Sell prints online", confidence: "observed" });
    const project = await repository.createProject(clientId, { name: "Webshop" });
    const task = await repository.createTask(project.id, { title: "Collect product photos" });
    await repository.load();
    await repository.setTaskStatus(task.id, "done");

    const fresh = await repositoryFor(owner, studio).load();
    const client = fresh.clients.find((c) => c.id === clientId)!;
    expect(client.context.goal).toMatchObject({ value: "Sell prints online", confidence: "observed" });
    expect(client.context.goal.recordedBy).toMatchObject({ kind: "human", name: "Mia Member", userId: member.id });
    expect(fresh.tasks.find((t) => t.id === task.id)?.status).toBe("done");
    const types = fresh.activity.filter((e) => e.entityId === task.id).map((e) => e.eventType);
    expect(types).toEqual(expect.arrayContaining(["task.created", "task.completed"]));
  });

  it("records who confirmed a value", async () => {
    const repository = repositoryFor(member, studio);
    await repository.load();
    await repository.setContextField(clientId, "budget", { value: "About 100k", confidence: "confirmed" });
    const client = (await repository.load()).clients.find((c) => c.id === clientId)!;
    expect(client.context.budget.confidence).toBe("confirmed");
    expect(client.context.budget.confirmedBy).toMatchObject({ userId: member.id });
    expect(client.context.budget.confirmedAt).toBeTruthy();
  });

  it("detects a concurrent edit instead of overwriting it", async () => {
    const first = repositoryFor(owner, studio);
    const second = repositoryFor(member, studio);
    await Promise.all([first.load(), second.load()]);
    await first.setContextField(clientId, "deadline", { value: "June", confidence: "observed" });
    await expectRepositoryError(second.setContextField(clientId, "deadline", { value: "August", confidence: "observed" }), "conflict");
    const client = (await first.load()).clients.find((c) => c.id === clientId)!;
    expect(client.context.deadline.value).toBe("June");
  });
});

describe("studio isolation", () => {
  it("gives anonymous visitors nothing", async () => {
    const anon = anonClient();
    const { data } = await anon.from("clients").select("id");
    expect(data ?? []).toEqual([]);
    const load = await anon.rpc("load_studio", { p_studio: studio });
    expect(load.error).not.toBeNull();
  });

  it("hides another studio's data even when its identifiers are known", async () => {
    const load = await outsider.client.rpc("load_studio", { p_studio: studio });
    expect(load.error?.code).toBe("42501");

    const { data: rows } = await outsider.client.from("clients").select("id").eq("id", clientId);
    expect(rows).toEqual([]);

    const { data: updated } = await outsider.client.from("clients").update({ name: "Taken over" }).eq("id", clientId).select();
    expect(updated ?? []).toEqual([]);

    const apply = await outsider.client.rpc("apply_changes", {
      p_studio: studio,
      p_changes: { clients: [{ op: "update", row: { id: clientId, name: "Taken over" }, expected: new Date().toISOString() }], events: [] },
    });
    expect(apply.error?.code).toBe("42501");

    const { data: check } = await owner.client.from("clients").select("name").eq("id", clientId).single();
    expect(check?.name).toBe("Ateljé Test");
  });

  it("refuses rows in your own studio that point at another studio's records", async () => {
    const project = await outsider.client.from("projects").insert({
      id: randomUUID(), studio_id: otherStudio, client_id: clientId, name: "Sneaky", project_type: "website",
    });
    expect(project.error).not.toBeNull();

    const event = await outsider.client.from("activity_events").insert({
      id: randomUUID(), studio_id: otherStudio, entity_type: "client", entity_id: clientId, event_type: "client.updated",
      description: "x", actor: { kind: "human", name: "Out", userId: outsider.id },
    });
    expect(event.error).not.toBeNull();
  });

  it("does not let rows move between studios", async () => {
    await addMember(outsider, otherStudio, owner, "member", "Owner elsewhere");
    const { error } = await owner.client.from("clients").update({ studio_id: otherStudio }).eq("id", clientId);
    expect(error?.code).toBe("42501");
  });
});

describe("task owner, due date and blocked reason", () => {
  it("stores them for members and refuses viewers", async () => {
    const repository = repositoryFor(member, studio);
    await repository.load();
    const project = await repository.createProject(clientId, { name: "Owners and dates" });
    const task = await repository.createTask(project.id, { title: "Product photos" });
    await repository.updateTask(task.id, { ownerName: "Mia Member", ownerUserId: member.id, dueDate: "2026-11-12" });
    await repository.setTaskStatus(task.id, "blocked", { blockedReason: "Waiting for photos from the client" });

    const fresh = await repositoryFor(owner, studio).load();
    expect(fresh.tasks.find((t) => t.id === task.id)).toMatchObject({
      assignee: { kind: "human", name: "Mia Member", userId: member.id },
      dueDate: "2026-11-12",
      status: "blocked",
      blockedReason: "Waiting for photos from the client",
    });
    const events = fresh.activity.filter((e) => e.entityId === task.id).map((e) => e.eventType);
    expect(events).toEqual(expect.arrayContaining(["task.created", "task.updated", "task.status_changed"]));

    const viewing = repositoryFor(viewer, studio);
    await viewing.load();
    await expectRepositoryError(viewing.updateTask(task.id, { ownerName: "Vera Viewer", dueDate: "" }), "permission");
    const direct = await viewer.client.from("tasks").update({ due_date: "2030-01-01" }).eq("id", task.id).select();
    expect(direct.data ?? []).toEqual([]);
    expect((await repositoryFor(owner, studio).load()).tasks.find((t) => t.id === task.id)?.dueDate).toBe("2026-11-12");
  });

  it("refuses a system owner, as before", async () => {
    const repository = repositoryFor(member, studio);
    const snapshot = await repository.load();
    const task = snapshot.tasks.find((t) => t.title === "Product photos")!;
    const { error } = await member.client.from("tasks").update({ assignee: { kind: "system" } }).eq("id", task.id);
    expect(error).not.toBeNull();
  });
});

describe("starting a project from a playbook", () => {
  it("creates the project and its tasks together", async () => {
    const repository = repositoryFor(member, studio);
    await repository.load();
    const project = await repository.createProject(clientId, { name: "Playbook site", projectType: "website", tasks: ["Kickoff call", "Page designs"] });
    const fresh = await repositoryFor(owner, studio).load();
    expect(fresh.tasks.filter((t) => t.projectId === project.id).map((t) => t.title).sort()).toEqual(["Kickoff call", "Page designs"]);
    expect(fresh.activity.find((e) => e.entityId === project.id)?.description).toBe("Started project Playbook site with 2 tasks");
  });

  it("creates nothing when one task cannot be stored", async () => {
    const changes = (projectId: string, secondStatus: string) => ({
      p_studio: studio,
      p_changes: {
        projects: [{ op: "insert", row: { id: projectId, client_id: clientId, name: "Half a project", project_type: "website", status: "planned", stage: "intake", is_demo: false } }],
        tasks: [
          { op: "insert", row: { id: randomUUID(), project_id: projectId, title: "Fine", status: "todo", is_demo: false } },
          { op: "insert", row: { id: randomUUID(), project_id: projectId, title: "Second", status: secondStatus, is_demo: false } },
        ],
        events: [],
      },
    });
    const broken = randomUUID();
    expect((await member.client.rpc("apply_changes", changes(broken, "not_a_status"))).error).not.toBeNull();
    // The same change with a valid second task goes through, so the refusal was that one row.
    const valid = randomUUID();
    expect((await member.client.rpc("apply_changes", changes(valid, "todo"))).error).toBeNull();

    const fresh = await repositoryFor(owner, studio).load();
    expect(fresh.projects.some((p) => p.id === broken)).toBe(false);
    expect(fresh.tasks.some((t) => t.projectId === broken)).toBe(false);
    expect(fresh.tasks.filter((t) => t.projectId === valid)).toHaveLength(2);
  });
});

describe("roles", () => {
  it("lets viewers read but not write", async () => {
    const repository = repositoryFor(viewer, studio);
    const snapshot = await repository.load();
    expect(snapshot.clients.some((c) => c.id === clientId)).toBe(true);
    expect(repository.info).toMatchObject({ kind: "supabase", role: "viewer", canWrite: false });
    await expectRepositoryError(repository.updateClient(clientId, { name: "x", contactPerson: "", email: "", website: "", status: "lead", projectType: "" }), "permission");

    const direct = await viewer.client.rpc("apply_changes", { p_studio: studio, p_changes: { events: [] } });
    expect(direct.error?.code).toBe("42501");
    const insert = await viewer.client.from("client_sources").insert({
      id: randomUUID(), studio_id: studio, client_id: clientId, type: "email", label: "x", content: "x",
      added_by: { kind: "human", name: "Vera", userId: viewer.id },
    });
    expect(insert.error).not.toBeNull();
  });

  it("lets only owners manage membership", async () => {
    const { error } = await member.client.rpc("add_studio_member", { p_studio: studio, p_email: outsider.email, p_display_name: "x", p_role: "owner" });
    expect(error?.code).toBe("42501");
    const direct = await member.client.from("studio_members").insert({ studio_id: studio, user_id: outsider.id, display_name: "x", role: "owner" });
    expect(direct.error).not.toBeNull();
  });
});

describe("people act only in their own name", () => {
  it("rejects activity attributed to someone else", async () => {
    const { error } = await member.client.rpc("apply_changes", {
      p_studio: studio,
      p_changes: { events: [{ id: randomUUID(), entity_type: "client", entity_id: clientId, event_type: "client.updated", description: "Forged", actor: { kind: "human", name: "Owner", userId: owner.id } }] },
    });
    expect(error?.code).toBe("42501");
  });

  it("rejects activity posing as an agent", async () => {
    const { error } = await member.client.rpc("apply_changes", {
      p_studio: studio,
      p_changes: { events: [{ id: randomUUID(), entity_type: "client", entity_id: clientId, event_type: "client.updated", description: "Forged", actor: { kind: "agent", agentId: "research" } }] },
    });
    expect(error?.code).toBe("42501");
  });

  it("rejects a confirmation in someone else's name", async () => {
    const { data: field } = await member.client.from("client_context_fields").select("*").eq("client_id", clientId).eq("field_key", "platform").single();
    const { error } = await member.client.rpc("apply_changes", {
      p_studio: studio,
      p_changes: {
        context_fields: [{
          op: "update", expected: field!.updated_at,
          row: { ...field, value: "Shopify", confidence: "confirmed", recorded_by: { kind: "human", name: "Mia", userId: member.id }, confirmed_by: { kind: "human", name: "Owner", userId: owner.id } },
        }],
        events: [],
      },
    });
    expect(error?.code).toBe("42501");
  });
});

describe("history", () => {
  it("keeps the activity log append-only, even for the service role", async () => {
    const { data: event } = await owner.client.from("activity_events").select("id").eq("entity_id", clientId).limit(1).single();
    const asOwner = await owner.client.from("activity_events").update({ description: "Rewritten" }).eq("id", event!.id);
    expect(asOwner.error).not.toBeNull();
    const asService = await admin.from("activity_events").update({ description: "Rewritten" }).eq("id", event!.id);
    expect(asService.error?.code).toBe("42501");
    const deleted = await admin.from("activity_events").delete().eq("id", event!.id);
    expect(deleted.error?.code).toBe("42501");
    // Even with full table access, the history cannot be rewritten.
    await asDatabaseOwner(async (db) => {
      await expect(db.query("update public.activity_events set description = 'Rewritten' where id = $1", [event!.id])).rejects.toThrow(/append-only/);
      await expect(db.query("delete from public.activity_events where id = $1", [event!.id])).rejects.toThrow(/append-only/);
    });
  });

  it("never drops earlier values from a field's history", async () => {
    const repository = repositoryFor(owner, studio);
    await repository.load();
    await repository.setContextField(clientId, "goal", { value: "Sell prints and frames online", confidence: "observed" });
    const { data: field } = await owner.client.from("client_context_fields").select("*").eq("client_id", clientId).eq("field_key", "goal").single();
    expect((field!.history as unknown[]).length).toBeGreaterThan(0);
    const { error } = await owner.client.rpc("apply_changes", {
      p_studio: studio,
      p_changes: { context_fields: [{ op: "update", expected: field!.updated_at, row: { ...field, history: [] } }], events: [] },
    });
    expect(error?.code).toBe("42501");
  });
});

describe("automation cannot make a person's decisions", () => {
  it("refuses a confirmation made with the service role", async () => {
    const { error } = await admin.from("client_context_fields")
      .update({ value: "Agent says 200k", confidence: "confirmed", confirmed_by: { kind: "human", name: "Owner", userId: owner.id } })
      .eq("client_id", clientId).eq("field_key", "requirements");
    expect(error?.code).toBe("42501");
    // Even with full table access, only a signed-in person can confirm.
    await asDatabaseOwner(async (db) => {
      await expect(db.query(
        `update public.client_context_fields set value = 'Agent says 200k', confidence = 'confirmed', confirmed_by = $1
          where client_id = $2 and field_key = 'requirements'`,
        [{ kind: "human", name: "Owner", userId: owner.id }, clientId],
      )).rejects.toThrow(/Only a person can confirm/);
    });
  });

  it("refuses an approval made with the service role", async () => {
    const repository = repositoryFor(owner, studio);
    await repository.load();
    const project = await repository.createProject(clientId, { name: "Approval test" });
    const task = await repository.createTask(project.id, { title: "Homepage design" });
    await repository.load();
    await repository.setTaskStatus(task.id, "awaiting_approval");
    const { error } = await admin.from("tasks").update({ status: "done" }).eq("id", task.id);
    expect(error?.code).toBe("42501");
    await asDatabaseOwner(async (db) => {
      await expect(db.query("update public.tasks set status = 'done' where id = $1", [task.id])).rejects.toThrow(/Only a person can approve/);
    });

    await repository.load();
    await repository.setTaskStatus(task.id, "done");
    const snapshot = await repository.load();
    const approval = snapshot.activity.find((e) => e.entityId === task.id && e.eventType === "decision.approved");
    expect(approval?.actor).toMatchObject({ kind: "human", userId: owner.id });
  });
});

describe("agent proposals", () => {
  async function seedProposal() {
    const runId = randomUUID();
    const sourceId = randomUUID();
    const run = await admin.from("agent_runs").insert({
      id: runId, studio_id: studio, client_id: clientId, agent: "research", task_type: "research.intake",
      idempotency_key: `test:${runId}`, status: "needs_approval", trigger: { kind: "manual", requestedBy: owner.id },
    });
    expect(run.error).toBeNull();
    const { data, error } = await admin.from("agent_proposals").insert({
      studio_id: studio, run_id: runId, client_id: clientId, target: "platform", value: "Shopify",
      evidence: [{ sourceId, sourceLabel: "Intro email", quote: "we run on Shopify" }],
    }).select().single();
    expect(error).toBeNull();
    return data!.id as string;
  }

  it("cannot be created or edited by people", async () => {
    const { error } = await owner.client.from("agent_runs").insert({
      studio_id: studio, client_id: clientId, agent: "research", task_type: "research.intake", idempotency_key: "forged-run-1",
      status: "needs_approval", trigger: {},
    });
    expect(error).not.toBeNull();
    const id = await seedProposal();
    const edit = await owner.client.from("agent_proposals").update({ value: "WordPress" }).eq("id", id);
    expect(edit.error).not.toBeNull();
  });

  it("is accepted once, by a person, through the repository", async () => {
    const id = await seedProposal();
    const repository = repositoryFor(member, studio);
    await repository.load();
    await repository.reviewProposal(id, { action: "accept", confidence: "observed" });
    const snapshot = await repository.load();
    expect(snapshot.proposals.find((p) => p.id === id)).toMatchObject({ status: "accepted", reviewConfidence: "observed", reviewedBy: { userId: member.id } });
    const client = snapshot.clients.find((c) => c.id === clientId)!;
    expect(client.context.platform).toMatchObject({ value: "Shopify", confidence: "observed" });
    expect(client.context.platform.note).toContain("we run on Shopify");

    const again = await member.client.rpc("apply_changes", {
      p_studio: studio,
      p_changes: { proposals: [{ id, status: "dismissed", review_confidence: null, reviewed_by: { kind: "human", name: "Mia", userId: member.id } }], events: [] },
    });
    expect(again.error?.code).toBe("SO409");
  });

  it("cannot be reviewed by the service role", async () => {
    const id = await seedProposal();
    const { error } = await admin.from("agent_proposals")
      .update({ status: "accepted", review_confidence: "confirmed", reviewed_by: { kind: "human", name: "Owner", userId: owner.id }, reviewed_at: new Date().toISOString() })
      .eq("id", id);
    expect(error?.code).toBe("42501");
    // The runner may change a proposal's status, but only to supersede it.
    const accepted = await admin.from("agent_proposals").update({ status: "accepted" }).eq("id", id);
    expect(accepted.error?.message).toMatch(/Only a person can review/);
  });
});
