/**
 * The agents the studio runs or plans to run. Only Client Intake & Research
 * has a runner ("available"); the rest are planned and the UI says so. An
 * available agent still needs a model provider configured on the server.
 */
import { AGENT_LABELS } from "@/lib/domain/labels";
import type { ActivityEventType, AgentId } from "@/lib/domain/types";
import type { AgentTaskType } from "./contract";
import type { AgentAction } from "./permissions";

export interface AgentDefinition {
  id: AgentId;
  label: string;
  purpose: string;
  status: "planned" | "available";
  taskTypes: AgentTaskType[];
  allowedActions: AgentAction[];
  /**
   * Events that start a run automatically. Empty for every agent for now:
   * runs start only when a person asks for one.
   */
  triggers: ActivityEventType[];
}

const READ_AND_PROPOSE: AgentAction[] = ["read_context", "propose_context", "create_draft"];

export const AGENTS: Record<AgentId, AgentDefinition> = {
  research: {
    id: "research",
    label: AGENT_LABELS.research,
    purpose: "Reads the source material you add and proposes brief values, each with a quote as evidence, plus open questions. It does not browse or research.",
    status: "available",
    taskTypes: ["research.intake"],
    allowedActions: ["read_context", "propose_context"],
    triggers: [],
  },
  design: {
    id: "design",
    label: AGENT_LABELS.design,
    purpose: "Proposes structure and visual directions from the confirmed brief.",
    status: "planned",
    taskTypes: ["design.direction", "design.review"],
    allowedActions: READ_AND_PROPOSE,
    triggers: [],
  },
  development: {
    id: "development",
    label: AGENT_LABELS.development,
    purpose: "Builds against approved requirements in a non-production environment.",
    status: "planned",
    taskTypes: ["development.build"],
    allowedActions: [...READ_AND_PROPOSE, "update_task_status", "change_production", "launch_website"],
    triggers: ["decision.approved"],
  },
  qa: {
    id: "qa",
    label: AGENT_LABELS.qa,
    purpose: "Checks deliverables against requirements, accessibility and quality standards.",
    status: "planned",
    taskTypes: ["qa.review"],
    allowedActions: [...READ_AND_PROPOSE, "update_task_status"],
    triggers: ["task.completed"],
  },
  sales: {
    id: "sales",
    label: AGENT_LABELS.sales,
    purpose: "Drafts proposals and presentations for a person to review and send.",
    status: "planned",
    taskTypes: ["sales.proposal_draft"],
    allowedActions: [...READ_AND_PROPOSE, "send_proposal"],
    triggers: [],
  },
  coordination: {
    id: "coordination",
    label: AGENT_LABELS.coordination,
    purpose: "Keeps tasks, owners and next steps in order across projects.",
    status: "planned",
    taskTypes: ["coordination.plan"],
    allowedActions: [...READ_AND_PROPOSE, "update_task_status", "send_client_message"],
    triggers: ["client.context_updated", "task.completed"],
  },
};

export function agentsTriggeredBy(eventType: ActivityEventType): AgentDefinition[] {
  return Object.values(AGENTS).filter((agent) => agent.status === "available" && agent.triggers.includes(eventType));
}
