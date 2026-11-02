/**
 * Website specs against a local Supabase stack: the lifecycle through the
 * app's repository, and what the database refuses whatever the client sends:
 * other studios, viewers, the service role, approvals in someone else's name,
 * on unconfirmed brief values or without the server's check, rewriting
 * history, deleting, and anything for an anonymised client. Every value is
 * invented.
 */
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { RepositoryError } from "@/lib/data/repository";
import { toRepositoryError } from "@/lib/data/supabase-errors";
import { siteSpecRow } from "@/lib/data/supabase-rows";
import type { Project, SiteSpecRecord } from "@/lib/domain/types";
import { completeSpec } from "@/lib/site-spec/test-helpers";
import { addMember, admin, anonClient, approveRoute, asDatabaseOwner, createStudio, createUser, repositoryFor, type TestUser } from "./helpers";

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

  it("stores a quiet save without an activity entry, so autosaving does not fill the log", async () => {
    const { repository, clientId, project } = await websiteClient();
    const draft = await repository.startSiteSpec(project.id);
    const spec = completeSpec(await freshClient(clientId));
    const quiet = await repository.saveSiteSpecDraft(draft, spec, { quiet: true });
    expect(quiet.spec.strategy.tone).toBe(spec.strategy.tone);
    const edited = async () => (await repositoryFor(owner, studio).load()).activity.filter((e) => e.entityId === project.id && e.eventType === "site_spec.updated").length;
    expect(await edited()).toBe(0);
    await repository.saveSiteSpecDraft(quiet, { ...spec, strategy: { ...spec.strategy, tone: "Formal" } });
    expect(await edited()).toBe(1);
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

  it("refuses to approve a spec with blockers when the app is bypassed, through the function and the table", async () => {
    const { repository, project } = await websiteClient();
    // The starting draft has blockers: no brand chosen, empty texts.
    const draft = await repository.startSiteSpec(project.id);
    const submit = { ...siteSpecRow(draft), status: "in_review", submitted_by: person(owner) };
    expect((await rawWrite(owner, { op: "update", row: submit, expected: draft.updatedAt })).error).toBeNull();
    const inReview = (await repository.listSiteSpecs(project.id))[0];

    const approve = { ...siteSpecRow(inReview), status: "approved", approved_by: person(owner) };
    expect((await rawWrite(owner, { op: "update", row: approve, expected: inReview.updatedAt })).error?.message).toMatch(/approved through Studio OS/);
    const direct = await owner.client.from("site_specs").update({ status: "approved", approved_by: person(owner) }).eq("id", inReview.id);
    expect(direct.error?.message).toMatch(/approved through Studio OS/);
    expect((await repository.listSiteSpecs(project.id))[0].status).toBe("in_review");
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

describe("the server's check before an approval", () => {
  const tokenOf = async (user: TestUser) => (await user.client.auth.getSession()).data.session!.access_token;

  /** A complete version waiting for approval. */
  async function waiting() {
    const setup = await websiteClient();
    const draft = await setup.repository.startSiteSpec(setup.project.id);
    const saved = await setup.repository.saveSiteSpecDraft(draft, completeSpec(await freshClient(setup.clientId)));
    return { ...setup, submitted: await setup.repository.submitSiteSpec(saved) };
  }
  const approval = (record: SiteSpecRecord, user: TestUser) => ({ ...siteSpecRow(record), status: "approved", approved_by: person(user) });
  const requestFor = (record: SiteSpecRecord, studioId = studio) => ({ studioId, specId: record.id, expectedUpdatedAt: record.updatedAt });

  it("approves in the person's own name", async () => {
    const { project, submitted } = await waiting();
    const memberRepository = repositoryFor(member, studio);
    await memberRepository.load();
    const approved = await memberRepository.approveSiteSpec(submitted);
    expect(approved).toMatchObject({ status: "approved", approvedBy: { kind: "human", userId: member.id } });
    const events = (await repositoryFor(owner, studio).load()).activity.filter((e) => e.entityId === project.id && e.eventType === "site_spec.approved");
    expect(events.map((e) => e.actor)).toMatchObject([{ kind: "human", userId: member.id }]);
  });

  it("lists everything that blocks a spec, and leaves it waiting", async () => {
    const { repository, project } = await websiteClient();
    const draft = await repository.startSiteSpec(project.id);
    expect((await rawWrite(owner, { op: "update", row: { ...siteSpecRow(draft), status: "in_review", submitted_by: person(owner) }, expected: draft.updatedAt })).error).toBeNull();
    const inReview = (await repository.listSiteSpecs(project.id))[0];

    const response = await approveRoute(await tokenOf(owner), requestFor(inReview));
    expect(response.status).toBe(422);
    const body = (await response.json()) as { blockers: string[] };
    expect(body.blockers.length).toBeGreaterThan(1);
    expect(body.blockers).toContain("Choose the brand colours and fonts (the starting values are placeholders).");
    expect((await repository.listSiteSpecs(project.id))[0].status).toBe("in_review");
  });

  it("refuses leftover draft text, but not what is only worth checking", async () => {
    const { repository, clientId, project } = await websiteClient();
    const draft = await repository.startSiteSpec(project.id);
    const spec = completeSpec(await freshClient(clientId));
    spec.assets = [];
    const saved = await repository.saveSiteSpecDraft(draft, spec);
    const submitted = await repository.submitSiteSpec(saved);
    // Worth checking only: a test client's name, short search descriptions. Sent back to add leftover text.
    const back = await repository.requestSiteSpecChanges(submitted);
    const hero = spec.pages[0].sections[0];
    if (hero.kind === "hero") hero.heading.en = "TODO write the heading";
    const edited = await repository.saveSiteSpecDraft(back, spec);
    const raw = { ...siteSpecRow(edited), status: "in_review", submitted_by: person(owner) };
    expect((await rawWrite(owner, { op: "update", row: raw, expected: edited.updatedAt })).error).toBeNull();
    const inReview = (await repository.listSiteSpecs(project.id))[0];
    const response = await approveRoute(await tokenOf(owner), requestFor(inReview));
    expect(response.status).toBe(422);
    expect(((await response.json()) as { blockers: string[] }).blockers.join(" ")).toMatch(/still says "TODO"/);
    expect((await repository.listSiteSpecs(project.id))[0].status).toBe("in_review");
  });

  it("refuses viewers, other studios and signed-out requests, and says nothing about the spec", async () => {
    const { repository, project, submitted } = await waiting();
    expect((await approveRoute(null, requestFor(submitted))).status).toBe(401);
    expect((await approveRoute("not-a-session", requestFor(submitted))).status).toBe(401);
    expect((await approveRoute(await tokenOf(viewer), requestFor(submitted))).status).toBe(403);
    const outsiders = await approveRoute(await tokenOf(outsider), requestFor(submitted));
    expect(outsiders.status).toBe(404);
    expect(JSON.stringify(await outsiders.json())).not.toContain("Spec Bakery");
    expect((await approveRoute(await tokenOf(owner), { studioId: studio })).status).toBe(400);
    expect((await repository.listSiteSpecs(project.id))[0].status).toBe("in_review");
  });

  it("refuses a version that changed since the page loaded", async () => {
    const { submitted } = await waiting();
    const response = await approveRoute(await tokenOf(owner), { ...requestFor(submitted), expectedUpdatedAt: "2020-01-01T00:00:00Z" });
    expect(response.status).toBe(409);
  });

  it("lets only the server record a pass, and only for someone who may approve", async () => {
    const { submitted } = await waiting();
    expect((await owner.client.rpc("record_site_spec_check", { p_spec: submitted.id, p_person: owner.id })).error).not.toBeNull();
    expect((await anonClient().rpc("record_site_spec_check", { p_spec: submitted.id, p_person: owner.id })).error).not.toBeNull();
    expect((await owner.client.schema("private" as "public").from("site_spec_checks").select("spec_id")).error).not.toBeNull();
    expect((await admin.rpc("record_site_spec_check", { p_spec: submitted.id, p_person: viewer.id })).error?.message).toMatch(/read-only/);
    expect((await admin.rpc("record_site_spec_check", { p_spec: submitted.id, p_person: outsider.id })).error?.message).toMatch(/read-only/);
    expect((await admin.rpc("record_site_spec_check", { p_spec: randomUUID(), p_person: owner.id })).error?.message).toMatch(/waiting for approval/);
    // What the route turns into "someone else changed this" when another person approves first.
    const { approved } = await approvedSpec();
    const late = await admin.rpc("record_site_spec_check", { p_spec: approved.id, p_person: owner.id });
    expect(toRepositoryError(late.error)).toMatchObject({ code: "conflict", message: expect.stringMatching(/no longer waiting for approval/) });
  });

  it("accepts a pass only for the same person, the same content and for 5 minutes", async () => {
    const { submitted } = await waiting();
    const write = (user: TestUser) => rawWrite(user, { op: "update", row: approval(submitted, user), expected: submitted.updatedAt });
    expect((await admin.rpc("record_site_spec_check", { p_spec: submitted.id, p_person: member.id })).error).toBeNull();
    expect((await write(owner)).error?.message).toMatch(/approved through Studio OS/);

    expect((await admin.rpc("record_site_spec_check", { p_spec: submitted.id, p_person: owner.id })).error).toBeNull();
    await asDatabaseOwner((db) => db.query("update private.site_spec_checks set spec_hash = 'other' where spec_id = $1 and person = $2", [submitted.id, owner.id]));
    expect((await write(owner)).error?.message).toMatch(/approved through Studio OS/);

    expect((await admin.rpc("record_site_spec_check", { p_spec: submitted.id, p_person: owner.id })).error).toBeNull();
    await asDatabaseOwner((db) => db.query("update private.site_spec_checks set checked_at = now() - interval '6 minutes' where spec_id = $1 and person = $2", [submitted.id, owner.id]));
    expect((await write(owner)).error?.message).toMatch(/approved through Studio OS/);

    expect((await admin.rpc("record_site_spec_check", { p_spec: submitted.id, p_person: owner.id })).error).toBeNull();
    expect((await write(owner)).error).toBeNull();
  });

  it("does not let a pass skip the database's own rules", async () => {
    const { repository, clientId, submitted } = await waiting();
    expect((await admin.rpc("record_site_spec_check", { p_spec: submitted.id, p_person: owner.id })).error).toBeNull();
    await repository.setContextField(clientId, "goal", { value: "Catering orders", confidence: "observed" });
    const { error } = await rawWrite(owner, { op: "update", row: approval(submitted, owner), expected: submitted.updatedAt });
    expect(error?.message).toMatch(/no longer confirmed/);
  });

  it("lets one of two people approving at once succeed", async () => {
    const { project, submitted } = await waiting();
    const memberRepository = repositoryFor(member, studio);
    await memberRepository.load();
    const ownerRepository = repositoryFor(owner, studio);
    await ownerRepository.load();
    const results = await Promise.allSettled([ownerRepository.approveSiteSpec(submitted), memberRepository.approveSiteSpec(submitted)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const refused = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(refused.reason).toMatchObject({ code: "conflict" });
    const approved = (await ownerRepository.listSiteSpecs(project.id)).filter((r) => r.status === "approved");
    expect(approved).toHaveLength(1);
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
