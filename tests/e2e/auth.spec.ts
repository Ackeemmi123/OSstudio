import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { signIn } from "./helpers";
import { fixture, localSupabase } from "./supabase";

test.describe("sign-in", () => {
  test("asks for sign-in and offers no public sign-up", async ({ page }) => {
    await page.goto("/clients");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.getByText("There is no public sign-up.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Clients" })).toHaveCount(0);
  });

  test("rejects a wrong password", async ({ page }) => {
    const { owner } = fixture();
    await page.goto("/");
    await page.getByLabel("Email").fill(owner.email);
    await page.getByLabel("Password").fill("not-the-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });

  test("signs in to the studio and out again", async ({ page }) => {
    const { owner } = fixture();
    await signIn(page, owner);
    await expect(page.getByRole("link", { name: "Clients" }).first()).toBeVisible();
    await expect(page.getByText("Local demo")).toHaveCount(0);

    await page.goto("/settings");
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });

  test("a person without a studio is offered to create one, not shown someone else's", async ({ page }) => {
    // A fresh account that belongs to no studio.
    const { url, serviceKey } = localSupabase();
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const email = `lonely-${Date.now().toString(36)}@e2e.studio-os.test`;
    const password = "e2e-lonely-password";
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    expect(created.error).toBeNull();

    await signIn(page, { id: created.data.user!.id, email, password, name: "Lonely" });
    await expect(page.getByRole("heading", { name: "You're not in a studio yet" })).toBeVisible();
    await expect(page.getByText("Confidential Client B")).toHaveCount(0);
  });

  test("an ended session asks the person to sign in again instead of failing silently", async ({ page }) => {
    const { owner } = fixture();
    await signIn(page, owner);
    await page.goto("/clients");
    await expect(page.getByRole("heading", { name: "Clients" })).toBeVisible();

    // Replace the stored access token with one the server rejects, as happens when a session is revoked.
    await page.evaluate(() => {
      const raw = window.localStorage.getItem("studio-os:auth");
      if (!raw) throw new Error("No stored session");
      const session = JSON.parse(raw);
      session.access_token = "invalid.jwt.token";
      session.expires_at = Math.floor(Date.now() / 1000) + 3600;
      window.localStorage.setItem("studio-os:auth", JSON.stringify(session));
    });

    await page.getByRole("button", { name: "New client" }).first().click();
    const dialog = page.getByRole("dialog", { name: "New client" });
    await dialog.getByLabel("Company or client name").fill("Should not be saved");
    await dialog.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.getByText("Your session has ended. Sign in again to continue.")).toBeVisible();
  });
});
