import { expect, test, type Page } from "@playwright/test";

/**
 * Guided onboarding in the local demo: create a client, answer only what
 * applies, leave, come back, edit, and see the brief on the client workspace.
 */

async function startOnboarding(page: Page, name: string, projectType: string) {
  await page.goto("/clients");
  await page.getByRole("button", { name: "New client" }).first().click();
  await page.getByLabel("Company or client name").fill(name);
  await page.getByLabel("What is the project?").selectOption({ label: projectType });
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(page.getByRole("heading", { name: "1. Business" })).toBeVisible();
}

const step = (page: Page, title: string) => expect(page.getByRole("heading", { name: title })).toBeVisible();

test("creates a client, saves a partial brief, resumes, edits and finishes", async ({ page }) => {
  await startOnboarding(page, "Fjord Ceramics", "E-commerce");

  await page.getByLabel("Contact person").fill("Ingrid Fjord");
  await page.getByLabel("What kind of business is it?").fill("Handmade ceramics studio");
  await page.getByRole("button", { name: "Continue" }).click();

  // E-commerce: several sales channels, and a store address follows from them.
  await step(page, "2. Current setup");
  await expect(page.getByLabel(/store address/)).toHaveCount(0);
  await page.getByRole("button", { name: "Etsy" }).click();
  await page.getByRole("button", { name: "Shopify" }).click();
  await page.getByLabel(/store address/).fill("fjord.myshopify.com");
  await page.getByRole("button", { name: "Continue" }).click();

  await step(page, "3. Goals");
  await page.getByLabel("What is the main goal of the project?").fill("Move all sales to one shop");
  await page.getByRole("button", { name: "Save and finish later" }).click();
  await expect(page).toHaveURL(/\/clients\/[^/]+$/);

  // Leave and come back: progress and answers survive a reload.
  await page.reload();
  await expect(page.getByText(/step 3 of 6/)).toBeVisible();
  await page.getByRole("link", { name: "Continue onboarding" }).click();
  await step(page, "3. Goals");

  // Going back keeps earlier answers, shown as observed values to confirm or correct.
  await page.getByRole("button", { name: "Back" }).click();
  await step(page, "2. Current setup");
  await expect(page.locator('[data-question="salesChannels"]').getByText("Shopify, Etsy")).toBeVisible();
  await page.locator('[data-question="storeUrl"]').getByRole("button", { name: "Correct" }).click();
  await page.getByLabel(/store address/).fill("shop.fjordceramics.no");
  await page.locator('[data-question="salesChannels"]').getByRole("button", { name: "Confirm" }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  // Jump ahead; unknown budget stays unknown.
  await page.getByRole("navigation", { name: "Onboarding steps" }).getByRole("button", { name: "Budget & timing" }).click();
  await step(page, "5. Budget & timing");
  await page.locator('[data-question="budget"]').getByRole("button", { name: "Not known yet" }).click();
  await page.getByLabel("Anything to ask the client?").fill("Who takes the product photos?");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name: "Review brief" }).click();

  await step(page, "6. Review");
  await expect(page.getByText("shop.fjordceramics.no")).toBeVisible();
  await expect(page.getByText("Who takes the product photos?")).toBeVisible();
  await page.getByRole("button", { name: /Mark ready/ }).click();

  // The structured brief lives on the client workspace and stays editable.
  await expect(page).toHaveURL(/#brief$/);
  const brief = page.locator("#brief");
  await expect(brief.getByText("Onboarding finished")).toBeVisible();
  await expect(brief.getByText("Shopify, Etsy")).toBeVisible();
  await expect(brief.locator("#brief-salesChannels").getByText("Confirmed")).toBeVisible();
  await expect(brief.locator("#brief-goal").getByText("Observed")).toBeVisible();
  await page.reload();
  await expect(page.locator("#brief").getByText("shop.fjordceramics.no")).toBeVisible();
});

test("asks no e-commerce questions for a website project", async ({ page }) => {
  await startOnboarding(page, "Lindgren Dental", "Website");
  await page.getByRole("button", { name: "Continue" }).click();
  await step(page, "2. Current setup");
  await expect(page.getByText("Where do they sell today?")).toHaveCount(0);
  await expect(page.getByText("What is the current website built on?")).toBeVisible();
});

test("keeps “Not selling online yet” exclusive and hides the store address", async ({ page }) => {
  await startOnboarding(page, "Nya Hantverk", "E-commerce");
  await page.getByRole("button", { name: "Continue" }).click();
  await step(page, "2. Current setup");
  await page.getByRole("button", { name: "Amazon" }).click();
  await expect(page.getByLabel(/store address/)).toBeVisible();
  await page.getByRole("button", { name: "Not selling online yet" }).click();
  await expect(page.getByRole("button", { name: "Amazon" })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByLabel(/store address/)).toHaveCount(0);
});

test("shows invalid input inline and does not move on", async ({ page }) => {
  await startOnboarding(page, "Typo AB", "Website");
  await page.getByLabel("Email").fill("not-an-email");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText(/valid email/)).toBeVisible();
  await step(page, "1. Business");
});
