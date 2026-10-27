import { describe, expect, it } from "vitest";
import { idempotencyKey } from "./contract";
import { authorize, REQUIRES_HUMAN_APPROVAL } from "./permissions";
import { AGENTS, agentsTriggeredBy } from "./registry";

describe("agent permissions", () => {
  it("refuses every action while agents are only planned", () => {
    expect(Object.values(AGENTS).every((agent) => agent.status === "planned")).toBe(true);
    expect(authorize("research", "read_context")).toMatchObject({ allowed: false });
    expect(agentsTriggeredBy("client.created")).toEqual([]);
  });

  it("requires a person for binding actions once an agent is connected", () => {
    const original = AGENTS.sales.status;
    AGENTS.sales.status = "available";
    try {
      expect(authorize("sales", "create_draft")).toEqual({ allowed: true, requiresApproval: false });
      expect(authorize("sales", "send_proposal")).toEqual({ allowed: true, requiresApproval: true });
      expect(authorize("sales", "launch_website")).toMatchObject({ allowed: false });
    } finally {
      AGENTS.sales.status = original;
    }
  });

  it("treats every binding or irreversible action as needing approval", () => {
    for (const action of ["send_proposal", "make_purchase", "change_production", "change_approved_scope", "launch_website"] as const) {
      expect(REQUIRES_HUMAN_APPROVAL.has(action)).toBe(true);
    }
  });

  it("gives a retried run the same idempotency key", () => {
    const request = { agentId: "research" as const, taskType: "research.brief" as const, taskId: null, trigger: { kind: "event" as const, eventId: "e1", eventType: "client.created" as const } };
    expect(idempotencyKey(request)).toBe(idempotencyKey({ ...request }));
    expect(idempotencyKey(request)).not.toBe(idempotencyKey({ ...request, trigger: { ...request.trigger, eventId: "e2" } }));
  });
});
