import { describe, expect, it } from "vitest";
import { setContextField } from "@/lib/domain/clients";
import { testDeps } from "@/lib/domain/test-helpers";
import { SECTION_KINDS } from "./catalog";
import { freshId, move, newForm, newItem, newPage, newPlaceholderImage, newSection, refreshFromBrief, slugify } from "./edit";
import { briefClient, completeSpec } from "./test-helpers";
import { approvalBlockers, parseSiteSpec } from "./validate";

describe("editing helpers", () => {
  it("makes every kind of section, with items, as a valid draft", () => {
    const spec = completeSpec(briefClient());
    for (const kind of SECTION_KINDS) {
      const section = newSection(spec, kind);
      if ("items" in section) (section.items as unknown[]).push(newItem(spec, kind));
      spec.pages[0].sections.push(section);
    }
    const parsed = parseSiteSpec(spec);
    expect(parsed.ok ? [] : parsed.issues).toEqual([]);
  });

  it("adds pages, images and forms that fit the spec", () => {
    const spec = completeSpec(briefClient());
    spec.pages.push(newPage(spec, "Contact"));
    spec.assets.push(newPlaceholderImage(spec, "Shop front"));
    spec.forms.push(newForm(spec));
    expect(spec.pages[2].slug.en).toBe("contact-2");
    expect(parseSiteSpec(spec).ok).toBe(true);
  });

  it("makes addresses and ids from any title", () => {
    expect(slugify("  Café & Bakery – Kallio ")).toBe("cafe-bakery-kallio");
    expect(slugify("Ääkköset")).toBe("aakkoset");
    const spec = completeSpec(briefClient());
    expect(freshId(spec, "home")).toBe("home-1");
    expect(freshId(spec, "2024 menu")).toBe("x-2024-menu-1");
  });

  it("refreshes content copied from brief values that were confirmed again, and clears its translations", () => {
    const client = briefClient();
    const spec = completeSpec(client);
    spec.locales.available = ["en", "fi"];
    const text = spec.pages[0].sections[1];
    if (text.kind !== "text") throw new Error("expected a text section");
    text.body.fi = "Juhlakakkuja";
    const later = { ...testDeps(), now: () => "2026-10-27T09:00:00.000Z" };
    let changed = setContextField(client, "goal", { value: "Catering orders", confidence: "confirmed" }, later).client;
    changed = setContextField(changed, "offering", { value: "Cakes and catering", confidence: "confirmed" }, later).client;
    expect(approvalBlockers(spec, changed).map((b) => b.message)).toContainEqual(expect.stringMatching(/Goal changed in the brief/));

    const { spec: refreshed, refreshed: fields } = refreshFromBrief(spec, changed);
    expect(fields.sort()).toEqual(["goal", "offering"]);
    expect(refreshed.strategy.goal).toEqual({ text: "Catering orders", source: { kind: "brief", field: "goal", confirmedAt: "2026-10-27T09:00:00.000Z" } });
    expect(refreshed.pages[0].sections[1]).toMatchObject({ body: { en: "Cakes and catering" }, source: { confirmedAt: "2026-10-27T09:00:00.000Z" } });
    expect(approvalBlockers(refreshed, changed).map((b) => b.message)).not.toContainEqual(expect.stringMatching(/changed in the brief/));
    expect(spec.strategy.goal.text).toBe("More cake pre-orders from local customers");
  });

  it("leaves values alone that are unchanged or no longer confirmed", () => {
    const client = briefClient();
    const spec = completeSpec(client);
    expect(refreshFromBrief(spec, client)).toEqual({ spec, refreshed: [] });
    const unconfirmed = setContextField(client, "goal", { value: "Something else", confidence: "observed" }, testDeps()).client;
    expect(refreshFromBrief(spec, unconfirmed).refreshed).toEqual([]);
  });

  it("moves entries without leaving the list", () => {
    expect(move([1, 2, 3], 0, 1)).toEqual([2, 1, 3]);
    expect(move([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
  });
});
