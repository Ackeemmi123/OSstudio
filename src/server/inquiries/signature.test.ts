import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { signInquiry, verifyInquirySignature } = await import("./signature");

describe("signInquiry", () => {
  it("matches the handoff test vector", () => {
    expect(signInquiry('{"version":1,"source":"axivo_website"}', "test-secret-do-not-use", 1793178000)).toBe(
      "v1=b2d7bebc2bdd0b74c34d6ab48eee23bf124a8fa12eb714aa087c6c2da8686275",
    );
  });
});

describe("verifyInquirySignature", () => {
  const secret = "a-test-secret-that-is-long-enough-123";
  const keys = new Map([["axivo-test-1", secret]]);
  const body = '{"version":1}';
  const nowSeconds = 1_793_178_000;
  const check = (overrides: Partial<Parameters<typeof verifyInquirySignature>[0]> = {}) =>
    verifyInquirySignature({ body, keyId: "axivo-test-1", timestamp: String(nowSeconds), signature: signInquiry(body, secret, nowSeconds), keys, nowSeconds, ...overrides });

  it("accepts a correct signature", () => expect(check()).toEqual({ ok: true, keyId: "axivo-test-1" }));

  it("refuses missing headers", () => {
    expect(check({ signature: null })).toEqual({ ok: false, reason: "missing" });
    expect(check({ keyId: null })).toEqual({ ok: false, reason: "missing" });
    expect(check({ timestamp: null })).toEqual({ ok: false, reason: "missing" });
  });

  it("refuses an unknown key id", () => expect(check({ keyId: "other" })).toEqual({ ok: false, reason: "unknown_key" }));

  it("accepts up to five minutes of clock difference, and no more", () => {
    const at = (offset: number) => check({ timestamp: String(nowSeconds + offset), signature: signInquiry(body, secret, nowSeconds + offset) });
    expect(at(300).ok).toBe(true);
    expect(at(-300).ok).toBe(true);
    expect(at(301)).toEqual({ ok: false, reason: "stale" });
    expect(at(-301)).toEqual({ ok: false, reason: "stale" });
    expect(check({ timestamp: "1793178000.5" })).toEqual({ ok: false, reason: "stale" });
  });

  it("refuses a signature for another body, secret or timestamp", () => {
    expect(check({ body: '{"version":2}' })).toEqual({ ok: false, reason: "mismatch" });
    expect(check({ signature: signInquiry(body, "another-secret-that-is-long-enough", nowSeconds) })).toEqual({ ok: false, reason: "mismatch" });
    expect(check({ signature: signInquiry(body, secret, nowSeconds - 1) })).toEqual({ ok: false, reason: "mismatch" });
    expect(check({ signature: "v1=short" })).toEqual({ ok: false, reason: "mismatch" });
    expect(check({ signature: signInquiry(body, secret, nowSeconds).replace("v1=", "v2=") })).toEqual({ ok: false, reason: "mismatch" });
  });

  it("accepts any active key during a rotation", () => {
    const rotated = new Map([...keys, ["axivo-test-2", "the-next-secret-that-is-long-enough"]]);
    expect(check({ keys: rotated, keyId: "axivo-test-2", signature: signInquiry(body, "the-next-secret-that-is-long-enough", nowSeconds) }).ok).toBe(true);
    expect(check({ keys: rotated, keyId: "axivo-test-2" })).toEqual({ ok: false, reason: "mismatch" });
  });
});
