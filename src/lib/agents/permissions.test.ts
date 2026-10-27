import { describe, expect, it } from "vitest";
import { intakeIdempotencyKey } from "./contract";
import { authorize, REQUIRES_HUMAN_APPROVAL } from "./permissions";
import { AGENTS, agentsTriggeredBy } from "./registry";

describe("agent permissions", () => {
  it("connects only the intake agent, and only to read and propose", () => {
    expect(Object.values(AGENTS).filter((agent) => agent.status === "available").map((agent) => agent.id)).toEqual(["research"]);
    expect(authorize("research", "read_context")).toEqual({ allowed: true, requiresApproval: false });
    expect(authorize("research", "propose_context")).toEqual({ allowed: true, requiresApproval: false });
    for (const action of ["create_draft", "update_task_status", "send_client_message", "send_proposal", "change_production", "launch_website"] as const) {
      expect(authorize("research", action)).toMatchObject({ allowed: false });
    }
    expect(authorize("design", "read_context")).toMatchObject({ allowed: false });
  });

  it("starts no agent automatically from events", () => {
    for (const eventType of ["client.created", "source.received", "task.completed", "decision.approved"] as const) {
      expect(agentsTriggeredBy(eventType)).toEqual([]);
    }
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

  it("keys intake runs by client and input fingerprint", () => {
    expect(intakeIdempotencyKey("c1", "abc")).toBe(intakeIdempotencyKey("c1", "abc"));
    expect(intakeIdempotencyKey("c1", "abc")).not.toBe(intakeIdempotencyKey("c1", "abd"));
    expect(intakeIdempotencyKey("c1", "abc")).not.toBe(intakeIdempotencyKey("c2", "abc"));
  });
});
