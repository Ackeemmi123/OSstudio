import { timingSafeEqual } from "node:crypto";
import { sendDailyDigests } from "@/server/reminders/send";

export const maxDuration = 60;

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
  try {
    const result = await sendDailyDigests(new URL(request.url).origin);
    return Response.json(result, { status: "error" in result ? 503 : 200 });
  } catch {
    return Response.json({ error: "failed" }, { status: 500 });
  }
}
