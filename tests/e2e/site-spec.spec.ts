import { expect, test } from "@playwright/test";
import { SupabaseRepository } from "@/lib/data/supabase-repository";
import { signIn, uniqueName } from "./helpers";
import { fixture, signedInClient, type SeedUser } from "./supabase";

/**
 * A website spec from start to a second version, in the browser, against the
 * local stack: started from the confirmed brief, edited, saved, submitted,
 * approved, then version 2 replaces version 1. A viewer reads it only.
 * The client and project are set up through the repository, as a member.
 */
async function websiteProject(user: SeedUser) {
  const { studioA } = fixture();
  const repository = new SupabaseRepository({ client: await signedInClient(user), studioId: studioA, user: { id: user.id, email: user.email } });
  await repository.load();
  const client = await repository.createClient({ name: uniqueName("Spec Bakery (TEST)") });
  await repository.setContextField(client.id, "goal", { value: "More cake pre-orders", confidence: "confirmed" });
  await repository.setContextField(client.id, "targetAudience", { value: "Local families", confidence: "confirmed" });
  await repository.setContextField(client.id, "offering", { value: "Celebration cakes", confidence: "observed" });
  const project = await repository.createProject(client.id, { name: "New website", projectType: "website" });
  return { client, project, url: `/clients/${client.id}/projects/${project.id}/site` };
}

test("a website spec goes from the brief to an approved second version", async ({ page }) => {
  test.setTimeout(90_000);
  const { client, url } = await websiteProject(fixture().member);
  await signIn(page, fixture().member);

  // The project card links to the spec page.
  await page.goto(`/clients/${client.id}`);
  await page.locator("section#projects").getByRole("link", { name: "Website spec" }).click();
  await expect(page.getByText(/Not confirmed yet, so left out: /)).toBeVisible();
  await page.getByRole("button", { name: "Start the website spec" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Website spec v1" })).toBeVisible();
  await expect(page.getByLabel("Goal of the website", { exact: true })).toHaveValue("More cake pre-orders");
  await expect(page.getByText("From brief: Goal")).toBeVisible();
  await expect(page.getByTestId("spec-blockers")).toContainText("Choose the brand colours and fonts");

  // Fill in what blocks approval.
  await page.getByRole("button", { name: "Keep these" }).click();
  await page.getByLabel("Default description", { exact: true }).fill("Celebration cakes baked to order.");
  await page.getByLabel("Search description", { exact: true }).first().fill("Order celebration cakes.");
  // Exact: "Heading font" in the brand would match too.
  await page.getByLabel("Heading", { exact: true }).first().fill("Cakes, made to order");
  // The offering was not confirmed, so the home page's text section starts empty and would block approval.
  await page.getByRole("button", { name: "Remove section" }).nth(1).click();
  await expect(page.getByTestId("spec-section")).toHaveCount(1);
  await page.getByRole("button", { name: /Contact/ }).first().click();
  await page.getByLabel("Search description", { exact: true }).last().fill("Ask us anything.");
  await page.getByLabel("Consent text", { exact: true }).fill("We use your details only to answer you.");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Saved" })).toBeVisible();
  await expect(page.getByText("Nothing blocks approval")).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Default description", { exact: true })).toHaveValue("Celebration cakes baked to order.");

  await page.getByRole("button", { name: "Submit for approval" }).click();
  await expect(page.getByText("Waiting for approval").first()).toBeVisible();
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByText("Approved", { exact: true }).first()).toBeVisible();
  await expect(page.getByLabel("Goal of the website", { exact: true })).toBeDisabled();

  // Version 2 starts as a copy; approving it replaces version 1.
  await page.getByRole("button", { name: "Start version 2" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Website spec v2" })).toBeVisible();
  await page.getByLabel("Tone of voice", { exact: true }).fill("Warm");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Saved" })).toBeVisible();
  await page.getByRole("button", { name: "Submit for approval" }).click();
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  const versions = page.getByTestId("spec-versions");
  await expect(versions.getByRole("button", { name: /v1/ })).toContainText("Replaced by a newer version");
  await expect(versions.getByRole("button", { name: /v2/ })).toContainText("Approved");

  // The viewer sees the spec but cannot change it.
  const viewer = await page.context().browser()!.newContext();
  const viewerPage = await viewer.newPage();
  await signIn(viewerPage, fixture().viewer);
  await viewerPage.goto(url);
  await expect(viewerPage.getByRole("heading", { level: 1, name: "Website spec v2" })).toBeVisible();
  await expect(viewerPage.getByText("Read only").first()).toBeVisible();
  await expect(viewerPage.getByRole("button", { name: "Start version 3" })).toHaveCount(0);
  await viewer.close();

  // The steps are in the client's activity.
  await page.goto(`/clients/${client.id}`);
  const activity = page.locator("section#activity");
  const showAll = activity.getByRole("button", { name: /Show all/ });
  if (await showAll.isVisible()) await showAll.click();
  await expect(activity.getByText("Approved website spec v2 (replaces v1)")).toBeVisible();
});
