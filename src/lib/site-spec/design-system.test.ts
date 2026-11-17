import { describe, expect, it } from "vitest";
import { DESIGN_SYSTEMS } from "./catalog";
import type { SiteSpec } from "./schema";
import { briefClient, completeSpec } from "./test-helpers";
import { approvalBlockers, parseSiteSpec } from "./validate";

const client = briefClient();

function spec(): SiteSpec {
  return structuredClone(completeSpec(client));
}

describe("the design a spec is built with", () => {
  it("is optional, so every existing spec stays valid", () => {
    const value = spec();
    expect(value.brand.designSystem).toBeUndefined();
    expect(parseSiteSpec(value).ok).toBe(true);
  });

  it("accepts each design system Studio OS knows", () => {
    for (const system of DESIGN_SYSTEMS) {
      const value = spec();
      value.brand.designSystem = system;
      expect(parseSiteSpec(value).ok).toBe(true);
    }
  });

  it("refuses a design system it does not know", () => {
    const value = spec() as unknown as { brand: Record<string, unknown> };
    value.brand.designSystem = "services@9";
    expect(parseSiteSpec(value).ok).toBe(false);
  });

  it("does not change what blocks approval", () => {
    const plain = spec();
    const chosen = spec();
    chosen.brand.designSystem = "association@0.1";
    expect(approvalBlockers(chosen, client)).toEqual(approvalBlockers(plain, client));
  });
});
