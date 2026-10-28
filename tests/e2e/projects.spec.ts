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

test("gives a task an owner and a due date, asks why it is blocked, and flags it once overdue", async ({ page }) => {
  const member = fixture().member;
  await page.clock.install();
  await signIn(page, member);
  const name = uniqueName("Owner Co");
  await createClientNamed(page, name);
  const projects = section(page, "projects");
  await projects.getByRole("button", { name: "New project" }).first().click();
  await projects.getByLabel("Project name").fill("Shop");
  await projects.getByRole("button", { name: "Create project" }).click();
  await projects.getByLabel("New task").fill("Product photos");
  await projects.getByRole("button", { name: "Add", exact: true }).click();
  const row = projects.locator("li", { hasText: "Product photos" });
  await expect(row).toBeVisible();

  // Due tomorrow, in Helsinki.
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleDateString("en-CA", { timeZone: "Europe/Helsinki" });
  await row.getByRole("button", { name: "Assign or schedule Product photos" }).click();
  await row.getByLabel("Owner").fill("Sara Studio");
  await row.getByLabel("Due date").fill(tomorrow);
  await row.getByRole("button", { name: "Save" }).click();
  await expect(row.getByTestId("task-details")).toContainText("Sara Studio");
  await expect(row.getByTestId("task-details")).toContainText(/Due \d+ \w+ \d{4}/);

  // Blocking asks for a reason before anything is saved.
  await row.getByLabel("Status of Product photos").selectOption("blocked");
  await expect(row.getByRole("button", { name: "Mark blocked" })).toBeDisabled();
  await row.getByLabel("What is it waiting for?").fill("Photos from the client");
  await row.getByRole("button", { name: "Mark blocked" }).click();
  await expect(row.getByTestId("task-details")).toContainText("Photos from the client");

  await page.reload();
  await expect(row.getByTestId("task-details")).toContainText("Sara Studio");
  await expect(row.getByTestId("task-details")).toContainText("Photos from the client");

  // Unblocked and two days later, the task is overdue: shown in the row and under Follow up.
  await row.getByLabel("Status of Product photos").selectOption("in_progress");
  await expect(row.getByTestId("task-details")).not.toContainText("Photos from the client");
  await page.clock.fastForward(2 * 24 * 60 * 60 * 1000 + 60_000);
  await expect(row.getByTestId("task-details")).toContainText("Overdue, was due");
  await page.goto("/");
  const followUp = page.locator("section#follow-up").getByRole("link", { name: /Product photos/ }).filter({ hasText: name });
  await expect(followUp).toContainText(/Overdue by \d+ days?/);
  await expect(followUp).toContainText("Reschedule");
});
