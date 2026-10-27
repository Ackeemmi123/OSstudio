import { expect, test } from "@playwright/test";
import { buildNewClient } from "@/lib/domain/clients";
import { buildProject, buildTask } from "@/lib/domain/projects";
import type { StudioSnapshot } from "@/lib/domain/types";
import { signIn, uniqueName } from "./helpers";
import { fixture } from "./supabase";

/** Data someone entered in the local demo before the studio moved to Supabase. */
function browserWorkspace(name: string): StudioSnapshot {
  let n = 0;
  const deps = { now: () => "2026-09-01T09:00:00.000Z", createId: () => `local-${++n}`, actor: { kind: "human" as const, name: "Alex (browser)" } };
  const { client, event } = buildNewClient({ name, contactPerson: "Kim", goal: "New website" }, deps);
  const { project, event: projectEvent } = buildProject(client, { name: "Website", projectType: "website" }, deps);
  const { task, event: taskEvent } = buildTask(project, { title: "Collect logo files" }, deps);
  return { clients: [client], projects: [project], tasks: [task], activity: [event, projectEvent, taskEvent], sources: [], agentRuns: [], proposals: [], onboardings: [] };
}

test("imports browser data once, verifies it, and keeps history", async ({ page }) => {
  const name = uniqueName("Browser client");
  const workspace = browserWorkspace(name);
  await page.addInitScript((data) => {
    if (!window.localStorage.getItem("studio-os:workspace:v2")) window.localStorage.setItem("studio-os:workspace:v2", data);
  }, JSON.stringify(workspace));

  await signIn(page, fixture().owner);
  await page.goto("/settings");
  const importSection = page.locator("section#import");
  await expect(importSection.getByText("1 client, 1 project and 1 task")).toBeVisible();

  await importSection.getByRole("button", { name: "Review import" }).click();
  const dialog = page.getByRole("dialog", { name: "Import from this browser" });
  await expect(dialog.getByText("1 client with their brief values")).toBeVisible();
  await dialog.getByRole("button", { name: "Import" }).click();
  await expect(page.getByText("Imported 1 client, 1 project and 1 task.")).toBeVisible();
  await expect(importSection.getByText("checked on the server")).toBeVisible();
  // Verified, so it is not offered again; the browser copy can now be removed.
  await expect(importSection.getByRole("button", { name: "Review import" })).toHaveCount(0);

  await page.goto("/clients");
  await page.getByLabel("Search clients").fill(name);
  await expect(page.getByRole("link", { name: new RegExp(name) })).toHaveCount(1);
  await page.getByRole("link", { name: new RegExp(name) }).click();
  await expect(page.getByText("Collect logo files", { exact: true })).toBeVisible();
  await expect(page.locator("#brief-goal").getByText("New website")).toBeVisible();
  await expect(page.locator("section#activity").getByText(/Alex \(browser\)/).first()).toBeVisible();

  await page.goto("/settings");
  await importSection.getByRole("button", { name: "Remove browser copy" }).click();
  await page.getByRole("dialog", { name: "Remove the browser copy?" }).getByRole("button", { name: "Remove browser copy" }).click();
  await expect(importSection.getByText("The browser copy has been removed.")).toBeVisible();
});
