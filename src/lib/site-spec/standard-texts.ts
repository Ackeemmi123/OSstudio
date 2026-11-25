/**
 * The studio's standard wording for what every small site's contact form
 * and privacy page need: the consent line, the send button, what happens
 * after sending, and a short privacy notice. Filled in with the client's name
 * and e-mail, so a first draft does not start with five texts to write. They
 * say only what holds for a site Studio OS builds (a form that e-mails the
 * client, no tracking unless analytics is switched on), and the client still
 * reads and approves them: a warning says so until someone edits them.
 */
import type { SiteLocale } from "./catalog";
import type { LocalizedText, SiteSpec, SiteSpecPage } from "./schema";

export interface StandardTexts {
  consent: LocalizedText;
  submit: LocalizedText;
  reply: LocalizedText;
  privacy: LocalizedText;
}

const SUPERVISOR: Record<SiteLocale, string> = { sv: "Dataombudsmannens byrå", fi: "tietosuojavaltuutetun toimiston", en: "the Data Protection Ombudsman" };

function privacy(locale: SiteLocale, name: string, email: string, tracking: boolean): string {
  if (locale === "sv") {
    return [
      `Personuppgiftsansvarig är ${name}. Du når oss på ${email}.`,
      "Vi sparar de uppgifter du själv skickar via formuläret på webbplatsen, till exempel namn, e-post och ditt meddelande, för att kunna svara dig. Uppgifterna kommer till oss per e-post och används inte till något annat.",
      "Vi sparar meddelandet så länge det behövs för att sköta ärendet och raderar det sedan.",
      `Du har rätt att få veta vilka uppgifter vi har om dig och att få dem rättade eller raderade. Skriv till ${email}. Du kan också vända dig till ${SUPERVISOR.sv}.`,
      ...(tracking ? [] : ["Webbplatsen använder inga kakor för spårning eller marknadsföring."]),
    ].join("\n\n");
  }
  if (locale === "fi") {
    return [
      `Rekisterinpitäjä on ${name}. Tavoitat meidät osoitteesta ${email}.`,
      "Tallennamme tiedot, jotka itse lähetät verkkosivuston lomakkeella, kuten nimesi, sähköpostiosoitteesi ja viestisi, jotta voimme vastata sinulle. Tiedot tulevat meille sähköpostilla, eikä niitä käytetä muuhun.",
      "Säilytämme viestin niin kauan kuin asian hoitaminen vaatii ja poistamme sen sen jälkeen.",
      `Sinulla on oikeus tietää, mitä tietoja meillä on sinusta, ja pyytää niiden korjaamista tai poistamista. Kirjoita osoitteeseen ${email}. Voit myös kääntyä ${SUPERVISOR.fi} puoleen.`,
      ...(tracking ? [] : ["Verkkosivusto ei käytä evästeitä seurantaan tai markkinointiin."]),
    ].join("\n\n");
  }
  return [
    `${name} is responsible for your personal data. You can reach us at ${email}.`,
    "We keep the details you send through the form on this website, such as your name, e-mail and message, so that we can answer you. They reach us by e-mail and are not used for anything else.",
    "We keep your message for as long as it takes to deal with it, and then delete it.",
    `You have the right to know what details we hold about you and to have them corrected or deleted. Write to ${email}. You can also contact ${SUPERVISOR.en}.`,
    ...(tracking ? [] : ["This website uses no cookies for tracking or marketing."]),
  ].join("\n\n");
}

const per = (locales: readonly SiteLocale[], text: (l: SiteLocale) => string): LocalizedText => Object.fromEntries(locales.map((l) => [l, text(l)]));

/** The standard texts in the site's languages, or null when the client has no e-mail to name. */
export function standardTexts(client: { name: string; email: string | null }, locales: readonly SiteLocale[], tracking = false): StandardTexts | null {
  const email = client.email?.trim();
  const name = client.name.replace(/\s*\(test\)\s*$/i, "").trim() || client.name.trim();
  if (!email || !name) return null;
  return {
    consent: per(locales, (l) =>
      l === "sv" ? "Jag godkänner att mina uppgifter används för att svara på mitt meddelande." : l === "fi" ? "Hyväksyn, että tietojani käytetään viestiini vastaamiseen." : "I agree that my details are used to answer my message.",
    ),
    submit: per(locales, (l) => (l === "sv" ? "Skicka" : l === "fi" ? "Lähetä" : "Send")),
    reply: per(locales, (l) =>
      l === "sv" ? `Meddelandet går till ${email}. Vi svarar så snart vi kan.` : l === "fi" ? `Viesti menee osoitteeseen ${email}. Vastaamme mahdollisimman pian.` : `Your message goes to ${email}. We will answer as soon as we can.`,
    ),
    privacy: per(locales, (l) => privacy(l, name, email, tracking)),
  };
}

/** Whether the spec switches on anything that tracks visitors. */
export function tracks(spec: Pick<SiteSpec, "integrations">): boolean {
  return spec.integrations.analytics.enabled;
}

/** True where a text is still exactly the standard one, so nobody has read and adjusted it. */
export function isStandardText(text: LocalizedText | undefined, standard: LocalizedText): boolean {
  if (!text) return false;
  return Object.entries(standard).some(([locale, value]) => value && text[locale as SiteLocale]?.trim() === value);
}

/** A sentence only the standard privacy text has, per language: how a check knows it is still the studio's wording. */
export const STANDARD_PRIVACY_MARK: Record<SiteLocale, string> = {
  sv: "Vi sparar meddelandet så länge det behövs för att sköta ärendet och raderar det sedan.",
  fi: "Säilytämme viestin niin kauan kuin asian hoitaminen vaatii ja poistamme sen sen jälkeen.",
  en: "We keep your message for as long as it takes to deal with it, and then delete it.",
};

/** A privacy page's id or address, in any of the site's languages. */
export const PRIVACY_ADDRESS = /(integritet|privacy|tietosuoja|dataskydd)/;

/**
 * Whether a page is the privacy page: the template calls it "privacy", while an AI draft may name
 * it after its address ("integritet", "tietosuoja"). Never the home page.
 */
export function isPrivacyPage(page: SiteSpecPage, index: number): boolean {
  if (index === 0) return false;
  return PRIVACY_ADDRESS.test(page.id) || Object.values(page.slug).some((slug) => Boolean(slug && PRIVACY_ADDRESS.test(slug)));
}

/** The site's privacy page, if it has one. */
export function findPrivacyPage(spec: Pick<SiteSpec, "pages">): SiteSpecPage | undefined {
  return spec.pages.find((page, index) => isPrivacyPage(page, index));
}
