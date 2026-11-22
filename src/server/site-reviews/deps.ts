import "server-only";
import { createClient } from "@supabase/supabase-js";
import { serverSupabase } from "@/server/config";
import type { ReviewDeps, ReviewState } from "./review";

/** The review functions through the service role, which only the server holds. */
export function reviewDeps(): ReviewDeps | null {
  const supabase = serverSupabase();
  if (!supabase.ok) return null;
  const db = createClient(supabase.url, supabase.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return {
    state: async (token) => {
      const { data, error } = await db.rpc("site_review_state", { p_token: token });
      if (error) throw error;
      return (data as ReviewState | null) ?? null;
    },
    comment: async (token, comment) => db.rpc("record_review_comment", { p_token: token, p_comment: comment }),
    approve: async (token, approval) => db.rpc("record_site_approval", { p_token: token, p_approval: approval }),
    answer: async (token, answers) => db.rpc("record_review_answers", { p_token: token, p_answers: answers }),
  };
}
