/**
 * Publications against a local Supabase stack: only the server records and
 * restores them, one is live per project, the studio's people read them, and
 * a site's form sends at most 20 messages an hour. Every client is invented.
 */
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { admin, asDatabaseOwner, createStudio, createUser, repositoryFor, type TestUser } from "./helpers";

let owner: TestUser;
let outsider: TestUser;
let studio: string;

beforeAll(async () => {
  [owner, outsider] = await Promise.all([createUser("pub-owner"), createUser("pub-outsider")]);
  studio = await createStudio(owner, "Publish test");
  await createStudio(outsider, "Elsewhere");
});

async function newProject() {
  const repository = repositoryFor(owner, studio);
  await repository.load();
  const client = await repository.createClient({ name: `Publish client ${randomUUID().slice(0, 6)} (test)` });
  const project = await repository.createProject(client.id, { name: "Website", projectType: "website" });
  const spec = await repository.startSiteSpec(project.id);
  const build = randomUUID();
  const { error } = await admin.rpc("record_site_build", {
    p_build: {
      id: build, studio_id: studio, client_id: client.id, project_id: project.id, spec_id: spec.id, spec_version: spec.version,
      design_system: "association@0.1", storage_prefix: `${studio}/${build}`, file_count: 1, byte_count: 10, checks: [],
      share_token: randomUUID().replace(/-/g, "") + "pub", expires_at: new Date(Date.now() + 86400000).toISOString(),
      created_by: { kind: "human", name: "Owner", userId: owner.id },
    },
  });
  if (error) throw error;
  return { clientId: client.id, projectId: project.id, specId: spec.id, version: spec.version, build };
}

const publication = (p: Awaited<ReturnType<typeof newProject>>, formKey: string) => ({
  id: randomUUID(), studio_id: studio, client_id: p.clientId, project_id: p.projectId, spec_id: p.specId, spec_version: p.version,
  approved_build_id: p.build, hosting_project: "prj_test", deployment_id: `dpl_${randomUUID().slice(0, 8)}`, deployment_url: "https://site-test.vercel.app",
  domain: "forening.example", form_key: formKey, form_recipient: "kontakt@example.test", site_name: "Test (test)", published_by: { kind: "human", name: "Owner", userId: owner.id },
});

describe("site publications", () => {
  it("are recorded by the server only, one live per project, and restored", async () => {
    const p = await newProject();
    const key = randomUUID().replace(/-/g, "");
    const first = publication(p, key);
    expect((await owner.client.rpc("record_site_publication", { p_publication: first })).error).not.toBeNull();
    expect((await admin.rpc("record_site_publication", { p_publication: first })).error).toBeNull();
    const second = publication(p, key);
    expect((await admin.rpc("record_site_publication", { p_publication: second })).error).toBeNull();
    const rows = (await owner.client.from("site_publications").select("id, status").eq("project_id", p.projectId)).data ?? [];
    expect(Object.fromEntries(rows.map((r) => [r.id, r.status]))).toEqual({ [first.id]: "previous", [second.id]: "live" });
    expect((await owner.client.rpc("restore_site_publication", { p_publication: first.id })).error).not.toBeNull();
    expect((await admin.rpc("restore_site_publication", { p_publication: first.id })).error).toBeNull();
    expect((await owner.client.from("site_publications").select("status").eq("id", first.id).single()).data).toEqual({ status: "live" });
    expect((await outsider.client.from("site_publications").select("id").eq("project_id", p.projectId)).data).toHaveLength(0);
  });

  it("let a live site's form send 20 messages an hour, and no more", async () => {
    const p = await newProject();
    const key = randomUUID().replace(/-/g, "");
    expect((await admin.rpc("take_form_send", { p_key: key })).data).toBeNull();
    await admin.rpc("record_site_publication", { p_publication: publication(p, key) });
    expect((await owner.client.rpc("take_form_send", { p_key: key })).error).not.toBeNull();
    for (let i = 0; i < 20; i++) expect((await admin.rpc("take_form_send", { p_key: key })).data).toMatchObject({ limited: false, recipient: "kontakt@example.test", siteUrl: "https://forening.example" });
    expect((await admin.rpc("take_form_send", { p_key: key })).data).toEqual({ limited: true });
  });

  it("keep a record after the client is anonymised, without where its forms went", async () => {
    const p = await newProject();
    const key = randomUUID().replace(/-/g, "");
    const row = publication(p, key);
    expect((await admin.rpc("record_site_publication", { p_publication: row })).error).toBeNull();
    await asDatabaseOwner((db) => db.query("select private.anonymise_client($1, true)", [p.clientId]));
    const kept = (await owner.client.from("site_publications").select("status, form_recipient, site_name, spec_id, approved_build_id, deployment_id").eq("id", row.id).single()).data;
    expect(kept).toMatchObject({ status: "live", form_recipient: null, site_name: "Former client", spec_id: null, approved_build_id: null, deployment_id: row.deployment_id });
    expect((await admin.rpc("take_form_send", { p_key: key })).data).toMatchObject({ limited: false, recipient: null });
  });
});
