import { describe, expect, it } from "vitest";
import { applyClientUpdate, buildNewClient, getInitials, getMissingInformation, toClientUpdateInput } from "./clients";

function deps() {
  let n = 0;
  return { now: () => "2026-10-26T12:00:00.000Z", createId: () => `id-${++n}` };
}

describe("buildNewClient", () => {
  it("creates a client from only a name, leaving everything else unknown", () => {
    const { client, event } = buildNewClient({ name: "  Ateljé Henrik  " }, deps());

    expect(client.name).toBe("Ateljé Henrik");
    expect(client.status).toBe("lead");
    expect(client.contactPerson).toBeNull();
    expect(client.email).toBeNull();
    expect(client.projectType).toBeNull();
    expect(client.source).toEqual({ type: "manual", initialNotes: null, receivedAt: "2026-10-26T12:00:00.000Z" });
    for (const field of Object.values(client.context)) {
      expect(field.value).toBeNull();
      expect(field.confidence).toBe("unknown");
    }
    expect(event).toMatchObject({ entityType: "client", entityId: client.id, eventType: "client.created" });
  });

  it("records supplied brief values as observed with their source, never as confirmed", () => {
    const { client } = buildNewClient(
      { name: "Nordvik", goal: "Rebrand", budget: "SEK 100,000", sourceType: "email", initialNotes: "From intro email" },
      deps(),
    );

    expect(client.context.goal).toMatchObject({ value: "Rebrand", confidence: "observed", source: { type: "email" } });
    expect(client.context.budget.confidence).toBe("observed");
    expect(client.context.deadline.confidence).toBe("unknown");
    expect(client.source).toMatchObject({ type: "email", initialNotes: "From intro email" });
  });

  it("treats blank optional values as missing", () => {
    const { client } = buildNewClient({ name: "Lumen", contactPerson: "   ", goal: "" }, deps());
    expect(client.contactPerson).toBeNull();
    expect(client.context.goal.value).toBeNull();
  });

  it("refuses a blank name", () => {
    expect(() => buildNewClient({ name: "   " }, deps())).toThrow();
  });
});

describe("applyClientUpdate", () => {
  const base = buildNewClient({ name: "Solberg", budget: "SEK 150,000" }, deps()).client;

  it("returns the same client and no events when nothing changed", () => {
    const result = applyClientUpdate(base, toClientUpdateInput(base), deps());
    expect(result.client).toBe(base);
    expect(result.events).toHaveLength(0);
  });

  it("keeps a replaced value as superseded history", () => {
    const input = toClientUpdateInput(base);
    input.context.budget = { value: "SEK 190,000", confidence: "confirmed" };
    const { client, events } = applyClientUpdate(base, input, deps());

    expect(client.context.budget).toMatchObject({ value: "SEK 190,000", confidence: "confirmed" });
    expect(client.context.budget.history).toEqual([
      { value: "SEK 150,000", confidence: "observed", supersededAt: "2026-10-26T12:00:00.000Z" },
    ]);
    expect(events[0]).toMatchObject({ eventType: "client.updated", description: "Updated budget" });
  });

  it("can confirm an existing value without adding history", () => {
    const input = toClientUpdateInput(base);
    input.context.budget.confidence = "confirmed";
    const { client } = applyClientUpdate(base, input, deps());
    expect(client.context.budget.confidence).toBe("confirmed");
    expect(client.context.budget.history).toBeUndefined();
  });

  it("marks a cleared value as unknown", () => {
    const input = toClientUpdateInput(base);
    input.context.budget.value = "";
    const { client } = applyClientUpdate(base, input, deps());
    expect(client.context.budget).toMatchObject({ value: null, confidence: "unknown" });
    expect(client.context.budget.history?.[0].value).toBe("SEK 150,000");
  });

  it("records core field and status changes as separate events", () => {
    const input = toClientUpdateInput(base);
    input.contactPerson = "Jonas";
    input.email = "jonas@example.com";
    input.status = "active";
    const { client, events } = applyClientUpdate(base, input, deps());

    expect(client).toMatchObject({ contactPerson: "Jonas", email: "jonas@example.com", status: "active" });
    expect(events.map((e) => e.eventType)).toEqual(["client.updated", "client.status_changed"]);
    expect(events[0].description).toBe("Updated contact person and email");
  });
});

describe("getMissingInformation", () => {
  it("lists essential details first", () => {
    const { client } = buildNewClient({ name: "Kontur", website: "kontur.se" }, deps());
    const missing = getMissingInformation(client);
    expect(missing.map((m) => m.key)).not.toContain("website");
    expect(missing.slice(0, 5).every((m) => m.essential)).toBe(true);
  });
});

describe("getInitials", () => {
  it("handles one word, several words and punctuation", () => {
    expect(getInitials("Ateljé Henrik")).toBe("AH");
    expect(getInitials("Kontur")).toBe("KO");
    expect(getInitials("Brand & Co.")).toBe("BC");
  });
});
