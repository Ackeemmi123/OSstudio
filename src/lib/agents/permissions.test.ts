import { describe, expect, it } from "vitest";
import { intakeIdempotencyKey } from "./contract";
import { AGENT_ACTIONS, authorize, REQUIRES_HUMAN_APPROVAL } from "./permissions";
import { AGENTS } from "./registry";
import { agentsTriggeredBy, TRIGGER_RULES } from "./triggers";

describe("agent permissions", () => {
  it("connects only the intake and coordination agents, and only to read and propose", () => {
    expect(Object.values(AGENTS).filter((agent) => agent.status === "available").map((agent) => agent.id)).toEqual(["research", "coordination"]);
    for (const agent of ["research", "coordination"] as const) {
      expect(authorize(agent, "read_context")).toEqual({ allowed: true, requiresApproval: false });
      expect(authorize(agent, "propose_context")).toEqual({ allowed: true, requiresApproval: false });
      for (const action of ["create_draft", "update_task_status", "send_client_message", "send_proposal", "change_production", "launch_website"] as const) {
        expect(authorize(agent, action)).toMatchObject({ allowed: false });
      }
    }
    expect(authorize("design", "read_context")).toMatchObject({ allowed: false });
  });

  it("starts no agent automatically from events", () => {
    // Adding a rule needs Alexander's explicit approval (see triggers.ts).
    expect(TRIGGER_RULES).toEqual([]);
    for (const eventType of ["client.created", "source.received", "task.completed", "decision.approved", "client.context_updated"] as const) {
      expect(agentsTriggeredBy(eventType)).toEqual([]);
    }
  });

  it("starts only connected agents, even from an approved rule", () => {
    const rules = [
      { eventType: "source.received" as const, agentId: "research" as const, taskType: "research.intake" as const, approval: { by: "test", on: "2026-10-30" } },
      { eventType: "source.received" as const, agentId: "sales" as const, taskType: "sales.proposal_draft" as const, approval: { by: "test", on: "2026-10-30" } },
    ];
    expect(agentsTriggeredBy("source.received", rules).map((agent) => agent.id)).toEqual(["research"]);
    expect(agentsTriggeredBy("task.completed", rules)).toEqual([]);
  });

  it("lets no agent, connected or planned, do more than read, propose and draft", () => {
    for (const agent of Object.values(AGENTS)) {
      for (const action of agent.allowedActions) expect(["read_context", "propose_context", "create_draft"]).toContain(action);
    }
    const original = AGENTS.sales.status;
    AGENTS.sales.status = "available";
    try {
      expect(authorize("sales", "create_draft")).toEqual({ allowed: true, requiresApproval: false });
      for (const action of AGENT_ACTIONS.filter((a) => REQUIRES_HUMAN_APPROVAL.has(a) || a === "update_task_status")) {
        expect(authorize("sales", action)).toMatchObject({ allowed: false });
      }
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
