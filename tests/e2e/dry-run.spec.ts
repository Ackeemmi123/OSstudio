import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { section, signIn, uniqueName } from "./helpers";
import { fixture, localSupabase } from "./supabase";

/**
 * The dry run in docs/dry-run.md, end to end on the local stack: the
 * fictional test customer's inquiry becomes a client, onboarding, an active
 * project with owned, dated tasks, and a completed project. A second inquiry
 * with every optional field left out is approved too. The inquiries are the
 * shared fixtures in tests/fixtures/inquiries, stored the way
 * /api/inquiries stores them.
 */
function readFixture(name: string): Record<string, unknown> & { contact: Record<string, string> } {
  return JSON.parse(readFileSync(path.join(__dirname, "../fixtures/inquiries", `${name}.json`), "utf8"));
}

async function receive(name: string, company: string | null, contactName: string): Promise<void> {
  const { url, serviceKey } = localSupabase();
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const payload = readFixture(name);
  const tag = randomUUID().slice(0, 8);
  const contact: Record<string, string> = { ...payload.contact, name: contactName, email: payload.contact.email.replace("@", `+${tag}@`) };
  if (company) contact.company = company;
  const inquiry: Record<string, unknown> = { ...payload, submissionId: randomUUID(), submittedAt: new Date().toISOString(), contact };
  if (inquiry.desiredDate) inquiry.desiredDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { error } = await admin.rpc("receive_inquiry", { p_studio: fixture().studioA, p_inquiry: inquiry, p_content_hash: tag.padEnd(64, "0"), p_ip_hash: null });
  if (error) throw new Error(JSON.stringify(error));
}

test("dry run: a test inquiry becomes an organized client project and is delivered", async ({ page }) => {
  test.setTimeout(120_000);
  const company = uniqueName("Dry Run Bakery (TEST)");
  await receive("dry-run-customer", company, "Testi Testinen (TEST)");
  await signIn(page, fixture().member);

  // 1. The inquiry waits on Today, marked as a test.
  await page.goto("/");
  const item = page.locator("section#decisions").getByRole("link", { name: new RegExp(`New inquiry from ${company.replace(/[()]/g, "\\$&")}`) });
  await expect(item).toBeVisible();
  await expect(item).toContainText("Test inquiry");
  await item.click();
  await expect(page.getByRole("heading", { level: 1, name: company })).toBeVisible();
  await expect(page.getByText("Sent as a test", { exact: false }).or(page.getByTitle("Sent as a test, not by a real customer"))).toBeVisible();

  // 2. Approve as a new client: status Onboarding, budget and timing observed, the message as source material.
  await page.getByRole("button", { name: "Approve as new client" }).click();
  await expect(page.getByRole("heading", { level: 1, name: company })).toBeVisible();
  await expect(page).toHaveURL(/\/clients\/[^/]+$/);
  const workspace = page.url();
  await expect(page.locator("header, main").getByText(/^(Lead|Onboarding|Active)$/).first()).toHaveText("Onboarding");
  await expect(section(page, "brief").locator("#brief-budget")).toContainText("€3,000–€5,000 (indicative)");
  await expect(section(page, "sources").getByTestId("source").getByText(/Website inquiry · /)).toBeVisible();

  // 3. Onboarding: confirm the budget with the client, then mark the brief ready.
  await page.goto(`${workspace}/onboarding`);
  const steps = page.getByRole("navigation", { name: "Onboarding steps" });
  await steps.getByRole("button", { name: "Budget & timing" }).click();
  await page.locator('[data-question="budget"]').getByRole("button", { name: "Confirm" }).click();
  await expect(page.locator('[data-question="budget"]').getByRole("button", { name: "Confirm" })).toHaveCount(0);
  await page.getByRole("button", { name: "Review brief" }).click();
  await page.getByRole("button", { name: /Mark ready/ }).click();
  await expect(page).toHaveURL(/#brief$/);

  // 4. Start the first project from the playbook; the client becomes Active.
  await page.locator("section#next").getByRole("link", { name: `Start the first project for ${company}` }).click();
  const projects = section(page, "projects");
  await projects.getByLabel("Project name").fill("New website (TEST)");
  await expect(projects.getByLabel("Mark " + company + " as an active client")).toBeChecked();
  await projects.getByRole("button", { name: /^Create project with \d+ tasks$/ }).click();
  const card = projects.locator('[id^="project-"]', { hasText: "New website (TEST)" });
  await expect(card.getByText("Kickoff call with the client", { exact: true })).toBeVisible();
  await expect(card.getByText("Launch and handover", { exact: true })).toBeVisible();
  await expect(page.locator("header, main").getByText(/^(Lead|Onboarding|Active)$/).first()).toHaveText("Active");

  // 5. Ownership and a due date on the first task, then it is done.
  const kickoff = card.locator("li", { hasText: "Kickoff call with the client" });
  const due = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString("en-CA", { timeZone: "Europe/Helsinki" });
  await kickoff.getByRole("button", { name: "Assign or schedule Kickoff call with the client" }).click();
  await kickoff.getByLabel("Owner").fill("Dry Run Owner");
  await kickoff.getByLabel("Due date").fill(due);
  await kickoff.getByRole("button", { name: "Save" }).click();
  await expect(kickoff.getByTestId("task-details")).toContainText("Dry Run Owner");
  await kickoff.getByLabel("Status of Kickoff call with the client").selectOption("done");
  await expect(card.getByRole("button", { name: "1 completed" })).toBeVisible();

  // 6. Delivery: a design waits for the client's approval, a person approves it.
  await card.getByLabel("Status of Page designs").selectOption("awaiting_approval");
  await card.locator("li", { hasText: "Page designs" }).getByRole("button", { name: "Approve" }).click();
  await expect(card.getByRole("button", { name: "2 completed" })).toBeVisible();

  // 7. Launch stage, then the project is completed. Everything is still there after a reload.
  await card.getByLabel("Stage").selectOption("launch");
  await card.getByLabel("Project status").selectOption("completed");
  await page.reload();
  await expect(card.getByLabel("Project status")).toHaveValue("completed");
  await expect(card.getByLabel("Stage")).toHaveValue("launch");
  const activity = section(page, "activity");
  const showAll = activity.getByRole("button", { name: /Show all/ });
  if (await showAll.isVisible()) await showAll.click();
  await expect(activity.getByText(/from a website inquiry/)).toBeVisible();
  await expect(activity.getByText("Completed Kickoff call with the client")).toBeVisible();
  await expect(activity.getByText("Approved Page designs")).toBeVisible();
});

test("dry run: an inquiry with every optional field left out is approved without guesses", async ({ page }) => {
  const person = uniqueName("Minimi Testaaja (TEST)");
  await receive("dry-run-minimal", null, person);
  await signIn(page, fixture().member);
  await page.goto("/");
  await page.locator("section#decisions").getByRole("link", { name: new RegExp(`New inquiry from ${person.replace(/[()]/g, "\\$&")}`) }).click();
  await expect(page.getByRole("heading", { level: 1, name: person })).toBeVisible();

  // With no company, the client is named after the person; the reviewer could change it.
  await expect(page.getByLabel("Client name")).toHaveValue(person);
  await page.getByRole("button", { name: "Approve as new client" }).click();
  await expect(page.getByRole("heading", { level: 1, name: person })).toBeVisible();
  await expect(page).toHaveURL(/\/clients\/[^/]+$/);
  await expect(section(page, "sources").getByTestId("source")).toContainText("Language: Finnish");
  // Nothing was sent for budget or timing, so nothing is recorded.
  await expect(section(page, "brief")).toContainText("Nothing recorded yet");
  await expect(section(page, "brief").locator("#brief-budget")).toHaveCount(0);
});
