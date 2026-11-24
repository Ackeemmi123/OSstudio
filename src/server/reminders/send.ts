import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { formMailConfig, serverSupabase } from "@/server/config";
import { sendWithResend } from "@/server/publish/forms";
import { digestMail, helsinkiDay, reviewEventMail, type DigestEntry, type ReviewEvent, type ReviewEventInfo } from "./mail";

type Ready = { db: SupabaseClient; apiKey: string; from: string };

/** The database as the service role and the mail service, or why reminders are off. */
function ready(): Ready | { reason: string } {
  const supabase = serverSupabase();
  if (!supabase.ok) return { reason: "not_configured" };
  const mail = formMailConfig();
  if (!mail.ok) return { reason: "mail_not_configured" };
  return { db: createClient(supabase.url, supabase.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } }), apiKey: mail.apiKey, from: mail.from };
}

/** Claims the e-mail in the log first, so a repeated run never sends it twice. */
async function claim(db: SupabaseClient, kind: "daily" | "client_event", userId: string, ref: string): Promise<boolean> {
  const { data, error } = await db.rpc("claim_email", { p_kind: kind, p_user: userId, p_ref: ref });
  if (error) throw error;
  return data === true;
}

/** Sends each member their morning e-mail for today in Helsinki. Returns counts only. */
export async function sendDailyDigests(origin: string, now = new Date()): Promise<{ sent: number; skipped: number; failed: number } | { error: string }> {
  const setup = ready();
  if ("reason" in setup) return { error: setup.reason };
  const day = helsinkiDay(now);
  const { data, error } = await setup.db.rpc("daily_digest", { p_day: day });
  if (error) throw error;
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const entry of (data ?? []) as DigestEntry[]) {
    if (!(await claim(setup.db, "daily", entry.userId, day))) {
      skipped += 1;
      continue;
    }
    const mail = digestMail(entry, day, origin);
    if (await sendWithResend(setup.apiKey, setup.from, { to: entry.email, ...mail }).catch(() => false)) sent += 1;
    else failed += 1;
  }
  return { sent, skipped, failed };
}

/**
 * Tells the studio's members, at once, that a client commented, approved or
 * answered on a review link. Never throws: the client's action is already
 * saved, and a mail that does not go out must not turn it into an error.
 */
export async function notifyReviewEvent(token: string, event: ReviewEvent, eventRef: string, origin: string): Promise<void> {
  try {
    const setup = ready();
    if ("reason" in setup) return;
    const { data, error } = await setup.db.rpc("review_event_recipients", { p_token: token });
    if (error || !data) return;
    const found = data as ReviewEventInfo & { recipients: { userId: string; email: string }[] };
    const mail = reviewEventMail(event, found, origin);
    for (const recipient of found.recipients) {
      if (!(await claim(setup.db, "client_event", recipient.userId, eventRef))) continue;
      await sendWithResend(setup.apiKey, setup.from, { to: recipient.email, ...mail }).catch(() => false);
    }
  } catch {
    // Logged nowhere on purpose: the error could carry the client's words.
  }
}
