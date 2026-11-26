import type { StudioSnapshot } from "./types";
import type { Client } from "./types";

/** A client made for trying Studio OS out, named with "(TEST)" as the team does. */
export function isTestClient(client: Pick<Client, "name">): boolean {
  return /\(test\)/i.test(client.name);
}

/**
 * The snapshot without test clients and everything that belongs to them:
 * their projects and tasks, material, agent runs and proposals, onboardings,
 * inquiries and activity. Today shows the real studio by default.
 */
export function withoutTestClients(snapshot: StudioSnapshot): StudioSnapshot {
  const tests = new Set(snapshot.clients.filter(isTestClient).map((c) => c.id));
  if (!tests.size) return snapshot;
  const projects = new Set(snapshot.projects.filter((p) => tests.has(p.clientId)).map((p) => p.id));
  const tasks = new Set(snapshot.tasks.filter((t) => projects.has(t.projectId)).map((t) => t.id));
  const hidden = new Set([...tests, ...projects, ...tasks]);
  return {
    ...snapshot,
    clients: snapshot.clients.filter((c) => !tests.has(c.id)),
    projects: snapshot.projects.filter((p) => !projects.has(p.id)),
    tasks: snapshot.tasks.filter((t) => !tasks.has(t.id)),
    activity: snapshot.activity.filter((e) => !hidden.has(e.entityId)),
    sources: snapshot.sources.filter((s) => !tests.has(s.clientId)),
    agentRuns: snapshot.agentRuns.filter((r) => !tests.has(r.clientId)),
    proposals: snapshot.proposals.filter((p) => !tests.has(p.clientId)),
    onboardings: snapshot.onboardings.filter((o) => !tests.has(o.clientId)),
    inquiries: snapshot.inquiries.filter((i) => !i.clientId || !tests.has(i.clientId)),
  };
}

/** How many test clients there are, for the switch that shows them. */
export function countTestClients(snapshot: Pick<StudioSnapshot, "clients">): number {
  return snapshot.clients.filter((c) => isTestClient(c) && c.status !== "archived").length;
}
