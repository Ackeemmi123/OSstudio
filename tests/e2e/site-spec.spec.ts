import { expect, test } from "@playwright/test";
import { SupabaseRepository } from "@/lib/data/supabase-repository";
import { openSection, signIn, uniqueName } from "./helpers";
import { completeSpec } from "@/lib/site-spec/test-helpers";
import { appFetch, fixture, signedInClient, type SeedUser } from "./supabase";

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
  return { repository, client, project, url: `/clients/${client.id}/projects/${project.id}/site` };
}

test("a website spec goes from the brief to an approved second version", async ({ page }) => {
  test.setTimeout(90_000);
  const { repository, client, project, url } = await websiteProject(fixture().member);
  await signIn(page, fixture().member);

  // The project card links to the spec page.
  await page.goto(`/clients/${client.id}`);
  await (await openSection(page, "projects")).getByRole("link", { name: "Website spec" }).click();
  await expect(page.getByText(/Not confirmed yet, so left out: /)).toBeVisible();
  // A small start, to go through every step. Templates have their own test.
  await repository.startSiteSpec(project.id);
  await page.reload();

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
  await expect(page.getByTestId("save-status")).toHaveText("Saved");
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
  await expect(page.getByTestId("save-status")).toHaveText("Saved");
  await page.getByRole("button", { name: "Submit for approval" }).click();
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  // Approving reloads the page's versions, so wait for that before opening the menu.
  await expect(page.getByRole("button", { name: "Start version 3" })).toBeVisible();
  await page.getByTestId("spec-version-menu").locator("summary").click();
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
  const activity = await openSection(page, "activity");
  const showAll = activity.getByRole("button", { name: /Show all/ });
  if (await showAll.isVisible()) await showAll.click();
  await expect(activity.getByText("Approved website spec v2 (replaces v1)")).toBeVisible();
});

test("shows what to fix when the server refuses an approval, and leaves the version waiting", async ({ page }) => {
  const member = fixture().member;
  const repository = new SupabaseRepository({ client: await signedInClient(member), studioId: fixture().studioA, user: { id: member.id, email: member.email }, fetch: appFetch });
  await repository.load();
  const created = await repository.createClient({ name: uniqueName("Refused Bakery (TEST)") });
  for (const [key, value] of [["goal", "More cake pre-orders"], ["targetAudience", "Local families"], ["offering", "Celebration cakes"]] as const) {
    await repository.setContextField(created.id, key, { value, confidence: "confirmed" });
  }
  const project = await repository.createProject(created.id, { name: "New website", projectType: "website" });
  const client = (await repository.load()).clients.find((c) => c.id === created.id)!;
  const draft = await repository.saveSiteSpecDraft(await repository.startSiteSpec(project.id), completeSpec(client));
  await repository.submitSiteSpec(draft);

  await signIn(page, member);
  await page.goto(`/clients/${client.id}/projects/${project.id}/site`);
  await expect(page.getByText("Nothing blocks approval")).toBeVisible();

  // The brief changes after the page loaded, so only the server knows.
  await repository.setContextField(client.id, "goal", { value: "Catering orders", confidence: "observed" });
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  const refusal = page.getByTestId("approval-refusal");
  await expect(refusal).toContainText("Not approved: 1 thing needs fixing");
  await expect(refusal).toContainText("is used from the brief but is not confirmed");
  await expect(page.getByText("Waiting for approval").first()).toBeVisible();
  await expect(page.getByText("Replaced by a newer version")).toHaveCount(0);
});

/** A complete draft, for the editor tests. */
async function completeDraft(name: string) {
  const member = fixture().member;
  const repository = new SupabaseRepository({ client: await signedInClient(member), studioId: fixture().studioA, user: { id: member.id, email: member.email }, fetch: appFetch });
  await repository.load();
  const created = await repository.createClient({ name: uniqueName(name) });
  for (const [key, value] of [["goal", "More cake pre-orders"], ["targetAudience", "Local families"], ["offering", "Celebration cakes"]] as const) {
    await repository.setContextField(created.id, key, { value, confidence: "confirmed" });
  }
  const project = await repository.createProject(created.id, { name: "New website", projectType: "website" });
  const client = (await repository.load()).clients.find((c) => c.id === created.id)!;
  const draft = await repository.saveSiteSpecDraft(await repository.startSiteSpec(project.id), completeSpec(client));
  return { repository, draft, url: `/clients/${client.id}/projects/${project.id}/site`, clientId: client.id };
}

test("shows edits in the preview straight away, and saves them without a Save button", async ({ page }) => {
  const { url } = await completeDraft("Live Bakery (TEST)");
  await signIn(page, fixture().member);
  await page.goto(url);
  const frame = page.getByTestId("live-preview-frame");
  await expect(frame).toHaveAttribute("sandbox", "");
  await expect(frame).toHaveAttribute("srcdoc", /<h1>Celebration cakes, made to order<\/h1>/);
  await expect(page.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);

  // The preview draws the draft before it has been saved.
  await page.getByLabel("Heading", { exact: true }).first().fill("Fresh cakes every day");
  await expect(frame).toHaveAttribute("srcdoc", /<h1>Fresh cakes every day<\/h1>/);
  await expect(page.getByTestId("save-status")).toHaveText("Saved");
  await page.reload();
  await expect(page.getByLabel("Heading", { exact: true }).first()).toHaveValue("Fresh cakes every day");

  // Keep typing across saves: nothing is lost, and the activity gets one entry, not one per save.
  const heading = page.getByLabel("Heading", { exact: true }).first();
  await heading.fill("Second text");
  await expect(page.getByTestId("save-status")).toHaveText("Saved");
  await heading.fill("Third text");
  await expect(page.getByTestId("save-status")).toHaveText("Saved");
  await page.reload();
  await expect(page.getByLabel("Heading", { exact: true }).first()).toHaveValue("Third text");

  // Opening another page shows it in the preview.
  await page.getByRole("button", { name: /Contact/ }).first().click();
  await expect(frame).toHaveAttribute("srcdoc", /<h1>Contact<\/h1>/);
});

test("submits what is on the screen without saving first", async ({ page }) => {
  const { url } = await completeDraft("Submit Bakery (TEST)");
  await signIn(page, fixture().member);
  await page.goto(url);
  await page.getByLabel("Tone of voice", { exact: true }).fill("Written just before submitting");
  await page.getByRole("button", { name: "Submit for approval" }).click();
  await expect(page.getByText("Waiting for approval").first()).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Tone of voice", { exact: true })).toHaveValue("Written just before submitting");
  await expect(page.getByLabel("Tone of voice", { exact: true })).toBeDisabled();
});

test("leads from a problem to its field, opening the page it is on", async ({ page }) => {
  const { repository, draft, url } = await completeDraft("Problem Bakery (TEST)");
  const spec = structuredClone(draft.spec);
  spec.pages[1].seo.description.en = "";
  await repository.saveSiteSpecDraft(draft, spec);
  await signIn(page, fixture().member);
  await page.goto(url);
  // The contact page is closed; its field is not on the screen yet.
  await expect(page.getByTestId("spec-blockers").getByRole("button", { name: /search description/ })).toBeVisible();
  await page.getByTestId("spec-blockers").getByRole("button", { name: /search description/ }).click();
  await expect(page.getByLabel("Search description", { exact: true }).last()).toBeFocused();
  await expect(page.getByTestId("live-preview-frame")).toHaveAttribute("srcdoc", /<h1>Contact<\/h1>/);
});

test("does not overwrite a change someone else made", async ({ page }) => {
  const { repository, draft, url } = await completeDraft("Conflict Bakery (TEST)");
  await signIn(page, fixture().member);
  await page.goto(url);
  await expect(page.getByTestId("save-status")).toHaveText("Saved");

  const spec = structuredClone(draft.spec);
  spec.strategy.tone = "Changed by someone else";
  await repository.saveSiteSpecDraft(draft, spec);

  await page.getByLabel("Goal of the website", { exact: true }).fill("My own text");
  const status = page.getByTestId("save-status");
  await expect(status).toContainText("Someone else changed this");
  await expect(status).toContainText("Your edits are still here.");
  await expect(page.getByLabel("Goal of the website", { exact: true })).toHaveValue("My own text");
  const stored = (await repository.listSiteSpecs(draft.projectId))[0];
  expect(stored.spec.strategy.tone).toBe("Changed by someone else");
  expect(stored.spec.strategy.goal.text).not.toBe("My own text");
});

test("the editor shows one thing at a time on a phone, without sideways scrolling", async ({ page }) => {
  const { url } = await completeDraft("Phone Bakery (TEST)");
  await signIn(page, fixture().member);
  await page.setViewportSize({ width: 375, height: 700 });
  await page.goto(url);
  await expect(page.getByLabel("Goal of the website", { exact: true })).toBeVisible();
  await expect(page.getByTestId("live-preview-frame")).toBeHidden();
  await page.getByRole("button", { name: "See preview" }).click();
  await expect(page.getByTestId("live-preview-frame")).toBeVisible();
  await expect(page.getByLabel("Goal of the website", { exact: true })).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});

test("a viewer can read the spec and its live preview, but nothing saves", async ({ page }) => {
  const { url } = await completeDraft("Reading Bakery (TEST)");
  await signIn(page, fixture().viewer);
  await page.goto(url);
  await expect(page.getByTestId("live-preview-frame")).toHaveAttribute("srcdoc", /<h1>Celebration cakes, made to order<\/h1>/);
  await expect(page.getByTestId("save-status")).toHaveCount(0);
  await expect(page.getByLabel("Goal of the website", { exact: true })).toBeDisabled();
});

test("sorts what must be fixed from what is worth checking, as it is typed, and reminds the reviewer", async ({ page }) => {
  const { url } = await completeDraft("Checks Bakery (TEST)");
  await signIn(page, fixture().member);
  await page.goto(url);
  await expect(page.getByText("Nothing blocks approval")).toBeVisible();
  // A test client's name is only worth a look.
  const warnings = page.getByTestId("spec-warnings");
  await expect(warnings).toContainText('says "(test)"');
  await expect(page.getByRole("button", { name: "Submit for approval" })).toBeEnabled();

  const heading = page.getByLabel("Heading", { exact: true }).first();
  await heading.fill("Lorem ipsum dolor");
  const blockers = page.getByTestId("spec-blockers");
  await expect(blockers).toContainText('still says "Lorem ipsum"');
  await expect(page.getByRole("button", { name: "Submit for approval" })).toBeDisabled();

  // A problem leads to its field, and fixing it clears it.
  await page.getByLabel("Goal of the website", { exact: true }).focus();
  await blockers.getByRole("button", { name: /Lorem ipsum/ }).click();
  await expect(heading).toBeFocused();
  await heading.fill("Fresh cakes every day");
  await expect(page.getByText("Nothing blocks approval")).toBeVisible();
  await expect(page.getByTestId("save-status")).toHaveText("Saved");

  // Warnings stop nothing, and the reviewer gets a reminder, not another step.
  await page.getByRole("button", { name: "Submit for approval" }).click();
  await expect(page.getByTestId("review-reminder")).toContainText("Does the copy sound right");
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByRole("button", { name: "Start version 2" })).toBeVisible();
  await expect(page.getByTestId("review-reminder")).toHaveCount(0);
});

test("a viewer sees the checks but no reminder to review", async ({ page }) => {
  const { repository, draft, url } = await completeDraft("Viewer Checks Bakery (TEST)");
  await repository.submitSiteSpec(draft);
  await signIn(page, fixture().viewer);
  await page.goto(url);
  await expect(page.getByTestId("spec-warnings")).toBeVisible();
  await expect(page.getByTestId("review-reminder")).toHaveCount(0);
});

test("starts a first draft from a template, with instructions to write and the brief filled in", async ({ page }) => {
  const { client, url } = await websiteProject(fixture().member);
  await signIn(page, fixture().member);
  await page.goto(url);

  // Suggested from the project type; another can be chosen. The size follows the choice.
  await expect(page.getByLabel("Services business")).toBeChecked();
  await expect(page.getByTestId("draft-size")).toContainText("5 pages");
  await page.getByLabel("Single page").check();
  await expect(page.getByTestId("draft-size")).toContainText("2 pages");
  await page.getByLabel("Online shop").check();
  await expect(page.getByTestId("draft-size")).toContainText("6 pages");
  await page.getByLabel("Services business").check();
  await page.getByLabel("Swedish").check();

  // Goal and audience were confirmed; the offering was only observed.
  const brief = page.getByTestId("from-brief");
  await expect(brief).toContainText("Goal, Audience");
  await expect(brief).toContainText("Not confirmed yet, so left out: ");
  await expect(brief.getByRole("link", { name: "Confirm in the brief" })).toHaveAttribute("href", `/clients/${client.id}#brief`);
  await page.getByRole("button", { name: "Create draft" }).click();

  // It opens in the editor, with its pages, the instructions and the preview.
  await expect(page.getByRole("heading", { level: 1, name: "Website spec v1" })).toBeVisible();
  const frame = page.getByTestId("live-preview-frame");
  await expect(frame).toHaveAttribute("srcdoc", /\[Say what /);
  await expect(page.getByRole("navigation", { name: "Website spec sections" })).toContainText("Services");
  await expect(page.getByRole("navigation", { name: "Website spec sections" })).toContainText("Privacy");

  // What is left to write is a list that leads to each field. It blocks submission.
  const blockers = page.getByTestId("spec-blockers");
  await expect(blockers).toContainText("still needs writing");
  await expect(page.getByRole("button", { name: "Submit for approval" })).toBeDisabled();
  // A long list opens where to start, grouped by page, with legal text marked.
  const groups = blockers.getByTestId("problem-group");
  await expect(groups.first()).toContainText("Start here: goal and brand");
  await expect(groups.first().getByRole("button").first()).toBeVisible();
  await expect(blockers.getByRole("button", { name: /Hero: heading still needs writing/ })).toBeHidden();
  const legal = groups.filter({ hasText: "Privacy and consent" });
  await legal.locator("summary").click();
  await expect(legal).toContainText("need client-specific details and legal review");
  await groups.filter({ hasText: /^Home/ }).locator("summary").click();
  await blockers.getByRole("button", { name: /Hero: heading still needs writing/ }).first().click();
  const heading = page.getByLabel("Heading (English)", { exact: true }).first();
  await expect(heading).toBeFocused();
  await heading.fill("Cakes for every celebration");
  await expect(frame).toHaveAttribute("srcdoc", /Cakes for every celebration/);
  await expect(page.getByTestId("save-status")).toHaveText("Saved");
  await page.reload();
  await expect(page.getByLabel("Heading (English)", { exact: true }).first()).toHaveValue("Cakes for every celebration");

  // Sections are easy to move, add and remove, and a removed section's unfilled image goes with it.
  const sections = page.getByTestId("spec-section");
  const before = await sections.count();
  const images = await page.getByTestId("spec-image").count();
  await page.getByRole("button", { name: "Move section down" }).first().click();
  await expect(sections.first()).not.toContainText("Hero");
  await expect(sections.nth(1)).toContainText("Hero");
  await page.getByRole("button", { name: "Add section" }).click();
  await expect(sections).toHaveCount(before + 1);
  await sections.nth(1).getByRole("button", { name: "Remove section" }).click();
  await expect(sections).toHaveCount(before);
  await expect(page.getByTestId("spec-image")).toHaveCount(images - 1);
  await expect(page.getByTestId("save-status")).toHaveText("Saved");
});

test("says what the online shop template does not set up, and that legal text is a placeholder", async ({ page }) => {
  const { url } = await websiteProject(fixture().member);
  await signIn(page, fixture().member);
  await page.goto(url);
  const limits = page.getByTestId("draft-limits");
  await expect(limits).toContainText("privacy page and consent text are placeholders");
  await expect(limits).not.toContainText("payments");
  await page.getByLabel("Online shop").check();
  await expect(limits).toContainText("Products, prices, payments, shipping and shop integrations are not set up");
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Website spec v1" })).toBeVisible();
  await page.getByLabel("Previewing", { exact: true }).selectOption("shop");
  await expect(page.getByTestId("live-preview-frame")).toHaveAttribute("srcdoc", /NOT SET UP: no products, prices, payments, shipping or shop platform are connected/);
});

test("a viewer can see the starting points but cannot create a draft", async ({ page }) => {
  const { url } = await websiteProject(fixture().member);
  await signIn(page, fixture().viewer);
  await page.goto(url);
  await expect(page.getByRole("heading", { level: 1, name: "Start the website spec" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create draft" })).toHaveCount(0);
});
