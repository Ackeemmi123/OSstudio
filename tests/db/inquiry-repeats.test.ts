/**
 * Repeat submissions against a local Supabase stack: a second inquiry from
 * the same address while the first is open is linked to it, decided with it,
 * and kept or anonymised with it.
 *
 * Every value here is invented test data.
 */
import { createHash, randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import type { SupabaseRepository } from "@/lib/data/supabase-repository";
import { getOpenInquiries } from "@/lib/domain/inquiries";
import { examplePayload } from "@/lib/inquiries/test-helpers";
import { addMember, admin, asDatabaseOwner, createStudio, createUser, repositoryFor, type TestUser } from "./helpers";

let owner: TestUser;
let member: TestUser;
let studio: string;

beforeAll(async () => {
  owner = await createUser("repeat-owner");
  member = await createUser("repeat-member");
  studio = await createStudio(owner, "Axivo (repeat test)");
  await addMember(owner, studio, member, "member", "Sam Member");
});

/** Stores one test inquiry the way /api/inquiries does, and returns its id. */
async function receive(email: string, message: string, overrides: Record<string, unknown> = {}): Promise<string> {
  const payload = examplePayload(
    { submissionId: randomUUID(), contact: { name: "Maja Lind", email, company: "Lumen Yoga (test)", website: "lumen.example" }, message, ...overrides },
    new Date(),
  );
  const hash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  const { data, error } = await admin.rpc("receive_inquiry", { p_studio: studio, p_inquiry: payload, p_content_hash: hash, p_ip_hash: null });
  if (error) throw error;
  return (data as { id: string }).id;
}

function address() {
  return `repeat-${randomUUID().slice(0, 8)}@example.test`;
}

async function loaded(user: TestUser): Promise<SupabaseRepository> {
  const repository = repositoryFor(user, studio);
  await repository.load();
  return repository;
}

async function rows(ids: string[]) {
  const { data, error } = await owner.client.from("inquiries").select("id, status, repeat_of, client_id, decided_by, decided_at").in("id", ids);
  if (error) throw error;
  return new Map(data.map((row) => [row.id as string, row]));
}

describe("linking repeats", () => {
  it("links a second and third inquiry from the same address to the first open one, whatever the case of the email", async () => {
    const email = address();
    const first = await receive(email, "Vi vill ha en ny webbplats med bokning av klasser.");
    const second = await receive(email.toUpperCase(), "Glömde nämna: vi behöver också en webbutik för presentkort.");
    const third = await receive(email, "Och ett nyhetsbrev, om det går att lägga till senare.");
    const stored = await rows([first, second, third]);
    expect(stored.get(first)?.repeat_of).toBeNull();
    expect(stored.get(second)?.repeat_of).toBe(first);
    expect(stored.get(third)?.repeat_of).toBe(first);

    const snapshot = await (await loaded(member)).load();
    expect(getOpenInquiries(snapshot).map((i) => i.id)).toContain(first);
    expect(getOpenInquiries(snapshot).map((i) => i.id)).not.toContain(second);
  });

  it("does not link to a decided inquiry, another address, or one older than 30 days", async () => {
    const email = address();
    const decided = await receive(email, "Den första förfrågan, som vi avvisar direkt.");
    await (await loaded(member)).decideInquiry(decided, { action: "reject" });
    const afterDecision = await receive(email, "En ny förfrågan efter att den första avvisades.");
    const other = await receive(address(), "En annan avsändare med en egen förfrågan här.");
    expect((await rows([afterDecision])).get(afterDecision)?.repeat_of).toBeNull();
    expect((await rows([other])).get(other)?.repeat_of).toBeNull();

    // An open inquiry received 31 days ago is too old to group with.
    const old = address();
    const oldId = await asDatabaseOwner(async (db) => {
      const { rows: inserted } = await db.query<{ id: string }>(
        `insert into public.inquiries (studio_id, source, submission_id, content_hash, is_test, locale, contact_name, email, service, message, submitted_at, received_at)
         values ($1, 'axivo_website', gen_random_uuid(), repeat('0', 64), true, 'en', 'Old Sender', $2, 'other',
                 'An open inquiry from more than a month ago.', now() - interval '31 days', now() - interval '31 days') returning id`,
        [studio, old],
      );
      return inserted[0].id;
    });
    const fresh = await receive(old, "A new inquiry long after the first one.");
    expect((await rows([fresh])).get(fresh)?.repeat_of).toBeNull();
    expect(oldId).toBeTruthy();
  });

  it("nobody can change which inquiry a repeat belongs to", async () => {
    const email = address();
    const first = await receive(email, "Den första förfrågan från den här adressen.");
    const second = await receive(email, "Den andra förfrågan från samma adress.");
    await asDatabaseOwner(async (db) => {
      await expect(
        db.query(
          `begin; select set_config('studio_os.deciding_inquiry', 'on', true);
           update public.inquiries set repeat_of = null where id = '${second}'; commit;`,
        ),
      ).rejects.toThrow(/cannot be changed/);
      await db.query("rollback");
    });
    expect((await rows([second])).get(second)?.repeat_of).toBe(first);
  });
});

describe("deciding with repeats", () => {
  it("approving the first creates one client with every message, and merges the repeats in the reviewer's name", async () => {
    const email = address();
    const first = await receive(email, "Vi vill ha en ny webbplats med bokning av klasser.");
    const second = await receive(email, "Glömde nämna: vi behöver också en webbutik för presentkort.");
    const repository = await loaded(member);

    const decided = await repository.decideInquiry(first, { action: "approve", name: "Lumen Yoga" });
    const stored = await rows([first, second]);
    expect(stored.get(second)).toMatchObject({ status: "merged", client_id: decided.clientId, decided_by: { kind: "human", userId: member.id } });
    expect(stored.get(second)?.decided_at).not.toBeNull();

    const snapshot = await repository.load();
    expect(snapshot.sources.filter((s) => s.clientId === decided.clientId).map((s) => s.content)).toEqual(
      expect.arrayContaining([
        "Language: Swedish\n\nVi vill ha en ny webbplats med bokning av klasser.",
        "Language: Swedish\n\nGlömde nämna: vi behöver också en webbutik för presentkort.",
      ]),
    );
    expect(snapshot.clients.filter((c) => c.name === "Lumen Yoga" && c.email === email)).toHaveLength(1);
  });

  it("rejecting the first merges the repeats without a client; adding to a client adds every message", async () => {
    const email = address();
    const first = await receive(email, "En förfrågan som teamet kommer att avvisa.");
    const second = await receive(email, "Samma avsändare skriver igen om samma sak.");
    await (await loaded(owner)).decideInquiry(first, { action: "reject", reason: "Outside what we do (test)." });
    expect((await rows([second])).get(second)).toMatchObject({ status: "merged", client_id: null });

    const linkEmail = address();
    const repository = await loaded(member);
    const existing = await repository.createClient({ name: "Returning Repeat (test)", email: linkEmail });
    const a = await receive(linkEmail, "Vi vill bygga om vår befintliga webbplats i vår.");
    const b = await receive(linkEmail, "Vi har också en budget för sökmotoroptimering.");
    await repository.load();
    await repository.decideInquiry(a, { action: "link", clientId: existing.id });
    expect((await rows([b])).get(b)).toMatchObject({ status: "merged", client_id: existing.id });
    const snapshot = await repository.load();
    expect(snapshot.sources.filter((s) => s.clientId === existing.id)).toHaveLength(2);
  });

  it("a repeat cannot be decided on its own while its first inquiry is open, in the app or in the database", async () => {
    const email = address();
    const first = await receive(email, "Den första förfrågan, fortfarande öppen.");
    const second = await receive(email, "Den andra förfrågan, som hör till den första.");
    await expect((await loaded(member)).decideInquiry(second, { action: "spam" })).rejects.toMatchObject({ code: "conflict" });

    const direct = await member.client.rpc("decide_inquiry", {
      p_studio: studio, p_inquiry: second, p_decision: { status: "spam", decided_by: { kind: "human", name: "Sam Member", userId: member.id } }, p_changes: null, p_onboarding: null,
    });
    expect(direct.error?.code).toBe("SO409");
    // Not even as merged, which only deciding the first inquiry may set.
    const merged = await member.client.rpc("decide_inquiry", {
      p_studio: studio, p_inquiry: first, p_decision: { status: "merged", decided_by: { kind: "human", name: "Sam Member", userId: member.id } }, p_changes: null, p_onboarding: null,
    });
    expect(merged.error?.code).toBe("22023");
    expect((await rows([first, second])).get(second)?.status).toBe("new");
  });

  it("deciding the first inquiry and its repeat at the same moment gives one decision, without a deadlock", async () => {
    const email = address();
    const first = await receive(email, "Den första av två förfrågningar.");
    const second = await receive(email, "Den andra av två förfrågningar.");
    const decideRepeat = async () => {
      // As a screen that never saw the first inquiry would send it.
      const result = await member.client.rpc("decide_inquiry", {
        p_studio: studio, p_inquiry: second, p_decision: { status: "spam", decided_by: { kind: "human", name: "Sam Member", userId: member.id } }, p_changes: null, p_onboarding: null,
      });
      if (result.error) throw result.error;
    };
    const results = await Promise.allSettled([(await loaded(owner)).decideInquiry(first, { action: "spam" }), decideRepeat()]);
    expect(results[0].status).toBe("fulfilled");
    // Either the first was still open, or the repeat was already merged with it.
    expect(results[1]).toMatchObject({ status: "rejected", reason: { code: "SO409" } });
    const stored = await rows([first, second]);
    expect(stored.get(first)?.status).toBe("spam");
    expect(stored.get(second)?.status).toBe("merged");
  });
});

describe("retention of repeats", () => {
  it("anonymises a repeat merged into a rejected inquiry after 12 months, and keeps one merged into an approved inquiry", async () => {
    const rejectedEmail = address();
    const rejectedFirst = await receive(rejectedEmail, "En förfrågan som avvisas och sedan glöms.");
    const rejectedRepeat = await receive(rejectedEmail, "En upprepning som slås ihop med den avvisade.");
    await (await loaded(member)).decideInquiry(rejectedFirst, { action: "reject" });

    const approvedEmail = address();
    const approvedFirst = await receive(approvedEmail, "En förfrågan som blir en kund hos oss.");
    const approvedRepeat = await receive(approvedEmail, "En upprepning som slås ihop med kunden.");
    await (await loaded(member)).decideInquiry(approvedFirst, { action: "approve", name: "Kept Client (test)" });

    const ends = await asDatabaseOwner(async (db) =>
      (
        await db.query<{ id: string; ends: Date | null }>(
          `select id, private.inquiry_retention_ends(status, client_id, received_at, decided_at) as ends from public.inquiries where id = any($1)`,
          [[rejectedRepeat, approvedRepeat]],
        )
      ).rows,
    );
    expect(ends.find((r) => r.id === rejectedRepeat)?.ends).not.toBeNull();
    expect(ends.find((r) => r.id === approvedRepeat)?.ends).toBeNull();

    await asDatabaseOwner(async (db) => {
      await db.query("select private.anonymise_inquiry($1, true)", [rejectedRepeat]);
      await expect(db.query("select private.anonymise_inquiry($1, true)", [approvedRepeat])).rejects.toThrow(/did not become clients/);
      const { rows: after } = await db.query(
        "select id, status, email, message, anonymised_at from public.inquiries where id = any($1) order by received_at",
        [[rejectedRepeat, approvedRepeat]],
      );
      expect(after[0]).toMatchObject({ id: rejectedRepeat, status: "merged", email: null, message: null });
      expect(after[0].anonymised_at).not.toBeNull();
      expect(after[1]).toMatchObject({ id: approvedRepeat, status: "merged", email: approvedEmail, anonymised_at: null });
    });
  });
});

describe("after a decision", () => {
  it("a repeat still open after its first inquiry is gone (anonymised) is listed and decided on its own", async () => {
    const email = address();
    const first = await receive(email, "Den första förfrågan, som sedan raderas på begäran.");
    const second = await receive(email, "Den andra förfrågan från samma adress, fortfarande öppen.");
    // An erasure request clears the first inquiry, which is then no longer loaded or open.
    await asDatabaseOwner((db) => db.query("select private.anonymise_inquiry($1, true)", [first]));

    const repository = await loaded(member);
    expect(getOpenInquiries(await repository.load()).map((i) => i.id)).toContain(second);
    expect(await repository.decideInquiry(second, { action: "reject" })).toMatchObject({ status: "rejected", repeatOf: first });
  });

  it("a decided inquiry is final: its merged repeats cannot be decided again", async () => {
    const email = address();
    const first = await receive(email, "Den första förfrågan, som markeras som skräp.");
    const second = await receive(email, "Den andra förfrågan, som slås ihop med den första.");
    const repository = await loaded(member);
    await repository.decideInquiry(first, { action: "spam" });
    await expect(repository.decideInquiry(second, { action: "approve", name: "Too Late (test)" })).rejects.toMatchObject({ code: "conflict" });
    await expect(repository.decideInquiry(first, { action: "reject" })).rejects.toMatchObject({ code: "conflict" });
    expect((await rows([first, second])).get(second)).toMatchObject({ status: "merged", client_id: null });
  });
});

describe("duplicates", () => {
  it("a retry of the same submission is the same inquiry, never a repeat", async () => {
    const email = address();
    const payload = examplePayload(
      { submissionId: randomUUID(), contact: { name: "Maja Lind", email, company: "Lumen Yoga (test)" }, message: "En förfrågan som skickas två gånger av nätverket." },
      new Date(),
    );
    const hash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
    const send = () => admin.rpc("receive_inquiry", { p_studio: studio, p_inquiry: payload, p_content_hash: hash, p_ip_hash: null });
    const [a, b] = await Promise.all([send(), send()]);
    const results = [a.data, b.data] as { result: string; id: string }[];
    expect(results.map((r) => r.result).sort()).toEqual(["duplicate", "received"]);
    expect(results[0].id).toBe(results[1].id);
    const { count } = await owner.client.from("inquiries").select("id", { count: "exact", head: true }).eq("email", email);
    expect(count).toBe(1);
  });

  it("repeats arriving at the same moment all link to the same first inquiry, and approving creates one client", async () => {
    const email = address();
    const first = await receive(email, "Den första förfrågan innan två till kommer samtidigt.");
    const [second, third] = await Promise.all([
      receive(email, "Den andra förfrågan, skickad samtidigt som den tredje."),
      receive(email, "Den tredje förfrågan, skickad samtidigt som den andra."),
    ]);
    const stored = await rows([first, second, third]);
    expect([stored.get(second)?.repeat_of, stored.get(third)?.repeat_of]).toEqual([first, first]);

    const [a, b] = await Promise.all([loaded(owner), loaded(member)]);
    const results = await Promise.allSettled([
      a.decideInquiry(first, { action: "approve", name: "Concurrent Repeat (test)" }),
      b.decideInquiry(first, { action: "approve", name: "Concurrent Repeat (test)" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const { data: clients } = await owner.client.from("clients").select("id").eq("studio_id", studio).eq("email", email);
    expect(clients).toHaveLength(1);
    const { data: sources } = await owner.client.from("client_sources").select("id").eq("client_id", clients![0].id);
    expect(sources).toHaveLength(3);
  });
});

describe("permissions", () => {
  it("viewers and other studios cannot decide a first inquiry, so its repeats stay open", async () => {
    const viewer = await createUser("repeat-viewer");
    await addMember(owner, studio, viewer, "viewer");
    const outsider = await createUser("repeat-outsider");
    await createStudio(outsider, "Someone else's studio (repeats)");
    const email = address();
    const first = await receive(email, "Den första förfrågan som bara läses av en tittare.");
    const second = await receive(email, "Den andra förfrågan som bara läses av en tittare.");

    for (const user of [viewer, outsider]) {
      const { error } = await user.client.rpc("decide_inquiry", {
        p_studio: studio, p_inquiry: first, p_decision: { status: "spam", decided_by: { kind: "human", name: "Someone", userId: user.id } }, p_changes: null, p_onboarding: null,
      });
      expect(error?.code).toBe("42501");
    }
    // Outsiders and visitors do not see the inquiries at all.
    expect((await outsider.client.from("inquiries").select("id").in("id", [first, second])).data).toEqual([]);
    expect((await viewer.client.from("inquiries").select("id, repeat_of").eq("id", second).single()).data).toMatchObject({ repeat_of: first });
    const stored = await rows([first, second]);
    expect([stored.get(first)?.status, stored.get(second)?.status]).toEqual(["new", "new"]);
  });

  it("nobody signed in can set or change repeat_of, or mark an inquiry as merged, outside the review", async () => {
    const email = address();
    const first = await receive(email, "Den första förfrågan, som någon försöker ändra.");
    const second = await receive(email, "Den andra förfrågan, som någon försöker ändra.");
    const relink = await member.client.from("inquiries").update({ repeat_of: null }).eq("id", second).select("id");
    expect(relink.error?.code).toBe("42501");
    const merge = await member.client
      .from("inquiries")
      .update({ status: "merged", decided_by: { kind: "human", name: "Sam Member", userId: member.id } })
      .eq("id", second)
      .select("id");
    expect(merge.error?.code).toBe("42501");
    expect((await rows([second])).get(second)).toMatchObject({ status: "new", repeat_of: first });
  });
});
