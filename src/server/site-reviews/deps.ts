import "server-only";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { notifyReviewEvent } from "@/server/reminders/send";
import { serverSupabase } from "@/server/config";
import type { ReviewDeps, ReviewState } from "./review";

/**
 * The review functions through the service role, which only the server holds.
 * With `origin` (where Studio OS is served), members are e-mailed after the
 * response when the client comments, approves or answers.
 */
export function reviewDeps(origin?: string): ReviewDeps | null {
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
    notify: origin
      ? (token, event) => {
          // One e-mail per event and person: an approval or answers happen once per link; a comment by its words.
          const link = createHash("sha256").update(token).digest("hex").slice(0, 24);
          const ref = event.kind === "comment" ? `comment:${createHash("sha256").update(`${token}\n${event.author}\n${event.body}`).digest("hex").slice(0, 32)}` : `${event.kind}:${link}`;
          after(() => notifyReviewEvent(token, event, ref, origin));
        }
      : undefined,
  };
}
