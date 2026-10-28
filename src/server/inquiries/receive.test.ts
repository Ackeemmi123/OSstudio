import { describe, expect, it, vi } from "vitest";
import { examplePayload, INQUIRY_TEST_NOW } from "@/lib/inquiries/test-helpers";
import type { InquiryConfig } from "../config";

vi.mock("server-only", () => ({}));
const { handleInquiryRequest, InquiryStudioMissingError, inquiryContentHash } = await import("./receive");
const { signInquiry } = await import("./signature");
type InquiryStore = import("./receive").InquiryStore;

const SECRET = "receive-test-secret-that-is-long-enough";
const STUDIO = "11111111-2222-4333-8444-555555555555";
const config: InquiryConfig = {
  supabase: { url: "http://127.0.0.1:54321", anonKey: "anon", serviceRoleKey: "service" },
  signingKeys: new Map([["axivo-test-1", SECRET]]),
  studioId: STUDIO,
  hashKey: "receive-test-hash-key-that-is-long-enough",
};
const now = () => INQUIRY_TEST_NOW;
const seconds = Math.floor(INQUIRY_TEST_NOW.getTime() / 1000);

function signedRequest(payload: unknown = examplePayload(), headers: Record<string, string> = {}, raw?: string) {
  const body = raw ?? JSON.stringify(payload);
  return new Request("http://studio.test/api/inquiries", {
    method: "POST",
    body,
    headers: {
      "content-type": "application/json",
      "studio-key-id": "axivo-test-1",
      "studio-timestamp": String(seconds),
      "studio-signature": signInquiry(body, SECRET, seconds),
      ...headers,
    },
  });
}

function storeAnswering(...answers: Array<Awaited<ReturnType<InquiryStore["receive"]>> | Error>) {
  const receive = vi.fn<InquiryStore["receive"]>();
  for (const answer of answers) {
    if (answer instanceof Error) receive.mockRejectedValueOnce(answer);
    else receive.mockResolvedValueOnce(answer);
  }
  return { receive };
}

const ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const send = (request: Request, store: InquiryStore | null = storeAnswering({ result: "received", id: ID })) =>
  handleInquiryRequest(request, { config: { ok: true, value: config }, store, now });

describe("POST /api/inquiries", () => {
  it("answers 202 with a reference once the store has the inquiry", async () => {
    const store = storeAnswering({ result: "received", id: ID });
    const response = await send(signedRequest(), store);
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ status: "received", reference: `inq_${ID}`, duplicate: false });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("access-control-allow-origin")).toBeNull();

    const call = store.receive.mock.calls[0][0];
    expect(call.studioId).toBe(STUDIO);
    expect(call.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(call.ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(call.ipHash).not.toContain("203.0.113.7");
  });

  it("answers 202 with duplicate: true and the original reference for a stored submission", async () => {
    const response = await send(signedRequest(), storeAnswering({ result: "duplicate", id: ID }));
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ status: "received", reference: `inq_${ID}`, duplicate: true });
  });

  it("hands a retry with a new submittedAt, IP and test flag the same content hash", async () => {
    const store = storeAnswering({ result: "received", id: ID }, { result: "duplicate", id: ID });
    await send(signedRequest(), store);
    await send(signedRequest(examplePayload({ submittedAt: new Date(INQUIRY_TEST_NOW.getTime() + 4000).toISOString(), meta: { ip: "198.51.100.9" }, test: false })), store);
    const [first, retry] = store.receive.mock.calls.map(([input]) => input);
    expect(retry.contentHash).toBe(first.contentHash);
    expect(retry.ipHash).not.toBe(first.ipHash);
  });

  it("hands changed customer answers a different content hash", async () => {
    const store = storeAnswering({ result: "received", id: ID }, { result: "conflict" });
    await send(signedRequest(), store);
    const response = await send(signedRequest(examplePayload({ message: "A different message about the same project." })), store);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "conflict" });
    const [first, changed] = store.receive.mock.calls.map(([input]) => input);
    expect(changed.contentHash).not.toBe(first.contentHash);
  });

  it("answers 429 with Retry-After when rate limited", async () => {
    const response = await send(signedRequest(), storeAnswering({ result: "rate_limited", retryAfter: 1234 }));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("1234");
    expect(await response.json()).toEqual({ error: "rate_limited" });
  });

  it("never answers 202 when the database fails", async () => {
    const response = await send(signedRequest(), storeAnswering(new Error("connection reset")));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "failed" });
  });

  it("answers 503 when the configured studio does not exist", async () => {
    const response = await send(signedRequest(), storeAnswering(new InquiryStudioMissingError()));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "not_configured" });
  });

  it("answers 503 and reads nothing when it is not configured", async () => {
    const store = storeAnswering();
    const response = await handleInquiryRequest(signedRequest(), { config: { ok: false, reason: "missing" }, store, now });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "not_configured" });
    expect(store.receive).not.toHaveBeenCalled();
  });

  it("answers 401 and stores nothing for a missing, wrong, unknown or stale signature", async () => {
    const store = storeAnswering();
    const cases = [
      signedRequest(examplePayload(), { "studio-signature": "" }),
      signedRequest(examplePayload(), { "studio-signature": signInquiry("{}", SECRET, seconds) }),
      signedRequest(examplePayload(), { "studio-key-id": "someone-else" }),
      signedRequest(examplePayload(), { "studio-timestamp": String(seconds - 301) }),
    ];
    for (const request of cases) {
      const response = await send(request, store);
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "unauthorized" });
    }
    expect(store.receive).not.toHaveBeenCalled();
  });

  it("checks the signature before reading the body as JSON", async () => {
    const response = await send(signedRequest(undefined, { "studio-signature": "v1=00" }, "not json"));
    expect(response.status).toBe(401);
  });

  it("answers 400 with field names only, and stores nothing, for an invalid payload", async () => {
    const store = storeAnswering();
    const response = await send(signedRequest(examplePayload({ contact: { name: "Maja", email: "maja-private-address" } })), store);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toEqual({ error: "invalid", fields: ["contact.email"] });
    expect(JSON.stringify(body)).not.toContain("maja-private-address");
    expect(store.receive).not.toHaveBeenCalled();
  });

  it("answers 400 for a body that is not JSON", async () => {
    const response = await send(signedRequest(undefined, {}, "not json"));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid", fields: ["body"] });
  });

  it("answers 400 when Idempotency-Key and submissionId disagree", async () => {
    const response = await send(signedRequest(examplePayload(), { "idempotency-key": "00000000-0000-4000-8000-000000000000" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid", fields: ["Idempotency-Key"] });
    const matching = await send(signedRequest(examplePayload(), { "idempotency-key": "6f1d2c1e-4b7a-4e0c-9a51-2f8d3c7b9e10" }));
    expect(matching.status).toBe(202);
  });

  it("answers 413 for bodies over 16 KB", async () => {
    const big = JSON.stringify(examplePayload({ message: "x".repeat(17 * 1024) }));
    const response = await send(signedRequest(undefined, {}, big));
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "too_large" });
  });

  it("stores no IP hash when the website sent no IP", async () => {
    const store = storeAnswering({ result: "received", id: ID });
    await send(signedRequest(examplePayload({ meta: undefined })), store);
    expect(store.receive.mock.calls[0][0].ipHash).toBeNull();
  });
});

describe("inquiryContentHash", () => {
  it("is the SHA-256 of the canonical customer fields", async () => {
    const { parseInquiryPayload, canonicalCustomerFields } = await import("@/lib/inquiries/contract");
    const { createHash } = await import("node:crypto");
    const parsed = parseInquiryPayload(examplePayload(), INQUIRY_TEST_NOW);
    if (!parsed.ok) throw new Error("invalid");
    expect(inquiryContentHash(parsed.inquiry)).toBe(createHash("sha256").update(canonicalCustomerFields(parsed.inquiry)).digest("hex"));
  });
});
