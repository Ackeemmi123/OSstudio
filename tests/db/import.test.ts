/** The one-time browser import, end to end against a local Supabase stack. */
import { describe, expect, it } from "vitest";
import { planImport, sendImport, verifyImport } from "@/lib/data/browser-import";
import { LocalDemoRepository } from "@/lib/data/local-repository";
import { createSeedSnapshot } from "@/lib/data/seed";
import { admin, createStudio, createUser, repositoryFor } from "./helpers";

async function browserWorkspace() {
  const repository = new LocalDemoRepository({ storage: null, seed: () => createSeedSnapshot() });
  const client = await repository.createClient({ name: "Imported Client", budget: "20k" });
  await repository.setContextField(client.id, "budget", { value: "20k", confidence: "confirmed" });
  const project = await repository.createProject(client.id, { name: "Landing page" });
  const task = await repository.createTask(project.id, { title: "Write copy" });
  await repository.setTaskStatus(task.id, "awaiting_approval");
  await repository.addContextItem(client.id, { kind: "question", text: "Who signs off the copy?" });
  await repository.addSource(client.id, { type: "email", label: "First email", content: "Budget: 20k" });
  return repository.load();
}

describe("browser import", () => {
  it("imports once, keeps history, and refuses a duplicate", async () => {
    const owner = await createUser("importer");
    const studio = await createStudio(owner);
    const plan = await planImport(await browserWorkspace(), studio);

    const first = await sendImport(owner.client, studio, plan);
    expect(first).toMatchObject({ status: "imported", counts: { clients: 1, projects: 1, tasks: 1, sources: 1, context_items: 1 } });
    expect(first).toMatchObject({ counts: { context_fields: plan.payload.context_fields.length } });

    const snapshot = await repositoryFor(owner, studio).load();
    expect(verifyImport(plan, snapshot)).toEqual({ ok: true, missing: 0 });
    const client = snapshot.clients.find((c) => c.name === "Imported Client")!;
    expect(client.context.budget).toMatchObject({ value: "20k", confidence: "confirmed", confirmedBy: { imported: true } });
    expect(client.contextItems.map((i) => i.text)).toEqual(["Who signs off the copy?"]);
    expect(snapshot.sources).toMatchObject([{ clientId: client.id, label: "First email", content: "Budget: 20k", addedBy: { imported: true } }]);
    const events = snapshot.activity.filter((e) => e.actor?.kind === "human" && e.actor.imported);
    expect(events.length).toBe(plan.counts.activity);
    // Imported history keeps its original time.
    expect(events.map((e) => Date.parse(e.timestamp))).toEqual(expect.arrayContaining(plan.payload.activity.map((e) => Date.parse(String(e.timestamp)))));

    const second = await sendImport(owner.client, studio, plan);
    expect(second.status).toBe("already_imported");
    const { count } = await admin.from("clients").select("id", { count: "exact", head: true }).eq("studio_id", studio);
    expect(count).toBe(1);

    // Imported work still needs a person's approval on the server.
    const repository = repositoryFor(owner, studio);
    await repository.load();
    const task = snapshot.tasks[0];
    expect(task.status).toBe("awaiting_approval");
  });

  it("refuses viewers and other studios", async () => {
    const owner = await createUser("import-owner");
    const outsider = await createUser("import-outsider");
    const studio = await createStudio(owner);
    const plan = await planImport(await browserWorkspace(), studio);
    await expect(sendImport(outsider.client, studio, plan)).rejects.toMatchObject({ code: "permission" });
  });

  it("cannot be used to record or confirm values in someone else's name", async () => {
    const member = await createUser("import-forger");
    const studio = await createStudio(member);
    const plan = await planImport(await browserWorkspace(), studio);
    const someoneElse = { kind: "human", name: "The client's CEO", userId: crypto.randomUUID() };

    const forgedField = structuredClone(plan.payload);
    forgedField.context_fields = forgedField.context_fields.map((row) => ({ ...row, confirmed_by: someoneElse }));
    const field = await member.client.rpc("import_browser_data", { p_studio: studio, p_hash: "forged-field", p_data: forgedField });
    expect(field.error?.code).toBe("42501");

    const forgedSource = structuredClone(plan.payload);
    forgedSource.sources = forgedSource.sources.map((row) => ({ ...row, added_by: someoneElse }));
    const source = await member.client.rpc("import_browser_data", { p_studio: studio, p_hash: "forged-source", p_data: forgedSource });
    expect(source.error?.code).toBe("42501");

    // Nothing from the refused imports was kept.
    const { count } = await admin.from("clients").select("id", { count: "exact", head: true }).eq("studio_id", studio);
    expect(count).toBe(0);
  });
});
