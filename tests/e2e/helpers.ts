import { expect, type Page } from "@playwright/test";
export async function signIn(page: Page, user: { email: string; password: string }) {
  await page.goto("/");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeHidden();
  await expect(page.getByText("Loading your studio…")).toBeHidden();
}

/** A name no other test uses, so tests can share a studio and run in parallel. */
export function uniqueName(prefix: string) {
  return `${prefix} ${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Creates a client from the Clients page. Creating a client opens guided
 * onboarding; this leaves it for later and waits for the client's workspace.
 */
export async function createClientNamed(page: Page, name: string, options: { notes?: string } = {}) {
  await page.goto("/clients");
  await page.getByRole("button", { name: "New client" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New client" });
  await dialog.getByLabel("Company or client name").fill(name);
  if (options.notes) {
    await dialog.getByRole("button", { name: "Add the inquiry or notes" }).click();
    await dialog.getByLabel("Inquiry or notes").fill(options.notes);
  }
  await dialog.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Onboarding" })).toBeVisible();
  const workspace = page.url().replace(/\/onboarding$/, "");
  await page.goto(workspace);
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  return workspace;
}

/** A section of the client workspace by its id: brief, projects, analysis, sources, activity. */
export function section(page: Page, id: string) {
  return page.locator(`section#${id}`);
}
