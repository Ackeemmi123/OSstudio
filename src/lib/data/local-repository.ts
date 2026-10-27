import { applyClientUpdate, buildNewClient, type DomainDeps } from "@/lib/domain/clients";
import type { Client, ClientUpdateInput, NewClientInput, StudioSnapshot } from "@/lib/domain/types";
import { validateClientIdentity, hasErrors } from "@/lib/domain/validation";
import { RepositoryError, type RepositoryInfo, type StudioRepository } from "./repository";
import { createSeedSnapshot } from "./seed";

export const STORAGE_KEY = "studio-os:workspace:v1";

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
    };
    this.seed = options.seed ?? (() => createSeedSnapshot());
    this.info = { kind: "local-demo", persistence: options.storage ? "browser" : "memory" };
  }

  async load(): Promise<StudioSnapshot> {
    if (this.snapshot) return this.snapshot;

    const stored = this.read();
    if (stored) {
      this.snapshot = stored;
    } else {
      this.snapshot = this.seed();
      this.write(this.snapshot);
    }
    return this.snapshot;
  }

  async createClient(input: NewClientInput): Promise<Client> {
    const errors = validateClientIdentity(input);
    if (hasErrors(errors)) {
      throw new RepositoryError(Object.values(errors)[0] ?? "Invalid client.", "validation");
    }

    const current = await this.load();
    const { client, event } = buildNewClient(input, this.deps);
    this.commit({
      ...current,
      clients: [client, ...current.clients],
      activity: [event, ...current.activity],
    });
    return client;
  }

  async updateClient(clientId: string, input: ClientUpdateInput): Promise<Client> {
    const errors = validateClientIdentity(input);
    if (hasErrors(errors)) {
      throw new RepositoryError(Object.values(errors)[0] ?? "Invalid client.", "validation");
    }

    const current = await this.load();
    const existing = current.clients.find((client) => client.id === clientId);
    if (!existing) {
      throw new RepositoryError("This client no longer exists.", "not_found");
    }

    const { client, events } = applyClientUpdate(existing, input, this.deps);
    if (events.length === 0) return existing;

    this.commit({
      ...current,
      clients: current.clients.map((c) => (c.id === clientId ? client : c)),
      activity: [...events, ...current.activity],
    });
    return client;
  }

  async resetDemoData(): Promise<StudioSnapshot> {
    this.snapshot = this.seed();
    this.write(this.snapshot);
    return this.snapshot;
  }

  /** Saves first, then swaps the in-memory snapshot, so a failed save changes nothing. */
  private commit(next: StudioSnapshot) {
    this.write(next);
    this.snapshot = next;
  }

  private read(): StudioSnapshot | null {
    if (!this.storage) return null;
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      return isSnapshot(parsed) ? parsed : null;
    } catch {
      // Corrupt or unreadable data: fall back to a fresh demo workspace.
      return null;
    }
  }

  private write(snapshot: StudioSnapshot) {
    if (!this.storage) return;
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      throw new RepositoryError(
        "Changes could not be saved in this browser. Storage may be full or disabled.",
        "storage",
      );
    }
  }
}

function isSnapshot(value: unknown): value is StudioSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return ["clients", "projects", "tasks", "activity"].every((key) => Array.isArray(candidate[key]));
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
