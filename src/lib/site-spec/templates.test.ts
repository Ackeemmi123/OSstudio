import { describe, expect, it } from "vitest";
import { SITE_LOCALES, type SiteLocale } from "./catalog";
import { qualityWarnings } from "./checks";
import type { SiteSpec } from "./schema";
import { briefClient } from "./test-helpers";
import { SITE_TEMPLATES, suggestedTemplate, templateSpec } from "./templates";
import { isPlaceholderText } from "./texts";
import { approvalBlockers, parseSiteSpec } from "./validate";

const project = { projectType: "website" as const };
const combinations: SiteLocale[][] = [["en"], ["sv"], ["fi"], ["en", "sv"], ["en", "fi"], ["sv", "fi"], ["en", "sv", "fi"]];

/** Replaces every instruction with text, as a person would. */
function written(spec: SiteSpec): SiteSpec {
  let n = 0;
  const fill = (value: unknown): unknown => {
    if (typeof value === "string") return isPlaceholderText(value) ? `Written text ${++n}` : value;
    if (Array.isArray(value)) return value.map(fill);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fill(v)]));
    return value;
  };
  const next = fill(spec) as SiteSpec;
  next.brand.source = { kind: "person", by: "Alex", at: "2026-10-26T12:00:00.000Z" };
  next.assets = next.assets.map((asset) => ({ ...asset, origin: "client_supplied", fileId: "00000000-0000-4000-8000-000000000001" }));
  return next;
}
const files = [{ id: "00000000-0000-4000-8000-000000000001", clientId: "", status: "approved" as const }];

describe("first drafts from templates", () => {
  it("suggests a template from the project type", () => {
    expect(suggestedTemplate({ projectType: "website" })).toBe("services");
    expect(suggestedTemplate({ projectType: "brand_website" })).toBe("services");
    expect(suggestedTemplate({ projectType: "ecommerce" })).toBe("shop");
    expect(suggestedTemplate({ projectType: "website_ecommerce" })).toBe("shop");
  });

  for (const template of SITE_TEMPLATES) {
    describe(template, () => {
      it("is a valid spec in every language combination", () => {
        for (const locales of combinations) {
          const parsed = parseSiteSpec(templateSpec(briefClient(), project, template, locales).spec);
          expect(parsed.ok ? [] : parsed.issues).toEqual([]);
        }
      });

      it("has pages, sections, a home page first and a privacy page", () => {
        const { spec } = templateSpec(briefClient(), project, template, ["en"]);
        expect(spec.pages[0].slug.en).toBe("");
        expect(spec.pages.find((p) => p.id === "privacy")?.nav).toBe("footer");
        for (const page of spec.pages) expect(page.sections.length).toBeGreaterThan(0);
        expect(spec.assets.length).toBeGreaterThan(0);
      });

      it("cannot be approved while anything is left to write", () => {
        const client = briefClient();
        const messages = approvalBlockers(templateSpec(client, project, template, ["en", "sv"]).spec, client).map((b) => b.message).join(" ");
        expect(messages).toMatch(/still needs writing/);
        expect(messages).toMatch(/still a placeholder/);
      });

      it("can be approved once it is all written, with nothing left over", () => {
        const client = briefClient();
        const spec = written(templateSpec(client, project, template, ["en", "sv", "fi"]).spec);
        const clientFiles = files.map((f) => ({ ...f, clientId: client.id }));
        expect(approvalBlockers(spec, client, clientFiles).map((b) => b.message)).toEqual([]);
      });

      it("reaches every page and has nothing unused or unconnected", () => {
        const client = briefClient();
        const messages = qualityWarnings(written(templateSpec(client, project, template, ["en"]).spec)).map((w) => w.message).join(" ");
        expect(messages).not.toMatch(/no menu or button|no page uses|main call to action|no heading/);
      });

      it("keeps a long or unusual client name within the limits", () => {
        const client = { ...briefClient(), name: `${"Åke & Söner's \"Bageri\" ".repeat(10)}` };
        const parsed = parseSiteSpec(templateSpec(client, project, template, ["en", "sv"]).spec);
        expect(parsed.ok ? [] : parsed.issues).toEqual([]);
      });
    });
  }

  it("copies only confirmed brief values, with their source", () => {
    const client = briefClient();
    const { spec, unconfirmed } = templateSpec(client, project, "services", ["en", "sv"]);
    expect(unconfirmed).toEqual([]);
    expect(spec.strategy.goal.source).toMatchObject({ kind: "brief", field: "goal" });
    const offering = spec.pages[0].sections[1];
    expect(offering.source).toMatchObject({ kind: "brief", field: "offering" });
    expect(offering.kind === "text" && offering.body.en).toBe(client.context.offering.value);
    expect(offering.kind === "text" && offering.body.sv).toMatch(/^\[Translate/);
  });

  it("still gives a usable draft when nothing is confirmed", () => {
    const client = briefClient([]);
    const { spec, unconfirmed } = templateSpec(client, project, "services", ["en"]);
    const parsed = parseSiteSpec(spec);
    expect(parsed.ok ? [] : parsed.issues).toEqual([]);
    expect(unconfirmed.length).toBeGreaterThan(0);
    const offering = spec.pages[0].sections[1];
    expect(offering.source).toBeUndefined();
    expect(offering.kind === "text" && offering.body.en).toMatch(/^\[Say what/);
    expect(spec.strategy.goal.text).toBe("");
  });

  it("the first chosen language is the default, and words a visitor reads are translated", () => {
    const { spec } = templateSpec(briefClient(), project, "services", ["sv", "fi"]);
    expect(spec.locales).toEqual({ available: ["sv", "fi"], default: "sv" });
    expect(spec.pages[0].title).toEqual({ sv: "Hem", fi: "Etusivu" });
    expect(spec.pages[1].slug).toEqual({ sv: "tjanster", fi: "palvelut" });
    expect(SITE_LOCALES).toContain("sv");
  });
});
