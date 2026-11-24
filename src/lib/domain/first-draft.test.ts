import { describe, expect, it } from "vitest";
import { briefClient } from "@/lib/site-spec/test-helpers";
import { approvalBlockers } from "@/lib/site-spec/validate";
import { firstDraftSpec } from "./site-specs";

const project = { projectType: "website" as const };
const AT = "2026-11-24T10:00:00.000Z";

describe("a first draft with the trade and design chosen at the start", () => {
  it("takes the company design in the trade's first starting style, chosen by the person", () => {
    const spec = firstDraftSpec(briefClient(), project, { template: "services", locales: ["sv"], industry: "cafe_restaurant", design: "services" }, "Alexander", AT);
    expect(spec.strategy.industry).toBe("cafe_restaurant");
    expect(spec.brand.designSystem).toBe("services@0.1");
    expect(spec.brand.servicesStyle?.direction).toBe("cafe");
    expect(spec.brand.source).toEqual({ kind: "person", by: "Alexander", at: AT });
    expect(approvalBlockers(spec, briefClient()).map((b) => b.message)).not.toContain("Choose the brand colours and fonts (the starting values are placeholders).");
  });

  it("leaves the brand to choose when no design was picked", () => {
    const spec = firstDraftSpec(briefClient(), project, { template: "services", locales: ["sv"] }, "Alexander", AT);
    expect(spec.brand.source).toBeUndefined();
    expect(spec.brand.designSystem).toBeUndefined();
  });
});
