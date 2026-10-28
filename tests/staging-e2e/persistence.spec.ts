import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { isLocalUrl, stagingEnv } from "../../scripts/staging-env.mjs";
import { createClientWithSourceAndReload } from "../e2e/flows/persistence";

/**
 * The real-data journey against the deployed staging app: create a client,
 * save source material, reload, and find both again in a new session and in
 * the database.
 *
 * It writes to staging, so it runs only with STAGING_E2E=1. It works in one
 * dedicated studio, "E2E persistence (automated)", which the test account
 * creates on the first run and reuses after that. Each run adds one client
 * named "E2E persistence <run>" with one source. It deletes, resets and
 * overwrites nothing, and never touches the "Smoke test" studios.
 *
 * Needs: STAGING_APP_URL, STAGING_SUPABASE_URL, STAGING_SUPABASE_ANON_KEY
 * (the same project the app uses), and an existing test account:
 * STAGING_E2E_EMAIL / STAGING_E2E_PASSWORD, or by default the smoke test
 * owner (STAGING_SMOKE_OWNER_EMAIL and its password). No service role key.
 */
const STUDIO_NAME = "E2E persistence (automated)";

const config = stagingEnv();
const email = process.env.STAGING_E2E_EMAIL?.trim() || config.smokeAccounts.owner;
const password = process.env.STAGING_E2E_PASSWORD?.trim() || config.smokeAccounts.ownerPassword;

function missing(): string[] {
  const problems: string[] = [];
  if (process.env.STAGING_E2E !== "1") problems.push("STAGING_E2E=1 (confirms this may add test data to staging)");
  if (!config.appUrl) problems.push("STAGING_APP_URL");
  if (!config.url || !config.anonKey) problems.push("STAGING_SUPABASE_URL and STAGING_SUPABASE_ANON_KEY");
  if (!email || !password) problems.push("STAGING_E2E_EMAIL and STAGING_E2E_PASSWORD (or the STAGING_SMOKE_OWNER_* account)");
  return problems;
}

test("creates a client and source material on staging that are still there after a reload and in a new session", async ({ page, browser }) => {
  const problems = missing();
  // Fails rather than skips: a run that was asked for must not look like a pass.
  expect(problems, `Missing staging configuration (see docs/staging.md): ${problems.join("; ")}`).toEqual([]);
  const appUrl = new URL(config.appUrl!);
  expect(appUrl.protocol === "https:" || isLocalUrl(config.appUrl!), "STAGING_APP_URL must use https").toBe(true);

  const studioId = await dedicatedStudio(config.url!, config.anonKey!, { email: email!, password: password! });
  await createClientWithSourceAndReload(page, browser, {
    supabaseUrl: config.url!,
    anonKey: config.anonKey!,
    studioId,
    user: { email: email!, password: password! },
    run: `${new Date().toISOString().slice(0, 16).replace(/\D/g, "")}-${Math.random().toString(36).slice(2, 6)}`,
  });
});

/** The test account's "E2E persistence (automated)" studio, created on the first run. */
async function dedicatedStudio(url: string, anonKey: string, user: { email: string; password: string }): Promise<string> {
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signIn = await client.auth.signInWithPassword(user);
  if (signIn.error) throw new Error(`The staging test account could not sign in: ${signIn.error.message}`);
  try {
    const studios = await client.rpc("my_studios");
    if (studios.error) throw new Error(`Studios could not be listed: ${studios.error.message}`);
    const owned = (studios.data as { studio_id: string; name: string; role: string }[]).filter((s) => s.name === STUDIO_NAME && s.role === "owner");
    if (owned.length > 0) return owned[0].studio_id;
    const created = await client.rpc("create_studio", { p_name: STUDIO_NAME, p_display_name: "E2E test account" });
    if (created.error) throw new Error(`The test studio could not be created: ${created.error.message}`);
    return created.data as string;
  } finally {
    await client.auth.signOut({ scope: "local" });
  }
}
