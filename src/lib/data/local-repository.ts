import { buildNewClient, DomainError, setContextField, updateClientDetails, type DomainDeps } from "@/lib/domain/clients";
import { addContextItem, buildSource, reviewProposal } from "@/lib/domain/intake";
import { buildProject, buildTask, setTaskStatus, updateProject } from "@/lib/domain/projects";
import type { AgentRunRecord } from "@/lib/agents/contract";
import type {
  ActivityEvent,
  AgentProposal,
  Client,
  ClientDetailsInput,
  ContextFieldInput,
  ContextFieldKey,
  NewClientInput,
  NewContextItemInput,
  NewProjectInput,
  NewSourceInput,
  NewTaskInput,
  Project,
  ProjectUpdateInput,
  ProposalDecision,
  SourceDocument,
  StudioSnapshot,
  Task,
  TaskStatus,
} from "@/lib/domain/types";
import { hasErrors, validateClientIdentity, type ClientIdentityValues } from "@/lib/domain/validation";
import { migrateSnapshot } from "./migrate";
import { RepositoryError, type RepositoryInfo, type StudioRepository } from "./repository";
import { createSeedSnapshot } from "./seed";

export const STORAGE_KEY = "studio-os:workspace:v2";
/** Keys written by earlier versions. Read once, migrated, then left untouched. */
export const LEGACY_STORAGE_KEYS = ["studio-os:workspace:v1"];

/** The subset of the Web Storage API this repository needs. */
export type KeyValueStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

interface LocalRepositoryOptions {
  storage: KeyValueStorage | null;
  deps?: Partial<DomainDeps>;
  seed?: () => StudioSnapshot;
}

/**
 * Development-only repository that keeps the workspace in browser storage.
 * Data stays on this device and browser; nothing is sent to a server.
 */
export class LocalDemoRepository implements StudioRepository {
  private snapshot: StudioSnapshot | null = null;
  private readonly storage: KeyValueStorage | null;
  private readonly deps: DomainDeps;
  private readonly seed: () => StudioSnapshot;
  readonly info: RepositoryInfo;

  constructor(options: LocalRepositoryOptions) {
    this.storage = options.storage;
    this.deps = {
      now: options.deps?.now ?? (() => new Date().toISOString()),
      createId: options.deps?.createId ?? (() => crypto.randomUUID()),
      // There are no user accounts yet, so every change is made by "You".
      actor: options.deps?.actor ?? { kind: "human", name: "You" },
    };
    this.seed = options.seed ?? (() => createSeedSnapshot());
    this.info = { kind: "local-demo", persistence: options.storage ? "browser" : "memory", canWrite: true };
  }

  async load(): Promise<StudioSnapshot> {
    if (this.snapshot) return this.snapshot;
    const stored = this.read();
    this.snapshot = stored?.snapshot ?? this.seed();
    // Save fresh demo data, and move data from an older key to the current one.
    if (stored?.key !== STORAGE_KEY) this.write(this.snapshot);
    return this.snapshot;
  }

  createClient(input: NewClientInput): Promise<Client> {
    return this.mutate((s) => {
      validateIdentity(input);
      const { client, event } = buildNewClient(input, this.deps);
      return [{ ...s, clients: [client, ...s.clients] }, client, [event]];
    });
  }

  updateClient(clientId: string, input: ClientDetailsInput): Promise<Client> {
    return this.mutate((s) => {
      validateIdentity(input);
      const { client, events } = updateClientDetails(find(s.clients, clientId, "client"), input, this.deps);
      return [{ ...s, clients: replace(s.clients, client) }, client, events];
    });
  }

  setContextField(clientId: string, key: ContextFieldKey, input: ContextFieldInput): Promise<Client> {
    return this.mutate((s) => {
      const { client, events } = setContextField(find(s.clients, clientId, "client"), key, input, this.deps);
      return [{ ...s, clients: replace(s.clients, client) }, client, events];
    });
  }

  addContextItem(clientId: string, input: NewContextItemInput): Promise<Client> {
    return this.mutate((s) => {
      const { client, event } = addContextItem(find(s.clients, clientId, "client"), input, this.deps);
      return [{ ...s, clients: replace(s.clients, client) }, client, [event]];
    });
  }

  addSource(clientId: string, input: NewSourceInput): Promise<SourceDocument> {
    return this.mutate((s) => {
      const { source, event } = buildSource(find(s.clients, clientId, "client"), input, this.deps);
      return [{ ...s, sources: [source, ...s.sources] }, source, [event]];
    });
  }

  reviewProposal(proposalId: string, decision: ProposalDecision): Promise<AgentProposal> {
    return this.mutate((s) => {
      const proposal = find(s.proposals, proposalId, "proposal");
      const review = reviewProposal(find(s.clients, proposal.clientId, "client"), proposal, decision, s.sources, this.deps);
      return [
        { ...s, clients: replace(s.clients, review.client), proposals: replace(s.proposals, review.proposal) },
        review.proposal,
        review.events,
      ];
    });
  }

  async requestIntakeAnalysis(): Promise<AgentRunRecord> {
    throw new RepositoryError(
      "Analysis runs on the server and needs a signed-in workspace. The local demo cannot run agents.",
      "unavailable",
    );
  }

  createProject(clientId: string, input: NewProjectInput): Promise<Project> {
    return this.mutate((s) => {
      const { project, event } = buildProject(find(s.clients, clientId, "client"), input, this.deps);
      return [{ ...s, projects: [project, ...s.projects] }, project, [event]];
    });
  }

  updateProject(projectId: string, input: ProjectUpdateInput): Promise<Project> {
    return this.mutate((s) => {
      const { project, events } = updateProject(find(s.projects, projectId, "project"), input, this.deps);
      return [{ ...s, projects: replace(s.projects, project) }, project, events];
    });
  }

  createTask(projectId: string, input: NewTaskInput): Promise<Task> {
    return this.mutate((s) => {
      const { task, event } = buildTask(find(s.projects, projectId, "project"), input, this.deps);
      return [{ ...s, tasks: [...s.tasks, task] }, task, [event]];
    });
  }

  setTaskStatus(taskId: string, status: TaskStatus): Promise<Task> {
    return this.mutate((s) => {
      const { task, events } = setTaskStatus(find(s.tasks, taskId, "task"), status, this.deps);
      return [{ ...s, tasks: replace(s.tasks, task) }, task, events];
    });
  }

  async resetDemoData(): Promise<StudioSnapshot> {
    const fresh = this.seed();
    this.write(fresh);
    this.snapshot = fresh;
    return fresh;
  }

  /**
   * Runs a domain change against the current snapshot and saves it with its
   * activity events. Saves first, then swaps the in-memory snapshot, so a
   * failed save changes nothing. No events means nothing changed.
   */
  private async mutate<T>(change: (snapshot: StudioSnapshot) => [StudioSnapshot, T, ActivityEvent[]]): Promise<T> {
    const current = await this.load();
    let result: [StudioSnapshot, T, ActivityEvent[]];
    try {
      result = change(current);
    } catch (error) {
      if (error instanceof DomainError) throw new RepositoryError(error.message, "validation");
      throw error;
    }
    const [next, value, events] = result;
    if (events.length === 0) return value;
    const saved = { ...next, activity: [...events, ...next.activity] };
    this.write(saved);
    this.snapshot = saved;
    return value;
  }

  private read(): { snapshot: StudioSnapshot; key: string } | null {
    if (!this.storage) return null;
    for (const key of [STORAGE_KEY, ...LEGACY_STORAGE_KEYS]) {
      try {
        const raw = this.storage.getItem(key);
        if (!raw) continue;
        const snapshot = migrateSnapshot(JSON.parse(raw));
        if (snapshot) return { snapshot, key };
      } catch {
        // Corrupt or unreadable data: try the next key, then fall back to demo data.
      }
    }
    return null;
  }

  private write(snapshot: StudioSnapshot) {
    if (!this.storage) return;
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      throw new RepositoryError("Changes could not be saved in this browser. Storage may be full or disabled.", "storage");
    }
  }
}

export function validateIdentity(values: ClientIdentityValues) {
  const errors = validateClientIdentity(values);
  if (hasErrors(errors)) throw new RepositoryError(Object.values(errors)[0] ?? "Invalid client.", "validation");
}

function find<T extends { id: string }>(items: T[], id: string, what: string): T {
  const item = items.find((candidate) => candidate.id === id);
  if (!item) throw new RepositoryError(`This ${what} no longer exists.`, "not_found");
  return item;
}

function replace<T extends { id: string }>(items: T[], next: T): T[] {
  return items.map((item) => (item.id === next.id ? next : item));
}

/** Returns browser storage when it is usable, or null (in-memory only) when it is not. */
export function getBrowserStorage(): KeyValueStorage | null {
  try {
    const storage = window.localStorage;
    const probe = "studio-os:probe";
    storage.setItem(probe, "1");
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}
