import { timingSafeEqual } from "node:crypto";
import { runMaintenance } from "@/server/maintenance/run";
import { sendDailyDigests } from "@/server/reminders/send";

// The morning e-mails, then a health check of every live site, and on the 1st the monthly reports (PageSpeed takes a while).
export const maxDuration = 300;

function authorized(header: string | null, secret: string): boolean {
  const given = Buffer.from(header ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * The morning e-mail of what is due (src/server/reminders), called by Vercel
 * Cron with `Authorization: Bearer $CRON_SECRET`. Off until CRON_SECRET (at
 * least 32 characters) and the mail service are set. Returns counts only.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || secret.length < 32) return Response.json({ error: "not_configured" }, { status: 503 });
  if (!authorized(request.headers.get("authorization"), secret)) return Response.json({ error: "unauthorized" }, { status: 401 });
  // Each part runs on its own, so a failure in one does not stop the other.
  const digests = await sendDailyDigests(new URL(request.url).origin).catch(() => ({ error: "failed" }));
  const maintenance = await runMaintenance().catch(() => ({ error: "failed" }));
  const failed = "error" in digests && "error" in maintenance;
  return Response.json({ digests, maintenance }, { status: failed ? 500 : 200 });
}
