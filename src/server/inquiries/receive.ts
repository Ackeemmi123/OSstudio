import "server-only";
import { createHash, createHmac } from "node:crypto";
import { canonicalCustomerFields, MAX_INQUIRY_BODY_BYTES, parseInquiryPayload, type InquiryPayload } from "@/lib/inquiries/contract";
import type { InquiryConfig } from "../config";
import { verifyInquirySignature } from "./signature";

/** What the database answered for one inquiry (see receive_inquiry() in the inquiries migration). */
export type ReceiveResult =
  | { result: "received" | "duplicate"; id: string }
  | { result: "conflict" }
  | { result: "rate_limited"; retryAfter: number };

export interface InquiryStore {
  /** Stores the inquiry in one transaction, or recognizes a retry. Resolves only after the database has committed. */
  receive(input: { studioId: string; inquiry: InquiryPayload; contentHash: string; ipHash: string | null }): Promise<ReceiveResult>;
}

/** The configured studio does not exist in this database. */
export class InquiryStudioMissingError extends Error {
  constructor() {
    super("The studio configured to receive inquiries does not exist.");
    this.name = "InquiryStudioMissingError";
  }
}

export interface InquiryDeps {
  config: { ok: true; value: InquiryConfig } | { ok: false; reason: string };
  store: InquiryStore | null;
  now: () => Date;
}

/** SHA-256 of the customer-entered fields only. Retries of one submission always match. */
export function inquiryContentHash(inquiry: InquiryPayload): string {
  return createHash("sha256").update(canonicalCustomerFields(inquiry)).digest("hex");
}

/** A keyed hash of the visitor's IP, for the rate limit. The address itself is never stored. */
export function inquiryIpHash(ip: string, hashKey: string): string {
  return createHmac("sha256", hashKey).update(ip).digest("hex");
}

/**
 * Handles POST /api/inquiries. Answers 202 only after the store has
 * committed the inquiry or found the stored original of this submission id;
 * every failure on the way returns another status. Responses never contain
 * submitted data, and logs name statuses and reasons only.
 */
export async function handleInquiryRequest(request: Request, deps: InquiryDeps): Promise<Response> {
  if (!deps.config.ok || !deps.store) {
    console.warn(`[inquiries] Not configured: ${deps.config.ok ? "no store" : deps.config.reason}`);
    return reply(503, { error: "not_configured" });
  }
  const config = deps.config.value;

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_INQUIRY_BODY_BYTES) return reply(413, { error: "too_large" });
  const body = await request.text();
  if (Buffer.byteLength(body, "utf8") > MAX_INQUIRY_BODY_BYTES) return reply(413, { error: "too_large" });

  const now = deps.now();
  const signature = verifyInquirySignature({
    body,
    keyId: request.headers.get("studio-key-id"),
    timestamp: request.headers.get("studio-timestamp"),
    signature: request.headers.get("studio-signature"),
    keys: config.signingKeys,
    nowSeconds: Math.floor(now.getTime() / 1000),
  });
  if (!signature.ok) {
    console.warn(`[inquiries] Refused: signature ${signature.reason}`);
    return reply(401, { error: "unauthorized" });
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(body);
  } catch {
    return reply(400, { error: "invalid", fields: ["body"] });
  }
  const parsed = parseInquiryPayload(decoded, now);
  if (!parsed.ok) {
    console.warn(`[inquiries] Refused: invalid ${parsed.fields.join(", ")}`);
    return reply(400, { error: "invalid", fields: parsed.fields });
  }
  const { inquiry } = parsed;
  const idempotencyKey = request.headers.get("idempotency-key");
  if (idempotencyKey !== null && idempotencyKey.trim() !== inquiry.submissionId) {
    return reply(400, { error: "invalid", fields: ["Idempotency-Key"] });
  }

  let outcome: ReceiveResult;
  try {
    outcome = await deps.store.receive({
      studioId: config.studioId,
      inquiry,
      contentHash: inquiryContentHash(inquiry),
      ipHash: inquiry.meta?.ip ? inquiryIpHash(inquiry.meta.ip, config.hashKey) : null,
    });
  } catch (error) {
    if (error instanceof InquiryStudioMissingError) {
      console.warn("[inquiries] Not configured: INQUIRY_STUDIO_ID names no studio in this database");
      return reply(503, { error: "not_configured" });
    }
    console.error("[inquiries] Could not be stored", error instanceof Error ? error.name : "unknown error");
    return reply(500, { error: "failed" });
  }

  switch (outcome.result) {
    case "received":
    case "duplicate":
      console.info(`[inquiries] ${outcome.result} inq_${outcome.id}`);
      return reply(202, { status: "received", reference: `inq_${outcome.id}`, duplicate: outcome.result === "duplicate" });
    case "conflict":
      console.warn("[inquiries] Refused: submission id reused with different answers");
      return reply(409, { error: "conflict" });
    case "rate_limited":
      return reply(429, { error: "rate_limited" }, { "retry-after": String(outcome.retryAfter) });
  }
}

function reply(status: number, body: object, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store", ...headers } });
}
