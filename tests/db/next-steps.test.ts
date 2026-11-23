/**
 * Next steps and calendar feeds against a local Supabase stack: the studio's
 * people read them, writers change them, each member's calendar link shows
 * the studio's open steps until it is turned off or they leave, and
 * anonymising a client removes its next steps. Every name is invented.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { addMember, admin, anonClient, asDatabaseOwner, createStudio, createUser, repositoryFor, type TestUser } from "./helpers";

let owner: TestUser;
let viewer: TestUser;
let outsider: TestUser;
let studio: string;

beforeAll(async () => {
  [owner, viewer, outsider] = await Promise.all([createUser("steps-owner"), createUser("steps-viewer"), createUser("steps-outsider")]);
  studio = await createStudio(owner, "Next steps test");
  await createStudio(outsider, "Elsewhere");
  await addMember(owner, studio, viewer, "viewer", "Vera Viewer");
});

async function newClient() {
  const repository = repositoryFor(owner, studio);
  await repository.load();
  const client = await repository.createClient({ name: `Steps client ${Math.random().toString(36).slice(2, 7)} (test)` });
  return { repository, client };
}

describe("next steps", () => {
  it("are added and ticked off by writers, read by the studio's people only", async () => {
    const { repository, client } = await newClient();
    const step = await repository.addNextStep({ clientId: client.id, title: "Ring tillbaka (test)", dueOn: "2026-12-01", dueTime: "10:00" });
    expect(step).toMatchObject({ title: "Ring tillbaka (test)", dueOn: "2026-12-01", dueTime: "10:00", status: "open" });
    const done = await repository.updateNextStep(step, { status: "done" });
    expect(done.status).toBe("done");
    expect(done.doneAt).not.toBeNull();

    expect((await viewer.client.from("client_next_steps").select("id").eq("id", step.id)).data).toHaveLength(1);
    expect((await outsider.client.from("client_next_steps").select("id").eq("id", step.id)).data).toHaveLength(0);
    expect((await viewer.client.from("client_next_steps").update({ title: "Ändrad" }).eq("id", step.id).select("id")).data ?? []).toHaveLength(0);
    const insert = await viewer.client.from("client_next_steps").insert({ studio_id: studio, client_id: client.id, title: "x", due_on: "2026-12-01", created_by: { kind: "human", name: "Vera", userId: viewer.id } });
    expect(insert.error).not.toBeNull();
    expect((await viewer.client.rpc("delete_next_step", { p_step: step.id })).error?.code).toBe("42501");
    expect((await owner.client.from("client_next_steps").delete().eq("id", step.id).select("id")).data ?? []).toHaveLength(0);
    await repository.deleteNextStep(done);
    expect((await owner.client.from("client_next_steps").select("id").eq("id", step.id)).data).toHaveLength(0);
    const pretend = await owner.client.from("client_next_steps").insert({ studio_id: studio, client_id: client.id, title: "x", due_on: "2026-12-01", created_by: { kind: "human", name: "Someone else", userId: viewer.id } });
    expect(pretend.error).not.toBeNull();
  });

  it("are removed when the client is anonymised", async () => {
    const { repository, client } = await newClient();
    await repository.addNextStep({ clientId: client.id, title: "Möte med Mikko (test)", dueOn: "2026-12-02" });
    await asDatabaseOwner((db) => db.query("select private.anonymise_client($1, true)", [client.id]));
    expect((await owner.client.from("client_next_steps").select("id").eq("client_id", client.id)).data).toHaveLength(0);
  });
});

describe("calendar feeds", () => {
  it("show the studio's open steps to a member's own link, until it is turned off", async () => {
    const { repository, client } = await newClient();
    await repository.addNextStep({ clientId: client.id, title: "Skicka offert (test)", dueOn: "2026-12-03", dueTime: "09:30" });
    const token = await repository.createCalendarFeed();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(await repository.hasCalendarFeed()).toBe(true);

    expect((await anonClient().rpc("calendar_feed_items", { p_token: token })).error).not.toBeNull();
    const items = (await admin.rpc("calendar_feed_items", { p_token: token })).data as { studio: string; steps: { title: string; client: string; dueTime: string }[] };
    expect(items.studio).toBe("Next steps test");
    expect(items.steps).toEqual(expect.arrayContaining([expect.objectContaining({ title: "Skicka offert (test)", client: client.name, dueTime: "09:30:00" })]));

    const again = await repository.createCalendarFeed();
    expect((await admin.rpc("calendar_feed_items", { p_token: token })).data).toBeNull();
    expect((await admin.rpc("calendar_feed_items", { p_token: again })).data).not.toBeNull();
    await repository.revokeCalendarFeed();
    expect((await admin.rpc("calendar_feed_items", { p_token: again })).data).toBeNull();
    expect(await repository.hasCalendarFeed()).toBe(false);
  });

  it("are refused to people outside the studio and stop when a member leaves", async () => {
    expect((await outsider.client.rpc("create_calendar_feed", { p_studio: studio })).error?.code).toBe("42501");
    const leaving = await createUser("steps-leaving");
    await addMember(owner, studio, leaving, "member", "Leo Leaving");
    const token = (await leaving.client.rpc("create_calendar_feed", { p_studio: studio })).data as string;
    expect((await admin.rpc("calendar_feed_items", { p_token: token })).data).not.toBeNull();
    await asDatabaseOwner((db) => db.query("delete from public.studio_members where studio_id = $1 and user_id = $2", [studio, leaving.id]));
    expect((await admin.rpc("calendar_feed_items", { p_token: token })).data).toBeNull();
    expect((await owner.client.from("calendar_feeds").select("id").eq("user_id", leaving.id)).data).toHaveLength(0);
  });
});
