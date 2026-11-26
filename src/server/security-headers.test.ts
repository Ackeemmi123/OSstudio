import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

/**
 * The baseline headers every page and API route sends. A change here should
 * be deliberate: a stricter Content-Security-Policy is proposed in
 * docs/production.md, and nothing may be weakened by accident.
 */
describe("security headers", () => {
  it("apply to every path and keep the baseline protections", async () => {
    const rules = await nextConfig.headers!();
    const all = rules.find((rule) => rule.source === "/:path*");
    expect(all).toBeDefined();
    expect(Object.fromEntries(all!.headers.map((h) => [h.key, h.value]))).toEqual({
      "Content-Security-Policy": "frame-ancestors 'none'",
      "X-Frame-Options": "DENY",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    });
    expect(nextConfig.poweredByHeader).toBe(false);
  });

  it("let a client's draft be shown only inside Studio OS, after the baseline", async () => {
    const rules = await nextConfig.headers!();
    const drafts = rules.findIndex((rule) => rule.source === "/s/:path*");
    expect(drafts).toBeGreaterThan(rules.findIndex((rule) => rule.source === "/:path*"));
    expect(Object.fromEntries(rules[drafts].headers.map((h) => [h.key, h.value]))).toEqual({
      "Content-Security-Policy": "frame-ancestors 'self'",
      "X-Frame-Options": "SAMEORIGIN",
    });
  });
});
