/**
 * Client activity: the one definition shared by retention and follow-ups.
 *
 * Client activity is a change a signed-in person made to the client, its
 * projects or its tasks, as recorded in the activity log (actor kind
 * "human"). Agents, the system, scheduled jobs and retention holds never
 * count. With no activity at all, the client's creation counts.
 *
 * The database computes the same thing in private.client_last_activity()
 * (supabase/migrations/20261029000200_client_retention.sql), which decides
 * retention; tests/db/client-retention.test.ts checks both agree. An event's
 * timestamp is set by the database (imports keep their earlier date), so it
 * is never later than when the event was stored.
 */
import type { ActivityEvent, Client, StudioSnapshot } from "./types";

/** Whether an event is client activity: recorded in a person's name. */
export function isClientActivity(event: ActivityEvent): boolean {
  return event.actor?.kind === "human";
}

/** When a person last changed the client, its projects or its tasks; at least the client's creation. */
export function lastClientActivity(client: Client, snapshot: Pick<StudioSnapshot, "projects" | "tasks" | "activity">): string {
  const projects = new Set(snapshot.projects.filter((p) => p.clientId === client.id).map((p) => p.id));
  const tasks = new Set(snapshot.tasks.filter((t) => projects.has(t.projectId)).map((t) => t.id));
  let last = client.createdAt;
  for (const event of snapshot.activity) {
    if (!isClientActivity(event)) continue;
    const about =
      (event.entityType === "client" && event.entityId === client.id) ||
      (event.entityType === "project" && projects.has(event.entityId)) ||
      (event.entityType === "task" && tasks.has(event.entityId));
    if (about && Date.parse(event.timestamp) > Date.parse(last)) last = event.timestamp;
  }
  return last;
}
