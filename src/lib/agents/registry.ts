/**
 * The agents the studio runs or plans to run. Client Intake & Research and
 * Project Coordination (task suggestions only) have runners ("available");
 * the rest are planned and the UI says so. An available agent still needs a
 * model provider configured on the server.
 */
import { AGENT_LABELS } from "@/lib/domain/labels";
import type { AgentId } from "@/lib/domain/types";
import type { AgentTaskType } from "./contract";
import type { AgentAction } from "./permissions";

export interface AgentDefinition {
  id: AgentId;
  label: string;
  purpose: string;
  status: "planned" | "available";
  taskTypes: AgentTaskType[];
  /**
   * What the agent may do. Every agent only reads, proposes and drafts: what
   * it produces is a proposal until a person accepts it. Events that start an
   * agent automatically are listed separately, in triggers.ts.
   */
  allowedActions: AgentAction[];
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
  },
  design: {
    id: "design",
    label: AGENT_LABELS.design,
    purpose: "Proposes structure and visual directions from the confirmed brief.",
    status: "planned",
    taskTypes: ["design.direction", "design.review"],
    allowedActions: READ_AND_PROPOSE,
  },
  development: {
    id: "development",
    label: AGENT_LABELS.development,
    purpose: "Proposes how to build approved requirements. It cannot change a live site.",
    status: "planned",
    taskTypes: ["development.build"],
    allowedActions: READ_AND_PROPOSE,
  },
  qa: {
    id: "qa",
    label: AGENT_LABELS.qa,
    purpose: "Checks deliverables against requirements, accessibility and quality standards.",
    status: "planned",
    taskTypes: ["qa.review"],
    allowedActions: READ_AND_PROPOSE,
  },
  sales: {
    id: "sales",
    label: AGENT_LABELS.sales,
    purpose: "Drafts proposals and presentations for a person to review and send.",
    status: "planned",
    taskTypes: ["sales.proposal_draft"],
    allowedActions: READ_AND_PROPOSE,
  },
  coordination: {
    id: "coordination",
    label: AGENT_LABELS.coordination,
    purpose: "Suggests tasks to add to or leave out of a new project's starting list, from the brief. You tick the ones you want; nothing is created otherwise.",
    status: "available",
    taskTypes: ["coordination.plan"],
    allowedActions: ["read_context", "propose_context"],
  },
};
