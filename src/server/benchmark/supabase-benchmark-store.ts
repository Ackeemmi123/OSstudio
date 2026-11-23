import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseIntakeStore } from "@/server/agents/supabase-intake-store";
import type { BenchmarkStore } from "./runner";

/** Storage for the competitor comparison. Reads as the requesting person; the run is written by the runner. */
export class SupabaseBenchmarkStore extends SupabaseIntakeStore implements BenchmarkStore {
  constructor(
    private readonly user: SupabaseClient,
    runner: SupabaseClient,
    private readonly studio: string,
  ) {
    super(user, runner, studio, { id: "qa", taskType: "qa.benchmark" });
  }

  async loadProject(projectId: string) {
    const { data, error } = await this.user.from("projects").select("client_id").eq("studio_id", this.studio).eq("id", projectId).maybeSingle();
    if (error) throw error;
    return data ? { clientId: String(data.client_id) } : null;
  }

  async ourSite(projectId: string) {
    const live = await this.user
      .from("site_publications")
      .select("deployment_url, domain")
      .eq("studio_id", this.studio)
      .eq("project_id", projectId)
      .eq("status", "live")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (live.error) throw live.error;
    if (live.data) return { url: live.data.domain ? `https://${live.data.domain}/` : String(live.data.deployment_url), published: true };
    const build = await this.user
      .from("site_builds")
      .select("share_token")
      .eq("studio_id", this.studio)
      .eq("project_id", projectId)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (build.error) throw build.error;
    return build.data ? { url: `/s/${build.data.share_token}/`, published: false } : null;
  }
}
