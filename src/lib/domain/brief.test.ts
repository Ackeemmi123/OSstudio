import { describe, expect, it } from "vitest";
import {
  BRIEF_FIELDS,
  decodeSalesChannels,
  encodeSalesChannels,
  getBriefGaps,
  normalizeSalesChannels,
  questionState,
  stepFields,
  toggleSalesChannel,
  type BriefConditions,
} from "./brief";
import { buildNewClient, setContextField } from "./clients";
import { testDeps } from "./test-helpers";
import { CONTEXT_FIELD_KEYS } from "./types";

const keys = (step: Parameters<typeof stepFields>[0], conditions: BriefConditions) => stepFields(step, conditions).map((d) => d.key);

describe("catalog", () => {
  it("defines every brief value exactly once", () => {
    expect(BRIEF_FIELDS.map((d) => d.key).sort()).toEqual([...CONTEXT_FIELD_KEYS].sort());
  });
});

describe("sales channels", () => {
  it("allows several active channels and stores them as a readable list", () => {
    let channels = toggleSalesChannel([], "etsy");
    channels = toggleSalesChannel(channels, "shopify");
    channels = toggleSalesChannel(channels, "social");
    expect(channels).toEqual(["shopify", "etsy", "social"]);
    expect(encodeSalesChannels(channels)).toBe("Shopify, Etsy, TikTok or Instagram");
    expect(decodeSalesChannels("Shopify, Etsy, TikTok or Instagram").channels).toEqual(channels);
  });

  it("keeps “Not selling online yet” exclusive", () => {
    expect(toggleSalesChannel(["shopify", "amazon"], "none")).toEqual(["none"]);
    expect(toggleSalesChannel(["none"], "etsy")).toEqual(["etsy"]);
    expect(() => normalizeSalesChannels(["none", "shopify"])).toThrow(/can’t be combined/);
  });

  it("deselects a channel and never drops text it does not recognize", () => {
    expect(toggleSalesChannel(["shopify", "etsy"], "shopify")).toEqual(["etsy"]);
    expect(decodeSalesChannels("Shopify, Squarespace")).toEqual({ channels: ["shopify"], unrecognized: ["Squarespace"] });
    expect(decodeSalesChannels(null)).toEqual({ channels: [], unrecognized: [] });
  });
});

describe("conditional questions", () => {
  it("does not ask e-commerce questions for a website project", () => {
    const setup = keys("setup", { projectType: "website", salesChannels: [] });
    expect(setup).toEqual(["platform", "integrations"]);
    expect(setup).not.toContain("salesChannels");
  });

  it("asks where an e-commerce client sells, then follows up on the answer", () => {
    expect(keys("setup", { projectType: "ecommerce", salesChannels: [] })).toEqual(["salesChannels", "integrations"]);
    // Shopify names the platform, so only the store address is asked.
    expect(keys("setup", { projectType: "ecommerce", salesChannels: ["shopify", "amazon"] })).toEqual(["salesChannels", "storeUrl", "integrations"]);
    // A custom store needs the platform question.
    expect(keys("setup", { projectType: "website_ecommerce", salesChannels: ["custom"] })).toContain("platform");
    // Not selling yet: no store address to ask for.
    expect(keys("setup", { projectType: "ecommerce", salesChannels: ["none"] })).toEqual(["salesChannels", "integrations"]);
  });

  it("adapts wording to the project type and earlier answers", () => {
    const challenges = BRIEF_FIELDS.find((d) => d.key === "challenges")!;
    expect(challenges.question({ projectType: "ecommerce", salesChannels: ["none"] })).toMatch(/selling online/);
    const store = BRIEF_FIELDS.find((d) => d.key === "storeUrl")!;
    expect(store.question({ projectType: "ecommerce", salesChannels: ["etsy"] })).toMatch(/Etsy/);
    const design = BRIEF_FIELDS.find((d) => d.key === "designPreferences")!;
    expect(design.question({ projectType: "brand_website", salesChannels: [] })).toMatch(/brand/);
  });
});

describe("question state and gaps", () => {
  const base = buildNewClient({ name: "Solberg", projectType: "ecommerce", budget: "SEK 100,000" }, testDeps()).client;

  it("asks unknown values, verifies unconfirmed ones and skips confirmed ones", () => {
    expect(questionState(base.context.goal, "goal")).toBe("ask");
    expect(questionState(base.context.budget, "budget")).toBe("verify");
    const confirmed = setContextField(base, "budget", { value: "SEK 100,000", confidence: "confirmed" }, testDeps()).client;
    expect(questionState(confirmed.context.budget, "budget")).toBe("known");
    expect(questionState(base.context.deadline, "deadline", { skipped: ["deadline"] })).toBe("skipped");
  });

  it("lists relevant gaps with essentials first, and ignores questions that do not apply", () => {
    const gaps = getBriefGaps(base, { skipped: ["deadline"] });
    expect(gaps.missing.slice(0, 2)).toEqual(["goal", "requirements"]);
    expect(gaps.skipped).toEqual(["deadline"]);
    expect(gaps.unconfirmed).toEqual(["budget"]);
    expect(gaps.missing).not.toContain("storeUrl");
    expect(gaps.missing).not.toContain("platform");
  });
});
