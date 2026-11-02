import { expect, type Page } from "@playwright/test";
import { signIn } from "./helpers";
import { fixture, signedInClient, type SeedUser } from "./supabase";

/** TEMPORARY diagnostics: removed before this PR is ready. */
async function timeLoad(user: SeedUser, studio: string) {
  const client = await signedInClient(user);
  const times: number[] = [];
  let bytes = 0;
  let counts = "";
  for (let i = 0; i < 3; i++) {
    const start = Date.now();
    const { data, error } = await client.rpc("load_studio", { p_studio: studio });
    if (error) throw error;
    times.push(Date.now() - start);
    bytes = JSON.stringify(data).length;
    const d = data as Record<string, unknown[]>;
    counts = ["clients", "context_fields", "projects", "tasks", "activity", "agent_runs", "retention"].map((k) => `${k}=${d[k].length}`).join(" ");
  }
  return { times, bytes, counts };
}

export async function loadProbe(label: string, page: Page) {
  const { studioA, member, owner } = fixture();
  console.log(`PROBE ${label} shared`, JSON.stringify(await timeLoad(member, studioA)));
  const ownerClient = await signedInClient(owner);
  const { data: empty, error } = await ownerClient.rpc("create_studio", { p_name: `Probe ${label} ${Date.now()}`, p_display_name: owner.name });
  if (error) throw error;
  console.log(`PROBE ${label} empty`, JSON.stringify(await timeLoad(owner, empty as string)));
  const start = Date.now();
  await signIn(page, member);
  const signedIn = Date.now();
  await page.goto("/clients");
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  await expect(page.getByText("Loading your studio…")).toBeHidden();
  console.log(`PROBE ${label} browser`, JSON.stringify({ signInMs: signedIn - start, clientsPageMs: Date.now() - signedIn }));
}

/** Logs each step's time and every load_studio request made by the page. */
export function stepClock(page: Page, label: string) {
  let last = Date.now();
  let loads = 0;
  let loadMs = 0;
  page.on("requestfinished", (request) => {
    if (!request.url().includes("/rpc/load_studio")) return;
    loads++;
    loadMs += Math.max(0, request.timing().responseEnd);
  });
  return (step: string) => {
    console.log(`PROBE ${label} ${step}: ${Date.now() - last}ms (load_studio so far: ${loads} requests, ${Math.round(loadMs)}ms)`);
    last = Date.now();
  };
}
