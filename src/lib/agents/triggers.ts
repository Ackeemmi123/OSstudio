/**
 * Events that start an agent without a person asking. The activity log is
 * the event stream (see ActivityEventType); a rule here makes an agent run
 * when an event of that type is recorded.
 *
 * There are no rules. Starting an agent automatically spends money and sends
 * client data to a model provider, so each rule needs Alexander's explicit
 * approval, recorded with it, before it is added.
 */
import type { ActivityEventType, AgentId } from "@/lib/domain/types";
import type { AgentTaskType } from "./contract";
import { AGENTS, type AgentDefinition } from "./registry";

export interface TriggerRule {
  eventType: ActivityEventType;
  agentId: AgentId;
  taskType: AgentTaskType;
  /** Who approved running this automatically, and when (YYYY-MM-DD). */
  approval: { by: string; on: string };
}

export const TRIGGER_RULES: readonly TriggerRule[] = [];

/** The connected agents an event starts. */
export function agentsTriggeredBy(eventType: ActivityEventType, rules: readonly TriggerRule[] = TRIGGER_RULES): AgentDefinition[] {
  return rules
    .filter((rule) => rule.eventType === eventType)
    .map((rule) => AGENTS[rule.agentId])
    .filter((agent) => agent.status === "available");
}
