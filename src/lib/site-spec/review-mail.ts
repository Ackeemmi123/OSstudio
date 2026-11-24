/**
 * The e-mail that sends a client the private review link, in the site's own
 * language. A starting point: the person reads and changes it before it goes.
 * The link itself is added by the server, so it is always the right one.
 */
import type { SiteLocale } from "./catalog";

export interface ReviewMailFacts {
  contact: string | null;
  until: string;
  sender: string;
  studio: string;
}

const firstName = (name: string | null) => name?.trim().split(/\s+/)[0] ?? "";

function day(iso: string, locale: SiteLocale): string {
  const tag = locale === "sv" ? "sv-FI" : locale === "fi" ? "fi-FI" : "en-GB";
  return new Date(iso).toLocaleDateString(tag, { day: "numeric", month: "long", timeZone: "Europe/Helsinki" });
}

export function reviewLinkMail(locale: SiteLocale, facts: ReviewMailFacts): { subject: string; message: string } {
  const who = firstName(facts.contact);
  const until = day(facts.until, locale);
  if (locale === "sv") {
    return {
      subject: "Utkastet till er nya webbplats är klart",
      message: [
        `Hej${who ? ` ${who}` : ""}!`,
        "Nu är ett utkast till er nya webbplats klart. Länken finns längst ner i det här mejlet.",
        "Klicka runt som en besökare. Vill ni ändra något, tryck på Kommentera och klicka på det som ska ändras. När ni är nöjda, tryck på Godkänn.",
        `Länken är privat och fungerar till ${until}.`,
        `Hälsningar\n${facts.sender}\n${facts.studio}`,
      ].join("\n\n"),
    };
  }
  if (locale === "fi") {
    return {
      subject: "Uuden verkkosivustonne luonnos on valmis",
      message: [
        `Hei${who ? ` ${who}` : ""}!`,
        "Uuden verkkosivustonne luonnos on nyt valmis. Linkki on tämän viestin lopussa.",
        "Selaa sivustoa kuin kävijä. Jos haluatte muuttaa jotain, painakaa Kommentoi ja klikatkaa muutettavaa kohtaa. Kun olette tyytyväisiä, painakaa Hyväksy.",
        `Linkki on yksityinen ja toimii ${until} asti.`,
        `Terveisin\n${facts.sender}\n${facts.studio}`,
      ].join("\n\n"),
    };
  }
  return {
    subject: "The draft of your new website is ready",
    message: [
      `Hi${who ? ` ${who}` : ""},`,
      "A draft of your new website is ready. The link is at the end of this e-mail.",
      "Click around as a visitor would. To change something, press Comment and click on it. When you are happy, press Approve.",
      `The link is private and works until ${until}.`,
      `Best regards,\n${facts.sender}\n${facts.studio}`,
    ].join("\n\n"),
  };
}
