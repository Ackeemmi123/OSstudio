/**
 * Invented briefs, in the same shape as Studio OS's client brief, so a later
 * connection stays simple. Every business, person and fact here is made up. AI
 * drafting (step 4, not yet approved) refuses anything without `invented: true`.
 */
import type { ContextFieldKey } from "@/lib/domain/types";

export interface Brief {
  invented: true;
  clientName: string;
  language: "en" | "sv" | "fi";
  context: Partial<Record<ContextFieldKey, string>>;
  /** What the client has confirmed. A claim that is not here cannot reach a page unconfirmed. */
  confirmedFacts: string[];
  photos: "good" | "none_usable";
}

export const briefs = {
  lindqvist: {
    invented: true,
    clientName: "Lindqvist Accounting",
    language: "en",
    photos: "good",
    context: {
      industry: "Accounting",
      offering: "Bookkeeping, payroll and year-end accounts for small companies. Fixed monthly prices and one named accountant for each client.",
      goal: "Win more small-business clients in Helsinki",
      targetAudience: "Owners of small companies who find accounting stressful and want a dependable accountant",
      challenges: "Owners worry that changing accountant is complicated",
      designPreferences: "Calm and trustworthy, not corporate",
    },
    confirmedFacts: ["Founded in 2009 by Anna Lindqvist", "About a hundred clients", "Reply within one working day", "Proposal within two days", "From €190 a month for bookkeeping", "From €25 a person for payroll", "From €900 a year for year-end accounts", "Authorised accountant (KLT)"],
  },
  kivela: {
    invented: true,
    clientName: "Asianajotoimisto Kivelä",
    language: "fi",
    photos: "good",
    context: {
      industry: "Asianajotoimisto",
      offering: "Sukupolvenvaihdokset, yrityskaupat ja osakassopimukset perheyrityksille Pirkanmaalla.",
      goal: "Saada lisää perheyritysasiakkaita, joilla on omistajanvaihdos edessä",
      targetAudience: "Perheyritysten omistajat, jotka harkitsevat sukupolvenvaihdosta tai yrityskauppaa",
      challenges: "Asiakkaat pelkäävät hintaa ja lakikieltä",
      designPreferences: "Arvokas ja rauhallinen, ei kylmä",
    },
    confirmedFacts: ["Perustettu 1998", "Ensimmäinen keskustelu on maksuton", "Vastaus yhden työpäivän kuluessa", "Kirjallinen arvio viikon kuluessa", "Suomen Asianajajaliiton jäsen"],
  },
  norrsken: {
    invented: true,
    clientName: "Norrsken VVS",
    language: "sv",
    photos: "none_usable",
    context: {
      industry: "VVS och rörmokeri",
      offering: "Akuta läckor, stopp i avlopp, varmvattenberedare och badrumsrör i Vasaregionen.",
      goal: "Fler samtal om akuta fel",
      targetAudience: "Husägare i Vasa med ett akut problem, ofta på mobilen",
      challenges: "De enda bilderna är suddiga mobilbilder från arbetsplatser",
      designPreferences: "Tydligt och rakt på sak",
    },
    confirmedFacts: ["Startat 2014", "Inom två timmar i Vasa vid akuta fel", "Jour efter klockan 16 kostar 150 € extra", "Från 95 € i timmen", "Från 180 € för stopp", "Från 420 € plus beredare", "Behörig VVS-installatör"],
  },
} satisfies Record<string, Brief>;
