import { createClient } from "@supabase/supabase-js";
import type { MonthFacts } from "@/lib/maintenance/report";
import { formMailConfig, serverSupabase } from "@/server/config";
import { buildReport, type LiveSite } from "@/server/maintenance/run";
import { sendWithResend } from "@/server/publish/forms";
import { helsinkiDay } from "@/server/reminders/mail";

export const maxDuration = 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function error(status: number, message: string) {
  return Response.json({ error: message }, { status });
}

/**
 * This month's report for a live site, so far: shown to the person, or sent
 * now to the report's receiver when `send` is set (a member who may edit).
 *
 * application/json: studioId, projectId, send?.
 */
export async function POST(request: Request) {
  const supabase = serverSupabase();
  if (!supabase.ok) return error(503, supabase.reason);
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return error(401, "Sign in to see the report.");
  const body = (await request.json().catch(() => null)) as { studioId?: unknown; projectId?: unknown; send?: unknown } | null;
  const { studioId, projectId } = body ?? {};
  if (typeof studioId !== "string" || !UUID.test(studioId) || typeof projectId !== "string" || !UUID.test(projectId)) return error(400, "The request was not understood.");

  const asUser = createClient(supabase.url, supabase.anonKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: auth } = await asUser.auth.getUser(token);
  if (!auth?.user) return error(401, "Your session has ended. Sign in again to continue.");
  const { data: membership } = await asUser.from("studio_members").select("role").eq("studio_id", studioId).eq("user_id", auth.user.id).maybeSingle();
  if (!membership) return error(404, "You do not have access to this studio.");

  // Read as the person, so the database decides what they may see.
  const { data: live } = await asUser.from("site_publications").select("client_id, domain, deployment_url, spec_id").eq("studio_id", studioId).eq("project_id", projectId).eq("status", "live").maybeSingle();
  if (!live) return error(404, "This website is not live.");
  const [{ data: client }, { data: spec }, { data: studio }, { data: settings }] = await Promise.all([
    asUser.from("clients").select("name").eq("id", live.client_id).maybeSingle(),
    live.spec_id ? asUser.from("site_specs").select("locale:spec->locales->>default").eq("id", live.spec_id).maybeSingle() : Promise.resolve({ data: null }),
    asUser.from("studios").select("name, brand").eq("id", studioId).maybeSingle(),
    asUser.from("site_maintenance").select("report_enabled, report_to").eq("project_id", projectId).maybeSingle(),
  ]);
  const month = `${helsinkiDay(new Date()).slice(0, 7)}-01`;
  const { data: facts, error: factsError } = await asUser.rpc("site_month_facts_for", { p_project: projectId, p_month: month });
  if (factsError || !facts) return error(500, "The month's facts could not be read. Try again.");
  const brand = (studio?.brand ?? {}) as { name?: string; email?: string };
  const site: LiveSite = {
    studioId,
    clientId: String(live.client_id),
    projectId,
    client: String(client?.name ?? "The client"),
    domain: (live.domain as string | null) ?? null,
    url: live.domain ? `https://${live.domain}` : String(live.deployment_url),
    locale: (["sv", "fi", "en"].includes(String((spec as { locale?: string } | null)?.locale)) ? (spec as { locale: "sv" | "fi" | "en" }).locale : "sv"),
    studio: brand.name?.trim() || String(studio?.name ?? "The studio"),
    studioEmail: brand.email?.trim() || null,
    report: settings?.report_enabled ? String(settings.report_to) : null,
  };
  const report = await buildReport(site, month, facts as MonthFacts);
  if (body?.send !== true) return Response.json({ ...report, to: site.report });

  if (membership.role === "viewer") return error(403, "Viewers cannot send reports. Ask an owner for member access.");
  if (!site.report) return error(409, "Turn the report on and say who receives it first.");
  const mail = formMailConfig();
  if (!mail.ok) return error(503, "E-mail is not set up on the server.");
  const sent = await sendWithResend(mail.apiKey, mail.from, { to: site.report, replyTo: site.studioEmail ?? auth.user.email ?? undefined, ...report }).catch(() => false);
  if (!sent) return error(502, "The e-mail service did not accept the report. Try again.");
  return Response.json({ ...report, to: site.report, sent: true });
}
