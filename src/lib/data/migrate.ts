import type { Actor, Assignee, StudioSnapshot } from "@/lib/domain/types";

/**
 * Upgrades workspace data saved by earlier versions so nobody loses the
 * clients they created. Returns null when the data is not recognizable.
 *
 * v1 (first release): tasks had `assignedTo: string | null`, events had
 * `actor?: string`. v2: both are structured, so agents can be represented.
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

  return { ...value, tasks, activity } as unknown as StudioSnapshot;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
