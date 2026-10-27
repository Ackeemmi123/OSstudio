import type {
  ClientStatus,
  ContextFieldKey,
  FieldConfidence,
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
  manual: "Entered manually",
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
  observed: "Taken from a source, but not yet confirmed.",
  proposed: "Suggested by the team or AI. Needs confirmation.",
  unknown: "Not yet established.",
  superseded: "Replaced by a newer value or decision.",
};

export const CONTEXT_FIELD_LABELS: Record<ContextFieldKey, string> = {
  goal: "Client goal",
  targetAudience: "Target audience",
  requirements: "Requirements",
  budget: "Budget",
  deadline: "Deadline",
  platform: "Platform & technical context",
};
