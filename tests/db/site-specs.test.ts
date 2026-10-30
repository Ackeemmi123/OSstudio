/**
 * Website specs against a local Supabase stack: the lifecycle through the
 * app's repository, and what the database refuses whatever the client sends:
 * other studios, viewers, the service role, approvals in someone else's name
 * or on unconfirmed brief values, rewriting history, deleting, and anything
 * for an anonymised client. Every value is invented.
 */
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { RepositoryError } from "@/lib/data/repository";
import { siteSpecRow } from "@/lib/data/supabase-rows";
import type { Project, SiteSpecRecord } from "@/lib/domain/types";
import { completeSpec } from "@/lib/site-spec/test-helpers";
import { addMember, admin, anonClient, asDatabaseOwner, createStudio, createUser, repositoryFor, type TestUser } from "./helpers";

let owner: TestUser;
let member: TestUser;
let viewer: TestUser;
let outsider: TestUser;
let studio: string;

beforeAll(async () => {
  [owner, member, viewer, outsider] = await Promise.all([
    createUser("spec-owner"),
    createUser("spec-member"),
    createUser("spec-viewer"),
    createUser("spec-outsider"),
  ]);
  studio = await createStudio(owner, "Website spec test");
  await createStudio(outsider, "Elsewhere");
  await addMember(owner, studio, member, "member", "Sam Member");
  await addMember(owner, studio, viewer, "viewer", "Vera Viewer");
});

function person(user: TestUser, name = "Owner") {
  return { kind: "human", name, userId: user.id };
}

/** A client whose goal, audience and offering are confirmed, with a website project. */
async function websiteClient(projectType: Project["projectType"] = "website") {
  const repository = repositoryFor(owner, studio);
  await repository.load();
  const client = await repository.createClient({ name: `Spec Bakery ${randomUUID().slice(0, 6)} (test)` });
  for (const [key, value] of [["goal", "More cake pre-orders"], ["targetAudience", "Local families"], ["offering", "Celebration cakes"]] as const) {
    await repository.setContextField(client.id, key, { value, confidence: "confirmed" });
  }
  const project = await repository.createProject(client.id, { name: "New website", projectType });
  await repository.load();
  return { repository, clientId: client.id, project };
}

async function freshClient(clientId: string) {
  return (await repositoryFor(owner, studio).load()).clients.find((c) => c.id === clientId)!;
}

/** Draft → complete → submitted → approved, through the repository. */
async function approvedSpec() {
  const setup = await websiteClient();
  const { repository, clientId, project } = setup;
  const draft = await repository.startSiteSpec(project.id);
  const saved = await repository.saveSiteSpecDraft(draft, completeSpec(await freshClient(clientId)));
  const submitted = await repository.submitSiteSpec(saved);
  const approved = await repository.approveSiteSpec(submitted);
  return { ...setup, approved };
}

/** Calls the write function directly, the way a modified browser could. */
function rawWrite(user: TestUser, spec: { op: "insert" | "update"; row: Record<string, unknown>; expected?: string }, supersede: unknown = null) {
  return user.client.rpc("apply_site_spec_changes", { p_studio: studio, p_changes: { events: [] }, p_spec: spec, p_supersede: supersede });
}

describe("the lifecycle", () => {
  it("starts from the brief, saves, submits and approves, with one event per step on the project", async () => {
    const { project, approved } = await approvedSpec();
    expect(approved).toMatchObject({ version: 1, status: "approved", approvedBy: { kind: "human", userId: owner.id }, basedOn: null });
    expect(approved.approvedAt).not.toBeNull();
    expect(approved.spec.strategy.goal).toMatchObject({ text: "More cake pre-orders", source: { kind: "brief", field: "goal" } });

    const stored = await repositoryFor(member, studio).listSiteSpecs(project.id);
    expect(stored.map((r) => r.id)).toEqual([approved.id]);
    const events = (await repositoryFor(owner, studio).load()).activity.filter((e) => e.entityId === project.id && e.eventType.startsWith("site_spec."));
    expect(events.map((e) => e.eventType).sort()).toEqual(["site_spec.approved", "site_spec.created", "site_spec.submitted", "site_spec.updated"]);
    expect(events.every((e) => e.actor?.kind === "human" && e.actor.userId === owner.id)).toBe(true);
  });

  it("starts version 2 from the approved one, and approving it supersedes version 1 in one step", async () => {
    const { repository, project, approved } = await approvedSpec();
    const v2 = await repository.startSiteSpec(project.id);
    expect(v2).toMatchObject({ version: 2, basedOn: approved.id, status: "draft" });
    expect(await repository.startSiteSpec(project.id)).toMatchObject({ id: v2.id });

    const memberRepository = repositoryFor(member, studio);
    await memberRepository.load();
    const submitted = await memberRepository.submitSiteSpec(v2);
    await memberRepository.approveSiteSpec(submitted);
    const versions = await repository.listSiteSpecs(project.id);
    expect(versions.map((r) => [r.version, r.status])).toEqual([[2, "approved"], [1, "superseded"]]);
    expect(versions[1].approvedAt).toBe(approved.approvedAt);
  });

  it("sends a version back to draft with a note", async () => {
    const { repository, clientId, project } = await websiteClient();
    const draft = await repository.saveSiteSpecDraft(await repository.startSiteSpec(project.id), completeSpec(await freshClient(clientId)));
    const back = await repository.requestSiteSpecChanges(await repository.submitSiteSpec(draft), "Shorter heading");
    expect(back).toMatchObject({ status: "draft", reviewNote: "Shorter heading", submittedBy: null, submittedAt: null });
  });

  it("detects two people saving the same draft", async () => {
    const { repository, clientId, project } = await websiteClient();
    const draft = await repository.startSiteSpec(project.id);
    const spec = completeSpec(await freshClient(clientId));
    await repository.saveSiteSpecDraft(draft, spec);
    const other = repositoryFor(member, studio);
    await other.load();
    await expect(other.saveSiteSpecDraft(draft, { ...spec, strategy: { ...spec.strategy, tone: "Formal" } })).rejects.toMatchObject({ code: "conflict" });
  });
});

describe("who can see and change specs", () => {
  it("lets viewers read but not write, and shows other studios and signed-out visitors nothing", async () => {
    const { project, approved } = await approvedSpec();
    const viewerRepository = repositoryFor(viewer, studio);
    await viewerRepository.load();
    expect((await viewerRepository.listSiteSpecs(project.id)).map((r) => r.id)).toEqual([approved.id]);
    await expect(viewerRepository.startSiteSpec(project.id)).rejects.toBeInstanceOf(RepositoryError);
    expect((await rawWrite(viewer, { op: "insert", row: { ...siteSpecRow({ ...approved, id: randomUUID(), version: 2, basedOn: approved.id, status: "draft", submittedBy: null, submittedAt: null, approvedBy: null, approvedAt: null, reviewNote: null }), created_by: person(viewer) } })).error).not.toBeNull();

    expect((await outsider.client.from("site_specs").select("id").eq("project_id", project.id)).data).toEqual([]);
    expect((await anonClient().from("site_specs").select("id")).data ?? []).toEqual([]);
  });

  it("gives the service role no access at all", async () => {
    const { approved } = await approvedSpec();
    expect((await admin.from("site_specs").select("id").eq("id", approved.id)).error).not.toBeNull();
    expect((await admin.from("site_specs").update({ status: "superseded" }).eq("id", approved.id)).error).not.toBeNull();
  });
});

describe("what the database refuses", () => {
  it("refuses an approval in someone else's name", async () => {
    const { repository, clientId, project } = await websiteClient();
    const submitted = await repository.submitSiteSpec(await repository.saveSiteSpecDraft(await repository.startSiteSpec(project.id), completeSpec(await freshClient(clientId))));
    const row = { ...siteSpecRow(submitted), status: "approved", approved_by: person(member, "Sam Member") };
    const { error } = await rawWrite(owner, { op: "update", row, expected: submitted.updatedAt });
    expect(error?.message).toMatch(/approved by a person, in their own name/);
  });

  it("refuses an approval when a brief value is no longer confirmed, even if the app is bypassed", async () => {
    const { repository, clientId, project } = await websiteClient();
    const submitted = await repository.submitSiteSpec(await repository.saveSiteSpecDraft(await repository.startSiteSpec(project.id), completeSpec(await freshClient(clientId))));
    await repository.setContextField(clientId, "goal", { value: "Catering orders", confidence: "observed" });
    await expect(repository.approveSiteSpec(submitted)).rejects.toMatchObject({ code: "validation" });
    const row = { ...siteSpecRow(submitted), status: "approved", approved_by: person(owner) };
    const { error } = await rawWrite(owner, { op: "update", row, expected: submitted.updatedAt });
    expect(error?.message).toMatch(/no longer confirmed/);
  });

  it("refuses changes to an approved version, superseding it without a newer approval, and deleting", async () => {
    const { approved } = await approvedSpec();
    const changed = { ...siteSpecRow(approved), spec: { ...approved.spec, strategy: { ...approved.spec.strategy, tone: "Changed" } } };
    expect((await rawWrite(owner, { op: "update", row: changed, expected: approved.updatedAt })).error?.message).toMatch(/Only a draft can be edited/);
    expect((await owner.client.from("site_specs").update({ status: "superseded" }).eq("id", approved.id)).error?.message).toMatch(/replaced only by approving a newer one/);
    expect((await rawWrite(owner, { op: "update", row: siteSpecRow(approved), expected: approved.updatedAt }, { id: approved.id, expected: approved.updatedAt })).error?.message).toMatch(/replaced only by approving a newer one/);

    await asDatabaseOwner(async (db) => {
      await expect(db.query("update public.site_specs set spec = spec || '{\"x\": 1}' where id = $1", [approved.id])).rejects.toThrow(/Only a person/);
      await expect(db.query("delete from public.site_specs where id = $1", [approved.id])).rejects.toThrow(/versions are kept/);
    });
  });

  it("refuses specs for projects that are not websites, for another client's project, out of order, or twice open", async () => {
    const other = await websiteClient("other");
    const spec = completeSpec(await freshClient(other.clientId));
    const draftFor = (clientId: string, projectId: string, version = 1): SiteSpecRecord => ({
      id: randomUUID(), clientId, projectId, version, basedOn: null, status: "draft", spec,
      createdBy: person(owner) as SiteSpecRecord["createdBy"], submittedBy: null, submittedAt: null, approvedBy: null, approvedAt: null, reviewNote: null, createdAt: "", updatedAt: "",
    });
    expect((await rawWrite(owner, { op: "insert", row: siteSpecRow(draftFor(other.clientId, other.project.id)) })).error?.message).toMatch(/Only website projects/);

    const site = await websiteClient();
    expect((await rawWrite(owner, { op: "insert", row: siteSpecRow(draftFor(other.clientId, site.project.id)) })).error?.message).toMatch(/does not belong to this client/);
    expect((await rawWrite(owner, { op: "insert", row: siteSpecRow(draftFor(site.clientId, site.project.id, 3)) })).error?.message).toMatch(/changed this in the meantime/);
    expect((await rawWrite(owner, { op: "insert", row: siteSpecRow(draftFor(site.clientId, site.project.id)) })).error).toBeNull();
    expect((await rawWrite(owner, { op: "insert", row: siteSpecRow(draftFor(site.clientId, site.project.id, 2)) })).error).not.toBeNull();
    expect((await rawWrite(owner, { op: "insert", row: { ...siteSpecRow(draftFor(site.clientId, site.project.id, 2)), created_by: person(member) } })).error).not.toBeNull();
  });
});

describe("retention", () => {
  it("deletes a client's specs when the client is anonymised, and refuses new ones after", async () => {
    const { clientId, project, approved } = await approvedSpec();
    await asDatabaseOwner(async (db) => {
      await db.query("select private.anonymise_client($1, true)", [clientId]);
      expect((await db.query("select count(*)::int as n from public.site_specs where client_id = $1", [clientId])).rows[0].n).toBe(0);
    });
    // A valid new draft in every other respect, so only the anonymisation can refuse it.
    const row = siteSpecRow({
      ...approved,
      id: randomUUID(),
      version: 1,
      basedOn: null,
      status: "draft",
      submittedBy: null,
      submittedAt: null,
      approvedBy: null,
      approvedAt: null,
      reviewNote: null,
      createdBy: person(owner) as SiteSpecRecord["createdBy"],
    });
    expect((await rawWrite(owner, { op: "insert", row: { ...row, project_id: project.id } })).error?.message).toMatch(/anonymised/);
  });
});
