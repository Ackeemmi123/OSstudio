import type {
  Client,
  ClientUpdateInput,
  NewClientInput,
  StudioSnapshot,
} from "@/lib/domain/types";

/**
 * Data access boundary for the UI. The first implementation stores data in
 * the browser; a Supabase-backed implementation can replace it without
 * changing the components that call these methods.
 */
export interface StudioRepository {
  readonly info: RepositoryInfo;
  load(): Promise<StudioSnapshot>;
  createClient(input: NewClientInput): Promise<Client>;
  updateClient(clientId: string, input: ClientUpdateInput): Promise<Client>;
  /** Restores the demonstration workspace. Only meaningful for demo repositories. */
  resetDemoData(): Promise<StudioSnapshot>;
}

export interface RepositoryInfo {
  kind: "local-demo";
  /** Where data actually lives, so the UI never over-promises persistence. */
  persistence: "browser" | "memory";
}

export class RepositoryError extends Error {
  constructor(
    message: string,
    readonly code: "not_found" | "validation" | "storage",
  ) {
    super(message);
    this.name = "RepositoryError";
  }
}
