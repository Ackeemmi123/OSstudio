import { describe, expect, it } from "vitest";
import {
  buildNewClient,
  getInitials,
  getMissingEssentials,
  getUnconfirmedFields,
  setContextField,
  toClientDetailsInput,
  updateClientDetails,
} from "./clients";
import { testDeps } from "./test-helpers";

describe("buildNewClient", () => {
  it("creates a client from only a name, leaving everything else unknown", () => {
    const { client, event } = buildNewClient({ name: "  Ateljé Henrik  " }, testDeps());

    expect(client.name).toBe("Ateljé Henrik");
    expect(client.status).toBe("lead");
    expect(client.contactPerson).toBeNull();
    expect(client.projectType).toBeNull();
    expect(client.source).toEqual({ type: "manual", initialNotes: null, receivedAt: "2026-10-26T12:00:00.000Z" });
    for (const field of Object.values(client.context)) {
      expect(field).toMatchObject({ value: null, confidence: "unknown" });
    }
    expect(event).toMatchObject({ entityType: "client", entityId: client.id, eventType: "client.created" });
    expect(event.actor).toEqual({ kind: "human", name: "Alex" });
  });

  it("records supplied brief values as observed with their source, never as confirmed", () => {
    const { client } = buildNewClient(
      { name: "Nordvik", goal: "Rebrand", budget: "SEK 100,000", sourceType: "email", initialNotes: "From intro email" },
      testDeps(),
    );
    expect(client.context.goal).toMatchObject({ value: "Rebrand", confidence: "observed", source: { type: "email" } });
    expect(client.context.budget.confidence).toBe("observed");
    expect(client.context.deadline.confidence).toBe("unknown");
    expect(client.source).toMatchObject({ type: "email", initialNotes: "From intro email" });
  });

  it("treats blank optional values as missing and refuses a blank name", () => {
    const { client } = buildNewClient({ name: "Lumen", contactPerson: "   ", goal: "" }, testDeps());
    expect(client.contactPerson).toBeNull();
    expect(client.context.goal.value).toBeNull();
    expect(() => buildNewClient({ name: "   " }, testDeps())).toThrow();
  });
});

describe("updateClientDetails", () => {
  const base = buildNewClient({ name: "Solberg" }, testDeps()).client;

  it("returns the same client and no events when nothing changed", () => {
    const result = updateClientDetails(base, toClientDetailsInput(base), testDeps());
    expect(result.client).toBe(base);
    expect(result.events).toHaveLength(0);
  });

  it("records detail and status changes as separate events", () => {
    const input = { ...toClientDetailsInput(base), contactPerson: "Jonas", email: "jonas@example.com", status: "active" as const };
    const { client, events } = updateClientDetails(base, input, testDeps());
    expect(client).toMatchObject({ contactPerson: "Jonas", email: "jonas@example.com", status: "active" });
    expect(events.map((e) => e.eventType)).toEqual(["client.updated", "client.status_changed"]);
    expect(events[0].description).toBe("Updated contact person and email");
  });
});

describe("setContextField", () => {
  const base = buildNewClient({ name: "Solberg", budget: "SEK 150,000" }, testDeps()).client;

  it("keeps a replaced value as superseded history", () => {
    const { client, events } = setContextField(base, "budget", { value: "SEK 190,000", confidence: "confirmed" }, testDeps());
    expect(client.context.budget).toMatchObject({ value: "SEK 190,000", confidence: "confirmed" });
    expect(client.context.budget.history).toEqual([
      { value: "SEK 150,000", confidence: "observed", supersededAt: "2026-10-26T12:00:00.000Z" },
    ]);
    expect(events[0]).toMatchObject({ eventType: "client.context_updated", description: "Updated budget" });
  });

  it("confirms an existing value without adding history", () => {
    const { client, events } = setContextField(base, "budget", { value: "SEK 150,000", confidence: "confirmed" }, testDeps());
    expect(client.context.budget.confidence).toBe("confirmed");
    expect(client.context.budget.history).toBeUndefined();
    expect(events[0].description).toBe("Confirmed budget");
  });

  it("marks a cleared value as unknown and keeps the old one", () => {
    const { client } = setContextField(base, "budget", { value: " ", confidence: "observed" }, testDeps());
    expect(client.context.budget).toMatchObject({ value: null, confidence: "unknown" });
    expect(client.context.budget.history?.[0].value).toBe("SEK 150,000");
  });

  it("does nothing when the value and confidence are unchanged", () => {
    const result = setContextField(base, "budget", { value: "SEK 150,000", confidence: "observed" }, testDeps());
    expect(result.client).toBe(base);
    expect(result.events).toHaveLength(0);
  });

  it("lets an agent propose a value but never confirm one", () => {
    const agent = testDeps({ kind: "agent", agentId: "research" });
    const { client } = setContextField(base, "goal", { value: "Grow online sales", confidence: "proposed" }, agent);
    expect(client.context.goal).toMatchObject({ confidence: "proposed", recordedBy: { kind: "agent", agentId: "research" } });
    expect(() => setContextField(client, "goal", { value: "Grow online sales", confidence: "confirmed" }, agent)).toThrow(
      /only a person/i,
    );
  });
});

describe("missing and unconfirmed information", () => {
  it("lists only the essentials that are missing", () => {
    const { client } = buildNewClient({ name: "Kontur", email: "a@kontur.se", goal: "Portfolio" }, testDeps());
    expect(getMissingEssentials(client).map((m) => m.key)).toEqual(["contactPerson", "budget", "deadline"]);
  });

  it("lists unconfirmed values with proposals first", () => {
    const { client } = buildNewClient({ name: "Kontur", goal: "Portfolio" }, testDeps());
    const withProposal = setContextField(client, "budget", { value: "SEK 1", confidence: "proposed" }, testDeps()).client;
    expect(getUnconfirmedFields(withProposal).map((f) => f.key)).toEqual(["budget", "goal"]);
  });
});

describe("getInitials", () => {
  it("handles one word, several words and punctuation", () => {
    expect(getInitials("Ateljé Henrik")).toBe("AH");
    expect(getInitials("Kontur")).toBe("KO");
    expect(getInitials("Brand & Co.")).toBe("BC");
  });
});
