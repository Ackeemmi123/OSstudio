/**
 * What agents may do. Every agent gets an explicit allow-list; some actions
 * always need a person's approval, whichever agent asks.
 */
import type { AgentId } from "@/lib/domain/types";
import { AGENTS } from "./registry";

export const AGENT_ACTIONS = [
  "read_context",
  "propose_context",
  "create_draft",
  "update_task_status",
  "send_client_message",
  "send_proposal",
  "make_purchase",
  "change_production",
  "change_approved_scope",
  "launch_website",
] as const;
export type AgentAction = (typeof AGENT_ACTIONS)[number];

/** Binding or irreversible actions. An agent may prepare them, never complete them alone. */
export const REQUIRES_HUMAN_APPROVAL: ReadonlySet<AgentAction> = new Set([
  "send_client_message",
  "send_proposal",
  "make_purchase",
  "change_production",
  "change_approved_scope",
  "launch_website",
]);

export type Authorization =
  | { allowed: false; reason: string }
  | { allowed: true; requiresApproval: boolean };

export function authorize(agentId: AgentId, action: AgentAction): Authorization {
  const agent = AGENTS[agentId];
  if (agent.status !== "available") {
    return { allowed: false, reason: `${agent.label} is not connected.` };
  }
  if (!agent.allowedActions.includes(action)) {
    return { allowed: false, reason: `${agent.label} is not permitted to ${action.replaceAll("_", " ")}.` };
  }
  return { allowed: true, requiresApproval: REQUIRES_HUMAN_APPROVAL.has(action) };
}
