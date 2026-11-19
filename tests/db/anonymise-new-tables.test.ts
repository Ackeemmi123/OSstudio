/**
 * Anonymising a client removes what later parts of Studio OS keep about it:
 * its files, its site's documents, its built sites (links off, files queued
 * for the purge), and the comments and approvals from the review link. And a
 * person deleting a file queues it instead of keeping it. Every client and
 * file is invented.
 */
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { admin, asDatabaseOwner, createStudio, createUser, repositoryFor, type TestUser } from "./helpers";

let owner: TestUser;
let studio: string;

beforeAll(async () => {
  owner = await createUser("anon-owner");
  studio = await createStudio(owner, "Anonymise test");
});

const by = () => ({ kind: "human", name: "Owner", userId: owner.id });

/** A client with a file, a site document, a built site, a comment and an approval. */
async function fullClient() {
  const repository = repositoryFor(owner, studio);
  await repository.load();
  const client = await repository.createClient({ name: `Anon client ${randomUUID().slice(0, 6)} (test)`, contactPerson: "Anna Test" });
  const project = await repository.createProject(client.id, { name: "Website", projectType: "website" });
  const spec = await repository.startSiteSpec(project.id);
  const material = randomUUID();
  const document = randomUUID();
  const build = randomUUID();
  const token = randomUUID().replace(/-/g, "") + "anon";
  const calls = [
    admin.rpc("record_client_material", { p_material: { id: material, studio_id: studio, client_id: client.id, storage_path: `${studio}/${client.id}/${material}.pdf`, title: "Brief (test)", mime_type: "application/pdf", byte_size: 10, sha256: "c".repeat(64), added_by: by() } }),
    admin.rpc("record_site_document", { p_document: { id: document, studio_id: studio, client_id: client.id, storage_path: `${studio}/${client.id}/${document}.pdf`, title: "Stadgar (test)", byte_size: 10, sha256: "d".repeat(64), uploaded_by: by() } }),
    admin.rpc("record_site_build", { p_build: { id: build, studio_id: studio, client_id: client.id, project_id: project.id, spec_id: spec.id, spec_version: spec.version, design_system: "association@0.1", storage_prefix: `${studio}/${build}`, file_count: 2, byte_count: 20, checks: [{ level: "warning", message: "Bild av Anna (test)" }], share_token: token, expires_at: new Date(Date.now() + 86400000).toISOString(), created_by: by() } }),
  ];
  for (const call of calls) expect((await call).error).toBeNull();
  expect((await admin.rpc("record_review_comment", { p_token: token, p_comment: { page: "/", target: "h1", body: "Byt rubrik (test)", author: "Anna Test" } })).error).toBeNull();
  expect((await admin.rpc("record_site_approval", { p_token: token, p_approval: { name: "Anna Test", role: "Ordförande", email: "anna@example.test", statement: "Godkänt (test)" } })).error).toBeNull();
  return { clientId: client.id, material, document, build, token };
}

async function queued(): Promise<{ bucket: string; path: string; is_prefix: boolean }[]> {
  const { data, error } = await admin.rpc("storage_files_due_for_purge", { p_limit: 500 });
  if (error) throw error;
  return data ?? [];
}

describe("anonymising a client's newer records", () => {
  it("removes files, documents, comments and approvals, turns links off and queues the files", async () => {
    const c = await fullClient();
    await asDatabaseOwner((db) => db.query("select private.anonymise_client($1, true)", [c.clientId]));

    expect((await owner.client.from("client_materials").select("id").eq("client_id", c.clientId)).data).toEqual([]);
    expect((await owner.client.from("site_documents").select("id").eq("client_id", c.clientId)).data).toEqual([]);
    expect((await owner.client.from("site_review_comments").select("id").eq("client_id", c.clientId)).data).toEqual([]);
    expect((await owner.client.from("site_approvals").select("id").eq("client_id", c.clientId)).data).toEqual([]);
    const build = (await owner.client.from("site_builds").select("revoked_at, reviews_enabled, checks").eq("id", c.build).single()).data!;
    expect(build.revoked_at).not.toBeNull();
    expect(build).toMatchObject({ reviews_enabled: false, checks: [] });
    expect((await admin.rpc("site_review_state", { p_token: c.token })).data).toBeNull();

    const paths = (await queued()).map((q) => `${q.bucket}:${q.path}:${q.is_prefix}`);
    expect(paths).toEqual(
      expect.arrayContaining([
        `client-materials:${studio}/${c.clientId}/${c.material}.pdf:false`,
        `site-documents:${studio}/${c.clientId}/${c.document}.pdf:false`,
        `site-builds:${studio}/${c.build}:true`,
      ]),
    );
  });

  it("queues a file when a person deletes it, and the purge can forget it", async () => {
    const c = await fullClient();
    expect((await owner.client.rpc("delete_client_material", { p_material: c.material })).error).toBeNull();
    expect((await owner.client.rpc("delete_site_document", { p_document: c.document })).error).toBeNull();
    const mine = (await queued()).filter((q) => q.path.includes(c.clientId));
    expect(mine.map((q) => q.bucket).sort()).toEqual(["client-materials", "site-documents"]);
    const ids = ((await admin.rpc("storage_files_due_for_purge", { p_limit: 500 })).data as { id: number; path: string }[]).filter((q) => q.path.includes(c.clientId)).map((q) => q.id);
    expect((await admin.rpc("forget_purged_storage_files", { p_ids: ids })).data).toBe(2);
  });

  it("keeps the queue out of people's reach", async () => {
    expect((await owner.client.rpc("storage_files_due_for_purge", { p_limit: 10 })).error).not.toBeNull();
    expect((await owner.client.from("storage_purge_queue").select("id")).error).not.toBeNull();
  });
});
