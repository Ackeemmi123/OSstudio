/**
 * A written offer for a client's website: the scope, the prices and what is
 * included, in the client's language, ready to print or save as a PDF. The
 * prices and terms start from Axivo's published ones (axivo.fi/hinnat), and
 * the person adjusts them for each client. Pure: nothing is stored or sent.
 */

export type OfferLanguage = "fi" | "sv" | "en";

export interface OfferLine {
  label: string;
  /** Euros without VAT. */
  price: number;
  unit: "once" | "month" | "year";
}

export interface OfferInput {
  language: OfferLanguage;
  /** YYYY-MM-DD. */
  date: string;
  validDays: number;
  client: { name: string; contact: string | null; email: string | null };
  project: string;
  /** What is being made, in a line or two. */
  scope: string;
  /** The website, once, without VAT. */
  website: number;
  upkeep: { monthly: number; yearly: number; chosen: "month" | "year" | "none" };
  /** One-off lines beyond the website, such as a second language. */
  extras: OfferLine[];
  vatPercent: number;
  intro: string;
  from: { studio: string; legalName: string; businessId: string; person: string; email: string; phone: string; website: string };
}

export interface Offer extends OfferInput {
  validUntil: string;
  lines: OfferLine[];
  /** Once, without VAT: the website and the extras. */
  onceTotal: number;
  onceVat: number;
  /** The upkeep the client chose, if any. */
  recurring: OfferLine | null;
}

interface Words {
  title: string;
  to: string;
  from: string;
  date: string;
  valid: string;
  project: string;
  scope: string;
  item: string;
  price: string;
  website: string;
  upkeepMonth: string;
  upkeepYear: string;
  units: Record<OfferLine["unit"], string>;
  onceTotal: string;
  vat: (percent: string) => string;
  withVat: string;
  then: string;
  includedSite: string;
  site: readonly string[];
  includedUpkeep: string;
  upkeep: readonly string[];
  upkeepTerms: (monthly: string, yearly: string) => string;
  stepsTitle: string;
  steps: readonly string[];
  yours: string;
  own: readonly string[];
  accept: string;
  acceptText: string;
  signature: string;
  validText: (date: string) => string;
  /** The payment plan in the customer agreement (Del B 3, Del A 6.2). */
  payment: string;
  paymentTitle: string;
  contact: string;
  businessId: string;
}

export const OFFER_WORDS: Record<OfferLanguage, Words> = {
  fi: {
    title: "Tarjous",
    to: "Vastaanottaja",
    from: "Lähettäjä",
    date: "Päivämäärä",
    valid: "Voimassa",
    project: "Kohde",
    scope: "Laajuus",
    item: "Erittely",
    price: "Hinta (alv 0 %)",
    website: "Verkkosivusto",
    upkeepMonth: "Ylläpito",
    upkeepYear: "Ylläpito, vuosimaksu",
    units: { once: "", month: "/kk", year: "/v" },
    onceTotal: "Kertamaksu yhteensä (alv 0 %)",
    vat: (percent) => `Arvonlisävero ${percent} %`,
    withVat: "Kertamaksu sis. alv",
    then: "Jatkuva maksu",
    includedSite: "Verkkosivustoon sisältyy",
    site: [
      "Toimialallenne tehty ulkoasu, sovitettuna teidän kuviinne ja tyyliinne",
      "Tekstit yhdessä kanssanne, teidän materiaalinne pohjalta",
      "Toimii puhelimella ja tietokoneella",
      "Yhteydenottolomake ja tietosuojaseloste",
      "Hakukoneiden perusasiat: otsikot, sivukuvaukset ja rakenne",
      "Laaduntarkistus ennen kuin näette mitään",
      "Yksityinen esikatselulinkki: kommentoitte ja hyväksytte ennen julkaisua",
      "Enintään viisi muutosta ennen julkaisua",
      "Julkaisu omassa verkkotunnuksessanne",
    ],
    includedUpkeep: "Ylläpitoon sisältyy",
    upkeep: ["Sivujen ja varmenteen ylläpito", "Päivittäinen tarkistus ja hälytys, jos jokin on vialla", "Kuukausiraportti", "Tekniset päivitykset", "Pienet muutokset enintään 30 minuuttia kuukaudessa"],
    upkeepTerms: (monthly, yearly) => `Ylläpito ${monthly}/kk tai ${yearly}/v (alv 0 %). Vähintään 12 kuukautta, sen jälkeen irtisanomisaika yksi kuukausi. Verkkotunnus laskutetaan omakustannushintaan. Suuremmat muutokset 75 €/h (alv 0 %) tai tarjouksen mukaan.`,
    stepsTitle: "Näin etenemme",
    steps: ["Aloituskeskustelu ja oma portaali", "Luonnos teidän materiaalistanne", "Laaduntarkistus ennen kuin näette mitään", "Yksityinen esikatselulinkki ja hyväksyntä", "Julkaisu omassa verkkotunnuksessanne"],
    yours: "Teidän omanne",
    own: ["Verkkotunnus on teidän nimissänne.", "Jos yhteistyö päättyy, saatte sivuston tiedostot ja sisällön."],
    accept: "Hyväksyntä",
    acceptText: "Hyväksyn tarjouksen.",
    signature: "Nimi ja päivämäärä",
    validText: (date) => `Tarjous on voimassa ${date} asti. Lopulliset ehdot sovitaan sopimuksessa.`,
    paymentTitle: "Maksuehdot",
    payment: "50 % sopimuksen allekirjoituksen yhteydessä ja 50 %, kun sivusto on julkaistu. Maksuaika 14 päivää laskun päiväyksestä.",
    contact: "Kysyttävää? Vastaamme yhden arkipäivän sisällä.",
    businessId: "Y-tunnus",
  },
  sv: {
    title: "Offert",
    to: "Till",
    from: "Från",
    date: "Datum",
    valid: "Giltig till",
    project: "Projekt",
    scope: "Omfattning",
    item: "Specifikation",
    price: "Pris (moms 0 %)",
    website: "Webbplats",
    upkeepMonth: "Underhåll",
    upkeepYear: "Underhåll, årsavgift",
    units: { once: "", month: "/mån", year: "/år" },
    onceTotal: "Engångsavgift totalt (moms 0 %)",
    vat: (percent) => `Moms ${percent} %`,
    withVat: "Engångsavgift inkl. moms",
    then: "Löpande avgift",
    includedSite: "Webbplatsen innehåller",
    site: [
      "En design gjord för er bransch, anpassad till era bilder och er stil",
      "Texter tillsammans med er, utifrån ert material",
      "Fungerar i mobilen och på datorn",
      "Kontaktformulär och dataskyddsbeskrivning",
      "Sökoptimering i grunden: rubriker, sidbeskrivningar och struktur",
      "Kvalitetskontroll innan ni ser något",
      "Privat granskningslänk: ni kommenterar och godkänner före publicering",
      "Upp till fem ändringar före publicering",
      "Publicering på er egen domän",
    ],
    includedUpkeep: "Underhållet innehåller",
    upkeep: ["Driften av sidan och certifikatet", "Daglig kontroll med larm om något är fel", "Månadsrapport", "Tekniska uppdateringar", "Små ändringar upp till 30 minuter i månaden"],
    upkeepTerms: (monthly, yearly) => `Underhåll ${monthly}/mån eller ${yearly}/år (moms 0 %). Minst 12 månader, därefter en månads uppsägningstid. Domänen faktureras till självkostnadspris. Större ändringar 75 €/h (moms 0 %) eller enligt offert.`,
    stepsTitle: "Så går det till",
    steps: ["Inledande samtal och egen portal", "Utkast utifrån ert material", "Kvalitetskontroll innan ni ser något", "Privat granskningslänk och godkännande", "Publicering på er egen domän"],
    yours: "Det är ert",
    own: ["Domänen står i ert namn.", "Om samarbetet upphör får ni webbplatsens filer och innehåll."],
    accept: "Godkännande",
    acceptText: "Jag godkänner offerten.",
    signature: "Namn och datum",
    validText: (date) => `Offerten gäller till ${date}. De slutliga villkoren avtalas i avtalet.`,
    paymentTitle: "Betalningsvillkor",
    payment: "50 % när avtalet undertecknas och 50 % när webbplatsen har publicerats. Betalningstid 14 dagar från fakturadatum.",
    contact: "Frågor? Vi svarar inom en arbetsdag.",
    businessId: "FO-nummer",
  },
  en: {
    title: "Offer",
    to: "To",
    from: "From",
    date: "Date",
    valid: "Valid until",
    project: "Project",
    scope: "Scope",
    item: "Item",
    price: "Price (VAT 0%)",
    website: "Website",
    upkeepMonth: "Maintenance",
    upkeepYear: "Maintenance, yearly",
    units: { once: "", month: "/month", year: "/year" },
    onceTotal: "One-off total (VAT 0%)",
    vat: (percent) => `VAT ${percent}%`,
    withVat: "One-off total incl. VAT",
    then: "Recurring",
    includedSite: "The website includes",
    site: [
      "A design made for your industry, fitted to your photos and style",
      "Texts written with you, from your own material",
      "Works on a phone and a computer",
      "A contact form and a privacy notice",
      "Search basics: titles, page descriptions and structure",
      "A quality check before you see anything",
      "A private review link: you comment and approve before launch",
      "Up to five changes before launch",
      "Launch on your own domain",
    ],
    includedUpkeep: "Maintenance includes",
    upkeep: ["Hosting and the certificate", "A daily check, with an alert if something is wrong", "A monthly report", "Technical updates", "Small changes of up to 30 minutes a month"],
    upkeepTerms: (monthly, yearly) => `Maintenance ${monthly}/month or ${yearly}/year (VAT 0%). At least 12 months, then one month's notice. The domain is invoiced at cost. Larger changes €75 an hour (VAT 0%) or quoted.`,
    stepsTitle: "How it goes",
    steps: ["First conversation and your own portal", "A draft from your material", "A quality check before you see anything", "A private review link and your approval", "Launch on your own domain"],
    yours: "Yours to keep",
    own: ["The domain is in your name.", "If we stop working together, you get the site's files and content."],
    accept: "Acceptance",
    acceptText: "I accept this offer.",
    signature: "Name and date",
    validText: (date) => `This offer is valid until ${date}. The final terms are set in the agreement.`,
    paymentTitle: "Payment",
    payment: "50% when the agreement is signed and 50% when the website is live. Payment within 14 days of the invoice date.",
    contact: "Questions? We answer within one working day.",
    businessId: "Business ID",
  },
};

/** Axivo's published prices (axivo.fi/hinnat), as a starting point for each offer. */
export const STANDARD_PRICES = { website: 1000, monthly: 49, yearly: 490 } as const;

/** Finland's general VAT rate, which the person can change on the offer. */
export const STANDARD_VAT_PERCENT = 25.5;

const LOCALE: Record<OfferLanguage, string> = { fi: "fi-FI", sv: "sv-FI", en: "en-GB" };

/** "1 000 €" in Finnish and Swedish, "€1,000" in English; cents only when there are any. */
export function euros(value: number, language: OfferLanguage): string {
  const rounded = Math.round(value * 100) / 100;
  const digits = Number.isInteger(rounded) ? 0 : 2;
  return new Intl.NumberFormat(LOCALE[language], { style: "currency", currency: "EUR", minimumFractionDigits: digits, maximumFractionDigits: 2 })
    .format(rounded)
    .replace(/[  ]/g, " ");
}

/** A percentage as the language writes it: "25,5" or "25.5". */
export function percent(value: number, language: OfferLanguage): string {
  return new Intl.NumberFormat(LOCALE[language], { maximumFractionDigits: 2 }).format(value);
}

export function offerDate(iso: string, language: OfferLanguage): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(LOCALE[language], { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Helsinki" });
}

const addDays = (iso: string, days: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** The offer with its lines and totals worked out. */
export function buildOffer(input: OfferInput): Offer {
  const w = OFFER_WORDS[input.language];
  const extras = input.extras.filter((line) => line.label.trim()).map((line) => ({ ...line, label: line.label.trim(), price: Math.max(0, line.price) }));
  const lines: OfferLine[] = [{ label: w.website, price: Math.max(0, input.website), unit: "once" }, ...extras];
  const onceTotal = lines.filter((line) => line.unit === "once").reduce((sum, line) => sum + line.price, 0);
  const onceVat = Math.round(onceTotal * input.vatPercent) / 100;
  const recurring: OfferLine | null =
    input.upkeep.chosen === "month"
      ? { label: w.upkeepMonth, price: input.upkeep.monthly, unit: "month" }
      : input.upkeep.chosen === "year"
        ? { label: w.upkeepYear, price: input.upkeep.yearly, unit: "year" }
        : null;
  return { ...input, extras, validUntil: addDays(input.date, input.validDays), lines, onceTotal, onceVat, recurring };
}

/** The opening paragraph, in the offer's language, until the person writes their own. */
export function defaultIntro(language: OfferLanguage, contact: string | null): string {
  const first = contact?.trim().split(/\s+/)[0];
  if (language === "fi") return `${first ? `Hei ${first}, ja kiitos` : "Kiitos"} keskustelusta. Tässä tarjouksemme verkkosivustostanne. Puhutte koko ajan suoraan meidän kanssamme, ensimmäisestä puhelusta julkaisuun ja sen jälkeenkin.`;
  if (language === "sv") return `${first ? `Hej ${first}, och tack` : "Tack"} för samtalet. Här är vår offert på er webbplats. Ni pratar direkt med oss hela vägen, från första samtalet till lanseringen och efteråt.`;
  return `${first ? `Hi ${first}, and thank you` : "Thank you"} for the conversation. Here is our offer for your website. You talk directly with us all the way, from the first call to launch and after.`;
}

/** What is being made, by default: the pages and the languages. */
export function defaultScope(language: OfferLanguage, pages: number, languages: number): string {
  if (language === "fi") return `Verkkosivusto, enintään ${pages} sivua, ${languages > 1 ? `${languages} kieltä` : "yksi kieli"}.`;
  if (language === "sv") return `Webbplats, högst ${pages} sidor, ${languages > 1 ? `${languages} språk` : "ett språk"}.`;
  return `A website of up to ${pages} pages, ${languages > 1 ? `in ${languages} languages` : "in one language"}.`;
}

/** The project's name as the client reads it: a generic "Website" becomes their language's word. */
export function projectTitle(name: string, language: OfferLanguage): string {
  const trimmed = name.trim();
  if (!/^(new )?website$|^webbplats$|^verkkosivu(sto|t)$/i.test(trimmed)) return trimmed;
  return OFFER_WORDS[language].website;
}
