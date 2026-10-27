import type { Client, ClientUpdateInput, NewClientInput, StudioSnapshot } from "@/lib/domain/types";
import type { RepositoryInfo, StudioRepository } from "./repository";

export type StudioState =
  | { status: "loading" }
  | { status: "ready"; snapshot: StudioSnapshot; info: RepositoryInfo }
  | { status: "error"; message: string };

const LOADING: StudioState = { status: "loading" };

/**
 * A small external store that exposes repository data to React via
 * `useSyncExternalStore`. Components read snapshots; writes go through the
 * repository and then refresh the snapshot.
 */
export class StudioStore {
  private state: StudioState = LOADING;
  private listeners = new Set<() => void>();
  private repository: StudioRepository | null = null;
  private loading: Promise<void> | null = null;

  constructor(private readonly createRepository: () => StudioRepository) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): StudioState => this.state;

  getServerSnapshot = (): StudioState => LOADING;

  load(): Promise<void> {
    this.loading ??= this.refresh().catch((error: unknown) => {
      this.loading = null;
      this.setState({ status: "error", message: errorMessage(error) });
    });
    return this.loading;
  }

  async createClient(input: NewClientInput): Promise<Client> {
    const client = await this.repo().createClient(input);
    await this.refresh();
    return client;
  }

  async updateClient(clientId: string, input: ClientUpdateInput): Promise<Client> {
    const client = await this.repo().updateClient(clientId, input);
    await this.refresh();
    return client;
  }

  async resetDemoData(): Promise<void> {
    await this.repo().resetDemoData();
    await this.refresh();
  }

  private repo(): StudioRepository {
    this.repository ??= this.createRepository();
    return this.repository;
  }

  private async refresh() {
    const repository = this.repo();
    const snapshot = await repository.load();
    this.setState({ status: "ready", snapshot, info: repository.info });
  }

  private setState(next: StudioState) {
    this.state = next;
    this.listeners.forEach((listener) => listener());
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}
