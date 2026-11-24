import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { siteQuality } from "@/lib/quality/site-quality";
import { monthlyReport, previousMonth, type MonthFacts } from "@/lib/maintenance/report";
import { measureSpeed } from "@/server/benchmark/pagespeed";
import { formMailConfig, serverSupabase } from "@/server/config";
import { sendWithResend } from "@/server/publish/forms";
import { helsinkiDay } from "@/server/reminders/mail";
import { checkSite } from "./health";

export interface LiveSite {
  studioId: string;
  clientId: string;
  projectId: string;
  client: string;
  domain: string | null;
  url: string;
  locale: "sv" | "fi" | "en";
  studio: string;
  studioEmail: string | null;
  /** Who receives the monthly report; null while it is off. */
  report: string | null;
}

function setup(): { db: SupabaseClient; mail: { apiKey: string; from: string } | null } | null {
  const supabase = serverSupabase();
  if (!supabase.ok) return null;
  const mail = formMailConfig();
  return { db: createClient(supabase.url, supabase.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } }), mail: mail.ok ? { apiKey: mail.apiKey, from: mail.from } : null };
}

/** A site's pages as a visitor finds them: the home page and up to ten pages it links to on the same site. */
async function livePages(url: string): Promise<{ path: string; html: string }[]> {
  const base = new URL(url);
  const read = async (path: string) => {
    try {
      const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(10_000), headers: { "user-agent": "Studio OS monthly report" } });
      return response.ok && (response.headers.get("content-type") ?? "").includes("text/html") ? await response.text() : null;
    } catch {
      return null;
    }
  };
  const home = await read("/");
  if (!home) return [];
  const links = [...new Set([...home.matchAll(/href="(\/[a-z0-9-/]*)"/gi)].map((m) => m[1]).filter((p) => p !== "/" && !/\.(pdf|jpg|png|webp|css|js)$/i.test(p)))].slice(0, 10);
  const pages = [{ path: "index.html", html: home }];
  for (const link of links) {
    const html = await read(link);
    if (html) pages.push({ path: `${link.replace(/^\/|\/$/g, "")}/index.html`, html });
  }
  return pages;
}

/** The report for one site and month, with what can be measured now. */
export async function buildReport(site: LiveSite, month: string, facts: MonthFacts) {
  const [speed, pages] = await Promise.all([measureSpeed(site.url).then((r) => r.speed).catch(() => null), livePages(site.url)]);
  const quality = pages.length ? siteQuality({ pages }).score : null;
  return monthlyReport({ locale: site.locale, client: site.client, studio: site.studio, siteUrl: site.url, month, facts, speed, quality, portalUrl: null });
}

/**
 * Each morning: checks every live site and tells the studio's members at
 * once about a problem (one e-mail per site and day). On the 1st, sends each
 * site whose report is on its report for the month before (once). Returns
 * counts only.
 */
export async function runMaintenance(now = new Date()): Promise<{ checked: number; problems: number; reports: number } | { error: string }> {
  const ready = setup();
  if (!ready) return { error: "not_configured" };
  const { db, mail } = ready;
  const { data, error } = await db.rpc("live_sites");
  if (error) throw error;
  const sites = (data ?? []) as LiveSite[];
  const day = helsinkiDay(now);
  let problems = 0;
  for (const site of sites) {
    const health = await checkSite(site);
    await db.rpc("record_site_health", { p_check: { studioId: site.studioId, projectId: site.projectId, ok: health.ok, detail: health } });
    if (health.ok || !mail) continue;
    problems += 1;
    const { data: members } = await db.rpc("studio_members_to_alert", { p_studio: site.studioId });
    for (const member of (members ?? []) as { userId: string; email: string }[]) {
      const { data: first } = await db.rpc("claim_email", { p_kind: "client_event", p_user: member.userId, p_ref: `health:${site.projectId}:${day}` });
      if (first !== true) continue;
      await sendWithResend(mail.apiKey, mail.from, {
        to: member.email,
        subject: `${site.client}'s website needs a look`,
        text: [`The morning check of ${site.url} found:`, "", ...health.problems.map((p) => `- ${p}`), "", "Look at it under Delivery in Studio OS. You get this once a day while it lasts.", "", "Turn these e-mails off under Settings › E-mail."].join("\n"),
      }).catch(() => false);
    }
  }

  let reports = 0;
  if (day.endsWith("-01") && mail) {
    const month = previousMonth(day);
    for (const site of sites.filter((s) => s.report)) {
      const { data: facts } = await db.rpc("site_month_facts", { p_project: site.projectId, p_month: month });
      if (!facts) continue;
      const { data: first } = await db.rpc("claim_site_report", { p_project: site.projectId, p_month: month });
      if (first !== true) continue;
      const report = await buildReport(site, month, facts as MonthFacts);
      if (await sendWithResend(mail.apiKey, mail.from, { to: site.report!, replyTo: site.studioEmail ?? undefined, ...report }).catch(() => false)) reports += 1;
    }
  }
  return { checked: sites.length, problems, reports };
}
