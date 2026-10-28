import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/** How far Studio-Timestamp may be from the server's clock, in seconds. */
export const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

/** HMAC-SHA256 over `${timestamp}.${body}`, as the handoff contract defines it. */
export function signInquiry(body: string, secret: string, timestamp: number): string {
  return "v1=" + createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export type SignatureCheck = { ok: true; keyId: string } | { ok: false; reason: "missing" | "unknown_key" | "stale" | "mismatch" };

/**
 * Checks the Studio-Key-Id, Studio-Timestamp and Studio-Signature headers
 * against the exact body bytes. Several keys can be active during a rotation.
 * The comparison takes the same time whatever the signature contains.
 */
export function verifyInquirySignature(input: {
  body: string;
  keyId: string | null;
  timestamp: string | null;
  signature: string | null;
  keys: ReadonlyMap<string, string>;
  nowSeconds: number;
}): SignatureCheck {
  const { body, keyId, timestamp, signature, keys, nowSeconds } = input;
  if (!keyId || !timestamp || !signature) return { ok: false, reason: "missing" };
  const secret = keys.get(keyId);
  if (!secret) return { ok: false, reason: "unknown_key" };
  if (!/^\d{1,12}$/.test(timestamp)) return { ok: false, reason: "stale" };
  const seconds = Number(timestamp);
  if (Math.abs(nowSeconds - seconds) > SIGNATURE_TOLERANCE_SECONDS) return { ok: false, reason: "stale" };

  const expected = Buffer.from(signInquiry(body, secret, seconds));
  const received = Buffer.from(signature.trim());
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return { ok: false, reason: "mismatch" };
  return { ok: true, keyId };
}
