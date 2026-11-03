import { describe, expect, it } from "vitest";
import { qualityWarnings } from "./checks";
import { approvalBlockers } from "./validate";
import { briefClient, completeSpec } from "./test-helpers";
import { templateSpec } from "./templates";
import type { SiteSpec, SiteSpecSection } from "./schema";

const client = briefClient();
const spec = () => structuredClone(completeSpec(client));
const warnings = (value: SiteSpec) => qualityWarnings(value).map((w) => w.message);
const hero = (value: SiteSpec) => value.pages[0].sections[0] as Extract<SiteSpecSection, { kind: "hero" }>;
const text = (id: string, body: string, heading = "How we bake"): SiteSpecSection => ({ id, kind: "text", variant: "single_column", heading: { en: heading }, body: { en: body } });

describe("claims that need the client's confirmation", () => {
  it.each([
    ["98% of clients stay with us", "a percentage"],
    ["Trusted by 500+ customers", "a number of customers"],
    ["Our award-winning team", "an award"],
    ["We are certified bakers", "a certification"],
    ["Money-back guarantee", "a guarantee"],
    ["The best bakery in Kallio", "a ranking"],
    ["Prisbelönt bageri", "an award"],
    ["Sertifioitu leipomo", "a certification"],
  ])("asks about %s", (body, what) => {
    const value = spec();
    value.pages[0].sections.push(text("claim", body));
    expect(warnings(value)).toContainEqual(expect.stringContaining(`makes a claim (${what}`));
  });

  it("leaves plain descriptions alone", () => {
    const value = spec();
    value.pages[0].sections.push(text("plain", "Cakes baked fresh to order in Kallio, by a small team who answer the same day."));
    expect(warnings(value).filter((w) => w.includes("makes a claim"))).toEqual([]);
  });

  it("ignores a template's instructions, which already block approval", () => {
    const value = spec();
    value.pages[0].sections.push(text("todo", "[Say how many customers, if the client can show it: 98%]"));
    expect(warnings(value).filter((w) => w.includes("makes a claim"))).toEqual([]);
  });

  it("notices invented pressure", () => {
    const value = spec();
    value.pages[0].sections.push(text("rush", "Hurry, only 3 left!"));
    expect(warnings(value)).toContainEqual(expect.stringContaining("puts pressure on visitors"));
  });
});

describe("the visitor's next step", () => {
  it("notices a generic heading, in any language", () => {
    const value = spec();
    value.pages[0].sections.push(text("a", "Words.", "Our services"), text("b", "Ord.", "Våra tjänster"));
    const found = warnings(value);
    expect(found).toContainEqual(expect.stringContaining('"Our services" could be on any website'));
    expect(found).toContainEqual(expect.stringContaining('"Våra tjänster" could be on any website'));
  });

  it("notices a hero with no button, and a very long heading", () => {
    const value = spec();
    hero(value).buttons = [];
    hero(value).heading.en = "A very long heading ".repeat(6).trim();
    const found = warnings(value);
    expect(found).toContainEqual(expect.stringContaining("the hero has no button"));
    expect(found).toContainEqual(expect.stringContaining("hero's heading is long"));
  });

  it("notices a home page that doesn't open with a hero", () => {
    const value = spec();
    value.pages[0].sections.unshift(text("first", "Words."));
    expect(warnings(value)).toContainEqual(expect.stringContaining("doesn't open with a hero"));
  });

  it("notices a quote with nobody named", () => {
    const value = spec();
    value.pages[0].sections.push({ id: "q", kind: "testimonials", variant: "quotes", heading: { en: "Words from the shop" }, items: [{ id: "one", quote: { en: "Lovely cakes." }, author: "" }] });
    expect(warnings(value)).toContainEqual(expect.stringContaining("a quote doesn't say who said it"));
  });

  it("notices three similar sections in a row, once", () => {
    const value = spec();
    value.pages[0].sections.push(text("a", "One."), text("b", "Two."), text("c", "Three."), text("d", "Four."));
    expect(warnings(value).filter((w) => w.includes("in a row"))).toHaveLength(1);
  });

  it("asks what happens after sending a form, until it says", () => {
    const value = spec();
    expect(warnings(value)).toContainEqual(expect.stringContaining("The contact form doesn't say what happens after sending"));
    value.forms[0].replyNote = { en: "We reply within a day." };
    expect(warnings(value).filter((w) => w.includes("after sending"))).toEqual([]);
  });
});

describe("a shop's terms", () => {
  const shop = () => templateSpec(client, { projectType: "website" } as never, "shop", ["en"]).spec;

  it("asks for delivery, returns and payment on a shop", () => {
    const found = warnings(shop());
    for (const what of ["delivery", "returns", "payment"]) expect(found).toContainEqual(expect.stringContaining(`doesn't mention ${what}`));
  });

  it("stops asking once the shop says them", () => {
    const value = shop();
    value.pages[0].sections.push(text("terms", "Delivery in three days. Returns within 14 days. Payment by card.", "Before you buy"));
    expect(warnings(value).filter((w) => w.includes("doesn't mention"))).toEqual([]);
  });

  it("doesn't ask this of a website with no shop", () => {
    expect(warnings(spec()).filter((w) => w.includes("doesn't mention"))).toEqual([]);
  });
});

describe("these checks only ask", () => {
  it("never stops an approval", () => {
    const value = spec();
    value.pages[0].sections.push(text("claim", "98% of clients. Hurry, only 3 left!", "Our services"));
    expect(approvalBlockers(value, client).map((b) => b.message)).toEqual([]);
  });
});
