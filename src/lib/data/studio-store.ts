import type { StudioSnapshot } from "@/lib/domain/types";
import { RepositoryError, type RepositoryInfo, type StudioRepository } from "./repository";

export type StudioState =
  | { status: "loading" }
  | { status: "ready"; snapshot: StudioSnapshot; info: RepositoryInfo }
  | { status: "error"; message: string };

const LOADING: StudioState = { status: "loading" };

/**
 * A small external store that exposes repository data to React via
 * `useSyncExternalStore`. Components read snapshots; every write goes
 * through the repository and then refreshes the snapshot.
 */
export class StudioStore {
  private state: StudioState = LOADING;
  private listeners = new Set<() => void>();
  private repository: StudioRepository | null = null;
  private loading: Promise<void> | null = null;

  constructor(
    private readonly createRepository: () => StudioRepository,
    /** Called when the sign-in session has ended, so the app can ask the person to sign in again. */
    private readonly onSessionExpired?: () => void,
  ) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): StudioState => this.state;

  getServerSnapshot = (): StudioState => LOADING;

  load(): Promise<void> {
    this.loading ??= this.refresh().catch((error: unknown) => {
      this.loading = null;
      this.notice(error);
      this.setState({ status: "error", message: errorMessage(error) });
    });
    return this.loading;
  }

  /**
   * Runs a write against the repository, then publishes the new snapshot.
   * After a conflict the snapshot is refreshed too, so the person sees what
   * changed before trying again.
   */
  async run<T>(write: (repository: StudioRepository) => Promise<T>): Promise<T> {
    let result: T;
    try {
      result = await write(this.repo());
    } catch (error) {
      this.notice(error);
      if (error instanceof RepositoryError && (error.code === "conflict" || error.code === "not_found")) {
        await this.refresh().catch(() => undefined);
      }
      throw error;
    }
    await this.refresh().catch((error: unknown) => {
      this.notice(error);
      throw error;
    });
    return result;
  }

  /** Reloads from the repository, for example after a background change. */
  reload(): Promise<void> {
    return this.refresh().catch((error: unknown) => {
      this.notice(error);
      throw error;
    });
  }

  private notice(error: unknown) {
    if (error instanceof RepositoryError && error.code === "session") this.onSessionExpired?.();
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
