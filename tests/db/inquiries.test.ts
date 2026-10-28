/**
 * Website inquiries end to end against a local Supabase stack: the real
 * POST /api/inquiries handler, signed requests, the receive_inquiry()
 * function, and who can read what.
 *
 * Every value here is invented test data; the signing secret and hash key are
 * test constants that exist only in this file.
 */
import { randomUUID } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { examplePayload } from "@/lib/inquiries/test-helpers";
import { addMember, admin, anonClient, asDatabaseOwner, createStudio, createUser, type TestUser } from "./helpers";

vi.mock("server-only", () => ({}));

const SECRET = "db-test-inquiry-secret-not-a-real-one-0123";
const { signInquiry } = await import("@/server/inquiries/signature");
const { POST } = await import("@/app/api/inquiries/route");

let owner: TestUser;
let viewer: TestUser;
let outsider: TestUser;
let studio: string;

const savedEnv = { ...process.env };

beforeAll(async () => {
  owner = await createUser("inquiry-owner");
  viewer = await createUser("inquiry-viewer");
  outsider = await createUser("inquiry-outsider");
  studio = await createStudio(owner, "Axivo (test)");
  await addMember(owner, studio, viewer, "viewer");
  await createStudio(outsider, "Someone else's studio");
  configure(studio);
});

afterEach(() => {
  process.env.SUPABASE_URL = savedEnv.SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = savedEnv.NEXT_PUBLIC_SUPABASE_URL;
  configure(studio);
});

function configure(studioId: string) {
  process.env.INQUIRY_SIGNING_KEYS = `axivo-test-1:${SECRET}`;
  process.env.INQUIRY_STUDIO_ID = studioId;
  process.env.INQUIRY_HASH_KEY = "db-test-inquiry-hash-key-not-a-real-one-0123";
}

/** A fresh, valid submission: its own submission id, email and IP unless given. */
function submission(overrides: Record<string, unknown> = {}) {
  const tag = randomUUID().slice(0, 8);
  return examplePayload(
    {
      submissionId: randomUUID(),
      contact: { name: "Test Person", email: `inquiry-${tag}@example.test`, company: "Test company (test)" },
      meta: { ip: `198.51.100.${Math.floor(Math.random() * 250) + 1}-${tag}` },
      ...overrides,
    },
    new Date(),
  );
}

async function send(payload: unknown, { timestamp = Math.floor(Date.now() / 1000), secret = SECRET } = {}) {
  const body = JSON.stringify(payload);
  const response = await POST(
    new Request("http://studio.test/api/inquiries", {
      method: "POST",
      body,
      headers: {
        "content-type": "application/json",
        "studio-key-id": "axivo-test-1",
        "studio-timestamp": String(timestamp),
        "studio-signature": signInquiry(body, secret, timestamp),
      },
    }),
  );
  return { status: response.status, body: await response.json(), retryAfter: response.headers.get("retry-after") };
}

async function storedRows(submissionId: string) {
  const { data, error } = await owner.client.from("inquiries").select("*").eq("submission_id", submissionId);
  if (error) throw error;
  return data;
}

describe("receiving an inquiry", () => {
  it("answers 202 only once the inquiry is stored, and members can read it", async () => {
    const payload = submission();
    const result = await send(payload);
    expect(result.status).toBe(202);
    expect(result.body).toMatchObject({ status: "received", duplicate: false });

    const rows = await storedRows(payload.submissionId as string);
    expect(rows).toHaveLength(1);
    expect(`inq_${rows[0].id}`).toBe(result.body.reference);
    expect(rows[0]).toMatchObject({
      studio_id: studio, status: "new", is_test: true, locale: "sv", service: "websites", project_type: "website",
      budget_range: "custom", budget_amount_eur: 4500, timeline: "within_3_months", desired_date: payload.desiredDate,
      contact_name: "Test Person", company: "Test company (test)",
    });
    // The IP address is never stored with the inquiry.
    expect(JSON.stringify(rows[0])).not.toContain("198.51.100.");
  });

  it("treats a retry with a new submittedAt, IP, test flag and signature time as the same submission", async () => {
    const payload = submission();
    const first = await send(payload);
    const retry = await send(
      { ...payload, submittedAt: new Date(Date.now() + 2000).toISOString(), meta: { ip: "203.0.113.200" }, test: false },
      { timestamp: Math.floor(Date.now() / 1000) + 3 },
    );
    expect(retry.status).toBe(202);
    expect(retry.body).toEqual({ status: "received", reference: first.body.reference, duplicate: true });
    const rows = await storedRows(payload.submissionId as string);
    expect(rows).toHaveLength(1);
    expect(new Date(rows[0].submitted_at).getTime()).toBe(new Date(payload.submittedAt as string).getTime());
    expect(rows[0].is_test).toBe(true);
  });

  it("answers 409 and changes nothing when the same submission id carries different answers", async () => {
    const payload = submission();
    await send(payload);
    const changed = await send({ ...payload, message: "A completely different message for the same id." });
    expect(changed.status).toBe(409);
    expect(changed.body).toEqual({ error: "conflict" });
    const rows = await storedRows(payload.submissionId as string);
    expect(rows).toHaveLength(1);
    expect(rows[0].message).toBe(payload.message);
  });

  it("stores one row when the same submission arrives many times at once", async () => {
    const payload = submission();
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) => send({ ...payload, submittedAt: new Date(Date.now() + i).toISOString() })),
    );
    expect(results.map((r) => r.status)).toEqual(Array(8).fill(202));
    expect(new Set(results.map((r) => r.body.reference)).size).toBe(1);
    expect(results.filter((r) => r.body.duplicate === false)).toHaveLength(1);
    expect(await storedRows(payload.submissionId as string)).toHaveLength(1);
  });

  it("stores the first of concurrent conflicting submissions and refuses the others", async () => {
    const payload = submission();
    const results = await Promise.all(
      Array.from({ length: 4 }, (_, i) => send({ ...payload, message: `Concurrent message number ${i} for one id.` })),
    );
    expect(results.filter((r) => r.status === 202)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(3);
    const rows = await storedRows(payload.submissionId as string);
    expect(rows).toHaveLength(1);
    const winner = results.findIndex((r) => r.status === 202);
    expect(rows[0].message).toBe(`Concurrent message number ${winner} for one id.`);
  });

  it("refuses unsigned, badly signed and stale requests without storing anything", async () => {
    const payload = submission();
    expect((await send(payload, { secret: "a-different-secret-of-sufficient-length" })).status).toBe(401);
    expect((await send(payload, { timestamp: Math.floor(Date.now() / 1000) - 600 })).status).toBe(401);
    const unsigned = await POST(new Request("http://studio.test/api/inquiries", { method: "POST", body: JSON.stringify(payload) }));
    expect(unsigned.status).toBe(401);
    expect(await storedRows(payload.submissionId as string)).toHaveLength(0);
  });

  it("refuses an invalid payload without storing anything", async () => {
    const payload = submission({ budget: "3k_5k" });
    const result = await send(payload);
    expect(result).toMatchObject({ status: 400, body: { error: "invalid", fields: ["budgetAmount"] } });
    expect(await storedRows(payload.submissionId as string)).toHaveLength(0);
  });
});

describe("rate limits", () => {
  it("accepts 5 inquiries per IP per hour, then answers 429 with Retry-After", async () => {
    const ip = `192.0.2.${randomUUID().slice(0, 6)}`;
    const results = [];
    for (let i = 0; i < 6; i++) results.push(await send(submission({ meta: { ip } })));
    expect(results.map((r) => r.status)).toEqual([202, 202, 202, 202, 202, 429]);
    expect(results[5].body).toEqual({ error: "rate_limited" });
    expect(Number(results[5].retryAfter)).toBeGreaterThan(3500);
  });

  it("still confirms a retry of a stored inquiry once the limit is reached", async () => {
    const ip = `192.0.2.${randomUUID().slice(0, 6)}`;
    const first = submission({ meta: { ip } });
    await send(first);
    for (let i = 0; i < 4; i++) await send(submission({ meta: { ip } }));
    expect((await send(submission({ meta: { ip } }))).status).toBe(429);
    const retry = await send(first);
    expect(retry).toMatchObject({ status: 202, body: { duplicate: true } });
  });

  it("accepts 3 inquiries per email address per day", async () => {
    const email = `limit-${randomUUID().slice(0, 8)}@example.test`;
    const statuses = [];
    for (let i = 0; i < 4; i++) {
      statuses.push((await send(submission({ contact: { name: "Same Person", email: i % 2 ? email.toUpperCase() : email } }))).status);
    }
    expect(statuses).toEqual([202, 202, 202, 429]);
  });

  it("accepts 200 inquiries per studio per day", async () => {
    const busy = await createStudio(owner, "Busy studio (test)");
    await asDatabaseOwner((db) =>
      db.query(
        `insert into public.inquiries (studio_id, source, submission_id, content_hash, locale, contact_name, email, service, message, submitted_at)
           select $1, 'axivo_website', gen_random_uuid(), repeat('a', 64), 'en', 'Bulk test', 'bulk' || n || '@example.test', 'other',
                  'A bulk test inquiry message.', now()
             from generate_series(1, 200) n`,
        [busy],
      ),
    );
    configure(busy);
    expect((await send(submission())).status).toBe(429);
  });
});

describe("database failures", () => {
  it("answers 503 and stores nothing when the configured studio does not exist", async () => {
    configure(randomUUID());
    const payload = submission();
    expect(await send(payload)).toMatchObject({ status: 503, body: { error: "not_configured" } });
    configure(studio);
    expect(await storedRows(payload.submissionId as string)).toHaveLength(0);
  });

  it("answers 500, never 202, when the database cannot be reached", async () => {
    process.env.SUPABASE_URL = "http://127.0.0.1:9";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:9";
    const payload = submission();
    expect(await send(payload)).toMatchObject({ status: 500, body: { error: "failed" } });
    process.env.SUPABASE_URL = savedEnv.SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = savedEnv.NEXT_PUBLIC_SUPABASE_URL;
    expect(await storedRows(payload.submissionId as string)).toHaveLength(0);
  });

  it("stores nothing when the database refuses the row", async () => {
    const payload = submission();
    const { error } = await admin.rpc("receive_inquiry", {
      p_studio: studio, p_inquiry: { ...payload, locale: "de" }, p_content_hash: "b".repeat(64), p_ip_hash: null,
    });
    expect(error?.code).toBe("23514");
    expect(await storedRows(payload.submissionId as string)).toHaveLength(0);
  });
});

describe("who can see and change inquiries", () => {
  let submissionId: string;

  beforeAll(async () => {
    const payload = submission();
    submissionId = payload.submissionId as string;
    expect((await send(payload)).status).toBe(202);
  });

  it("signed-out visitors can neither read, write nor receive inquiries", async () => {
    const anon = anonClient();
    expect((await anon.from("inquiries").select("id").limit(1)).error?.code).toBe("42501");
    expect((await anon.from("inquiry_rate_limits").select("id").limit(1)).error?.code).toBe("42501");
    const insert = await anon.from("inquiries").insert({ studio_id: studio, source: "axivo_website", submission_id: randomUUID() });
    expect(insert.error?.code).toBe("42501");
    const rpc = await anon.rpc("receive_inquiry", { p_studio: studio, p_inquiry: submission(), p_content_hash: "c".repeat(64), p_ip_hash: null });
    expect(rpc.error?.code).toBe("42501");
  });

  it("members and viewers read their studio's inquiries; outsiders see none", async () => {
    expect((await owner.client.from("inquiries").select("id").eq("submission_id", submissionId)).data).toHaveLength(1);
    expect((await viewer.client.from("inquiries").select("id").eq("submission_id", submissionId)).data).toHaveLength(1);
    const outside = await outsider.client.from("inquiries").select("id").eq("studio_id", studio);
    expect(outside.error).toBeNull();
    expect(outside.data).toEqual([]);
  });

  it("nobody signed in can insert, edit, delete or receive inquiries", async () => {
    const insert = await owner.client.from("inquiries").insert({ studio_id: studio, source: "axivo_website", submission_id: randomUUID() });
    expect(insert.error?.code).toBe("42501");
    const update = await owner.client.from("inquiries").update({ message: "Edited by staff, which must not happen." }).eq("submission_id", submissionId);
    expect(update.error?.code).toBe("42501");
    const remove = await owner.client.from("inquiries").delete().eq("submission_id", submissionId);
    expect(remove.error?.code).toBe("42501");
    expect((await owner.client.from("inquiry_rate_limits").select("id").limit(1)).error?.code).toBe("42501");
    const rpc = await owner.client.rpc("receive_inquiry", { p_studio: studio, p_inquiry: submission(), p_content_hash: "c".repeat(64), p_ip_hash: null });
    expect(rpc.error?.code).toBe("42501");
  });

  it("the service role can only call receive_inquiry, not read or write the tables", async () => {
    expect((await admin.from("inquiries").select("id").limit(1)).error?.code).toBe("42501");
    expect((await admin.from("inquiry_rate_limits").select("id").limit(1)).error?.code).toBe("42501");
    const privileges = await asDatabaseOwner(async (db) =>
      (
        await db.query<{ role: string; allowed: boolean }>(
          `select r as role, has_function_privilege(r, 'public.receive_inquiry(uuid, jsonb, text, text)', 'execute') as allowed
             from unnest(array['anon', 'authenticated', 'service_role']) r`,
        )
      ).rows,
    );
    expect(privileges).toEqual([
      { role: "anon", allowed: false },
      { role: "authenticated", allowed: false },
      { role: "service_role", allowed: true },
    ]);
  });
});
