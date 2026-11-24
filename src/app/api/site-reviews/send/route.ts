import { createClient } from "@supabase/supabase-js";
import { formMailConfig, serverSupabase } from "@/server/config";
import { sendWithResend } from "@/server/publish/forms";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

function error(status: number, message: string) {
  return Response.json({ error: message }, { status });
}

/**
 * Sends a build's private review link to the client, in the words the person
 * wrote and read in Studio OS. Only a member who may edit, only for an open
 * link of their own studio. Answers go to the person who sent it.
 *
 * application/json: studioId, buildId, to, subject, message.
 */
export async function POST(request: Request) {
  const supabase = serverSupabase();
  if (!supabase.ok) return error(503, supabase.reason);
  const mail = formMailConfig();
  if (!mail.ok) return error(503, "E-mail is not set up on the server, so the link cannot be sent from here. Copy it instead.");
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return error(401, "Sign in to send the link.");
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const { studioId, buildId, to, subject, message } = body ?? {};
  if (typeof studioId !== "string" || !UUID.test(studioId) || typeof buildId !== "string" || !UUID.test(buildId)) return error(400, "The request was not understood.");
  if (typeof to !== "string" || !EMAIL.test(to.trim()) || to.length > 200) return error(400, "Write the client's e-mail address.");
  if (typeof subject !== "string" || !subject.trim() || subject.length > 150) return error(400, "Write a subject of at most 150 characters.");
  if (typeof message !== "string" || !message.trim() || message.length > 4000) return error(400, "Write a message of at most 4,000 characters.");

  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const asUser = createClient(supabase.url, supabase.anonKey, { ...options, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: auth, error: authError } = await asUser.auth.getUser(token);
  if (authError || !auth.user) return error(401, "Your session has ended. Sign in again to continue.");
  const { data: membership } = await asUser.from("studio_members").select("role").eq("studio_id", studioId).eq("user_id", auth.user.id).maybeSingle();
  if (!membership) return error(404, "This link does not exist, or you do not have access to it.");
  if (membership.role === "viewer") return error(403, "Viewers cannot send links. Ask an owner for member access.");

  // Read as the person, so the database decides what they may see.
  const { data: build } = await asUser.from("site_builds").select("share_token, expires_at, revoked_at").eq("id", buildId).eq("studio_id", studioId).maybeSingle();
  if (!build) return error(404, "This link does not exist, or you do not have access to it.");
  if (build.revoked_at || Date.parse(String(build.expires_at)) <= Date.now()) return error(409, "This link is turned off or has expired. Build the site again for a new one.");

  const link = `${new URL(request.url).origin}/s/${build.share_token}/`;
  const text = message.includes(link) ? message.trim() : `${message.trim()}\n\n${link}`;
  const sent = await sendWithResend(mail.apiKey, mail.from, { to: to.trim(), replyTo: auth.user.email ?? undefined, subject: subject.trim(), text }).catch(() => false);
  if (!sent) return error(502, "The e-mail service did not accept the message. Try again, or copy the link instead.");
  return Response.json({ ok: true });
}
