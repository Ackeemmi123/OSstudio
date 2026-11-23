import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SITE_SPEC_COLUMNS, toSiteSpecRecord } from "@/lib/data/supabase-rows";
import { SupabaseIntakeStore } from "./supabase-intake-store";
import type { WarmTextStore } from "./warm-text-runner";

/**
 * Storage for the warmer-text pass. The spec is read as the requesting
 * person, so row-level security decides whether they may see it; the run is
 * written by the runner, like every agent run.
 */
export class SupabaseWarmTextStore extends SupabaseIntakeStore implements WarmTextStore {
  constructor(
    private readonly user: SupabaseClient,
    runner: SupabaseClient,
    private readonly studio: string,
  ) {
    super(user, runner, studio, { id: "design", taskType: "design.warm_text" });
  }

  async loadSpec(specId: string) {
    const { data, error } = await this.user.from("site_specs").select(SITE_SPEC_COLUMNS).eq("studio_id", this.studio).eq("id", specId).maybeSingle();
    if (error) throw error;
    return data ? toSiteSpecRecord(data as unknown as Record<string, unknown>) : null;
  }
}
