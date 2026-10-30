import { describe, expect, it } from "vitest";
import { briefClient, completeSpec } from "@/lib/site-spec/test-helpers";
import { headingSizes, readableOn, themeCss, themeVariables } from "./theme";

describe("theme", () => {
  it("picks the readable text colour on the primary colour", () => {
    expect(readableOn("#1F4E79")).toBe("#FFFFFF");
    expect(readableOn("#F2B544")).toBe("#111111");
  });

  it("grows heading sizes with the type scale", () => {
    const small = headingSizes("1.125");
    const large = headingSizes("1.333");
    expect(small.h1).toBeGreaterThan(small.h2);
    expect(small.h2).toBeGreaterThan(small.h3);
    expect(large.h1).toBeGreaterThan(small.h1);
  });

  it("names fonts with system fallbacks and falls back to the primary colour for optional ones", () => {
    const brand = completeSpec(briefClient()).brand;
    const vars = themeVariables(brand);
    expect(vars["--sp-font-heading"]).toMatch(/^"Inter", system-ui/);
    expect(vars["--sp-accent"]).toBe(brand.colors.primary);
    expect(themeCss(brand)).toMatch(/^:root\{--sp-primary:#1F4E79;/);
    expect(themeCss(brand)).not.toMatch(/[<>]/);
  });
});
