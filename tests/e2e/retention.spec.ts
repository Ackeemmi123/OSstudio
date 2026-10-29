import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import pg from "pg";
import { createClientNamed, section, signIn, uniqueName } from "./helpers";
import { fixture } from "./supabase";

/**
 * Client retention in the signed-in app: each client shows when its data
 * will be anonymised, Today warns 30 days ahead, and only an owner places or
 * releases a hold, with a logged reason.
 */

/** Moves the client's dates back, as the database owner of the local stack, the way it will look later. */
async function age(clientId: string, interval: string) {
  const raw = execFileSync("npx", ["supabase", "status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const url = (JSON.parse(raw.slice(raw.indexOf("{"))) as { DB_URL: string }).DB_URL;
  if (!/@(127\.0\.0\.1|localhost):/.test(url)) throw new Error("Only the local database may be aged.");
  const db = new pg.Client({ connectionString: url });
  await db.connect();
  try {
    await db.query("begin");
    await db.query("set local session_replication_role = replica");
    await db.query("update public.clients set created_at = created_at - $2::interval where id = $1", [clientId, interval]);
    await db.query(
      `update public.activity_events set "timestamp" = "timestamp" - $2::interval, recorded_at = recorded_at - $2::interval
         where private.entity_client(entity_type, entity_id) = $1`,
      [clientId, interval],
    );
    await db.query("commit");
  } finally {
    await db.end();
  }
}

test("an owner sees the retention date, gets a warning on Today, and holds and releases it with a reason", async ({ page }) => {
  const name = uniqueName("Retention Co (test)");
  await signIn(page, fixture().owner);
  const workspace = await createClientNamed(page, name);
  const clientId = workspace.split("/").pop()!;

  const retention = section(page, "retention");
  await expect(retention.getByText(/^Anonymised on /)).toBeVisible();
  await expect(retention.getByText("never became a customer is kept for 12 months", { exact: false })).toBeVisible();

  // Eleven months and 20 days later, Today lists it.
  await age(clientId, "11 months 20 days");
  await page.goto("/");
  const warning = page.locator("section#decisions").getByRole("link", { name: new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}: client data will be anonymised`) });
  await expect(warning).toBeVisible();
  await expect(warning).toContainText(/Anonymised in (9|10|11) days/);
  await warning.click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();

  await retention.getByRole("button", { name: "Place hold" }).click();
  const dialog = page.getByRole("dialog", { name: "Place a retention hold" });
  await dialog.getByRole("button", { name: "Place hold" }).click();
  await expect(dialog.getByText("Give a reason for the hold", { exact: false })).toBeVisible();
  await dialog.getByLabel("Reason").fill("Open invoice dispute (test)");
  await dialog.getByRole("button", { name: "Place hold" }).click();
  await expect(retention.getByText("On hold: Open invoice dispute (test)")).toBeVisible();
  await expect(retention.getByText(/^Held: Open invoice dispute \(test\)/)).toBeVisible();

  await page.goto("/");
  await expect(page.locator("section#decisions").getByText(`${name}: client data will be anonymised`)).toHaveCount(0);

  await page.goto(workspace);
  await retention.getByRole("button", { name: "Release hold" }).click();
  await expect(retention.getByText(/^Released · /)).toBeVisible();
  // Not the old date 10 days away: at least 30 days' notice after a release.
  await expect(retention.getByText(/^Anonymised (in (29|30|31) days|on )/)).toBeVisible();
  await expect(retention.getByText(/Anonymised in (9|10|11) days/)).toHaveCount(0);
});

test("members see the retention date but cannot place a hold", async ({ page }) => {
  const name = uniqueName("Member Retention (test)");
  await signIn(page, fixture().member);
  await createClientNamed(page, name);
  const retention = section(page, "retention");
  await expect(retention.getByText(/^Anonymised on /)).toBeVisible();
  await expect(retention.getByRole("button", { name: "Place hold" })).toHaveCount(0);
});
