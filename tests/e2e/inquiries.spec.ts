import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { examplePayload } from "@/lib/inquiries/test-helpers";
import { section, signIn, uniqueName } from "./helpers";
import { fixture, localSupabase } from "./supabase";

/**
 * Website inquiries in the signed-in app: they appear under Needs your
 * decision, and a person approves, adds, rejects or marks them as spam.
 * Each test stores its own invented test inquiry the way /api/inquiries does.
 */
async function receiveInquiry(company: string, overrides: Record<string, unknown> = {}): Promise<string> {
  const { url, serviceKey } = localSupabase();
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const tag = randomUUID().slice(0, 8);
  const payload = examplePayload(
    { submissionId: randomUUID(), contact: { name: "Maja Lind", email: `maja-${tag}@example.test`, company, website: `lumen-${tag}.example` }, ...overrides },
    new Date(),
  );
  const { data, error } = await admin.rpc("receive_inquiry", { p_studio: fixture().studioA, p_inquiry: payload, p_content_hash: tag.padEnd(64, "0"), p_ip_hash: null });
  if (error) throw new Error(JSON.stringify(error));
  return (data as { id: string }).id;
}

async function openFromToday(page: Page, company: string) {
  await page.goto("/");
  const item = page.locator("section#decisions").getByRole("link", { name: new RegExp(`New inquiry from ${escape(company)}`) });
  await expect(item).toBeVisible();
  await item.click();
  await expect(page.getByRole("heading", { level: 1, name: company })).toBeVisible();
}

function escape(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("approving creates the client with a prefilled, staff-led onboarding", async ({ page }) => {
  const company = uniqueName("Lumen Yoga");
  await receiveInquiry(company);
  await signIn(page, fixture().member);

  await page.goto("/clients");
  await expect(section(page, "inquiries").getByRole("link", { name: new RegExp(escape(company)) })).toBeVisible();

  await openFromToday(page, company);
  await expect(page.getByText("From website inquiry · not reviewed", { exact: false })).toBeVisible();
  await expect(page.getByText("€4,500")).toBeVisible();
  await expect(page.getByText("Indicative. Not a price", { exact: false })).toBeVisible();

  const approvedName = company.replace(" (test)", "");
  await page.getByLabel("Client name").fill(approvedName);
  await page.getByRole("button", { name: "Approve as new client" }).click();
  await expect(page.getByRole("heading", { level: 1, name: approvedName })).toBeVisible();
  await expect(page).toHaveURL(/\/clients\/[^/]+$/);

  await expect(page.getByText("Maja Lind").first()).toBeVisible();
  const brief = section(page, "brief");
  await expect(brief.locator("#brief-budget").getByText("€4,500", { exact: true })).toBeVisible();
  await expect(section(page, "sources").getByTestId("source").getByText(/Website inquiry · /)).toBeVisible();

  // Onboarding starts as a draft; inquiry values are shown to verify, not asked again.
  await page.goto(`${new URL(page.url()).pathname}/onboarding`);
  await page.getByRole("navigation", { name: "Onboarding steps" }).getByRole("button", { name: "Budget & timing" }).click();
  const budget = page.locator('[data-question="budget"]');
  await expect(budget.getByText("€4,500")).toBeVisible();
  await expect(budget.getByRole("button", { name: "Confirm" })).toBeVisible();

  // The inquiry is no longer waiting for a decision.
  await page.goto("/");
  await expect(page.locator("section#decisions").getByText(`New inquiry from ${company}`)).toHaveCount(0);
});

test("rejecting keeps an internal reason and creates no client", async ({ page }) => {
  const company = uniqueName("Rejected Co (test)");
  await receiveInquiry(company, { budget: "under_1k", budgetAmount: undefined });
  await signIn(page, fixture().owner);
  await openFromToday(page, company);
  await expect(page.getByText("Under €1,000")).toBeVisible();

  await page.getByRole("button", { name: "Reject", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Reject this inquiry?" });
  await dialog.getByLabel("Reason (optional)").fill("Outside what we do right now.");
  await dialog.getByRole("button", { name: "Reject" }).click();

  await expect(page.getByText("Inquiry rejected.")).toBeVisible();
  await expect(page.getByText(/rejected it/)).toBeVisible();
  await expect(page.getByText("Outside what we do right now.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve as new client" })).toHaveCount(0);

  await page.goto("/clients");
  await expect(page.getByRole("link", { name: new RegExp(escape(company)) })).toHaveCount(0);
});

test("a returning customer is added to the existing client without a second one", async ({ page }) => {
  const company = uniqueName("Returning (test)");
  const id = await receiveInquiry(company);
  await signIn(page, fixture().member);

  // An earlier client with the same name.
  await page.goto("/clients");
  await page.getByRole("button", { name: "New client" }).first().click();
  const create = page.getByRole("dialog", { name: "New client" });
  await create.getByLabel("Company or client name").fill(company);
  await create.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Onboarding" })).toBeVisible();

  await page.goto(`/inquiries/${id}`);
  await expect(section(page, "matches").getByRole("link", { name: new RegExp(escape(company)) })).toContainText("Same name");
  await page.locator("section#decision").getByRole("button", { name: `Add to ${company}` }).click();
  const dialog = page.getByRole("dialog", { name: `Add to ${company}?` });
  await expect(dialog.getByText("No existing value changes")).toBeVisible();
  await dialog.getByRole("button", { name: `Add to ${company}` }).click();
  await expect(page.getByRole("heading", { level: 1, name: company })).toBeVisible();
  await expect(section(page, "sources").getByTestId("source").getByText(/Website inquiry · /)).toBeVisible();

  await page.goto("/clients");
  await page.getByLabel("Search clients").fill(company);
  await expect(page.getByRole("link", { name: new RegExp(escape(company)) })).toHaveCount(1);
});

test("viewers see inquiries but cannot decide; spam is one click away for members", async ({ page, browser }) => {
  const company = uniqueName("Spammy (test)");
  const id = await receiveInquiry(company);

  await signIn(page, fixture().viewer);
  await page.goto(`/inquiries/${id}`);
  await expect(page.getByRole("heading", { level: 1, name: company })).toBeVisible();
  await expect(page.getByText("You have read-only access.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve as new client" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Mark as spam" })).toHaveCount(0);

  const memberPage = await browser.newPage();
  await signIn(memberPage, fixture().member);
  await memberPage.goto(`/inquiries/${id}`);
  await memberPage.getByRole("button", { name: "Mark as spam" }).click();
  await memberPage.getByRole("dialog", { name: "Mark as spam?" }).getByRole("button", { name: "Mark as spam" }).click();
  await expect(memberPage.getByText(/marked it as spam/)).toBeVisible();
  await memberPage.close();

  await page.reload();
  await expect(page.getByText(/marked it as spam/)).toBeVisible();
});

test("an inquiry left undecided for 2 working days moves to Follow up", async ({ page }) => {
  const company = uniqueName("Waiting Co (test)");
  await receiveInquiry(company);
  await page.clock.install();
  await signIn(page, fixture().member);
  await page.goto("/");
  await expect(page.locator("section#decisions").getByRole("link", { name: new RegExp(`New inquiry from ${escape(company)}`) })).toBeVisible();

  // Four calendar days always include at least two working days.
  await page.clock.fastForward(4 * 24 * 60 * 60 * 1000);
  const followUp = page.locator("section#follow-up").getByRole("link", { name: new RegExp(`Inquiry from ${escape(company)}`) });
  await expect(followUp).toBeVisible();
  await expect(followUp).toContainText(/Waiting \d working days · Test inquiry/);
  await expect(followUp).toContainText("Decide");
  await expect(page.locator("section#decisions").getByRole("link", { name: new RegExp(`New inquiry from ${escape(company)}`) })).toHaveCount(0);
});

test("a repeat from the same address is shown and decided with the first inquiry", async ({ page }) => {
  const company = uniqueName("Repeat Yoga (test)");
  const email = `repeat-${randomUUID().slice(0, 8)}@example.test`;
  const contact = { name: "Maja Lind", email, company, website: `${randomUUID().slice(0, 8)}.example` };
  const first = await receiveInquiry(company, { contact });
  const repeat = await receiveInquiry(company, { contact, message: "Glömde nämna: vi behöver också en webbutik för presentkort." });
  await signIn(page, fixture().member);

  await page.goto("/");
  const items = page.locator("section#decisions").getByRole("link", { name: new RegExp(`New inquiry from ${escape(company)}`) });
  await expect(items).toHaveCount(1);
  await expect(items).toContainText("Sent 2 times");

  await page.goto(`/inquiries/${repeat}`);
  await expect(page.getByText("It is decided together with that one.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve as new client" })).toHaveCount(0);
  await page.getByRole("link", { name: "Open the first inquiry" }).click();
  await expect(page).toHaveURL(new RegExp(`/inquiries/${first}$`));

  await expect(section(page, "sent-again").getByTestId("repeat")).toContainText("presentkort");
  const approvedName = company.replace(" (test)", "");
  await page.getByLabel("Client name").fill(approvedName);
  await page.getByRole("button", { name: "Approve as new client" }).click();
  await expect(page.getByRole("heading", { level: 1, name: approvedName })).toBeVisible();
  await expect(section(page, "sources").getByTestId("source")).toHaveCount(2);

  await page.goto(`/inquiries/${repeat}`);
  await expect(page.getByText(/decided the first inquiry from this address/)).toBeVisible();
  await expect(page.getByRole("link", { name: `Open ${approvedName}` })).toBeVisible();
});
