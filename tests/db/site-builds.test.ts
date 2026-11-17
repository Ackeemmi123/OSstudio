/**
 * Site builds against a local Supabase stack: only the server stores builds
 * and their files, members of the studio read their own builds, and only a
 * writer can turn a link off. Every client and spec is invented.
 */
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { addMember, admin, createStudio, createUser, repositoryFor, type TestUser } from "./helpers";

let owner: TestUser;
let viewer: TestUser;
let outsider: TestUser;
let studio: string;

beforeAll(async () => {
  [owner, viewer, outsider] = await Promise.all([createUser("build-owner"), createUser("build-viewer"), createUser("build-outsider")]);
  studio = await createStudio(owner, "Build test");
  await createStudio(outsider, "Elsewhere");
  await addMember(owner, studio, viewer, "viewer", "Vera Viewer");
});

/** A client, a website project and a spec version, the way the editor makes them. */
async function newSpec() {
  const repository = repositoryFor(owner, studio);
  await repository.load();
  const client = await repository.createClient({ name: `Build client ${randomUUID().slice(0, 6)} (test)` });
  const project = await repository.createProject(client.id, { name: "Website", projectType: "website" });
  const spec = await repository.startSiteSpec(project.id);
  return { clientId: client.id, projectId: project.id, specId: spec.id, version: spec.version };
}

function row(ids: Awaited<ReturnType<typeof newSpec>>, token = randomUUID().replace(/-/g, "") + "abc") {
  const id = randomUUID();
  return {
    id,
    studio_id: studio,
    client_id: ids.clientId,
    project_id: ids.projectId,
    spec_id: ids.specId,
    spec_version: ids.version,
    design_system: "association@0.1",
    storage_prefix: `${studio}/${id}`,
    file_count: 3,
    byte_count: 1200,
    checks: [{ level: "warning", message: "The rights for one image are not decided yet." }],
    share_token: token,
    expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
    created_by: { kind: "human", name: "Owner", userId: owner.id },
  };
}

describe("site builds", () => {
  it("are written by the server only, never by a person's session", async () => {
    const ids = await newSpec();
    expect((await owner.client.from("site_builds").insert(row(ids))).error).not.toBeNull();
    expect((await owner.client.rpc("record_site_build", { p_build: row(ids) })).error).not.toBeNull();
    expect((await owner.client.rpc("site_build_by_token", { p_token: "x".repeat(32) })).error).not.toBeNull();
    const stored = await admin.rpc("record_site_build", { p_build: row(ids) });
    expect(stored.error).toBeNull();
  });

  it("are readable by the studio's people, not by others", async () => {
    const ids = await newSpec();
    const build = row(ids);
    expect((await admin.rpc("record_site_build", { p_build: build })).error).toBeNull();
    expect((await owner.client.from("site_builds").select("id").eq("id", build.id)).data).toHaveLength(1);
    expect((await viewer.client.from("site_builds").select("id").eq("id", build.id)).data).toHaveLength(1);
    expect((await outsider.client.from("site_builds").select("id").eq("id", build.id)).data).toHaveLength(0);
  });

  it("refuse a short or guessable link token", async () => {
    const ids = await newSpec();
    const { error } = await admin.rpc("record_site_build", { p_build: row(ids, "short") });
    expect(error).not.toBeNull();
  });

  it("can have their link turned off by a writer, once, and not by a viewer or an outsider", async () => {
    const ids = await newSpec();
    const build = row(ids);
    expect((await admin.rpc("record_site_build", { p_build: build })).error).toBeNull();
    expect((await viewer.client.rpc("revoke_site_build", { p_build: build.id })).error).not.toBeNull();
    expect((await outsider.client.rpc("revoke_site_build", { p_build: build.id })).error).not.toBeNull();
    const first = await owner.client.rpc("revoke_site_build", { p_build: build.id });
    expect(first.error).toBeNull();
    const again = await owner.client.rpc("revoke_site_build", { p_build: build.id });
    expect(again.data).toBe(first.data);
    const found = (await admin.rpc("site_build_by_token", { p_token: build.share_token })).data as { revoked_at: string | null }[];
    expect(found[0].revoked_at).not.toBeNull();
  });

  it("keep their files out of every person's reach", async () => {
    const ids = await newSpec();
    const build = row(ids);
    const path = `${build.storage_prefix}/index.html`;
    expect((await admin.storage.from("site-builds").upload(path, new TextEncoder().encode("<!doctype html><title>t</title>"), { contentType: "text/html" })).error).toBeNull();
    expect((await owner.client.storage.from("site-builds").createSignedUrl(path, 60)).error).not.toBeNull();
    expect((await owner.client.storage.from("site-builds").upload(`${build.storage_prefix}/x.html`, new TextEncoder().encode("x"), { contentType: "text/html" })).error).not.toBeNull();
  });
});
