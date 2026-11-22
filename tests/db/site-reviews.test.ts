/**
 * Client review against a local Supabase stack: only the server records what
 * a client writes on a link, and only while the link is open for review; the
 * studio's people read it, writers answer it, and an approval is once per
 * build. Every client, spec and comment is invented.
 */
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { addMember, admin, createStudio, createUser, repositoryFor, type TestUser } from "./helpers";

let owner: TestUser;
let viewer: TestUser;
let outsider: TestUser;
let studio: string;

beforeAll(async () => {
  [owner, viewer, outsider] = await Promise.all([createUser("review-owner"), createUser("review-viewer"), createUser("review-outsider")]);
  studio = await createStudio(owner, "Review test");
  await createStudio(outsider, "Elsewhere");
  await addMember(owner, studio, viewer, "viewer", "Vera Viewer");
});

/** A stored build of a new client's spec, and its link token. */
async function newBuild(over: { expires?: string } = {}) {
  const repository = repositoryFor(owner, studio);
  await repository.load();
  const client = await repository.createClient({ name: `Review client ${randomUUID().slice(0, 6)} (test)` });
  const project = await repository.createProject(client.id, { name: "Website", projectType: "website" });
  const spec = await repository.startSiteSpec(project.id);
  const id = randomUUID();
  const token = randomUUID().replace(/-/g, "") + "rev";
  const { error } = await admin.rpc("record_site_build", {
    p_build: {
      id, studio_id: studio, client_id: client.id, project_id: project.id, spec_id: spec.id, spec_version: spec.version,
      design_system: "association@0.1", storage_prefix: `${studio}/${id}`, file_count: 3, byte_count: 1200, checks: [],
      share_token: token, expires_at: over.expires ?? new Date(Date.now() + 30 * 86400000).toISOString(),
      created_by: { kind: "human", name: "Owner", userId: owner.id },
    },
  });
  if (error) throw error;
  return { id, token, clientId: client.id };
}

const COMMENT = { page: "/om-oss/", target: "h2: Om oss", body: "Byt rubriken (test)", author: "Anna Test" };
const APPROVAL = { name: "Anna Test", role: "Ordförande", email: "anna@example.test", statement: "Jag godkänner (test)." };
const owners = () => ({ kind: "human", name: "Owner", userId: owner.id });

describe("client review", () => {
  it("is recorded by the server only, through the link", async () => {
    const build = await newBuild();
    expect((await owner.client.rpc("record_review_comment", { p_token: build.token, p_comment: COMMENT })).error).not.toBeNull();
    expect((await owner.client.from("site_review_comments").insert({ ...COMMENT, studio_id: studio })).error).not.toBeNull();
    expect((await admin.rpc("record_review_comment", { p_token: build.token, p_comment: COMMENT })).error).toBeNull();
    const state = (await admin.rpc("site_review_state", { p_token: build.token })).data;
    expect(state).toMatchObject({ buildId: build.id, comments: [{ page: "/om-oss/", body: "Byt rubriken (test)", status: "open" }], approval: null });
  });

  it("is refused on expired, turned-off and closed links", async () => {
    const off = await newBuild();
    expect((await owner.client.rpc("revoke_site_build", { p_build: off.id })).error).toBeNull();
    expect((await admin.rpc("record_review_comment", { p_token: off.token, p_comment: COMMENT })).error?.code).toBe("42501");
    const closed = await newBuild();
    expect((await viewer.client.rpc("set_build_reviews", { p_build: closed.id, p_enabled: false })).error).not.toBeNull();
    expect((await owner.client.rpc("set_build_reviews", { p_build: closed.id, p_enabled: false })).error).toBeNull();
    expect((await admin.rpc("record_site_approval", { p_token: closed.token, p_approval: APPROVAL })).error?.code).toBe("42501");
    expect((await admin.rpc("site_review_state", { p_token: closed.token })).data).toBeNull();
  });

  it("is read by the studio's people and answered by a writer", async () => {
    const build = await newBuild();
    await admin.rpc("record_review_comment", { p_token: build.token, p_comment: COMMENT });
    const id = (await owner.client.from("site_review_comments").select("id").eq("build_id", build.id).single()).data!.id;
    expect((await viewer.client.from("site_review_comments").select("id").eq("id", id)).data).toHaveLength(1);
    expect((await outsider.client.from("site_review_comments").select("id").eq("id", id)).data).toHaveLength(0);
    expect((await viewer.client.rpc("answer_review_comment", { p_comment: id, p_reply: "Nej", p_resolve: true, p_actor: { kind: "human", name: "Vera", userId: viewer.id } })).error).not.toBeNull();
    expect((await owner.client.rpc("answer_review_comment", { p_comment: id, p_reply: "Ändrat", p_resolve: true, p_actor: owners() })).error).toBeNull();
    expect((await admin.rpc("site_review_state", { p_token: build.token })).data).toMatchObject({ comments: [{ status: "resolved", reply: "Ändrat" }] });
  });

  it("takes one approval per build and notes it in the client's activity", async () => {
    const build = await newBuild();
    expect((await admin.rpc("record_site_approval", { p_token: build.token, p_approval: APPROVAL })).error).toBeNull();
    expect((await admin.rpc("record_site_approval", { p_token: build.token, p_approval: APPROVAL })).error?.code).toBe("23505");
    expect((await viewer.client.from("site_approvals").select("approver_name").eq("build_id", build.id).single()).data).toEqual({ approver_name: "Anna Test" });
    const events = (await owner.client.from("activity_events").select("event_type").eq("entity_id", build.clientId)).data ?? [];
    expect(events.map((e) => e.event_type)).toContain("site_spec.client_approved");
  });
});

describe("questions for the client on the link", () => {
  const QUESTIONS = ["Hur började det? (test)", "Får vi visa era namn och bilder? (test)"];

  it("are set by a writer, at most eight, and answered once by the client through the server", async () => {
    const build = await newBuild();
    expect((await viewer.client.rpc("set_build_questions", { p_build: build.id, p_questions: QUESTIONS })).error).not.toBeNull();
    expect((await owner.client.rpc("set_build_questions", { p_build: build.id, p_questions: Array.from({ length: 9 }, (_, i) => `Fråga ${i}`) })).error?.code).toBe("22023");
    expect((await owner.client.rpc("set_build_questions", { p_build: build.id, p_questions: QUESTIONS })).error).toBeNull();
    expect((await admin.rpc("site_review_state", { p_token: build.token })).data).toMatchObject({ questions: QUESTIONS, answered: false });

    expect((await owner.client.rpc("record_review_answers", { p_token: build.token, p_answers: { author: "Sara Test", answers: ["x", "y"] } })).error).not.toBeNull();
    expect((await admin.rpc("record_review_answers", { p_token: build.token, p_answers: { author: "Sara Test", answers: ["bara ett svar"] } })).error?.code).toBe("22023");
    expect((await admin.rpc("record_review_answers", { p_token: build.token, p_answers: { author: "Sara Test", answers: ["Vi öppnade 2019 (test).", ""] } })).error).toBeNull();
    expect((await admin.rpc("record_review_answers", { p_token: build.token, p_answers: { author: "Sara Test", answers: ["igen", ""] } })).error?.code).toBe("23505");
    expect((await admin.rpc("site_review_state", { p_token: build.token })).data).toMatchObject({ questions: [], answered: true });
    expect((await owner.client.rpc("set_build_questions", { p_build: build.id, p_questions: [] })).error?.code).toBe("23505");
  });

  it("turns the answers into the client's source material, for the studio only", async () => {
    const build = await newBuild();
    await owner.client.rpc("set_build_questions", { p_build: build.id, p_questions: QUESTIONS });
    await admin.rpc("record_review_answers", { p_token: build.token, p_answers: { author: "Sara Test", answers: ["", "Ja, med förnamn (test)."] } });
    const { data } = await owner.client.from("client_sources").select("label, content, type").eq("client_id", build.clientId);
    expect(data).toHaveLength(1);
    expect(data![0].label).toMatch(/granskningslänken.*Sara Test/);
    expect(data![0].content).toBe("Fråga: Får vi visa era namn och bilder? (test)\nSvar: Ja, med förnamn (test).");
    expect((await outsider.client.from("client_sources").select("id").eq("client_id", build.clientId)).data).toHaveLength(0);
  });
});

