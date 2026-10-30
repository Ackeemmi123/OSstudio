import { buildNewClient, setContextField } from "@/lib/domain/clients";
import { buildProject } from "@/lib/domain/projects";
import { testDeps } from "@/lib/domain/test-helpers";
import type { Client, ContextFieldKey, Project } from "@/lib/domain/types";
import { startingSpec } from "./from-brief";
import type { SiteSpec } from "./schema";

/** A bakery whose goal, audience and offering the client confirmed, and whose budget is only observed. */
export function briefClient(confirmed: ContextFieldKey[] = ["goal", "targetAudience", "offering"]): Client {
  let client = buildNewClient({ name: "Dry Run Bakery (TEST)", projectType: "website" }, testDeps()).client;
  const values: Partial<Record<ContextFieldKey, string>> = {
    goal: "More cake pre-orders from local customers",
    targetAudience: "Families ordering birthday cakes",
    offering: "Celebration cakes, sourdough bread and catering",
    budget: "€3,000–€5,000",
  };
  for (const [key, value] of Object.entries(values) as [ContextFieldKey, string][]) {
    const confidence = confirmed.includes(key) ? "confirmed" : "observed";
    client = setContextField(client, key, { value, confidence }, testDeps()).client;
  }
  return client;
}

export function websiteProject(client: Client, projectType: Project["projectType"] = "website"): Project {
  return buildProject(client, { name: "New website", projectType }, testDeps()).project;
}

/** A spec with nothing blocking approval, built from the client's confirmed brief. */
export function completeSpec(client: Client): SiteSpec {
  const spec = startingSpec(client, { projectType: "website" }).spec;
  spec.strategy.tone = "Warm and plain-spoken";
  spec.brand.source = { kind: "person", by: "Alex", at: "2026-10-26T12:00:00.000Z" };
  spec.seo.defaultDescription.en = "Celebration cakes baked fresh to order.";
  const [home, contact] = spec.pages;
  home.seo.description.en = "Order celebration cakes baked fresh in Kallio.";
  const hero = home.sections[0];
  if (hero.kind === "hero") hero.heading.en = "Celebration cakes, made to order";
  contact.seo.description.en = "Order a cake or ask us anything.";
  spec.forms[0].consentText.en = "We use your details only to answer you.";
  return spec;
}
