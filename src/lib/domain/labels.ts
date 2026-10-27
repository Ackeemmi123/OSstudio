import type {
  Actor,
  AgentId,
  Assignee,
  ClientStatus,
  ContextFieldKey,
  FieldConfidence,
  ProposalTarget,
  ProjectStage,
  ProjectStatus,
  ProjectType,
  SourceType,
  TaskStatus,
} from "./types";

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  website: "Website",
  ecommerce: "E-commerce",
  brand_website: "Brand & Website",
  website_ecommerce: "Website & E-commerce",
  other: "Other",
};

export const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
  lead: "Lead",
  onboarding: "Onboarding",
  active: "Active",
  on_hold: "On hold",
  archived: "Archived",
};

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  planned: "Planned",
  active: "Active",
  on_hold: "On hold",
  completed: "Completed",
};

export const PROJECT_STAGE_LABELS: Record<ProjectStage, string> = {
  intake: "Intake",
  discovery: "Discovery",
  strategy: "Strategy",
  design: "Design",
  development: "Development",
  review: "Review",
  launch: "Launch",
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  blocked: "Blocked",
  in_review: "In review",
  awaiting_approval: "Awaiting approval",
  done: "Done",
};

export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  email: "Email",
  contact_form: "Contact form",
  meeting: "Meeting",
  phone: "Phone call",
  referral: "Referral",
  document: "Document",
  manual: "Entered in Studio OS",
  other: "Other",
};

export const CONFIDENCE_LABELS: Record<FieldConfidence, string> = {
  confirmed: "Confirmed",
  observed: "Observed",
  proposed: "Proposed",
  unknown: "Unknown",
  superseded: "Superseded",
};

export const CONFIDENCE_DESCRIPTIONS: Record<FieldConfidence, string> = {
  confirmed: "Explicitly confirmed by the client or an authorized team member.",
  observed: "Taken from a source, not yet confirmed.",
  proposed: "Suggested by the team or an agent. Needs a human decision.",
  unknown: "Not yet established.",
  superseded: "Replaced by a newer value or decision.",
};

export const CONTEXT_FIELD_LABELS: Record<ContextFieldKey, string> = {
  goal: "Goal",
  requirements: "Requirements",
  targetAudience: "Audience",
  budget: "Budget",
  deadline: "Deadline",
  platform: "Platform",
};

export const PROPOSAL_TARGET_LABELS: Record<ProposalTarget, string> = {
  ...CONTEXT_FIELD_LABELS,
  companyName: "Company name",
  contactPerson: "Contact person",
  email: "Email",
  website: "Website",
};

export const AGENT_LABELS: Record<AgentId, string> = {
  research: "Intake & research agent",
  design: "Design agent",
  development: "Development agent",
  qa: "Quality assurance agent",
  sales: "Sales & presentations agent",
  coordination: "Project coordination agent",
};

export function actorLabel(actor: Actor | Assignee): string {
  if (actor.kind === "human") return actor.name;
  if (actor.kind === "agent") return AGENT_LABELS[actor.agentId];
  return "Studio OS";
}
