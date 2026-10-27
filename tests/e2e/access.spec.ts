import { expect, test } from "@playwright/test";
import { createClientNamed, section, signIn, uniqueName } from "./helpers";
import { fixture, signedInClient } from "./supabase";

test.describe("viewers", () => {
  test("can read the studio but get no controls to change it", async ({ page, browser }) => {
    const { member, viewer } = fixture();
    // A member creates a client the viewer can then look at.
    const memberPage = await browser.newPage();
    await signIn(memberPage, member);
    const name = uniqueName("Viewer check");
    const url = await createClientNamed(memberPage, name);
    await memberPage.close();

    await signIn(page, viewer);
    await expect(page.getByText("Read only")).toBeVisible();
    await page.goto("/clients");
    await expect(page.getByRole("button", { name: "New client" })).toBeHidden();

    await page.goto(new URL(url).pathname);
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit details" })).toHaveCount(0);
    await expect(section(page, "brief").getByRole("button", { name: "Goal" })).toHaveCount(0);
    await expect(section(page, "projects").getByRole("button", { name: "New project" })).toHaveCount(0);
    await expect(section(page, "sources").getByRole("button", { name: "Add" })).toHaveCount(0);
    await expect(section(page, "analysis").getByRole("button", { name: /Analyze/ })).toHaveCount(0);
  });

  test("are refused by the database and the agent endpoint even without the UI", async ({ request }) => {
    const { viewer, studioA } = fixture();
    const client = await signedInClient(viewer);
    const now = new Date().toISOString();
    const write = await client.rpc("apply_changes", {
      p_studio: studioA,
      p_changes: {
        clients: [{ op: "insert", row: { id: crypto.randomUUID(), name: "Sneaky", status: "lead", source_type: "manual", created_at: now, updated_at: now } }],
      },
    });
    expect(write.error?.code).toBe("42501");

    const direct = await client.from("clients").insert({ id: crypto.randomUUID(), studio_id: studioA, name: "Sneaky direct" });
    expect(direct.error).not.toBeNull();

    const { data: clients } = await client.from("clients").select("id").eq("studio_id", studioA).limit(1);
    const token = (await client.auth.getSession()).data.session!.access_token;
    const response = await request.post("/api/agents/intake", {
      headers: { authorization: `Bearer ${token}` },
      data: { studioId: studioA, clientId: clients?.[0]?.id ?? crypto.randomUUID() },
    });
    expect(response.status()).toBe(403);
  });
});

test.describe("other studios", () => {
  test("a client in another studio cannot be opened by changing the address", async ({ page }) => {
    const { owner, foreignClientId } = fixture();
    await signIn(page, owner);
    await page.goto(`/clients/${foreignClientId}`);
    await expect(page.getByText("Client not found")).toBeVisible();
    await expect(page.getByText("do not have access to it")).toBeVisible();
    await expect(page.getByText("Confidential Client B")).toHaveCount(0);
  });

  test("another studio's data cannot be read or changed through the API", async ({ request }) => {
    const { owner, studioB, foreignClientId } = fixture();
    const client = await signedInClient(owner);

    const read = await client.from("clients").select("id, name").eq("id", foreignClientId);
    expect(read.error).toBeNull();
    expect(read.data).toEqual([]);

    const load = await client.rpc("load_studio", { p_studio: studioB });
    expect(load.error).not.toBeNull();

    const write = await client.rpc("apply_changes", {
      p_studio: studioB,
      p_changes: { clients: [{ op: "update", row: { id: foreignClientId, name: "Taken over" }, expected: new Date().toISOString() }] },
    });
    expect(write.error).not.toBeNull();

    const token = (await client.auth.getSession()).data.session!.access_token;
    const agent = await request.post("/api/agents/intake", {
      headers: { authorization: `Bearer ${token}` },
      data: { studioId: studioB, clientId: foreignClientId },
    });
    // Not a member: answered as "not found", so another studio's clients cannot be probed.
    expect(agent.status()).toBe(404);
  });

  test("the agent endpoint requires a signed-in person", async ({ request }) => {
    const { studioA } = fixture();
    const anonymous = await request.post("/api/agents/intake", { data: { studioId: studioA, clientId: crypto.randomUUID() } });
    expect(anonymous.status()).toBe(401);
    const forged = await request.post("/api/agents/intake", {
      headers: { authorization: "Bearer not-a-real-token" },
      data: { studioId: studioA, clientId: crypto.randomUUID() },
    });
    expect(forged.status()).toBe(401);
  });
});
