/** The website draft runner, with the test provider and an in-memory store. Every client and file is invented. */
import { describe, expect, it } from "vitest";
import { siteDraftResultOf } from "@/lib/agents/contract";
import type { DraftFile } from "@/lib/agents/site-draft";
import { buildNewClient } from "@/lib/domain/clients";
import { testDeps } from "@/lib/domain/test-helpers";
import type { Client, SourceDocument } from "@/lib/domain/types";
import { FixtureModel } from "./fixture-model";
import { runSiteDraft, type SiteDraftStore } from "./site-draft-runner";
import { MemoryStore, NOW } from "./testing/memory-store";

const DESIGN = { id: "design", taskType: "design.site_draft" } as const;
const TEXT = "Testföreningen ordnar kurser i keramik för vuxna varje torsdag i Åbo.\nAnmälan sker via e-post till föreningens sekreterare senast en vecka före kursstart.\nKurserna leds av erfarna medlemmar och materialet ingår i avgiften, som betalas på plats.";

class DraftStore extends MemoryStore implements SiteDraftStore {
  files: DraftFile[] = [];
  projectClient: string | null = null;
  async loadProject(projectId: string) {
    return projectId === "project-1" && this.projectClient ? { clientId: this.projectClient, projectType: "website" as const } : null;
  }
  async loadFiles() {
    return { files: this.files, skipped: [{ id: "f9", title: "Stor fil", reason: "Too large." }] };
  }
}

function setup(content = TEXT) {
  const client: Client = buildNewClient({ name: "Testföreningen (test)", sourceType: "email" }, testDeps()).client;
  const sources: SourceDocument[] = content ? [{ id: "src-1", clientId: client.id, type: "document", label: "Broschyr", content, receivedAt: "2026-11-01T10:00:00.000Z" }] : [];
  const store = new DraftStore(client, sources, DESIGN);
  store.projectClient = client.id;
  return store;
}

const draft = (store: DraftStore, overrides: Partial<Parameters<typeof runSiteDraft>[0]> = {}) =>
  runSiteDraft({ store, model: new FixtureModel(), clientId: store.client!.id, projectId: "project-1", requestedBy: "user-1", timeoutMs: 5_000, capMicros: 25_000_000, now: () => NOW, ...overrides });

describe("runSiteDraft", () => {
  it("stores a checked draft on the run for review", async () => {
    const store = setup();
    const outcome = await draft(store);
    const run = outcome.body.run!;
    expect(run).toMatchObject({ agentId: "design", taskType: "design.site_draft", status: "needs_approval", runner: "fixture" });
    const result = siteDraftResultOf(run)!;
    expect(result.projectId).toBe("project-1");
    expect(result.spec.pages.map((p) => p.id)).toEqual(["home", "contact"]);
    // The fixture's invented line is left out; its quoted first line is kept with its source.
    expect(result.dropped.map((d) => d.text)).toContain("Founded in 1850 and trusted by thousands.");
    expect(JSON.stringify(result.spec)).not.toContain("1850");
    expect(result.provenance["pages.0.sections.1.body"]).toEqual([expect.objectContaining({ sourceId: "src-1", checked: true })]);
    expect(result.skippedFiles).toEqual([{ id: "f9", title: "Stor fil", reason: "Too large." }]);
    expect(run.inputs).toContainEqual({ type: "project", id: "project-1" });
    expect(store.events).toEqual(["agent.run_started", "agent.run_completed"]);
  });

  it("reuses the draft for the same material and drafts again on request", async () => {
    const store = setup();
    const first = await draft(store);
    expect((await draft(store)).body).toMatchObject({ reused: true, run: { id: first.body.run!.id } });
    const again = await draft(store, { force: true });
    expect(again.body.run!.id).not.toBe(first.body.run!.id);
  });

  it("asks for material before calling the model", async () => {
    const store = setup("");
    const outcome = await draft(store);
    expect(outcome.body.run).toMatchObject({ status: "needs_input", blocker: expect.stringContaining("too little material") });
  });

  it("refuses a project of another client", async () => {
    const store = setup();
    store.projectClient = "someone-else";
    expect((await draft(store)).status).toBe(404);
  });

  it("records a failure when the answer is not a valid draft", async () => {
    const store = setup(`${TEXT}\nFIXTURE_MALFORMED`);
    const outcome = await draft(store);
    expect(outcome.body.run).toMatchObject({ status: "failed", error: { message: expect.stringContaining("valid website spec"), retryable: true } });
  });

  it("stays within the monthly budget", async () => {
    const store = setup();
    store.spentMicros = 25_000_000;
    const outcome = await draft(store, { model: Object.assign(new FixtureModel(), { model: "claude-opus-5-5" }) });
    expect(outcome.body.run).toMatchObject({ status: "failed", error: { message: expect.stringContaining("budget") } });
  });
});
