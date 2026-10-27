import { expect, test } from "@playwright/test";
import { createClientNamed, section, signIn, uniqueName } from "./helpers";
import { fixture } from "./supabase";

/**
 * The intake agent, with the server's deterministic test provider (no AI).
 * It proposes "Label: value" lines from the source material, quoting them.
 */
test("analyzes source material into proposals that only a person can add to the brief", async ({ page }) => {
  await signIn(page, fixture().member);
  await createClientNamed(page, uniqueName("Lumen Yoga"));

  const sources = section(page, "sources");
  await sources.getByRole("button", { name: "Add" }).click();
  const dialog = page.getByRole("dialog", { name: "Add source material" });
  await dialog.getByLabel("Name").fill("Email from Anna");
  await dialog.getByLabel("Content").fill("Hi!\nBudget: 50 000 SEK\nDeadline: before the summer term\nThanks, Anna");
  await dialog.getByRole("button", { name: "Add material" }).click();
  await expect(sources.getByText("Email from Anna")).toBeVisible();

  const analysis = section(page, "analysis");
  await analysis.getByRole("button", { name: "Analyze client information" }).click();

  const proposals = analysis.getByTestId("proposal");
  await expect(proposals).toHaveCount(2);
  const budget = proposals.filter({ hasText: "Budget" });
  await expect(budget.getByText("50 000 SEK", { exact: true })).toBeVisible();
  await expect(budget.getByText("“Budget: 50 000 SEK”")).toBeVisible();
  await expect(analysis.getByText("No external research was performed.", { exact: false })).toBeVisible();
  await expect(analysis.getByText("Produced by the test provider, not by an AI model.", { exact: false })).toBeVisible();

  // Nothing reached the brief yet.
  const brief = section(page, "brief");
  await expect(brief.locator("#brief-budget").getByText("50 000 SEK", { exact: true })).toHaveCount(0);

  await budget.getByRole("button", { name: "Add to brief" }).click();
  await expect(brief.locator("#brief-budget").getByText("50 000 SEK", { exact: true })).toBeVisible();
  await expect(brief.locator("#brief-budget").getByText("Observed")).toBeVisible();

  await proposals.filter({ hasText: "Deadline" }).getByRole("button", { name: "Dismiss" }).click();
  await expect(proposals).toHaveCount(0);

  const question = analysis.getByRole("listitem").filter({ hasText: "What is the goal for this project?" });
  await question.getByRole("button", { name: "Add to open questions" }).click();
  await expect(question.getByText("In open questions")).toBeVisible();

  await page.reload();
  await expect(brief.locator("#brief-budget").getByText("50 000 SEK", { exact: true })).toBeVisible();
  await expect(brief.locator("#brief-deadline")).not.toContainText("before the summer term");
  await expect(brief.getByText("What is the goal for this project?")).toBeVisible();

  const activity = section(page, "activity");
  const showAll = activity.getByRole("button", { name: /Show all/ });
  if (await showAll.isVisible()) await showAll.click();
  await expect(activity.getByText("Intake analysis proposed 2 values for review")).toBeVisible();
  await expect(activity.getByText("Accepted proposed budget")).toBeVisible();
  await expect(activity.getByText("Dismissed proposed deadline")).toBeVisible();
});

test("asks for material instead of guessing when there is nothing to read", async ({ page }) => {
  await signIn(page, fixture().member);
  await createClientNamed(page, uniqueName("Empty brief"));
  const analysis = section(page, "analysis");
  await analysis.getByRole("button", { name: "Analyze client information" }).click();
  await expect(analysis.getByText("There is no source material to analyze.", { exact: false })).toBeVisible();
});

test("shows a failed analysis and lets the person try again", async ({ page }) => {
  await signIn(page, fixture().member);
  await createClientNamed(page, uniqueName("Failing analysis"), { notes: "FIXTURE_FAIL" });
  const analysis = section(page, "analysis");
  await analysis.getByRole("button", { name: "Analyze client information" }).click();
  await expect(analysis.getByText("The analysis did not finish.", { exact: false })).toBeVisible();
  await expect(analysis.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(analysis.getByTestId("proposal")).toHaveCount(0);
});
