import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createClientNamed, section, signIn } from "../helpers";

/** Where the app keeps the chosen studio (see workspace-gate.tsx). */
const STUDIO_CHOICE_KEY = "studio-os:studio";

export interface PersistenceTarget {
  /** The Supabase project the app under test uses, for the read-back as the same person. */
  supabaseUrl: string;
  anonKey: string;
  /** The studio to work in. Other studios the account belongs to are left alone. */
  studioId: string;
  user: { email: string; password: string };
  /** Unique per run, so runs never touch each other's records. */
  run: string;
}

/** Opens the app in `studioId` instead of whichever studio the account was in last. */
export async function chooseStudio(context: BrowserContext, studioId: string) {
  await context.addInitScript(([key, value]) => window.localStorage.setItem(key, value), [STUDIO_CHOICE_KEY, studioId] as const);
}

/**
 * The core real-data journey: create a client, save source material, reload,
 * and check the data is still there: in the same tab, in a new browser
 * session with no local state, and in the database itself (read as the same
 * person, under row-level security). It only adds records; it changes and
 * deletes nothing that already exists.
 */
export async function createClientWithSourceAndReload(page: Page, browser: Browser, target: PersistenceTarget) {
  const name = `E2E persistence ${target.run}`;
  const label = `E2E inquiry ${target.run}`;
  const content = `Hello, this is an automated test inquiry (${target.run}).\nBudget: 10 000 SEK\nPlease ignore.`;

  await chooseStudio(page.context(), target.studioId);
  await signIn(page, target.user);
  const workspace = await createClientNamed(page, name);

  const sources = section(page, "sources");
  await sources.getByRole("button", { name: "Add" }).click();
  const dialog = page.getByRole("dialog", { name: "Add source material" });
  await dialog.getByLabel("Name").fill(label);
  await dialog.getByLabel("Content").fill(content);
  await dialog.getByRole("button", { name: "Add material" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Source material added.")).toBeVisible();

  const savedSource = (scope: Page) => section(scope, "sources").getByTestId("source").filter({ hasText: label });

  // 1. Same tab, after a reload.
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  await expect(savedSource(page)).toContainText(`automated test inquiry (${target.run})`);

  // 2. A new browser session with empty storage: the data comes from the server.
  const fresh = await browser.newContext();
  try {
    await chooseStudio(fresh, target.studioId);
    const other = await fresh.newPage();
    await signIn(other, target.user);
    await other.goto(workspace);
    await expect(other.getByRole("heading", { level: 1, name })).toBeVisible();
    await expect(savedSource(other)).toContainText(`automated test inquiry (${target.run})`);
    await other.goto("/clients");
    await other.getByLabel("Search clients").fill(name);
    await expect(other.getByRole("link", { name: new RegExp(name) })).toBeVisible();
  } finally {
    await fresh.close();
  }

  // 3. The database, as the same person: exactly one such client with exactly this source.
  const db = createClient(target.supabaseUrl, target.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: signInError } = await db.auth.signInWithPassword(target.user);
  if (signInError) throw signInError;
  try {
    const clients = await db.from("clients").select("id").eq("studio_id", target.studioId).eq("name", name);
    expect(clients.error).toBeNull();
    expect(clients.data).toHaveLength(1);
    const clientId = clients.data![0].id as string;
    expect(workspace).toContain(clientId);
    const stored = await db.from("client_sources").select("label, content").eq("studio_id", target.studioId).eq("client_id", clientId);
    expect(stored.error).toBeNull();
    expect(stored.data).toEqual([{ label, content }]);
  } finally {
    await db.auth.signOut({ scope: "local" });
  }
}
