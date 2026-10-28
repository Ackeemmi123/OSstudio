import { test } from "@playwright/test";
import { createClientWithSourceAndReload } from "./flows/persistence";
import { fixture } from "./supabase";

/**
 * Data saved through the UI is stored in Supabase, not in the browser. The
 * same journey runs against hosted staging with `npm run staging:e2e`
 * (tests/staging-e2e).
 */
test("creates a client and source material that are still there after a reload and in a new session", async ({ page, browser }) => {
  const { url, anonKey, studioA, member } = fixture();
  await createClientWithSourceAndReload(page, browser, {
    supabaseUrl: url,
    anonKey,
    studioId: studioA,
    user: { email: member.email, password: member.password },
    run: Math.random().toString(36).slice(2, 8),
  });
});
