import { buildNewClient, setContextField } from "@/lib/domain/clients";
import { buildProject } from "@/lib/domain/projects";
import { testDeps } from "@/lib/domain/test-helpers";
import type { Client, ContextFieldKey, Project } from "@/lib/domain/types";
import { startingSpec } from "./from-brief";
import { templateSpec } from "./templates";
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

/** Studio OS's services template with every instruction written out, as a person would. */
export function companySpec(): SiteSpec {
  const client = briefClient();
  const spec = templateSpec(client, websiteProject(client), "services", ["sv"]).spec as SiteSpec;
  let n = 0;
  const fill = (node: unknown, key = ""): unknown => {
    if (typeof node === "string") {
      if (!node.startsWith("[")) return node;
      n += 1;
      if (key === "price") return "";
      if (key === "body" && /kontakt/i.test(JSON.stringify(node))) return node;
      return `Text ${n}.`;
    }
    if (Array.isArray(node)) return node.map((child) => fill(child, key));
    if (node && typeof node === "object") return Object.fromEntries(Object.entries(node as Record<string, unknown>).map(([k, child]) => [k, fill(child, key === "sv" || key === "en" || key === "fi" ? key : k === "sv" || k === "en" || k === "fi" ? key : k)]));
    return node;
  };
  const filled = fill(spec) as SiteSpec;
  filled.brand.designSystem = "services@0.1";
  for (const page of filled.pages)
    for (const section of page.sections) {
      if (section.kind === "contact") section.body = { sv: "Skriv till info@example.fi eller ring 040 123 4567." };
      if (section.kind === "services") section.items.forEach((item) => delete item.price);
    }
  return filled;
}
