import { expect, test } from "@playwright/test";
import { createClientNamed, section, signIn, uniqueName } from "./helpers";
import { fixture } from "./supabase";

test("creates a project and tasks, completes and approves work, and records it all", async ({ page }) => {
  await signIn(page, fixture().member);
  await createClientNamed(page, uniqueName("Ateljé Henrik"));
  const projects = section(page, "projects");

  await projects.getByRole("button", { name: "New project" }).first().click();
  await projects.getByLabel("Project name").fill("Website relaunch");
  await projects.getByRole("button", { name: "Create project" }).click();
  await expect(projects.getByText("Website relaunch")).toBeVisible();

  for (const title of ["Write homepage copy", "Design direction"]) {
    await projects.getByLabel("New task").fill(title);
    await projects.getByRole("button", { name: "Add", exact: true }).click();
    await expect(projects.getByText(title, { exact: true })).toBeVisible();
  }

  await projects.getByLabel("Status of Write homepage copy").selectOption("done");
  await expect(projects.getByRole("button", { name: "1 completed" })).toBeVisible();

  await projects.getByLabel("Status of Design direction").selectOption("awaiting_approval");
  await projects.getByRole("button", { name: "Approve" }).click();
  await expect(projects.getByRole("button", { name: "2 completed" })).toBeVisible();

  await page.reload();
  await expect(projects.getByText("Website relaunch")).toBeVisible();
  await expect(projects.getByRole("button", { name: "2 completed" })).toBeVisible();

  const activity = section(page, "activity");
  const showAll = activity.getByRole("button", { name: /Show all/ });
  if (await showAll.isVisible()) await showAll.click();
  await expect(activity.getByText("Completed Write homepage copy")).toBeVisible();
  await expect(activity.getByText("Approved Design direction")).toBeVisible();
});
