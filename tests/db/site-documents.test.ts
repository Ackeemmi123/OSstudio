/**
 * Site documents against a local Supabase stack: only the server records a
 * document and stores its file, the studio's people read the records, and a
 * writer, not a viewer or an outsider, can delete one. Every file is invented.
 */
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { addMember, admin, createStudio, createUser, repositoryFor, type TestUser } from "./helpers";

let owner: TestUser;
let viewer: TestUser;
let outsider: TestUser;
let studio: string;

beforeAll(async () => {
  [owner, viewer, outsider] = await Promise.all([createUser("doc-owner"), createUser("doc-viewer"), createUser("doc-outsider")]);
  studio = await createStudio(owner, "Document test");
  await createStudio(outsider, "Elsewhere");
  await addMember(owner, studio, viewer, "viewer", "Vera Viewer");
});

async function newClient() {
  const repository = repositoryFor(owner, studio);
  await repository.load();
  return (await repository.createClient({ name: `Document client ${randomUUID().slice(0, 6)} (test)` })).id;
}

function document(clientId: string) {
  const id = randomUUID();
  return {
    id,
    studio_id: studio,
    client_id: clientId,
    storage_path: `${studio}/${clientId}/${id}.pdf`,
    title: "Stadgar (test)",
    byte_size: 12,
    sha256: "a".repeat(64),
    uploaded_by: { kind: "human", name: "Owner", userId: owner.id },
  };
}

describe("site documents", () => {
  it("are recorded by the server only", async () => {
    const clientId = await newClient();
    expect((await owner.client.from("site_documents").insert(document(clientId))).error).not.toBeNull();
    expect((await owner.client.rpc("record_site_document", { p_document: document(clientId) })).error).not.toBeNull();
    expect((await admin.rpc("record_site_document", { p_document: document(clientId) })).error).toBeNull();
  });

  it("are readable by the studio's people, not by others", async () => {
    const clientId = await newClient();
    const doc = document(clientId);
    expect((await admin.rpc("record_site_document", { p_document: doc })).error).toBeNull();
    expect((await owner.client.from("site_documents").select("id").eq("id", doc.id)).data).toHaveLength(1);
    expect((await viewer.client.from("site_documents").select("id").eq("id", doc.id)).data).toHaveLength(1);
    expect((await outsider.client.from("site_documents").select("id").eq("id", doc.id)).data).toHaveLength(0);
  });

  it("can be deleted by a writer, not by a viewer or an outsider", async () => {
    const clientId = await newClient();
    const doc = document(clientId);
    expect((await admin.rpc("record_site_document", { p_document: doc })).error).toBeNull();
    expect((await viewer.client.rpc("delete_site_document", { p_document: doc.id })).error).not.toBeNull();
    expect((await outsider.client.rpc("delete_site_document", { p_document: doc.id })).error).not.toBeNull();
    expect((await owner.client.rpc("delete_site_document", { p_document: doc.id })).error).toBeNull();
    const row = (await owner.client.from("site_documents").select("deleted_at").eq("id", doc.id).single()).data!;
    expect(row.deleted_at).not.toBeNull();
  });

  it("refuse an empty title", async () => {
    const clientId = await newClient();
    expect((await admin.rpc("record_site_document", { p_document: { ...document(clientId), title: " " } })).error).not.toBeNull();
  });

  it("keep their files out of every person's reach", async () => {
    const clientId = await newClient();
    const doc = document(clientId);
    expect((await admin.storage.from("site-documents").upload(doc.storage_path, new TextEncoder().encode("%PDF-1.7 test"), { contentType: "application/pdf" })).error).toBeNull();
    expect((await owner.client.storage.from("site-documents").createSignedUrl(doc.storage_path, 60)).error).not.toBeNull();
    expect((await owner.client.storage.from("site-documents").upload(`${studio}/${clientId}/x.pdf`, new TextEncoder().encode("%PDF-1.7"), { contentType: "application/pdf" })).error).not.toBeNull();
  });
});
