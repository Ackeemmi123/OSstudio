import { CONTEXT_FIELD_KEYS, type Actor, type Assignee, type StudioSnapshot } from "@/lib/domain/types";

/**
 * Upgrades workspace data saved by earlier versions so nobody loses the
 * clients they created. Returns null when the data is not recognizable.
 *
 * v1 (first release): tasks had `assignedTo: string | null`, events had
 * `actor?: string`. v2: both are structured, so agents can be represented.
 * Phase 2 added source material, agent runs and proposals (empty when absent).
 * Onboarding added brief values (unknown when absent) and onboarding progress.
 */
export function migrateSnapshot(value: unknown): StudioSnapshot | null {
  if (!isRecord(value)) return null;
  if (!["clients", "projects", "tasks", "activity"].every((key) => Array.isArray(value[key]))) return null;

  const tasks = (value.tasks as Record<string, unknown>[]).map((task) => {
    if ("assignee" in task) return task;
    const { assignedTo, ...rest } = task;
    const assignee: Assignee | null = typeof assignedTo === "string" && assignedTo ? { kind: "human", name: assignedTo } : null;
    return { ...rest, assignee };
  });

  const activity = (value.activity as Record<string, unknown>[]).map((event) => {
    if (typeof event.actor !== "string") return event;
    const actor: Actor = { kind: "human", name: event.actor };
    return { ...event, actor };
  });

  // Brief values added later start as unknown, dated when the client was created.
  const clients = (value.clients as Record<string, unknown>[]).map((client) => {
    const context = isRecord(client.context) ? client.context : {};
    const missing = CONTEXT_FIELD_KEYS.filter((key) => !isRecord(context[key]));
    if (missing.length === 0) return client;
    const updatedAt = typeof client.createdAt === "string" ? client.createdAt : new Date(0).toISOString();
    return { ...client, context: { ...context, ...Object.fromEntries(missing.map((key) => [key, { value: null, confidence: "unknown", updatedAt }])) } };
  });

  const list = (key: string) => (Array.isArray(value[key]) ? value[key] : []);
  return {
    ...value,
    clients,
    tasks,
    activity,
    sources: list("sources"),
    agentRuns: list("agentRuns"),
    proposals: list("proposals"),
    onboardings: list("onboardings"),
    // Inquiries only exist in a signed-in workspace.
    inquiries: [],
  } as unknown as StudioSnapshot;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
