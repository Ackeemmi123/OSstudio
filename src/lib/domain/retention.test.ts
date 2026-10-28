import { describe, expect, it } from "vitest";
import { createSeedSnapshot } from "@/lib/data/seed";
import { toSnapshot, type StudioPayload } from "@/lib/data/supabase-rows";
import { getDecisions } from "./insights";
import { cleanHoldReason, daysUntilAnonymised, describeDaysLeft, getRetentionWarnings } from "./retention";
import type { Client, ClientRetention } from "./types";

const NOW = Date.parse("2026-10-29T12:00:00.000Z");
const DAY = 24 * 3600 * 1000;
const base = createSeedSnapshot(NOW);

function withRetention(client: Client, retention: Partial<ClientRetention>): Client {
  return { ...client, retention: { customer: false, lastActivityAt: new Date(NOW - 300 * DAY).toISOString(), endsAt: null, hold: null, log: [], ...retention } };
}

describe("retention warnings", () => {
  const [a, b, c, d] = base.clients;
  const clients = [
    withRetention(a, { endsAt: new Date(NOW + 10 * DAY).toISOString() }),
    withRetention(b, { endsAt: new Date(NOW + 31 * DAY).toISOString() }),
    withRetention(c, { endsAt: new Date(NOW - DAY).toISOString() }),
    withRetention(d, { endsAt: null, hold: { reason: "Open dispute", by: { kind: "human", name: "Alex" }, at: new Date(NOW).toISOString() } }),
  ];

  it("lists clients due within 30 days, soonest first; never held clients or the local demo", () => {
    expect(getRetentionWarnings(clients, NOW).map((w) => [w.client.id, w.days])).toEqual([[c.id, 0], [a.id, 10]]);
    expect(getRetentionWarnings(base.clients, NOW)).toEqual([]);
    expect(daysUntilAnonymised(clients[3], NOW)).toBeNull();
  });

  it("puts them on Today, after new inquiries and before approvals", () => {
    const decisions = getDecisions({ ...base, clients }, NOW);
    const retention = decisions.filter((d) => d.kind === "retention");
    expect(retention.map((d) => [d.clientId, d.where])).toEqual([[c.id, "Anonymised at the next daily run"], [a.id, "Anonymised in 10 days"]]);
    expect(retention[0].href).toContain("#retention");
    const kinds = decisions.map((d) => d.kind);
    expect(kinds.indexOf("retention")).toBeLessThan(kinds.indexOf("approval"));
  });

  it("describes the days left", () => {
    expect(describeDaysLeft(1)).toBe("Anonymised in 1 day");
    expect(describeDaysLeft(0)).toBe("Anonymised at the next daily run");
  });
});

describe("hold reasons", () => {
  it("are required and short", () => {
    expect(cleanHoldReason("  Open invoice dispute ")).toBe("Open invoice dispute");
    expect(() => cleanHoldReason("   ")).toThrow(/Give a reason/);
    expect(() => cleanHoldReason("x".repeat(501))).toThrow(/under 500/);
  });
});

describe("reading retention from the database", () => {
  it("attaches each client's dates, hold and log", () => {
    const row = { id: "c1", name: "Client", status: "active", source_type: "manual", source_received_at: "2026-01-01T00:00:00Z", created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z", retention_hold_reason: "Dispute", retention_hold_by: { kind: "human", name: "Alex" }, retention_held_at: "2026-10-01T00:00:00Z" };
    const payload: StudioPayload = {
      studio: { id: "s", name: "S" }, role: "owner", members: [], clients: [row, { ...row, id: "c2", retention_hold_reason: null }], context_fields: [], context_items: [],
      sources: [], projects: [], tasks: [], activity: [], agent_runs: [], proposals: [],
      retention: [{ clientId: "c1", customer: true, lastActivityAt: "2026-09-01T00:00:00Z", endsAt: null }],
      retention_holds: [{ client_id: "c1", action: "hold", reason: "Dispute", actor: { kind: "human", name: "Alex" }, created_at: "2026-10-01T00:00:00Z" }],
    };
    const [held, unknown] = toSnapshot(payload).clients;
    expect(held.retention).toEqual({
      customer: true, lastActivityAt: "2026-09-01T00:00:00Z", endsAt: null,
      hold: { reason: "Dispute", by: { kind: "human", name: "Alex" }, at: "2026-10-01T00:00:00Z" },
      log: [{ action: "hold", reason: "Dispute", actor: { kind: "human", name: "Alex" }, at: "2026-10-01T00:00:00Z" }],
    });
    expect(unknown.retention).toBeUndefined();
  });
});
