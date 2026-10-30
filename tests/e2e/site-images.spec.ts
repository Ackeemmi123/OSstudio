import { expect, test } from "@playwright/test";
import { Buffer } from "node:buffer";
import { SupabaseRepository } from "@/lib/data/supabase-repository";
import { pngImage } from "@/lib/site-assets/test-images";
import { newPlaceholderImage } from "@/lib/site-spec/edit";
import { completeSpec } from "@/lib/site-spec/test-helpers";
import { signIn, uniqueName } from "./helpers";
import { fixture, signedInClient } from "./supabase";

/**
 * Website images in the browser, against the local stack with Storage: a
 * placeholder is replaced by an uploaded image (processed in the browser,
 * checked by the server), its rights are decided, the spec has nothing
 * blocking approval, and the preview shows the stored image. A viewer sees
 * the image but cannot upload or decide.
 */
async function specWithPlaceholder() {
  const member = fixture().member;
  const repository = new SupabaseRepository({ client: await signedInClient(member), studioId: fixture().studioA, user: { id: member.id, email: member.email } });
  await repository.load();
  const created = await repository.createClient({ name: uniqueName("Image Bakery (TEST)") });
  for (const [key, value] of [["goal", "More cake pre-orders"], ["targetAudience", "Local families"], ["offering", "Celebration cakes"]] as const) {
    await repository.setContextField(created.id, key, { value, confidence: "confirmed" });
  }
  const project = await repository.createProject(created.id, { name: "New website", projectType: "website" });
  const client = (await repository.load()).clients.find((c) => c.id === created.id)!;
  const spec = completeSpec(client);
  const photo = newPlaceholderImage(spec, "Shop front (test)");
  photo.alt.en = "The bakery's shop front";
  spec.assets.push(photo);
  const hero = spec.pages[0].sections[0];
  if (hero.kind === "hero") hero.mediaAssetId = photo.id;
  await repository.saveSiteSpecDraft(await repository.startSiteSpec(project.id), spec);
  return { specUrl: `/clients/${client.id}/projects/${project.id}/site` };
}

test("replaces a placeholder with an uploaded image whose rights are approved, and previews it", async ({ page }) => {
  test.setTimeout(120_000);
  const { specUrl } = await specWithPlaceholder();
  await signIn(page, fixture().member);
  await page.goto(specUrl);
  await expect(page.getByTestId("spec-blockers")).toContainText("still a placeholder");

  // Upload into the placeholder.
  const card = page.getByTestId("spec-image").filter({ hasText: "Placeholder" });
  await card.getByRole("button", { name: "Upload image" }).click();
  const upload = page.getByRole("dialog", { name: "Upload an image" });
  await upload.getByLabel("Image file").setInputFiles({ name: "shop.png", mimeType: "image/png", buffer: Buffer.from(pngImage(800, 600)) });
  await expect(upload.getByLabel("What the image shows")).toHaveValue("Shop front (test)");
  await upload.getByRole("button", { name: "Upload", exact: true }).click();
  await expect(upload).toBeHidden();
  const library = page.getByTestId("image-library");
  await expect(library).toContainText("Rights not decided yet");
  await expect(page.getByTestId("spec-blockers")).toContainText("rights for this image are not approved yet");

  // Decide the rights.
  await library.getByRole("button", { name: "Decide rights" }).click();
  const rights = page.getByRole("dialog", { name: "Decide the rights for this image" });
  await expect(rights.getByRole("button", { name: "Approve the rights" })).toBeDisabled();
  await rights.getByLabel("Who holds the rights").selectOption("client_owns");
  await rights.getByLabel("There is permission to use this image on this client's website").check();
  await rights.getByLabel("Who gave permission, and where it is recorded").fill("Client by email, 3 Nov (test)");
  await rights.getByRole("button", { name: "Approve the rights" }).click();
  await expect(rights).toBeHidden();
  await expect(library).toContainText("Rights approved");

  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Saved" })).toBeVisible();
  await expect(page.getByText("Nothing blocks approval")).toBeVisible();

  // The preview shows the stored image through a signed link.
  await page.getByRole("link", { name: "Preview", exact: true }).click();
  const frame = page.getByTestId("site-preview-frame");
  await expect(frame).toHaveAttribute("srcdoc", /<img[^>]+src="[^"]+\/storage\/v1\/object\/sign\/site-assets\//);
  await expect(frame).toHaveAttribute("srcdoc", /alt="The bakery&#x27;s shop front"|alt="The bakery's shop front"/);

  // A viewer sees it, but cannot upload or decide.
  const viewer = await page.context().browser()!.newContext();
  const viewerPage = await viewer.newPage();
  await signIn(viewerPage, fixture().viewer);
  await viewerPage.goto(specUrl);
  await expect(viewerPage.getByTestId("image-library")).toContainText("Rights approved");
  await expect(viewerPage.getByRole("button", { name: "Upload image" })).toHaveCount(0);
  await expect(viewerPage.getByRole("button", { name: "Decide rights" })).toHaveCount(0);
  await viewer.close();
});
