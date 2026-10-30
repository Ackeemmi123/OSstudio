/**
 * Website images against a local Supabase stack with Storage: the upload
 * steps the server route takes (begin as the person, store as the person,
 * finish as the service role), storage isolation between studios, clients
 * and roles, the bucket's limits, rights decisions, website specs using
 * only approved images of their client, deletion, anonymisation and the
 * purge. Every image is generated; no photo of anyone.
 */
import { createHash, randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { emptyProvenance, STORAGE_BUCKET } from "@/lib/site-assets/limits";
import { pngImage } from "@/lib/site-assets/test-images";
import { completeSpec } from "@/lib/site-spec/test-helpers";
import { addMember, admin, anonClient, asDatabaseOwner, createStudio, createUser, repositoryFor, type TestUser } from "./helpers";

let owner: TestUser;
let member: TestUser;
let viewer: TestUser;
let outsider: TestUser;
let studio: string;
let otherStudio: string;

beforeAll(async () => {
  [owner, member, viewer, outsider] = await Promise.all([
    createUser("img-owner"),
    createUser("img-member"),
    createUser("img-viewer"),
    createUser("img-outsider"),
  ]);
  studio = await createStudio(owner, "Image test");
  otherStudio = await createStudio(outsider, "Elsewhere");
  await addMember(owner, studio, member, "member", "Sam Member");
  await addMember(owner, studio, viewer, "viewer", "Vera Viewer");
});

const person = (user: TestUser, name = "Owner") => ({ kind: "human", name, userId: user.id });

async function newClient(user = owner, studioId = studio) {
  const repository = repositoryFor(user, studioId);
  await repository.load();
  return (await repository.createClient({ name: `Image client ${randomUUID().slice(0, 6)} (test)` })).id;
}

function measure(bytes: Uint8Array) {
  return { mimeType: "image/png", byteSize: bytes.length, width: 400, height: 300, sha256: createHash("sha256").update(bytes).digest("hex") };
}

const answers = {
  ...emptyProvenance("Strawberry cake (test)"),
  rightsBasis: "client_owns" as const,
  usePermitted: true,
  usePermissionNote: "Client email, 3 Nov (test)",
};

/** The route's three steps. Returns the asset id. */
async function upload(user: TestUser, clientId: string, bytes = pngImage(400, 300, [Math.floor(Math.random() * 255), 10, 10]), studioId = studio) {
  const begun = await user.client.rpc("begin_site_asset_upload", { p_studio: studioId, p_client: clientId, p_asset: { ...measure(bytes), ...answers }, p_actor: person(user) });
  if (begun.error) throw begun.error;
  const { id, storagePath } = begun.data as { id: string; storagePath: string };
  const stored = await user.client.storage.from(STORAGE_BUCKET).upload(storagePath, bytes, { contentType: "image/png" });
  if (stored.error) throw stored.error;
  const finished = await admin.rpc("finish_site_asset_upload", { p_asset: id, p_measured: measure(bytes) });
  if (finished.error) throw finished.error;
  return { id, storagePath, bytes };
}

async function approve(user: TestUser, id: string) {
  const { error } = await user.client.rpc("review_site_asset", { p_studio: studio, p_asset: id, p_decision: "approve", p_details: answers, p_note: null, p_actor: person(user) });
  if (error) throw error;
}

const canRead = async (user: TestUser, path: string) => !(await user.client.storage.from(STORAGE_BUCKET).createSignedUrl(path, 60)).error;

describe("uploading", () => {
  it("stores a checked image readable by the studio's people only", async () => {
    const clientId = await newClient();
    const { id, storagePath } = await upload(owner, clientId);
    const row = (await owner.client.from("site_assets").select("status, validated_at, uploaded_by").eq("id", id).single()).data!;
    expect(row).toMatchObject({ status: "pending_review", uploaded_by: { userId: owner.id } });
    expect(row.validated_at).not.toBeNull();
    expect(storagePath).toBe(`${studio}/${clientId}/${id}.png`);
    expect(await canRead(member, storagePath)).toBe(true);
    expect(await canRead(viewer, storagePath)).toBe(true);
    expect(await canRead(outsider, storagePath)).toBe(false);
    expect((await outsider.client.from("site_assets").select("id").eq("id", id)).data).toEqual([]);
    expect((await anonClient().storage.from(STORAGE_BUCKET).createSignedUrl(storagePath, 60)).error).not.toBeNull();
  });

  it("reuses an image already stored for the client", async () => {
    const clientId = await newClient();
    const first = await upload(owner, clientId);
    const again = await owner.client.rpc("begin_site_asset_upload", { p_studio: studio, p_client: clientId, p_asset: { ...measure(first.bytes), ...answers }, p_actor: person(owner) });
    expect(again.data).toMatchObject({ id: first.id, existing: true });
  });

  it("refuses viewers, other studios, someone else's upload, and paths nobody began", async () => {
    const clientId = await newClient();
    const bytes = pngImage();
    expect((await viewer.client.rpc("begin_site_asset_upload", { p_studio: studio, p_client: clientId, p_asset: { ...measure(bytes), ...answers }, p_actor: person(viewer) })).error).not.toBeNull();
    expect((await outsider.client.rpc("begin_site_asset_upload", { p_studio: studio, p_client: clientId, p_asset: { ...measure(bytes), ...answers }, p_actor: person(outsider) })).error).not.toBeNull();
    expect((await owner.client.rpc("begin_site_asset_upload", { p_studio: studio, p_client: clientId, p_asset: { ...measure(bytes), ...answers }, p_actor: person(member) })).error?.message).toMatch(/own name/);

    const begun = (await owner.client.rpc("begin_site_asset_upload", { p_studio: studio, p_client: clientId, p_asset: { ...measure(bytes), ...answers }, p_actor: person(owner) })).data as { storagePath: string };
    expect((await member.client.storage.from(STORAGE_BUCKET).upload(begun.storagePath, bytes, { contentType: "image/png" })).error).not.toBeNull();
    expect((await outsider.client.storage.from(STORAGE_BUCKET).upload(begun.storagePath, bytes, { contentType: "image/png" })).error).not.toBeNull();
    expect((await owner.client.storage.from(STORAGE_BUCKET).upload(`${studio}/${clientId}/${randomUUID()}.png`, bytes, { contentType: "image/png" })).error).not.toBeNull();
  });

  it("keeps a file nobody checked unreadable, and only the server can check it", async () => {
    const clientId = await newClient();
    const bytes = pngImage();
    const begun = (await owner.client.rpc("begin_site_asset_upload", { p_studio: studio, p_client: clientId, p_asset: { ...measure(bytes), ...answers }, p_actor: person(owner) })).data as { id: string; storagePath: string };
    expect((await owner.client.storage.from(STORAGE_BUCKET).upload(begun.storagePath, bytes, { contentType: "image/png" })).error).toBeNull();
    expect(await canRead(owner, begun.storagePath)).toBe(false);
    expect((await owner.client.rpc("finish_site_asset_upload", { p_asset: begun.id, p_measured: measure(bytes) })).error).not.toBeNull();
    expect((await admin.rpc("finish_site_asset_upload", { p_asset: begun.id, p_measured: { ...measure(bytes), byteSize: bytes.length + 1 } })).error?.message).toMatch(/not the file that was checked/);
    expect((await admin.from("site_assets").select("id")).error).not.toBeNull();
  });

  it("lets the bucket refuse other file types and files over 3 MB", async () => {
    const clientId = await newClient();
    const bytes = pngImage();
    const begun = (await owner.client.rpc("begin_site_asset_upload", { p_studio: studio, p_client: clientId, p_asset: { ...measure(bytes), ...answers }, p_actor: person(owner) })).data as { storagePath: string };
    const html = new TextEncoder().encode("<html><script>alert(1)</script></html>");
    expect((await owner.client.storage.from(STORAGE_BUCKET).upload(begun.storagePath, html, { contentType: "text/html" })).error).not.toBeNull();
    const big = new Uint8Array(3 * 1024 * 1024 + 1);
    expect((await owner.client.storage.from(STORAGE_BUCKET).upload(begun.storagePath, big, { contentType: "image/png" })).error).not.toBeNull();
    expect((await owner.client.rpc("begin_site_asset_upload", { p_studio: studio, p_client: clientId, p_asset: { ...measure(bytes), mimeType: "image/svg+xml", ...answers }, p_actor: person(owner) })).error).not.toBeNull();
  });

  it("allows nobody to change or delete a stored file through Storage", async () => {
    const clientId = await newClient();
    const { storagePath } = await upload(owner, clientId);
    await owner.client.storage.from(STORAGE_BUCKET).remove([storagePath]);
    expect(await canRead(owner, storagePath)).toBe(true);
    expect((await owner.client.storage.from(STORAGE_BUCKET).update(storagePath, pngImage(), { contentType: "image/png" })).error).not.toBeNull();
  });
});

describe("rights decisions", () => {
  it("approves only with every answer, in the person's own name, and never as the server", async () => {
    const clientId = await newClient();
    const { id } = await upload(owner, clientId);
    const incomplete = await owner.client.rpc("review_site_asset", { p_studio: studio, p_asset: id, p_decision: "approve", p_details: { ...answers, usePermitted: false }, p_note: null, p_actor: person(owner) });
    expect(incomplete.error).not.toBeNull();
    const people = await owner.client.rpc("review_site_asset", { p_studio: studio, p_asset: id, p_decision: "approve", p_details: { ...answers, identifiablePeople: true }, p_note: null, p_actor: person(owner) });
    expect(people.error).not.toBeNull();
    expect((await owner.client.rpc("review_site_asset", { p_studio: studio, p_asset: id, p_decision: "approve", p_details: answers, p_note: null, p_actor: person(member) })).error?.message).toMatch(/own name/);
    expect((await viewer.client.rpc("review_site_asset", { p_studio: studio, p_asset: id, p_decision: "approve", p_details: answers, p_note: null, p_actor: person(viewer) })).error).not.toBeNull();
    expect((await admin.rpc("review_site_asset", { p_studio: studio, p_asset: id, p_decision: "approve", p_details: answers, p_note: null, p_actor: person(owner) })).error).not.toBeNull();

    const withBasis = { ...answers, identifiablePeople: true, peopleBasis: "contract", peopleBasisNote: "Staff agreement (test)" };
    const ok = await member.client.rpc("review_site_asset", { p_studio: studio, p_asset: id, p_decision: "approve", p_details: withBasis, p_note: "Fine", p_actor: person(member, "Sam Member") });
    expect(ok.error).toBeNull();
    const row = (await owner.client.from("site_assets").select("status, reviewed_by, people_basis").eq("id", id).single()).data!;
    expect(row).toMatchObject({ status: "approved", reviewed_by: { userId: member.id }, people_basis: "contract" });
    expect((await owner.client.rpc("review_site_asset", { p_studio: studio, p_asset: id, p_decision: "reject", p_details: answers, p_note: null, p_actor: person(owner) })).error).not.toBeNull();
  });
});

describe("website specs and images", () => {
  async function specUsing(clientId: string, fileId: string) {
    const repository = repositoryFor(owner, studio);
    await repository.load();
    for (const [key, value] of [["goal", "More orders"], ["targetAudience", "Families"], ["offering", "Cakes"]] as const) {
      await repository.setContextField(clientId, key, { value, confidence: "confirmed" });
    }
    const project = await repository.createProject(clientId, { name: "Website", projectType: "website" });
    const client = (await repository.load()).clients.find((c) => c.id === clientId)!;
    const spec = completeSpec(client);
    spec.assets.push({ id: "photo", kind: "photo", alt: { en: "Cake" }, origin: "client_supplied", description: "Cake", fileId });
    const draft = await repository.saveSiteSpecDraft(await repository.startSiteSpec(project.id), spec);
    return { repository, draft };
  }

  it("approves a spec only when its images are approved images of the same client", async () => {
    const clientId = await newClient();
    const { id } = await upload(owner, clientId);
    const { repository, draft } = await specUsing(clientId, id);
    await expect(repository.submitSiteSpec(draft)).rejects.toMatchObject({ code: "validation" });

    // Around the app: the database refuses too.
    const raw = (status: string) =>
      owner.client.rpc("apply_site_spec_changes", {
        p_studio: studio,
        p_changes: { events: [] },
        p_spec: { op: "update", row: { id: draft.id, spec: draft.spec, status, submitted_by: person(owner), approved_by: status === "approved" ? person(owner) : null, review_note: null }, expected: draft.updatedAt },
      });
    expect((await raw("in_review")).error).toBeNull();
    const inReview = (await repository.listSiteSpecs(draft.projectId))[0];
    const approveRaw = await owner.client.rpc("apply_site_spec_changes", {
      p_studio: studio,
      p_changes: { events: [] },
      p_spec: { op: "update", row: { id: inReview.id, spec: inReview.spec, status: "approved", submitted_by: inReview.submittedBy, approved_by: person(owner), review_note: null }, expected: inReview.updatedAt },
    });
    expect(approveRaw.error?.message).toMatch(/approved image of this client/);

    await approve(owner, id);
    await repository.load();
    expect((await repository.approveSiteSpec(inReview)).status).toBe("approved");
  });

  it("refuses another client's image, even approved", async () => {
    const clientA = await newClient();
    const clientB = await newClient();
    const { id } = await upload(owner, clientA);
    await approve(owner, id);
    const { repository, draft } = await specUsing(clientB, id);
    await expect(repository.submitSiteSpec(draft)).rejects.toMatchObject({ code: "validation" });
  });
});

describe("deletion, anonymisation and the purge", () => {
  it("refuses to delete an image an approved spec uses, and hides others at once", async () => {
    const clientId = await newClient();
    const used = await upload(owner, clientId);
    const unused = await upload(owner, clientId);
    await approve(owner, used.id);
    const repository = repositoryFor(owner, studio);
    await repository.load();
    for (const [key, value] of [["goal", "More orders"], ["targetAudience", "Families"], ["offering", "Cakes"]] as const) {
      await repository.setContextField(clientId, key, { value, confidence: "confirmed" });
    }
    const project = await repository.createProject(clientId, { name: "Website", projectType: "website" });
    const client = (await repository.load()).clients.find((c) => c.id === clientId)!;
    const spec = completeSpec(client);
    spec.assets.push({ id: "photo", kind: "photo", alt: { en: "Cake" }, origin: "client_supplied", description: "Cake", fileId: used.id });
    const draft = await repository.saveSiteSpecDraft(await repository.startSiteSpec(project.id), spec);
    await repository.approveSiteSpec(await repository.submitSiteSpec(draft));

    expect((await owner.client.rpc("delete_site_asset", { p_studio: studio, p_asset: used.id, p_actor: person(owner) })).error?.message).toMatch(/used by a website spec/);
    expect((await viewer.client.rpc("delete_site_asset", { p_studio: studio, p_asset: unused.id, p_actor: person(viewer) })).error).not.toBeNull();
    expect((await owner.client.rpc("delete_site_asset", { p_studio: studio, p_asset: unused.id, p_actor: person(owner) })).error).toBeNull();
    expect(await canRead(owner, unused.storagePath)).toBe(false);
    const row = (await owner.client.from("site_assets").select("status, purge_requested_at").eq("id", unused.id).single()).data!;
    expect(row.status).toBe("deleted");
    expect(row.purge_requested_at).not.toBeNull();
  });

  it("anonymising a client hides its images and refuses new ones; the purge deletes the files and rows", async () => {
    const clientId = await newClient();
    const { id, storagePath } = await upload(owner, clientId);
    await approve(owner, id);
    await asDatabaseOwner((db) => db.query("select private.anonymise_client($1, true)", [clientId]));
    expect(await canRead(owner, storagePath)).toBe(false);
    expect((await owner.client.rpc("begin_site_asset_upload", { p_studio: studio, p_client: clientId, p_asset: { ...measure(pngImage()), ...answers }, p_actor: person(owner) })).error?.message).toMatch(/anonymised/);

    const due = (await admin.rpc("site_assets_due_for_purge", { p_limit: 500 })).data as { id: string; storage_path: string }[];
    expect(due.map((d) => d.id)).toContain(id);
    expect((await admin.storage.from(STORAGE_BUCKET).remove([storagePath])).error).toBeNull();
    expect((await admin.rpc("forget_purged_site_assets", { p_ids: [id] })).data).toBe(1);
    expect((await admin.storage.from(STORAGE_BUCKET).list(`${studio}/${clientId}`)).data ?? []).toEqual([]);
    expect((await owner.client.rpc("site_assets_due_for_purge", { p_limit: 10 })).error).not.toBeNull();
    expect((await owner.client.rpc("forget_purged_site_assets", { p_ids: [id] })).error).not.toBeNull();
  });

  it("forgets nothing that is still in use", async () => {
    const clientId = await newClient();
    const { id } = await upload(owner, clientId);
    expect((await admin.rpc("forget_purged_site_assets", { p_ids: [id] })).data).toBe(0);
    await asDatabaseOwner(async (db) => {
      await expect(db.query("delete from public.site_assets where id = $1", [id])).rejects.toThrow(/through the purge/);
    });
    expect(otherStudio).toBeTruthy();
  });
});
