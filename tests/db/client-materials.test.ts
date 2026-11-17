/**
 * Client materials against a local Supabase stack: only the server records a
 * file and stores it, the studio's people read the records, and a writer, not
 * a viewer or an outsider, can delete one. Every file is invented.
 */
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { addMember, admin, createStudio, createUser, repositoryFor, type TestUser } from "./helpers";

let owner: TestUser;
let viewer: TestUser;
let outsider: TestUser;
let studio: string;

beforeAll(async () => {
  [owner, viewer, outsider] = await Promise.all([createUser("mat-owner"), createUser("mat-viewer"), createUser("mat-outsider")]);
  studio = await createStudio(owner, "Material test");
  await createStudio(outsider, "Elsewhere");
  await addMember(owner, studio, viewer, "viewer", "Vera Viewer");
});

async function newClient() {
  const repository = repositoryFor(owner, studio);
  await repository.load();
  return (await repository.createClient({ name: `Material client ${randomUUID().slice(0, 6)} (test)` })).id;
}

function material(clientId: string) {
  const id = randomUUID();
  return {
    id,
    studio_id: studio,
    client_id: clientId,
    storage_path: `${studio}/${clientId}/${id}.pdf`,
    title: "Brief (test)",
    mime_type: "application/pdf",
    byte_size: 12,
    sha256: "b".repeat(64),
    added_by: { kind: "human", name: "Owner", userId: owner.id },
  };
}

describe("client materials", () => {
  it("are recorded by the server only", async () => {
    const clientId = await newClient();
    expect((await owner.client.from("client_materials").insert(material(clientId))).error).not.toBeNull();
    expect((await owner.client.rpc("record_client_material", { p_material: material(clientId) })).error).not.toBeNull();
    expect((await admin.rpc("record_client_material", { p_material: material(clientId) })).error).toBeNull();
  });

  it("are readable by the studio's people, not by others", async () => {
    const clientId = await newClient();
    const file = material(clientId);
    expect((await admin.rpc("record_client_material", { p_material: file })).error).toBeNull();
    expect((await owner.client.from("client_materials").select("id").eq("id", file.id)).data).toHaveLength(1);
    expect((await viewer.client.from("client_materials").select("id").eq("id", file.id)).data).toHaveLength(1);
    expect((await outsider.client.from("client_materials").select("id").eq("id", file.id)).data).toHaveLength(0);
  });

  it("can be deleted by a writer, not by a viewer or an outsider", async () => {
    const clientId = await newClient();
    const file = material(clientId);
    expect((await admin.rpc("record_client_material", { p_material: file })).error).toBeNull();
    expect((await viewer.client.rpc("delete_client_material", { p_material: file.id })).error).not.toBeNull();
    expect((await outsider.client.rpc("delete_client_material", { p_material: file.id })).error).not.toBeNull();
    expect((await owner.client.rpc("delete_client_material", { p_material: file.id })).error).toBeNull();
    const row = (await owner.client.from("client_materials").select("deleted_at").eq("id", file.id).single()).data!;
    expect(row.deleted_at).not.toBeNull();
  });

  it("refuse an empty title or another file type", async () => {
    const clientId = await newClient();
    expect((await admin.rpc("record_client_material", { p_material: { ...material(clientId), title: " " } })).error).not.toBeNull();
    expect((await admin.rpc("record_client_material", { p_material: { ...material(clientId), mime_type: "text/html" } })).error).not.toBeNull();
  });

  it("keep their files out of every person's reach", async () => {
    const clientId = await newClient();
    const file = material(clientId);
    expect((await admin.storage.from("client-materials").upload(file.storage_path, new TextEncoder().encode("%PDF-1.7 test"), { contentType: "application/pdf" })).error).toBeNull();
    expect((await owner.client.storage.from("client-materials").createSignedUrl(file.storage_path, 60)).error).not.toBeNull();
    expect((await owner.client.storage.from("client-materials").upload(`${studio}/${clientId}/x.pdf`, new TextEncoder().encode("%PDF-1.7"), { contentType: "application/pdf" })).error).not.toBeNull();
  });
});
