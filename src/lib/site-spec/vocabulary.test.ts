import { describe, expect, it } from "vitest";
import { buildRenderModel } from "@/lib/site-render/model";
import { renderPreviewDocument } from "@/lib/site-render/document";
import { qualityWarnings } from "./checks";
import { newPage, newPlaceholderImage, removePage, removeSection } from "./edit";
import type { SiteSpec, SiteSpecSection } from "./schema";
import { briefClient, completeSpec } from "./test-helpers";
import { approvalBlockers, parseSiteSpec } from "./validate";

const client = briefClient();

function spec(): SiteSpec {
  return structuredClone(completeSpec(client));
}

function hero(value: SiteSpec): Extract<SiteSpecSection, { kind: "hero" }> {
  const section = value.pages[0].sections[0];
  if (section.kind !== "hero") throw new Error("Expected a hero first.");
  return section;
}

function addServices(value: SiteSpec, price?: Record<string, string>): number {
  value.pages[0].sections.push({
    id: "offer",
    kind: "services",
    variant: "list",
    eyebrow: { en: "What we do" },
    heading: { en: "Services" },
    items: [{ id: "cakes", title: { en: "Cakes" }, body: { en: "Made to order." }, ...(price ? { price } : {}) }],
  });
  return value.pages[0].sections.length - 1;
}

const messages = (value: SiteSpec) => approvalBlockers(value, client).map((b) => b.message);

describe("SiteSpec additions", () => {
  it("leaves existing specs valid, because every addition is optional", () => {
    const parsed = parseSiteSpec(spec());
    expect(parsed.ok).toBe(true);
    expect(messages(spec())).toEqual([]);
  });

  it("accepts every new field together", () => {
    const value = spec();
    addServices(value, { en: "From €80" });
    const section = hero(value);
    section.eyebrow = { en: "For families" };
    section.emphasis = { en: "made to order" };
    section.reassurance = { en: "We reply within a day." };
    section.buttons[0].targetPageId = value.pages[0].id;
    section.buttons[0].targetSectionId = "offer";
    value.forms[0].submitLabel = { en: "Order a cake" };
    value.forms[0].replyNote = { en: "We reply within a day." };
    value.forms[0].fieldLabels = { name: { en: "Your name" } };
    const parsed = parseSiteSpec(value);
    expect(parsed.ok ? [] : parsed.issues).toEqual([]);
    expect(messages(value)).toEqual([]);
  });

  it("refuses a button to a section that is not on its page", () => {
    const value = spec();
    hero(value).buttons[0].targetSectionId = "nowhere";
    const parsed = parseSiteSpec(value);
    expect(parsed.ok ? [] : parsed.issues.map((i) => i.message)).toContain("The button points to a section that is not on that page.");
  });

  it("refuses unknown form field labels", () => {
    const value = spec() as unknown as { forms: { fieldLabels?: unknown }[] };
    value.forms[0].fieldLabels = { shoeSize: { en: "Shoe size" } };
    expect(parseSiteSpec(value).ok).toBe(false);
  });

  it("blocks approval when an optional text is written in only some languages", () => {
    const value = spec();
    value.locales.available = ["en", "sv"];
    addServices(value, { en: "From €80" });
    hero(value).reassurance = { en: "We reply within a day." };
    value.forms[0].submitLabel = { en: "Send it" };
    const found = messages(value).join(" | ");
    expect(found).toMatch(/a price is missing in Swedish/);
    expect(found).toMatch(/the reassurance is missing in Swedish/);
    expect(found).toMatch(/send button is missing in Swedish/);
  });

  it("blocks approval when a new field still holds a template's instruction", () => {
    const value = spec();
    hero(value).reassurance = { en: "[What happens after they get in touch]" };
    expect(messages(value)).toContainEqual(expect.stringMatching(/still needs writing/));
  });

  it("keeps the image-rights rule for an image beside testimonials", () => {
    const value = spec();
    const image = newPlaceholderImage(value, "A client at work");
    value.assets.push(image);
    value.pages[0].sections.push({ id: "words", kind: "testimonials", variant: "quotes", heading: { en: "Words" }, mediaAssetId: image.id, items: [] });
    expect(messages(value)).toContainEqual(expect.stringMatching(/A client at work: still a placeholder/));
    expect(qualityWarnings(value).map((w) => w.message)).not.toContainEqual(expect.stringMatching(/no page uses this image/));
  });

  it("drops a section link when that section or its page is removed", () => {
    const value = spec();
    const index = addServices(value);
    const button = hero(value).buttons[0];
    button.targetPageId = value.pages[0].id;
    button.targetSectionId = "offer";
    removeSection(value, 0, index);
    expect(hero(value).buttons[0].targetSectionId).toBeUndefined();
    expect(parseSiteSpec(value).ok).toBe(true);

    const about = newPage(value, "About");
    about.sections.push({ id: "story", kind: "text", variant: "single_column", heading: { en: "Story" }, body: { en: "Words." } });
    value.pages.push(about);
    const link = hero(value).buttons[0];
    link.targetPageId = about.id;
    link.targetSectionId = "story";
    removePage(value, value.pages.length - 1);
    expect(hero(value).buttons[0]).toMatchObject({ targetPageId: value.pages[0].id });
    expect(hero(value).buttons[0].targetSectionId).toBeUndefined();
    expect(parseSiteSpec(value).ok).toBe(true);
  });

  it("warns when the words to set apart are not the heading's ending", () => {
    const value = spec();
    hero(value).emphasis = { en: "not in the heading" };
    expect(qualityWarnings(value).map((w) => w.message)).toContainEqual(expect.stringMatching(/will not stand out/));
  });
});

describe("drawing the additions", () => {
  it("resolves them into the render model", () => {
    const value = spec();
    addServices(value, { en: "From €80" });
    const section = hero(value);
    const ending = (section.heading.en ?? "").split(", ").at(-1) ?? "";
    section.emphasis = { en: ending };
    section.buttons[0].targetPageId = value.pages[0].id;
    section.buttons[0].targetSectionId = "offer";
    value.forms[0].fieldLabels = { name: { en: "Your name" } };
    const model = buildRenderModel(value, { showMissing: true });
    expect(model.sections[0].emphasis?.text).toBe(ending);
    expect(model.sections[0].buttons[0].href).toBe("/#offer");
    const offer = model.sections.find((s) => s.id === "offer");
    expect(offer?.eyebrow?.text).toBe("What we do");
    expect(offer?.items[0].price?.text).toBe("From €80");
    const contact = buildRenderModel(value, { showMissing: true, pageId: "contact" }).sections.find((s) => s.form);
    expect(contact?.form?.fields.find((f) => f.name === "name")?.label).toBe("Your name");
  });

  it("shows nothing and invents nothing when they are empty", () => {
    const value = spec();
    addServices(value);
    const model = buildRenderModel(value, { showMissing: true });
    expect(model.sections[0].eyebrow).toBeNull();
    expect(model.sections[0].reassurance).toBeNull();
    expect(model.sections.find((s) => s.id === "offer")?.items[0].price).toBeNull();
    const html = renderPreviewDocument(value, model);
    expect(html).not.toContain('class="sp-price"');
    expect(html).not.toContain('class="sp-reassurance"');
  });

  it("draws the new texts, escaped, in the preview", () => {
    const value = spec();
    addServices(value, { en: "<b>From</b> €80" });
    hero(value).reassurance = { en: "We reply within a day." };
    const html = renderPreviewDocument(value, buildRenderModel(value, { showMissing: true }));
    expect(html).toContain('class="sp-eyebrow"');
    expect(html).toContain("We reply within a day.");
    expect(html).toContain("&lt;b&gt;From&lt;/b&gt; €80");
    expect(html).not.toContain("<b>From</b>");
  });
});
