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
});
