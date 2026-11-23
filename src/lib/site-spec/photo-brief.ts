/**
 * The photo brief: which photos this client's company-design site needs, and
 * how to take them, worked out from the spec's concept, direction, industry
 * and sections. Real photos of the client's own place, people and work are
 * what make a site human, so the brief is concrete enough to send to the
 * client as it is. Pure: no database, no AI.
 */
import type { SiteLocale } from "./catalog";
import type { Industry } from "./industries";
import type { SiteSpec } from "./schema";

export type PhotoSlot = "hero" | "everyday" | "owner" | "team" | "work" | "place";

export interface PhotoNeed {
  slot: PhotoSlot;
  /** How many: a single number or a range. */
  count: string;
  /** Needed for the concept as chosen, or a plus. */
  required: boolean;
}

/** What each photo is, and how to take it, in the site's language. */
const TEXT: Record<SiteLocale, { intro: string; outro: string; slots: Record<PhotoSlot, { what: string; how: string }>; heroFull: { what: string; how: string }; heroSplit: { what: string; how: string }; plus: string; industry: Record<Industry, string>; mono: string }> = {
  sv: {
    intro: "Här är bilderna som gör er webbplats till er egen. Mobilkamera räcker, så länge ljuset är bra.",
    outro: "Skicka bilderna i full storlek. Vi väljer, beskär och anpassar dem, och ni godkänner allt innan något publiceras.",
    heroSplit: { what: "Ett porträtt av dig, eller en närbild av ert arbete", how: "Stående bild, dagsljus från sidan, lugn bakgrund. Titta gärna mot kameran." },
    heroFull: { what: "En bred bild av er plats eller ert arbete", how: "Liggande bild, dagsljus, ingen blixt. Lämna luft upptill och till vänster, där texten hamnar." },
    slots: {
      hero: { what: "", how: "" },
      everyday: { what: "Bilder från en vanlig dag", how: "Stående bilder av ögonblick under dagen: händer i arbete, verktyg, en kund i dörren. Skriv ner klockslaget för varje bild." },
      owner: { what: "Ett porträtt av ägaren", how: "Ansiktet tydligt, neutral bakgrund, gärna samma ljus som övriga bilder." },
      team: { what: "Ett porträtt av varje person på sidan", how: "Samma bakgrund och samma ljus för alla, i midjehöjd. Var och en godkänner skriftligt att bilden används." },
      work: { what: "Bilder av färdiga arbeten", how: "Hela resultatet i dagsljus, raka linjer, inget stök i bild." },
      place: { what: "Er plats eller ert team i arbete", how: "Liggande bild som visar var ni finns eller hur ni arbetar." },
    },
    plus: "Bra att ha",
    mono: "Färgbilder går bra: webbplatsen visar dem i svartvitt.",
    industry: {
      law_finance: "Visa lugna arbetsrum och människor i arbete. Undvik handslag och stockbilder av vågskålar.",
      consulting: "Visa samtal och arbete vid bordet, inte poserade gruppbilder.",
      trades: "Visa händer och verktyg i arbete, och det färdiga resultatet.",
      interior_design: "Visa färdiga rum i dagsljus, kameran i ögonhöjd och lodräta linjer raka.",
      cafe_restaurant: "Visa maten på disken, rummet i morgonljus och människorna bakom disken.",
      health_beauty: "Visa ett lugnt behandlingsrum. Inga kunder utan skriftligt samtycke.",
      retail: "Visa produkterna i butiken och butiken utifrån.",
      other: "Visa er verksamhet som den är en vanlig dag.",
    },
  },
  fi: {
    intro: "Nämä kuvat tekevät verkkosivustosta teidän näköisenne. Puhelimen kamera riittää, kunhan valo on hyvä.",
    outro: "Lähettäkää kuvat täysikokoisina. Valitsemme, rajaamme ja sovitamme ne, ja te hyväksytte kaiken ennen julkaisua.",
    heroSplit: { what: "Muotokuva sinusta tai lähikuva työstänne", how: "Pystykuva, sivulta tuleva päivänvalo, rauhallinen tausta. Katso mielellään kameraan." },
    heroFull: { what: "Laaja kuva paikastanne tai työstänne", how: "Vaakakuva, päivänvalo, ei salamaa. Jätä tilaa ylös ja vasemmalle, johon teksti tulee." },
    slots: {
      hero: { what: "", how: "" },
      everyday: { what: "Kuvia tavallisesta päivästä", how: "Pystykuvia päivän hetkistä: kädet työssä, työkalut, asiakas ovella. Kirjoita kunkin kuvan kellonaika ylös." },
      owner: { what: "Muotokuva omistajasta", how: "Kasvot selvästi, neutraali tausta, mielellään sama valo kuin muissa kuvissa." },
      team: { what: "Muotokuva jokaisesta sivulla esiteltävästä", how: "Sama tausta ja valo kaikille, vyötärön korkeudelta. Jokainen hyväksyy kuvan käytön kirjallisesti." },
      work: { what: "Kuvia valmiista töistä", how: "Koko lopputulos päivänvalossa, suorat linjat, ei sotkua kuvassa." },
      place: { what: "Paikkanne tai tiimi työssä", how: "Vaakakuva, joka näyttää, missä olette tai miten työskentelette." },
    },
    plus: "Hyvä olla",
    mono: "Värikuvat käyvät: sivusto näyttää ne mustavalkoisina.",
    industry: {
      law_finance: "Näytä rauhallisia työtiloja ja ihmisiä työssä. Vältä kättelyitä ja vaa'an kuvapankkikuvia.",
      consulting: "Näytä keskusteluja ja työskentelyä pöydän ääressä, ei poseerattuja ryhmäkuvia.",
      trades: "Näytä kädet ja työkalut työssä sekä valmis lopputulos.",
      interior_design: "Näytä valmiit huoneet päivänvalossa, kamera silmien korkeudella ja pystylinjat suorina.",
      cafe_restaurant: "Näytä ruoka tiskillä, sali aamun valossa ja ihmiset tiskin takana.",
      health_beauty: "Näytä rauhallinen hoitohuone. Ei asiakkaita ilman kirjallista suostumusta.",
      retail: "Näytä tuotteet myymälässä ja myymälä ulkoa.",
      other: "Näytä toimintanne sellaisena kuin se on tavallisena päivänä.",
    },
  },
  en: {
    intro: "These are the photos that make your website your own. A phone camera is enough, as long as the light is good.",
    outro: "Send the photos at full size. We choose, crop and fit them, and you approve everything before anything is published.",
    heroSplit: { what: "A portrait of you, or a close-up of your work", how: "Portrait format, daylight from the side, a calm background. Looking at the camera is good." },
    heroFull: { what: "A wide photo of your place or your work", how: "Landscape format, daylight, no flash. Leave room at the top and on the left, where the words go." },
    slots: {
      hero: { what: "", how: "" },
      everyday: { what: "Photos of an ordinary day", how: "Portrait-format moments through the day: hands at work, tools, a customer at the door. Note the time of each one." },
      owner: { what: "A portrait of the owner", how: "The face clearly, a neutral background, ideally the same light as the other photos." },
      team: { what: "A portrait of each person on the site", how: "The same background and light for everyone, from the waist up. Each person agrees in writing." },
      work: { what: "Photos of finished work", how: "The whole result in daylight, straight lines, nothing cluttering the frame." },
      place: { what: "Your place, or the team at work", how: "A landscape photo showing where you are or how you work." },
    },
    plus: "Nice to have",
    mono: "Colour photos are fine: the site shows them in black and white.",
    industry: {
      law_finance: "Show calm workrooms and people at work. Avoid handshakes and stock photos of scales.",
      consulting: "Show conversations and work at the table, not posed group photos.",
      trades: "Show hands and tools at work, and the finished result.",
      interior_design: "Show finished rooms in daylight, the camera at eye level and verticals straight.",
      cafe_restaurant: "Show the food on the counter, the room in morning light and the people behind the counter.",
      health_beauty: "Show a calm treatment room. No clients without written consent.",
      retail: "Show the products in the shop, and the shop from outside.",
      other: "Show your business as it is on an ordinary day.",
    },
  },
};

/** Which photos the site needs, from the concept and what the spec holds. */
export function photoNeeds(spec: SiteSpec): PhotoNeed[] {
  if (spec.brand.designSystem !== "services@0.1") return [];
  const concept = spec.brand.concept ?? {};
  const direction = spec.brand.servicesStyle?.direction ?? "editorial";
  const sections = spec.pages.flatMap((p) => p.sections);
  const needs: PhotoNeed[] = [];
  if (concept.hero !== "type") needs.push({ slot: "hero", count: "1", required: true });
  if (concept.signature === "everyday") needs.push({ slot: "everyday", count: "3–5", required: true });
  if (concept.signature === "ownerLine") needs.push({ slot: "owner", count: "1", required: false });
  const team = sections.find((s) => s.kind === "team");
  if (team && "items" in team && team.items.length) needs.push({ slot: "team", count: String(team.items.length), required: true });
  if (direction === "atelier" || direction === "cafe" || sections.some((s) => s.kind === "gallery")) needs.push({ slot: "work", count: "4–8", required: direction === "atelier" });
  else needs.push({ slot: "work", count: "2–4", required: false });
  needs.push({ slot: "place", count: "1–2", required: false });
  return needs;
}

/** Photos with a real file in the spec: the client's own, the studio's or licensed ones. */
export function photosInHand(spec: SiteSpec): number {
  return spec.assets.filter((a) => a.fileId && a.origin !== "placeholder").length;
}

/** The brief as text for the client, in the site's language. */
export function photoBriefText(spec: SiteSpec): string {
  const locale = spec.locales.default;
  const words = TEXT[locale];
  const needs = photoNeeds(spec);
  const industry = (spec.strategy.industry ?? "other") as Industry;
  const lines = needs.map((need, i) => {
    const text = need.slot === "hero" ? (spec.brand.concept?.hero === "full" ? words.heroFull : words.heroSplit) : words.slots[need.slot];
    return `${i + 1}. ${text.what} (${need.count})${need.required ? "" : `, ${words.plus.toLowerCase()}`}\n   ${text.how}`;
  });
  return [words.intro, "", ...lines, "", words.industry[industry], ...(spec.brand.concept?.feel === "mono" ? [words.mono] : []), "", words.outro].join("\n");
}

/** One line per need, in English, for the studio's own view. */
export function photoNeedLabel(need: PhotoNeed, spec: SiteSpec): string {
  const words = TEXT.en;
  const text = need.slot === "hero" ? (spec.brand.concept?.hero === "full" ? words.heroFull : words.heroSplit) : words.slots[need.slot];
  return `${text.what} (${need.count})`;
}
