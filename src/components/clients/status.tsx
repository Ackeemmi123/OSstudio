import { StatusLabel, Tag, type Tone } from "@/components/ui/status";
import {
  CLIENT_STATUS_LABELS,
  CONFIDENCE_DESCRIPTIONS,
  CONFIDENCE_LABELS,
  PROJECT_STATUS_LABELS,
  TASK_STATUS_LABELS,
} from "@/lib/domain/labels";
import type { ClientStatus, FieldConfidence, ProjectStatus, TaskStatus } from "@/lib/domain/types";

const CLIENT_TONES: Record<ClientStatus, Tone> = {
  lead: "info",
  onboarding: "caution",
  active: "positive",
  on_hold: "neutral",
  archived: "neutral",
};

export function ClientStatusLabel({ status }: { status: ClientStatus }) {
  return <StatusLabel tone={CLIENT_TONES[status]}>{CLIENT_STATUS_LABELS[status]}</StatusLabel>;
}

const PROJECT_TONES: Record<ProjectStatus, Tone> = {
  planned: "info",
  active: "positive",
  on_hold: "neutral",
  completed: "accent",
};

export function ProjectStatusLabel({ status }: { status: ProjectStatus }) {
  return <StatusLabel tone={PROJECT_TONES[status]}>{PROJECT_STATUS_LABELS[status]}</StatusLabel>;
}

const TASK_TONES: Record<TaskStatus, Tone> = {
  todo: "neutral",
  in_progress: "info",
  blocked: "critical",
  in_review: "caution",
  awaiting_approval: "caution",
  done: "positive",
};

export function TaskStatusLabel({ status }: { status: TaskStatus }) {
  return <StatusLabel tone={TASK_TONES[status]}>{TASK_STATUS_LABELS[status]}</StatusLabel>;
}

const CONFIDENCE_TONES: Record<FieldConfidence, Tone> = {
  confirmed: "positive",
  observed: "info",
  proposed: "caution",
  unknown: "neutral",
  superseded: "neutral",
};

export function ConfidenceTag({ confidence }: { confidence: FieldConfidence }) {
  return (
    <Tag tone={CONFIDENCE_TONES[confidence]} title={CONFIDENCE_DESCRIPTIONS[confidence]}>
      {CONFIDENCE_LABELS[confidence]}
    </Tag>
  );
}

export function DemoTag() {
  return (
    <Tag tone="neutral" title="Example record for demonstration. Not a real client.">
      Demo
    </Tag>
  );
}
