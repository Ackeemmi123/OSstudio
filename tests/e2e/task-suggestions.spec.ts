import { expect, test } from "@playwright/test";
import { SupabaseRepository } from "@/lib/data/supabase-repository";
import { createClientNamed, section, signIn, uniqueName } from "./helpers";
import { fixture, signedInClient } from "./supabase";

/**
 * Task suggestions when starting a project, with the server's deterministic
 * test provider (no AI). It suggests tasks from the brief's integrations and
 * content, and leaving out brand guidelines the client already has.
 */
async function briefFor(workspace: string, values: Record<string, string>) {
  const client = await signedInClient(fixture().member);
  const member = fixture().member;
  const repository = new SupabaseRepository({ client, studioId: fixture().studioA, user: { id: member.id, email: member.email } });
  await repository.load();
  const clientId = decodeURIComponent(workspace.split("/clients/")[1]);
  for (const [key, value] of Object.entries(values)) {
    await repository.setContextField(clientId, key as "integrations", { value, confidence: "confirmed" });
  }
  return clientId;
}

test("suggests tasks from the brief, and creates only the ones the person ticks", async ({ page }) => {
  await signIn(page, fixture().member);
  const workspace = await createClientNamed(page, uniqueName("Suggest Co"));
  await briefFor(workspace, { integrations: "Bokamera booking", content: "We need help writing page copy", existingMaterials: "Logo and brand guidelines from 2024" });
  await page.reload();

  const projects = section(page, "projects");
  await projects.getByRole("button", { name: "New project" }).first().click();
  await projects.getByLabel("Project name").fill("Brand and site");
  await projects.getByLabel("Type").selectOption("brand_website");
  const create = projects.getByRole("button", { name: /^Create project with \d+ tasks$/ });
  const offered = Number((await create.textContent())!.match(/\d+/)![0]);

  await projects.getByRole("button", { name: "Suggest changes from the brief" }).click();
  const suggestions = projects.getByTestId("task-suggestions");
  await expect(suggestions.getByLabel(/Connect the integrations the client named/)).not.toBeChecked();
  await expect(suggestions.getByLabel(/Content plan and writing schedule/)).not.toBeChecked();
  await expect(suggestions).toContainText("Produced by the test provider, not by an AI model.");
  await expect(suggestions).toContainText("none is added unless you tick it");
  // Leaving out a usual task is suggested on that task, which stays ticked.
  await expect(projects.getByText("Suggested to leave out: The client already has brand guidelines.")).toBeVisible();
  await expect(projects.getByLabel(/^Brand guidelines/)).toBeChecked();
  // Nothing changed yet.
  await expect(projects.getByRole("button", { name: `Create project with ${offered} tasks` })).toBeVisible();

  await suggestions.getByLabel(/Connect the integrations the client named/).check();
  await projects.getByLabel(/^Brand guidelines/).uncheck();
  await projects.getByRole("button", { name: `Create project with ${offered} tasks` }).click();

  const card = projects.locator('[id^="project-"]', { hasText: "Brand and site" });
  await expect(card.getByText("Connect the integrations the client named", { exact: true })).toBeVisible();
  await expect(card.getByText("Content plan and writing schedule", { exact: true })).toHaveCount(0);
  await expect(card.getByText("Brand guidelines", { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(card.locator("li[id^='task-']")).toHaveCount(offered);
});

test("asks for a brief first, and shows a failed request without creating anything", async ({ page }) => {
  await signIn(page, fixture().member);
  const empty = await createClientNamed(page, uniqueName("No brief"));
  const projects = section(page, "projects");
  await projects.getByRole("button", { name: "New project" }).first().click();
  await projects.getByRole("button", { name: "Suggest changes from the brief" }).click();
  await expect(projects.getByTestId("task-suggestions")).toContainText("The brief is empty.");

  await briefFor(empty, { goal: "FIXTURE_FAIL" });
  await page.reload();
  await projects.getByRole("button", { name: "New project" }).first().click();
  await projects.getByRole("button", { name: "Suggest changes from the brief" }).click();
  await expect(projects.getByTestId("task-suggestions")).toContainText("No suggestions this time. The test provider was asked to fail.");
});

test("lets only owners and members ask for suggestions", async ({ request }) => {
  const asViewer = await signedInClient(fixture().viewer);
  const token = (await asViewer.auth.getSession()).data.session!.access_token;
  const body = { studioId: fixture().studioA, clientId: crypto.randomUUID(), projectType: "website" };
  const viewer = await request.post("/api/agents/plan", { data: body, headers: { authorization: `Bearer ${token}` } });
  expect(viewer.status()).toBe(403);
  expect((await request.post("/api/agents/plan", { data: body })).status()).toBe(401);

  const asOutsider = await signedInClient(fixture().outsider);
  const outsiderToken = (await asOutsider.auth.getSession()).data.session!.access_token;
  const outsider = await request.post("/api/agents/plan", { data: { ...body, clientId: fixture().foreignClientId, studioId: fixture().studioA }, headers: { authorization: `Bearer ${outsiderToken}` } });
  expect(outsider.status()).toBe(404);
});
