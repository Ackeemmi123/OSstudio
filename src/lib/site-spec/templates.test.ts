import { describe, expect, it } from "vitest";
import { SITE_LOCALES, type SiteLocale } from "./catalog";
import { qualityWarnings } from "./checks";
import { newPage, newSection } from "./edit";
import type { SiteSpec } from "./schema";
import { briefClient } from "./test-helpers";
import { SITE_TEMPLATES, suggestedTemplate, templateSpec } from "./templates";
import { isPlaceholderText, visibleTexts } from "./texts";
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

  it("marks the privacy notice and consent text as placeholders needing legal review, and blocks them", () => {
    const client = briefClient();
    for (const template of SITE_TEMPLATES) {
      const { spec } = templateSpec(client, project, template, ["en"]);
      const privacy = spec.pages.find((p) => p.id === "privacy")!.sections[0];
      expect(privacy.kind === "text" && privacy.body.en).toMatch(/^\[PLACEHOLDER, NOT A PRIVACY NOTICE.*legal review/);
      expect(spec.forms[0].consentText.en).toMatch(/^\[PLACEHOLDER.*legally reviewed/);
      const paths = approvalBlockers(spec, client).map((b) => b.path);
      expect(paths).toContain("forms.0.consentText.en");
      expect(paths.some((path) => path.startsWith(`pages.${spec.pages.findIndex((p) => p.id === "privacy")}.sections.0.body`))).toBe(true);
    }
  });

  it("does not make the online shop read as if anything were set up", () => {
    const { spec } = templateSpec(briefClient(), project, "shop", ["en"]);
    // Everything a visitor would read that is not an instruction to replace.
    const finished = visibleTexts(spec).filter((t) => !isPlaceholderText(t.text)).map((t) => t.text).join(" | ");
    expect(finished).not.toMatch(/checkout|cart|basket|payment|pay |shipping|delivery|returns|in stock|buy now|price/i);
    const shop = spec.pages.find((p) => p.id === "shop")!.sections[0];
    expect(shop.kind === "text" && shop.body.en).toMatch(/^\[NOT SET UP: no products, prices, payments, shipping or shop platform are connected/);
    expect(spec.integrations.store.enabled).toBe(false);
  });

  it("looks different from template to template, not one form three times", () => {
    const variants = (template: (typeof SITE_TEMPLATES)[number]) => templateSpec(briefClient(), project, template, ["en"]).spec.pages[0].sections[0];
    expect(new Set(SITE_TEMPLATES.map((t) => variants(t).variant)).size).toBe(3);
  });

  it("gives each template its own journey on the home page", () => {
    const journey = (template: (typeof SITE_TEMPLATES)[number]) => templateSpec(briefClient(), project, template, ["en"]).spec.pages[0].sections.map((s) => s.kind);
    expect(journey("services")).toEqual(["hero", "features", "services", "features", "testimonials", "faq", "cta"]);
    expect(journey("shop")).toEqual(["hero", "text_media", "services", "features", "features", "testimonials"]);
    expect(journey("single")).toEqual(["hero", "text", "services", "text_media", "features", "testimonials", "faq", "contact"]);
  });

  it("leads the buttons that matter to the form or section they promise", () => {
    const sectionsOf = (spec: SiteSpec, pageId: string) => spec.pages.find((p) => p.id === pageId)!.sections.map((s) => s.id);
    const services = templateSpec(briefClient(), project, "services", ["en"]).spec;
    const hero = services.pages[0].sections[0];
    if (hero.kind !== "hero") throw new Error("Expected a hero");
    expect(hero.buttons).toHaveLength(2);
    expect(sectionsOf(services, "contact")).toContain(hero.buttons[0].targetSectionId);
    expect(services.pages[0].sections.find((s) => s.id === hero.buttons[1].targetSectionId)?.kind).toBe("services");
    expect(sectionsOf(services, "contact")).toContain(services.strategy.primaryCta?.targetSectionId);

    const single = templateSpec(briefClient(), project, "single", ["en"]).spec;
    const form = single.pages[0].sections.find((s) => s.kind === "contact")!;
    expect(single.strategy.primaryCta).toMatchObject({ targetPageId: "home", targetSectionId: form.id });
  });

  it("starts with no heading that could be on any website, and warns about none once written", () => {
    for (const template of SITE_TEMPLATES) {
      const { spec } = templateSpec(briefClient(), project, template, ["en", "sv", "fi"]);
      const fixed = spec.pages.flatMap((p) => p.sections).flatMap((s) => Object.values(s.heading)).filter((h) => !isPlaceholderText(h ?? ""));
      for (const words of [/^What we do/, /^Our services/, /^Why choose us/, /^What customers say/, /^About$/]) expect(fixed.join(" | ")).not.toMatch(words);
      expect(qualityWarnings(spec).map((w) => w.message).join(" ")).not.toMatch(/could be on any website/);
    }
  });

  it("lets no instruction through: any one left behind stops approval, also inside finished text", () => {
    const client = briefClient();
    const clientFiles = files.map((f) => ({ ...f, clientId: client.id }));
    for (const template of SITE_TEMPLATES) {
      const original = templateSpec(client, project, template, ["en"]).spec;
      const finished = written(original);
      const instructions: (string | number)[][] = [];
      const find = (value: unknown, path: (string | number)[]) => {
        if (typeof value === "string" && isPlaceholderText(value)) instructions.push(path);
        else if (Array.isArray(value)) value.forEach((v, i) => find(v, [...path, i]));
        else if (value && typeof value === "object") Object.entries(value).forEach(([k, v]) => find(v, [...path, k]));
      };
      find(original, []);
      expect(instructions.length).toBeGreaterThan(20);
      const at = (root: unknown, path: (string | number)[]) => path.slice(0, -1).reduce((node, key) => (node as Record<string | number, unknown>)[key], root) as Record<string | number, string>;
      for (const path of instructions) {
        const last = path[path.length - 1];
        for (const left of [at(original, path)[last], `Some words. ${at(original, path)[last]}`]) {
          const spec = structuredClone(finished);
          at(spec, path)[last] = left;
          expect(approvalBlockers(spec, client, clientFiles).length, `${path.join(".")}: ${left}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it("does not block finished standard headings or text that only mentions brackets without words", () => {
    const client = briefClient();
    const spec = written(templateSpec(client, project, "services", ["en"]).spec);
    const clientFiles = files.map((f) => ({ ...f, clientId: client.id }));
    const faq = spec.pages[0].sections.find((s) => s.kind === "faq")!;
    expect(faq.heading.en).toBe("Frequently asked questions");
    faq.heading.en = "Questions [1]";
    expect(approvalBlockers(spec, client, clientFiles).map((b) => b.message)).toEqual([]);
    expect(qualityWarnings(spec).map((w) => w.message).join(" ")).not.toMatch(/could be on any website/);
  });

  it("still lets a business with a lot to say about its services have its own page", () => {
    const client = briefClient();
    const spec = written(templateSpec(client, project, "services", ["en"]).spec);
    const clientFiles = files.map((f) => ({ ...f, clientId: client.id }));
    const page = newPage(spec, "Services");
    page.nav = "main";
    page.seo.title.en = "Services";
    page.seo.description.en = "The services in detail.";
    const section = newSection(spec, "services");
    section.heading.en = "Everything we do in detail";
    if (section.kind === "services") section.items = [{ id: "detail", title: { en: "Bookkeeping" }, body: { en: "In detail." } }];
    page.sections.push(section);
    spec.pages.splice(1, 0, page);
    expect(approvalBlockers(spec, client, clientFiles).map((b) => b.message)).toEqual([]);
    expect(parseSiteSpec(spec).ok).toBe(true);
  });

  it("asks for real quotes or none, and for what a form's sender can expect", () => {
    const client = briefClient();
    for (const template of SITE_TEMPLATES) {
      const { spec } = templateSpec(client, project, template, ["en"]);
      const quotes = spec.pages.flatMap((p) => p.sections).find((s) => s.kind === "testimonials");
      expect(quotes?.kind === "testimonials" && quotes.items[0].quote.en).toMatch(/with their permission.*remove this section/);
      const paths = approvalBlockers(spec, client).map((b) => b.path);
      expect(paths).toEqual(expect.arrayContaining(["forms.0.submitLabel.en", "forms.0.replyNote.en"]));
    }
  });

  it("starts each template with its own look, readable, and still to be chosen", () => {
    const client = briefClient();
    const looks = SITE_TEMPLATES.map((t) => templateSpec(client, project, t, ["en"]).spec.brand);
    expect(new Set(looks.map((b) => b.colors.primary)).size).toBe(3);
    expect(new Set(looks.map((b) => b.typography.heading.family)).size).toBe(3);
    for (const brand of looks) expect(brand.source).toBeUndefined();
    for (const template of SITE_TEMPLATES) {
      const messages = approvalBlockers(templateSpec(client, project, template, ["en"]).spec, client).map((b) => b.message).join(" ");
      expect(messages).toMatch(/Choose the brand colours and fonts/);
      expect(messages).not.toMatch(/contrast/i);
    }
  });

  it("copies only confirmed brief values, with their source", () => {
    const client = briefClient();
    const { spec, unconfirmed } = templateSpec(client, project, "services", ["en", "sv"]);
    expect(unconfirmed).toEqual([]);
    expect(spec.strategy.goal.source).toMatchObject({ kind: "brief", field: "goal" });
    const offering = spec.pages.flatMap((p) => p.sections).find((s) => s.kind === "text" && s.source)!;
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
    const offering = spec.pages.find((p) => p.id === "about")!.sections[1];
    expect(offering.source).toBeUndefined();
    expect(offering.kind === "text" && offering.body.en).toMatch(/^\[Say what/);
    expect(spec.strategy.goal.text).toBe("");
  });

  it("the first chosen language is the default, and words a visitor reads are translated", () => {
    const { spec } = templateSpec(briefClient(), project, "services", ["sv", "fi"]);
    expect(spec.locales).toEqual({ available: ["sv", "fi"], default: "sv" });
    expect(spec.pages[0].title).toEqual({ sv: "Hem", fi: "Etusivu" });
    expect(spec.pages[1].slug).toEqual({ sv: "om-oss", fi: "tietoa-meista" });
    expect(SITE_LOCALES).toContain("sv");
  });
});
