import { expect, test } from "@playwright/test";
import { createClientNamed, section, signIn, uniqueName } from "./helpers";
import { fixture } from "./supabase";

test.beforeEach(async ({ page }) => {
  await signIn(page, fixture().member);
});

test("creates and edits a client, and the changes are still there after a reload", async ({ page }) => {
  const name = uniqueName("Lumen Yoga");
  await createClientNamed(page, name);

  await page.getByRole("button", { name: "Edit details" }).click();
  const dialog = page.getByRole("dialog", { name: "Client details" });
  await dialog.getByLabel("Contact person").fill("Anna Berg");
  await dialog.getByLabel("Email").fill("anna@lumen.example");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();

  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  await expect(page.getByText("Anna Berg")).toBeVisible();
  await expect(page.getByRole("link", { name: "anna@lumen.example" })).toBeVisible();

  await page.goto("/clients");
  await page.getByLabel("Search clients").fill(name);
  await expect(page.getByRole("link", { name: new RegExp(name) })).toBeVisible();
});

test("records a brief value as observed, confirms it, and keeps who confirmed it", async ({ page }) => {
  const { member } = fixture();
  await createClientNamed(page, uniqueName("Nordvik"));
  const brief = section(page, "brief");

  await brief.getByRole("button", { name: "Goal" }).click();
  const editor = brief.getByRole("form", { name: "Edit goal" });
  await editor.getByLabel("Goal").fill("More online bookings");
  await editor.getByLabel("Observed").check();
  await editor.getByRole("button", { name: "Save" }).click();

  const goal = brief.locator("#brief-goal");
  await expect(goal.getByText("More online bookings")).toBeVisible();
  await expect(goal.getByText("Observed")).toBeVisible();

  await goal.getByRole("button", { name: "Confirm" }).click();
  await expect(goal.getByText("Confirmed", { exact: true })).toBeVisible();

  await page.reload();
  await expect(goal.getByText("More online bookings")).toBeVisible();
  await expect(goal.getByText("Confirmed", { exact: true })).toBeVisible();
  await expect(goal.getByText(`confirmed by ${member.name}`)).toBeVisible();
  await expect(section(page, "activity").getByText(/goal/i).first()).toBeVisible();
});
