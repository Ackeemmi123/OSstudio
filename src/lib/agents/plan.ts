/**
 * Project coordination: task suggestions for a new project. The agent reads
 * the client's brief and the playbook for the project type, and suggests
 * tasks to add or leave out. A person sees each suggestion as an unticked
 * option in the start-project form; nothing becomes a task unless they tick
 * it and create the project.
 *
 * The model is treated as untrusted. Its output is validated here: every
 * added task must point at a brief value it was given, a task to leave out
 * must be one of the playbook's own, and titles naming the client are
 * dropped so tasks stay generic.
 */
import { z } from "zod";
import { PLAYBOOKS, type PlaybookTask } from "@/lib/domain/playbooks";
import { CONTEXT_FIELD_KEYS, PROJECT_STAGES, type Client, type ContextFieldKey, type FieldConfidence, type ProjectType } from "@/lib/domain/types";
import type { PlanResult } from "./contract";
import { buildPlanMessage, PLAN_PROMPT_VERSION, PLAN_SYSTEM_PROMPT } from "./plan-prompt";
import { utf8Bytes } from "./pricing";

export const PLAN_LIMITS = {
  maxAdd: 6,
  maxRemove: 4,
  minTitleLength: 3,
  maxTitleLength: 100,
  maxReasonLength: 300,
} as const;

/**
 * Brief fields the agent is given. Identifiers (company and contact names,
 * email, web addresses) are left out: suggesting tasks does not need them.
 */
export const PLAN_BRIEF_FIELDS = CONTEXT_FIELD_KEYS.filter((key) => key !== "storeUrl");

/** Everything the agent is given. No source material, no client details. */
export interface PlanInput {
  projectType: ProjectType;
  brief: { target: ContextFieldKey; value: string; confidence: FieldConfidence }[];
  playbook: PlaybookTask[];
}

export const planModelOutput = z.object({
  add: z.array(z.object({ stage: z.enum(PROJECT_STAGES), title: z.string(), reason: z.string(), basedOn: z.enum(CONTEXT_FIELD_KEYS) })),
  remove: z.array(z.object({ title: z.string(), reason: z.string() })),
});
export type PlanModelOutput = z.infer<typeof planModelOutput>;

export function buildPlanInput(client: Client, projectType: ProjectType): PlanInput {
  const brief = PLAN_BRIEF_FIELDS.flatMap((target) => {
    const field = client.context[target];
    return field.value?.trim() ? [{ target, value: field.value, confidence: field.confidence }] : [];
  });
  return { projectType, brief, playbook: PLAYBOOKS[projectType] };
}

/** Everything a call sends (instructions, message, answer format), in bytes, for reserving its worst cost. */
export function planRequestBytes(input: PlanInput): number {
  return utf8Bytes(PLAN_SYSTEM_PROMPT, buildPlanMessage(input), JSON.stringify(z.toJSONSchema(planModelOutput)));
}

/** Refuses a brief with nothing to base suggestions on. */
export function checkPlanInput(input: PlanInput): { ok: true } | { ok: false; blocker: string } {
  if (input.brief.length === 0) {
    return { ok: false, blocker: "The brief is empty. Record what the client needs first, then ask for suggestions." };
  }
  return { ok: true };
}

/**
 * Checks the model's answer and keeps only suggestions a person can act on.
 * `names` are the client's and contact's names: a title containing one is
 * dropped, because tasks are kept free of client details.
 */
export function normalizePlanOutput(raw: unknown, input: PlanInput, names: readonly (string | null)[]): PlanResult {
  const output = planModelOutput.parse(raw);
  const briefTargets = new Set(input.brief.map((entry) => entry.target));
  const playbookTitles = new Map(input.playbook.map((task) => [key(task.title), task.title]));
  const forbidden = names.map((name) => name?.trim().toLocaleLowerCase()).filter((name): name is string => Boolean(name && name.length >= 3));
  let discarded = 0;

  const add: PlanResult["add"] = [];
  const seen = new Set(playbookTitles.keys());
  for (const item of output.add) {
    const title = clean(item.title);
    const reason = clean(item.reason);
    const usable =
      title.length >= PLAN_LIMITS.minTitleLength &&
      title.length <= PLAN_LIMITS.maxTitleLength &&
      reason.length > 0 &&
      briefTargets.has(item.basedOn) &&
      !seen.has(key(title)) &&
      !forbidden.some((name) => key(title).includes(name));
    if (!usable || add.length >= PLAN_LIMITS.maxAdd) {
      discarded++;
      continue;
    }
    seen.add(key(title));
    add.push({ stage: item.stage, title, reason: limit(reason), basedOn: item.basedOn });
  }

  const remove: PlanResult["remove"] = [];
  for (const item of output.remove) {
    const title = playbookTitles.get(key(item.title));
    const reason = clean(item.reason);
    if (!title || !reason || remove.some((r) => r.title === title) || remove.length >= PLAN_LIMITS.maxRemove) {
      discarded++;
      continue;
    }
    remove.push({ title, reason: limit(reason) });
  }

  add.sort((a, b) => PROJECT_STAGES.indexOf(a.stage) - PROJECT_STAGES.indexOf(b.stage));
  return { kind: "plan", projectType: input.projectType, add, remove, discarded, externalResearch: false };
}

/** The same brief, type and instructions give the same fingerprint, so asking again reuses the run. */
export async function planFingerprint(input: PlanInput): Promise<string> {
  const material = JSON.stringify({
    v: 1,
    prompt: PLAN_PROMPT_VERSION,
    projectType: input.projectType,
    brief: [...input.brief].sort((a, b) => a.target.localeCompare(b.target)),
    playbook: input.playbook,
  });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));
  return Array.from(new Uint8Array(digest).slice(0, 16), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function planIdempotencyKey(clientId: string, fingerprint: string): string {
  return `coordination.plan:${clientId}:${fingerprint}`;
}

function clean(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function key(title: string): string {
  return clean(title).toLocaleLowerCase();
}

function limit(text: string): string {
  return text.length > PLAN_LIMITS.maxReasonLength ? `${text.slice(0, PLAN_LIMITS.maxReasonLength - 1)}…` : text;
}
