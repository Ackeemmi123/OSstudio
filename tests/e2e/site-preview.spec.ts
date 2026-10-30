import { expect, test } from "@playwright/test";
import { SupabaseRepository } from "@/lib/data/supabase-repository";
import { completeSpec } from "@/lib/site-spec/test-helpers";
import { signIn, uniqueName } from "./helpers";
import { fixture, signedInClient } from "./supabase";

/**
 * The internal preview, in the browser, against the local stack: an approved
 * spec (set up through the repository, as a member) opens from the editor,
 * renders in a frame without any permissions, switches page and screen size,
 * and is readable by a viewer.
 */
async function approvedSpec() {
  const member = fixture().member;
  const repository = new SupabaseRepository({ client: await signedInClient(member), studioId: fixture().studioA, user: { id: member.id, email: member.email } });
  await repository.load();
  const created = await repository.createClient({ name: uniqueName("Preview Bakery (TEST)") });
  for (const [key, value] of [["goal", "More cake pre-orders"], ["targetAudience", "Local families"], ["offering", "Celebration cakes"]] as const) {
    await repository.setContextField(created.id, key, { value, confidence: "confirmed" });
  }
  const project = await repository.createProject(created.id, { name: "New website", projectType: "website" });
  const client = (await repository.load()).clients.find((c) => c.id === created.id)!;
  const draft = await repository.startSiteSpec(project.id);
  const saved = await repository.saveSiteSpecDraft(draft, completeSpec(client));
  await repository.approveSiteSpec(await repository.submitSiteSpec(saved));
  return { specUrl: `/clients/${client.id}/projects/${project.id}/site` };
}

test("previews an approved website spec in an isolated frame", async ({ page }) => {
  test.setTimeout(90_000);
  const { specUrl } = await approvedSpec();
  await signIn(page, fixture().member);
  await page.goto(specUrl);
  await page.getByRole("link", { name: "Preview", exact: true }).click();
  await expect(page).toHaveURL(/\/site\/preview\?v=1$/);
  await expect(page.getByRole("heading", { level: 1, name: "Preview · website spec v1" })).toBeVisible();

  // The frame has no permissions at all, and the page is drawn inside it.
  const frame = page.getByTestId("site-preview-frame");
  await expect(frame).toHaveAttribute("sandbox", "");
  await expect(frame).toHaveAttribute("srcdoc", /<h1>Celebration cakes, made to order<\/h1>/);
  await expect(frame).not.toHaveAttribute("srcdoc", /<script/i);
  await expect(frame).toHaveAttribute("srcdoc", /name="robots" content="noindex, nofollow"/);

  // Another page, then the phone width.
  await page.getByLabel("Page", { exact: true }).selectOption("contact");
  await expect(page).toHaveURL(/page=contact/);
  await expect(frame).toHaveAttribute("srcdoc", /<h1>Contact<\/h1>/);
  await expect(frame).toHaveAttribute("srcdoc", /We use your details only to answer you\./);
  await page.getByRole("button", { name: "Phone" }).click();
  await expect(page.getByRole("button", { name: "Phone" })).toHaveAttribute("aria-pressed", "true");
  await expect(frame).toHaveCSS("width", "390px");

  // A viewer may look too.
  const viewer = await page.context().browser()!.newContext();
  const viewerPage = await viewer.newPage();
  await signIn(viewerPage, fixture().viewer);
  await viewerPage.goto(`${specUrl}/preview?v=1`);
  await expect(viewerPage.getByTestId("site-preview-frame")).toHaveAttribute("srcdoc", /Celebration cakes, made to order/);
  await viewer.close();
});
