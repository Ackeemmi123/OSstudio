import type { SupabaseClient } from "@supabase/supabase-js";
import { getBrowserStorage, LocalDemoRepository } from "./local-repository";
import type { StudioRepository } from "./repository";
import { SupabaseRepository } from "./supabase-repository";

/**
 * The places that decide where workspace data lives. The workspace gate
 * (src/components/providers/workspace-gate.tsx) picks one from the
 * configuration: Supabase behind sign-in, or the local demo when explicitly
 * configured or when no backend is set up. See docs/persistence.md.
 */
export function createLocalRepository(): StudioRepository {
  return new LocalDemoRepository({ storage: getBrowserStorage() });
}

export function createSupabaseRepository(client: SupabaseClient, studioId: string, user: { id: string; email: string | null }): StudioRepository {
  return new SupabaseRepository({ client, studioId, user });
}
