/**
 * The monthly report a studio sends a client about their live website:
 * whether it stayed up, how quick and accessible it is on a phone, how many
 * form messages came, what changed, and how to ask for a change. Plain text,
 * in the website's language, signed by the studio. Pure.
 */

export interface MonthFacts {
  checks: number;
  checksOk: number;
  forms: number;
  formsBefore: number;
  published: { version: number; at: string }[];
}

export interface ReportInput {
  locale: "sv" | "fi" | "en";
  client: string;
  studio: string;
  siteUrl: string;
  /** The first day of the month reported on, YYYY-MM-01. */
  month: string;
  facts: MonthFacts;
  speed: { performance: number | null; accessibility: number | null; lcpSeconds: number | null } | null;
  quality: number | null;
  portalUrl: string | null;
}

const MONTHS: Record<ReportInput["locale"], string[]> = {
  sv: ["januari", "februari", "mars", "april", "maj", "juni", "juli", "augusti", "september", "oktober", "november", "december"],
  fi: ["tammikuu", "helmikuu", "maaliskuu", "huhtikuu", "toukokuu", "kesäkuu", "heinäkuu", "elokuu", "syyskuu", "lokakuu", "marraskuu", "joulukuu"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};

function monthName(month: string, locale: ReportInput["locale"]): string {
  const [year, m] = month.split("-").map(Number);
  return locale === "fi" ? `${MONTHS.fi[m - 1]} ${year}` : `${MONTHS[locale][m - 1]} ${year}`;
}

const pct = (ok: number, all: number) => (all ? Math.round((ok / all) * 1000) / 10 : null);

export function monthlyReport(input: ReportInput): { subject: string; text: string } {
  const { locale, facts } = input;
  const month = monthName(input.month, locale);
  const uptime = pct(facts.checksOk, facts.checks);
  const site = input.siteUrl.replace(/^https:\/\//, "").replace(/\/$/, "");
  if (locale === "fi") {
    const lines = [
      `Hei!`,
      "",
      `Tässä verkkosivustonne ${site} kuukausikatsaus: ${month}.`,
      "",
      uptime === null ? "Sivusto: tarkistuksia ei vielä ole tältä kuukaudelta." : uptime === 100 ? `Sivusto: toiminnassa koko kuukauden (${facts.checks} päivittäistä tarkistusta).` : `Sivusto: toiminnassa ${uptime} % tarkistuksista (${facts.checksOk}/${facts.checks}). Korjasimme havaitut ongelmat.`,
      input.speed?.performance != null ? `Nopeus puhelimella: ${input.speed.performance}/100${input.speed.lcpSeconds != null ? `, pääsisältö näkyy ${input.speed.lcpSeconds.toFixed(1).replace(".", ",")} sekunnissa` : ""}.` : "",
      input.speed?.accessibility != null ? `Saavutettavuus: ${input.speed.accessibility}/100.` : "",
      input.quality != null ? `Laatutarkistuksemme: ${input.quality}/100.` : "",
      `Lomakeviestit: ${facts.forms} (edellisessä kuussa ${facts.formsBefore}).`,
      facts.published.length ? `Muutokset: julkaisimme ${facts.published.length === 1 ? "uuden version" : `${facts.published.length} uutta versiota`}.` : "Muutokset: ei muutoksia tässä kuussa.",
      "",
      input.portalUrl ? `Haluatteko muuttaa jotain? Kertokaa siitä sivullanne ${input.portalUrl} tai vastatkaa tähän viestiin.` : "Haluatteko muuttaa jotain? Vastatkaa tähän viestiin.",
      "",
      `Terveisin\n${input.studio}`,
    ];
    return { subject: `${input.client}: verkkosivuston kuukausikatsaus, ${month}`, text: lines.filter((l, i, all) => l || all[i - 1]).join("\n") };
  }
  if (locale === "en") {
    const lines = [
      "Hello!",
      "",
      `Here is the monthly report for your website ${site}: ${month}.`,
      "",
      uptime === null ? "Website: no checks for this month yet." : uptime === 100 ? `Website: up all month (${facts.checks} daily checks).` : `Website: up in ${uptime}% of checks (${facts.checksOk}/${facts.checks}). We fixed what we found.`,
      input.speed?.performance != null ? `Speed on a phone: ${input.speed.performance}/100${input.speed.lcpSeconds != null ? `, main content visible in ${input.speed.lcpSeconds.toFixed(1)} seconds` : ""}.` : "",
      input.speed?.accessibility != null ? `Accessibility: ${input.speed.accessibility}/100.` : "",
      input.quality != null ? `Our quality check: ${input.quality}/100.` : "",
      `Form messages: ${facts.forms} (the month before: ${facts.formsBefore}).`,
      facts.published.length ? `Changes: we published ${facts.published.length === 1 ? "a new version" : `${facts.published.length} new versions`}.` : "Changes: none this month.",
      "",
      input.portalUrl ? `Want something changed? Tell us on your page ${input.portalUrl} or reply to this e-mail.` : "Want something changed? Reply to this e-mail.",
      "",
      `Best regards,\n${input.studio}`,
    ];
    return { subject: `${input.client}: your website's monthly report, ${month}`, text: lines.filter((l, i, all) => l || all[i - 1]).join("\n") };
  }
  const lines = [
    "Hej!",
    "",
    `Här är månadsrapporten för er webbplats ${site}: ${month}.`,
    "",
    uptime === null ? "Webbplatsen: inga kontroller ännu den här månaden." : uptime === 100 ? `Webbplatsen: uppe hela månaden (${facts.checks} dagliga kontroller).` : `Webbplatsen: uppe vid ${String(uptime).replace(".", ",")} % av kontrollerna (${facts.checksOk}/${facts.checks}). Vi har åtgärdat det vi hittade.`,
    input.speed?.performance != null ? `Hastighet på mobil: ${input.speed.performance}/100${input.speed.lcpSeconds != null ? `, huvudinnehållet syns efter ${input.speed.lcpSeconds.toFixed(1).replace(".", ",")} sekunder` : ""}.` : "",
    input.speed?.accessibility != null ? `Tillgänglighet: ${input.speed.accessibility}/100.` : "",
    input.quality != null ? `Vår kvalitetskontroll: ${input.quality}/100.` : "",
    `Meddelanden via formulären: ${facts.forms} (månaden innan: ${facts.formsBefore}).`,
    facts.published.length ? `Ändringar: vi publicerade ${facts.published.length === 1 ? "en ny version" : `${facts.published.length} nya versioner`}.` : "Ändringar: inga den här månaden.",
    "",
    input.portalUrl ? `Vill ni ändra något? Berätta på er sida ${input.portalUrl} eller svara på det här mejlet.` : "Vill ni ändra något? Svara på det här mejlet.",
    "",
    `Hälsningar\n${input.studio}`,
  ];
  return { subject: `${input.client}: månadsrapport för webbplatsen, ${month}`, text: lines.filter((l, i, all) => l || all[i - 1]).join("\n") };
}

/** The month before the given day in Helsinki, as YYYY-MM-01. */
export function previousMonth(day: string): string {
  const [year, month] = day.split("-").map(Number);
  const y = month === 1 ? year - 1 : year;
  const m = month === 1 ? 12 : month - 1;
  return `${y}-${String(m).padStart(2, "0")}-01`;
}
