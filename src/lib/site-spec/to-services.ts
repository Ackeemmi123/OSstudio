/**
 * A website spec as the company design (design-systems/services) reads it.
 *
 * The company design is a fixed composition, not a list of blocks: a home
 * page with a promise, reasons, services, first steps, proof, questions and
 * a closing form, plus about, contact and privacy pages. This finds each part
 * in the spec by its kind and place, and says exactly what is missing instead
 * of guessing. Only people and quotes marked with consent are shown.
 */
import { isPlaceholderText } from "./texts";
import type { SiteContent, SiteDesign } from "../../../design-systems/services/content";
import type { SiteLocale } from "./catalog";
import type { SiteSpec, SiteSpecPage, SiteSpecSection, SiteSpecSource } from "./schema";

type Statement = { text: string; origin: "brief" | "ai_draft" | "person" | "client_confirmed" };

/** An image the company design may show: where its file is and where it came from. */
export interface ServicesImage {
  src: string;
  width: number;
  height: number;
  source: string;
  licence: string;
  showsPerson: boolean;
}

export type ServicesMode = { prototype: { madeBy: string } } | { client: { approvedBy: string; approvedOn: string } };

export type ServicesResult = { ok: true; content: SiteContent; design: SiteDesign; pages: Record<string, string> } | { ok: false; missing: string[] };

const WORDS: Record<SiteLocale, { services: string; steps: string; questions: string; reasons: string; people: string; details: string; name: string; email: string; phone: string; message: string; send: string; notFound: string; notFoundText: string; back: string; menuServices: string; menuQuestions: string; contact: string; privacy: string; about: string; work: string; publications: string; menu: string }> = {
  sv: { services: "Tjänster", steps: "Så går det till", questions: "Frågor", reasons: "Därför", people: "Vi som jobbar här", details: "Kontaktuppgifter", name: "Namn", email: "E-post", phone: "Telefon", message: "Meddelande", send: "Skicka", notFound: "Sidan hittades inte", notFoundText: "Adressen finns inte längre, eller så skrevs den fel.", back: "Till startsidan", menuServices: "Tjänster", menuQuestions: "Frågor", contact: "Kontakt", privacy: "Integritet", about: "Om oss", work: "Arbeten", publications: "Publikationer", menu: "Meny" },
  fi: { services: "Palvelut", steps: "Näin edetään", questions: "Kysymykset", reasons: "Miksi me", people: "Meillä töissä", details: "Yhteystiedot", name: "Nimi", email: "Sähköposti", phone: "Puhelin", message: "Viesti", send: "Lähetä", notFound: "Sivua ei löytynyt", notFoundText: "Osoite ei ole enää käytössä, tai siinä on kirjoitusvirhe.", back: "Etusivulle", menuServices: "Palvelut", menuQuestions: "Kysymykset", contact: "Yhteystiedot", privacy: "Tietosuoja", about: "Meistä", work: "Töitämme", publications: "Julkaisut", menu: "Ruokalista" },
  en: { services: "Services", steps: "How it works", questions: "Questions", reasons: "Why us", people: "The people", details: "Contact details", name: "Name", email: "Email", phone: "Phone", message: "Message", send: "Send", notFound: "Page not found", notFoundText: "This address no longer exists, or it was mistyped.", back: "Back to the front page", menuServices: "Services", menuQuestions: "Questions", contact: "Contact", privacy: "Privacy", about: "About", work: "Our work", publications: "Publications", menu: "Menu" },
};

const ABOUT = /^(om|about|om-oss|meista|meist|tietoa|about-us)/;
const PRIVACY = /(integritet|privacy|tietosuoja|dataskydd)/;
const PUBLICATIONS = /(julkaisu|publikation|publication|skrifter)/;
const PAGE_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MENU = /^(meny|menu|ruokalista|lista|matsedel|lounas|lunch|ruoka)/;

/** A line of opening hours: the days, then the time ("Ma–Pe 11–22", "Su: suljettu"), or the whole line when it cannot be told apart. */
export function hoursLine(line: string): { days: string; time?: string } {
  const text = line.replace(/\s+/g, " ").trim();
  const colon = text.match(/^([^:\d]{1,60}?)\s*:\s*(.+)$/);
  if (colon) return { days: colon[1].trim(), time: colon[2].trim() };
  const timed = text.match(/^(.+?)\s+((?:klo\s+)?\d{1,2}(?:[.:]\d{2})?\s*[–-]\s*\d{1,2}(?:[.:]\d{2})?.*|suljettu.*|stängt.*|closed.*)$/i);
  if (timed) return { days: timed[1].trim(), time: timed[2].trim() };
  return { days: text };
}

function lines(text: string): string[] {
  return text
    .split(/\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** A line of a publications list: a leading year ("2023", "2014–2016") stands apart, a closing web address becomes the link. */
export function publicationLine(line: string): { text: string; year?: string; href?: string } {
  let rest = line.trim();
  let href: string | undefined;
  const link = rest.match(/\s(https?:\/\/\S+)$/);
  if (link) {
    href = link[1];
    rest = rest.slice(0, -link[0].length).trim();
  }
  const dated = rest.match(/^(\d{4}(?:\s?[–-]\s?\d{2,4})?)[\s.:,–-]+(.+)$/);
  return { text: dated ? dated[2].trim() : rest, ...(dated ? { year: dated[1].replace(/\s/g, "") } : {}), ...(href ? { href } : {}) };
}

function originOf(source: SiteSpecSource | undefined): Statement["origin"] {
  if (!source) return "person";
  if (source.kind === "brief") return "brief";
  if (source.kind === "proposal") return "ai_draft";
  return "person";
}

/** The default-language text of a localized value. */
function t(value: Partial<Record<SiteLocale, string>> | undefined, locale: SiteLocale): string {
  return (value?.[locale] ?? "").trim();
}

function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

type SignatureKind = NonNullable<SiteDesign["signature"]>;

/** The small label above a signature part when the spec has none, in the site's language. */
const SIGNATURE_LABELS: Record<SiteLocale, Record<"everyday" | "area" | "numbers" | "season" | "books", string>> = {
  sv: { everyday: "En vanlig dag", area: "Här jobbar vi", numbers: "I siffror", season: "Just nu", books: "Böcker" },
  fi: { everyday: "Tavallinen päivä", area: "Missä toimimme", numbers: "Lukuina", season: "Nyt", books: "Kirjat" },
  en: { everyday: "An ordinary day", area: "Where we work", numbers: "In numbers", season: "Now", books: "Books" },
};

/**
 * The signature part the concept chose, as the company design reads it, or why it cannot be
 * shown yet. A part is shown only when it is whole: enough items, the owner's consent ticked,
 * every number confirmed by the client, photos with files. Otherwise the site is built without it.
 */
export function signatureFor(
  spec: SiteSpec,
  locale: SiteLocale,
  imageId: (id: string | undefined) => string | undefined,
): { kind: SignatureKind; content: NonNullable<SiteContent["signature"]> } | { kind: null; reason: string | null } {
  const kind = spec.brand.concept?.signature;
  if (!kind) return { kind: null, reason: null };
  const data = spec.signature;
  const origin = originOf(data?.source);
  const st = (text: string, max: number, from: Statement["origin"] = origin): Statement => ({ text: text.slice(0, max), origin: from });
  const L = (value: Partial<Record<SiteLocale, string>> | undefined) => t(value, locale);
  const not = (reason: string) => ({ kind: null, reason });
  switch (kind) {
    case "year": {
      const part = data?.year;
      if (!part || !L(part.heading)) return not("The founding year needs a year and a heading.");
      const events = part.events.filter((e) => e.when.trim() && L(e.text)).map((e) => ({ when: e.when.trim().slice(0, 12), text: st(L(e.text), 160) }));
      return { kind, content: { year: { year: part.year, heading: st(L(part.heading), 110), events: events.slice(0, 4) } } };
    }
    case "ownerLine": {
      const part = data?.ownerLine;
      if (!part || !L(part.text) || !part.who.trim()) return not("The owner's line needs their words and their name.");
      if (!part.consent) return not("Tick that the owner agreed to be quoted.");
      const portrait = imageId(part.assetId);
      return { kind, content: { ownerLine: { text: st(L(part.text), 220), who: part.who.trim().slice(0, 80), ...(L(part.role) ? { role: L(part.role).slice(0, 70) } : {}), ...(portrait ? { imageId: portrait } : {}), consent: "given" } } };
    }
    case "everyday": {
      const part = data?.everyday;
      const items = (part?.items ?? []).flatMap((item) => {
        const shown = imageId(item.assetId);
        return shown && L(item.text) ? [{ imageId: shown, ...(item.when?.trim() ? { when: item.when.trim().slice(0, 20) } : {}), text: st(L(item.text), 140) }] : [];
      });
      if (!part || !L(part.heading) || items.length < 3) return not("An ordinary day needs a heading and at least three of the client's own photos, each with a line.");
      return { kind, content: { everyday: { label: (L(part.label) || SIGNATURE_LABELS[locale].everyday).slice(0, 60), heading: st(L(part.heading), 110), items: items.slice(0, 5) } } };
    }
    case "area": {
      const part = data?.area;
      const places = (part?.places ?? []).filter((p) => p.name.trim()).map((p) => ({ name: p.name.trim().slice(0, 40), ...(L(p.note) ? { note: st(L(p.note), 60) } : {}) }));
      if (!part || !L(part.heading) || places.length < 2) return not("Where they work needs a heading and at least two places.");
      return { kind, content: { area: { label: (L(part.label) || SIGNATURE_LABELS[locale].area).slice(0, 60), heading: st(L(part.heading), 110), ...(L(part.text) ? { text: st(L(part.text), 240) } : {}), places: places.slice(0, 8) } } };
    }
    case "numbers": {
      const part = data?.numbers;
      const items = (part?.items ?? []).filter((i) => i.value.trim() && L(i.text));
      if (!part || items.length < 2) return not("Numbers need at least two, each with a line.");
      if (items.some((i) => !i.confirmed)) return not("Every number must be confirmed by the client before it is shown.");
      return { kind, content: { numbers: { label: (L(part.label) || SIGNATURE_LABELS[locale].numbers).slice(0, 60), items: items.slice(0, 3).map((i) => ({ value: i.value.trim().slice(0, 12), text: st(L(i.text), 80, "client_confirmed") })) } } };
    }
    case "season": {
      const part = data?.season;
      if (!part || !L(part.title) || !L(part.text)) return not("What is on now needs a title and a line.");
      return { kind, content: { season: { label: (L(part.label) || SIGNATURE_LABELS[locale].season).slice(0, 40), title: st(L(part.title), 70), text: st(L(part.text), 200), ...(L(part.price) ? { price: st(L(part.price), 40) } : {}) } } };
    }
    case "books": {
      const part = data?.books;
      const items = (part?.items ?? []).filter((b) => L(b.title) && L(b.detail)).map((b) => ({ title: st(L(b.title), 140), detail: st(L(b.detail), 140), year: b.year, ...(b.href ? { href: b.href } : {}) }));
      if (!part || !L(part.heading) || items.length < 2) return not("Books need a heading and at least two books.");
      return { kind, content: { books: { label: (L(part.label) || SIGNATURE_LABELS[locale].books).slice(0, 60), heading: st(L(part.heading), 110), items: items.slice(0, 8) } } };
    }
  }
}

export function servicesContent(spec: SiteSpec, images: Record<string, ServicesImage>, mode: ServicesMode): ServicesResult {
  const locale = spec.locales.default;
  const w = WORDS[locale];
  const missing: string[] = [];
  const need = (label: string, text: string, max: number, origin: Statement["origin"]): Statement => {
    if (!text) missing.push(`${label} is empty.`);
    // An instruction in brackets already blocks approval as "still needs writing"; its length says nothing.
    else if (text.length > max && !isPlaceholderText(text)) missing.push(`${label} is too long for the company design (at most ${max} characters, now ${text.length}).`);
    return { text: text.slice(0, max), origin };
  };

  const pages = spec.pages;
  const home = pages[0];
  const all = pages.flatMap((page) => page.sections.map((section) => ({ page, section })));
  const firstOf = <K extends SiteSpecSection["kind"]>(kind: K, within?: SiteSpecPage) =>
    (within ? within.sections : all.map((entry) => entry.section)).find((s): s is Extract<SiteSpecSection, { kind: K }> => s.kind === kind);
  const pageOf = (test: (page: SiteSpecPage) => boolean) => pages.slice(1).find(test);
  const slugOf = (page: SiteSpecPage) => t(page.slug, locale) || page.id;

  // Pages
  const aboutPage = pageOf((p) => ABOUT.test(slugOf(p)) || ABOUT.test(p.id)) ?? pageOf((p) => p.sections.some((s) => s.kind === "team"));
  const contactPage = pageOf((p) => p.sections.some((s) => s.kind === "contact"));
  const privacyPage = pageOf((p) => PRIVACY.test(slugOf(p)) || PRIVACY.test(p.id));
  const publicationsPage = pageOf((p) => PUBLICATIONS.test(slugOf(p)) || PUBLICATIONS.test(p.id));
  const menuSpecPage = pageOf((p) => (MENU.test(slugOf(p)) || MENU.test(p.id)) && p.sections.some((s) => s.kind === "services"));
  if (!aboutPage) missing.push("Add an About page (its address starting with om, about or meista).");
  if (!contactPage) missing.push("Add a Contact page with a contact section.");
  if (!privacyPage) missing.push("Add a Privacy page (its address containing integritet, privacy or tietosuoja).");

  // Images the design can show: only those with a stored file.
  const assets: SiteContent["assets"] = spec.assets.flatMap((asset) => {
    const file = asset.fileId ? images[asset.fileId] : undefined;
    if (!file) return [];
    return [{ id: asset.id.slice(0, 40), src: file.src, width: file.width, height: file.height, alt: (t(asset.alt, locale) || asset.description || asset.id).slice(0, 200), source: file.source.slice(0, 120), licence: file.licence.slice(0, 120), showsPerson: file.showsPerson }];
  });
  const imageId = (id: string | undefined) => (id && assets.some((a) => a.id === id) ? id : undefined);

  // Booking: the place's own booking service, when it has one; the main button then books.
  const contactForBooking = contactPage?.sections.find((s): s is Extract<SiteSpecSection, { kind: "contact" }> => s.kind === "contact");
  const bookingUrl = contactForBooking?.bookingUrl?.trim() ?? "";
  let bookingHref: string | undefined;
  if (bookingUrl) {
    try {
      const url = new URL(bookingUrl);
      if (url.protocol !== "https:") throw new Error("not https");
      bookingHref = url.href;
    } catch {
      missing.push("The booking address must be a whole https address, like https://booking.example.fi/place.");
    }
  }

  // Promise: the home page's hero.
  const hero = firstOf("hero", home);
  if (!hero) missing.push("The home page needs a hero section.");
  const button = hero?.buttons[0] ?? (spec.strategy.primaryCta ? { label: spec.strategy.primaryCta.label } : undefined);
  const heroOrigin = originOf(hero?.source);
  const headline = t(hero?.heading, locale);
  const turn = t(hero?.emphasis, locale);
  const promise: SiteContent["promise"] = {
    whoFor: need("The hero's eyebrow (who the site is for)", t(hero?.eyebrow, locale), 70, heroOrigin),
    headline: need("The hero's heading", headline, 110, heroOrigin),
    ...(turn && headline.endsWith(turn) ? { turn: turn.slice(0, 60) } : {}),
    why: need("The hero's subheading", t(hero?.subheading, locale), 280, heroOrigin),
    action: { label: (t(button?.label, locale) || w.contact).slice(0, 36), by: bookingHref ? "booking" : "form" },
    ...(t(hero?.reassurance, locale) ? { reassurance: need("The hero's reassurance line", t(hero?.reassurance, locale), 140, heroOrigin) } : {}),
    ...(imageId(hero?.mediaAssetId) ? { imageId: imageId(hero?.mediaAssetId) } : {}),
  };

  // Reasons and first steps: the first two feature lists, home first.
  const features = [...home.sections, ...pages.slice(1).flatMap((p) => p.sections)].filter((s): s is Extract<SiteSpecSection, { kind: "features" }> => s.kind === "features");
  const stepsSection = features.find((s) => s.variant === "list" || /steg|step|går det till|vaihe|edetään|process/i.test(t(s.heading, locale))) ?? features[1];
  const reasonsSection = features.find((s) => s !== stepsSection);
  const points = (section: Extract<SiteSpecSection, { kind: "features" }> | undefined, label: string) => {
    const items = (section?.items ?? []).slice(0, 4).map((item, i) => ({
      title: need(`${label}, item ${i + 1}: title`, t(item.title, locale), 60, originOf(item.source ?? section?.source)),
      text: need(`${label}, item ${i + 1}: text`, t(item.body, locale), 240, originOf(item.source ?? section?.source)),
    }));
    if (items.length < 2) missing.push(`${label} needs a features section with 2 to 4 items.`);
    return items;
  };
  const reasons = { items: points(reasonsSection, "Reasons to choose the firm") };
  const firstSteps = {
    label: (t(stepsSection?.eyebrow, locale) || w.steps).slice(0, 60),
    heading: need("The first-steps section's heading", t(stepsSection?.heading, locale), 110, originOf(stepsSection?.source)),
    items: points(stepsSection, "First steps (how working together starts)"),
  };

  // Services, each with its own page when it has an address.
  const siteNameText = t(spec.seo.siteName, locale);
  const servicePage = (item: Extract<SiteSpecSection, { kind: "services" }>["items"][number], i: number): { page?: NonNullable<SiteContent["services"]["items"][number]["page"]> } => {
    const slug = t(item.slug, locale).toLowerCase();
    if (!slug) return {};
    if (!PAGE_SLUG.test(slug) || slug.length > 60) {
      missing.push(`Service ${i + 1}: the page address may use only lower-case letters, digits and single hyphens (like patents).`);
      return {};
    }
    const from = originOf(item.source ?? servicesSection?.source);
    const name = t(item.title, locale);
    const matters = lines(t(item.matters, locale));
    if (matters.length > 12) missing.push(`Service ${i + 1}: at most 12 typical matters (now ${matters.length}).`);
    return {
      page: {
        slug,
        ...(t(item.whoFor, locale) ? { whoFor: need(`Service ${i + 1}: who it is for`, t(item.whoFor, locale), 240, from) } : {}),
        matters: matters.slice(0, 12).map((matter, m) => need(`Service ${i + 1}: typical matter ${m + 1}`, matter, 200, from)),
        seo: { title: (siteNameText ? `${name} · ${siteNameText}` : name).slice(0, 70) || "Service", description: (t(item.body, locale) || name).replace(/\s+/g, " ").slice(0, 170) || "Service" },
      },
    };
  };
  const servicesSection = firstOf("services");
  if (!servicesSection || !servicesSection.items.length) missing.push("Add a services section with at least one service.");
  const services = {
    label: (t(servicesSection?.eyebrow, locale) || w.services).slice(0, 60),
    heading: need("The services section's heading", t(servicesSection?.heading, locale), 110, originOf(servicesSection?.source)),
    items: (servicesSection?.items ?? []).slice(0, 8).map((item, i) => ({
      name: need(`Service ${i + 1}: title`, t(item.title, locale), 60, originOf(item.source ?? servicesSection?.source)),
      text: need(`Service ${i + 1}: text`, t(item.body, locale), 320, originOf(item.source ?? servicesSection?.source)),
      ...(t(item.price, locale) ? { price: need(`Service ${i + 1}: price`, t(item.price, locale), 50, originOf(item.source)) } : {}),
      ...(t(item.diets, locale) ? { diets: t(item.diets, locale).slice(0, 40) } : {}),
      ...servicePage(item, i),
    })),
  };

  // Proof: only quotes the person agreed to.
  const testimonials = firstOf("testimonials");
  const proof: SiteContent["proof"] = {
    quotes: (testimonials?.items ?? [])
      .filter((item) => item.consent)
      .slice(0, 4)
      .map((item, i) => ({ text: need(`Quote ${i + 1}`, t(item.quote, locale), 320, originOf(item.source)), who: item.author.slice(0, 80), permission: "given" as const })),
    credentials: [],
    ...(imageId(testimonials?.mediaAssetId) ? { imageId: imageId(testimonials?.mediaAssetId) } : {}),
  };

  // Questions.
  const faq = firstOf("faq");
  if (!faq || !faq.items.length) missing.push("Add a questions (FAQ) section with at least one question.");
  const questions = {
    label: (t(faq?.eyebrow, locale) || w.questions).slice(0, 60),
    heading: need("The questions section's heading", t(faq?.heading, locale), 110, originOf(faq?.source)),
    items: (faq?.items ?? []).slice(0, 12).map((item, i) => ({
      question: need(`Question ${i + 1}`, t(item.question, locale), 140, originOf(item.source ?? faq?.source)),
      answer: need(`Answer ${i + 1}`, t(item.answer, locale), 500, originOf(item.source ?? faq?.source)),
    })),
  };

  // Closing: the call to action next to the form.
  const cta = firstOf("cta");
  if (!cta) missing.push("Add a call-to-action section; its heading and text sit next to the form.");
  const closing = { heading: need("The call to action's heading", t(cta?.heading, locale), 90, originOf(cta?.source)), text: need("The call to action's text", t(cta?.body, locale), 200, originOf(cta?.source)) };

  // About.
  const aboutTexts = (aboutPage?.sections ?? []).filter((s): s is Extract<SiteSpecSection, { kind: "text" | "text_media" }> => s.kind === "text" || s.kind === "text_media");
  const aboutParas = aboutTexts.flatMap((s) => paragraphs(t(s.body, locale)).map((text) => ({ text, origin: originOf(s.source) })));
  const team = (aboutPage?.sections ?? []).find((s): s is Extract<SiteSpecSection, { kind: "team" }> => s.kind === "team") ?? firstOf("team");
  const aboutImage = aboutTexts.map((s) => (s.kind === "text_media" ? imageId(s.mediaAssetId) : undefined)).find(Boolean);
  const leadPara = aboutParas[0];
  if (!leadPara) missing.push("The About page needs a text section to tell the firm's story.");
  const story = aboutParas.slice(1).flatMap((p) => (p.text.length > 800 ? (p.text.match(/[\s\S]{1,800}(\s|$)/g) ?? []).map((part) => ({ text: part.trim(), origin: p.origin })) : [p])).slice(0, 6);
  const about: SiteContent["about"] = {
    slug: aboutPage ? slugOf(aboutPage).slice(0, 30) : "om-oss",
    menuLabel: ((aboutPage && t(aboutPage.title, locale)) || w.about).slice(0, 24),
    label: ((aboutPage && t(aboutPage.title, locale)) || w.about).slice(0, 60),
    heading: need("The About page's heading", t(aboutTexts[0]?.heading, locale) || (aboutPage ? t(aboutPage.title, locale) : ""), 110, originOf(aboutTexts[0]?.source)),
    lead: need("The About page's first paragraph", leadPara?.text.slice(0, 300) ?? "", 300, leadPara?.origin ?? "person"),
    story: story.length ? story : leadPara && leadPara.text.length > 300 ? [{ text: leadPara.text.slice(0, 800), origin: leadPara.origin }] : [{ text: leadPara?.text.slice(0, 800) ?? "", origin: leadPara?.origin ?? "person" }],
    ...(aboutImage ? { imageId: aboutImage } : {}),
    ...(team ? { peopleLabel: (t(team.heading, locale) || w.people).slice(0, 60) } : {}),
    people: (team?.items ?? [])
      .filter((person) => person.consent)
      .slice(0, 12)
      .map((person) => {
        const from = originOf(person.source ?? team?.source);
        const bio = paragraphs(t(person.bio, locale));
        const education = lines(t(person.education, locale));
        const positions = lines(t(person.positions, locale));
        const languages = t(person.languages, locale);
        const hasProfile = bio.length || education.length || positions.length || languages;
        if (bio.length > 4) missing.push(`${person.name}'s profile: at most 4 paragraphs about them (now ${bio.length}).`);
        if (education.length > 10) missing.push(`${person.name}'s profile: at most 10 lines of education (now ${education.length}).`);
        if (positions.length > 16) missing.push(`${person.name}'s profile: at most 16 positions of trust (now ${positions.length}).`);
        return {
          name: person.name.slice(0, 60),
          role: need(`${person.name}'s role`, t(person.role, locale), 70, from),
          ...(imageId(person.assetId) ? { imageId: imageId(person.assetId) } : {}),
          consent: "given" as const,
          ...(hasProfile
            ? {
                profile: {
                  bio: bio.slice(0, 4).map((text, b) => need(`${person.name}'s profile, paragraph ${b + 1}`, text, 800, from)),
                  education: education.slice(0, 10).map((text, e) => need(`${person.name}'s education, line ${e + 1}`, text, 200, from)),
                  positions: positions.slice(0, 16).map((text, e) => need(`${person.name}'s positions of trust, line ${e + 1}`, text, 200, from)),
                  ...(languages ? { languages: need(`${person.name}'s languages`, languages, 160, from) } : {}),
                },
              }
            : {}),
        };
      }),
    seo: { title: (aboutPage ? t(aboutPage.seo.title, locale) || t(aboutPage.title, locale) : w.about).slice(0, 70) || w.about, description: (aboutPage ? t(aboutPage.seo.description, locale) : "").slice(0, 170) || (leadPara?.text ?? w.about).slice(0, 170) },
  };

  // Publications: a page whose address says so; each text section is a group, one publication per line.
  const publicationGroups = (publicationsPage?.sections ?? [])
    .filter((s): s is Extract<SiteSpecSection, { kind: "text" | "text_media" }> => s.kind === "text" || s.kind === "text_media")
    .map((section) => ({ section, heading: t(section.heading, locale), items: lines(t(section.body, locale)) }))
    .filter((group) => group.items.length);
  if (publicationsPage && !publicationGroups.length) missing.push("The publications page needs a text section with one publication per line.");
  const publications: SiteContent["publications"] = publicationsPage && publicationGroups.length
    ? {
        slug: slugOf(publicationsPage).slice(0, 30),
        menuLabel: (t(publicationsPage.title, locale) || w.publications).slice(0, 24),
        label: (t(publicationsPage.title, locale) || w.publications).slice(0, 60),
        heading: need("The publications page's title", t(publicationsPage.title, locale), 110, "person"),
        groups: publicationGroups.slice(0, 8).map((group, g) => {
          if (!group.heading) missing.push(`Publications, group ${g + 1}: the section needs a heading (like Books or Articles).`);
          if (group.items.length > 120) missing.push(`Publications, group ${g + 1}: at most 120 lines (now ${group.items.length}).`);
          return {
            heading: group.heading.slice(0, 80) || w.publications,
            items: group.items.slice(0, 120).map((line, n) => {
              const parsed = publicationLine(line);
              return { text: need(`Publications, group ${g + 1}, line ${n + 1}`, parsed.text, 300, originOf(group.section.source)), ...(parsed.year ? { year: parsed.year.slice(0, 12) } : {}), ...(parsed.href ? { href: parsed.href } : {}) };
            }),
          };
        }),
        seo: { title: (t(publicationsPage.seo.title, locale) || t(publicationsPage.title, locale) || w.publications).slice(0, 70), description: (t(publicationsPage.seo.description, locale) || t(publicationsPage.title, locale) || w.publications).slice(0, 170) },
      }
    : undefined;

  // Contact and the form.
  const contactSection = contactPage?.sections.find((s): s is Extract<SiteSpecSection, { kind: "contact" }> => s.kind === "contact");
  const contactBody = t(contactSection?.body, locale);
  const form = spec.forms.find((f) => f.id === contactSection?.formId) ?? spec.forms[0];
  const email = contactBody.match(/[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}/i)?.[0];
  const phone = contactBody.match(/(\+?\d[\d\s-]{6,}\d)/)?.[0]?.trim();
  const contact = {
    slug: contactPage ? slugOf(contactPage).slice(0, 30) : "kontakt",
    menuLabel: ((contactPage && t(contactPage.title, locale)) || w.contact).slice(0, 24),
    heading: need("The contact section's heading", t(contactSection?.heading, locale), 110, originOf(contactSection?.source)),
    text: need("The contact section's text", paragraphs(contactBody)[0] ?? "", 280, originOf(contactSection?.source)),
    detailsLabel: w.details,
    seo: { title: (contactPage ? t(contactPage.seo.title, locale) || t(contactPage.title, locale) : w.contact).slice(0, 70) || w.contact, description: (contactPage ? t(contactPage.seo.description, locale) : "").slice(0, 170) || w.contact },
  };
  if (!form) missing.push("The site needs a contact form.");
  const formContent: SiteContent["form"] = {
    nameLabel: w.name,
    emailLabel: w.email,
    ...(form?.fields.includes("phone") ? { phoneLabel: w.phone } : {}),
    messageLabel: w.message,
    send: (t(form?.submitLabel, locale) || w.send).slice(0, 36),
    whatHappensNext: need("The contact form's line about what happens after sending", t(form?.replyNote, locale), 160, "person"),
    consent: need("The contact form's consent text", t(form?.consentText, locale), 300, "person"),
  };

  // Privacy.
  const privacyParas = (privacyPage?.sections ?? []).flatMap((s) => ("body" in s ? paragraphs(t(s.body as Partial<Record<SiteLocale, string>>, locale)) : []));
  if (privacyPage && !privacyParas.length) missing.push("The Privacy page has no text.");
  const privacy = {
    slug: privacyPage ? slugOf(privacyPage).slice(0, 30) : "integritet",
    menuLabel: ((privacyPage && t(privacyPage.title, locale)) || w.privacy).slice(0, 24),
    heading: ((privacyPage && t(privacyPage.title, locale)) || w.privacy).slice(0, 80),
    paragraphs: (privacyParas.length ? privacyParas : [""]).slice(0, 20).map((text) => ({ text: text.slice(0, 800), origin: "person" as const })),
    seo: { title: ((privacyPage && t(privacyPage.title, locale)) || w.privacy).slice(0, 70), description: ((privacyPage && t(privacyPage.seo.description, locale)) || w.privacy).slice(0, 170) },
  };

  // Address and opening hours, exactly as written in the contact section: one line, or a timetable when there are several.
  const address = t(contactSection?.address, locale).slice(0, 120);
  const hourLines = lines(t(contactSection?.hours, locale));
  const hours = hourLines.join(" · ").slice(0, 120);
  if (hourLines.length > 10) missing.push(`Opening hours: at most 10 lines (now ${hourLines.length}).`);
  const openingHours = hourLines.length >= 2 ? hourLines.slice(0, 10).map((line) => { const parsed = hoursLine(line); return { days: parsed.days.slice(0, 60), ...(parsed.time ? { time: parsed.time.slice(0, 60) } : {}) }; }) : undefined;

  // The whole menu: a page whose address says so; each services section on it is a group of dishes.
  const menuGroups = (menuSpecPage?.sections ?? []).filter((s): s is Extract<SiteSpecSection, { kind: "services" }> => s.kind === "services" && s.items.length > 0);
  const menuNote = (menuSpecPage?.sections ?? []).filter((s): s is Extract<SiteSpecSection, { kind: "text" | "text_media" }> => s.kind === "text" || s.kind === "text_media").flatMap((s) => paragraphs(t(s.body, locale))).join(" ");
  if (menuGroups.length > 10) missing.push(`The menu page: at most 10 groups (now ${menuGroups.length}).`);
  const menuPage: SiteContent["menuPage"] = menuSpecPage && menuGroups.length
    ? {
        slug: slugOf(menuSpecPage).slice(0, 30),
        menuLabel: (t(menuSpecPage.title, locale) || w.menu).slice(0, 24),
        label: (t(menuSpecPage.title, locale) || w.menu).slice(0, 60),
        heading: need("The menu page's title", t(menuSpecPage.title, locale), 110, "person"),
        groups: menuGroups.slice(0, 10).map((group, g) => {
          if (!t(group.heading, locale)) missing.push(`The menu, group ${g + 1}: the section needs a heading (like Lunch or Drinks).`);
          if (group.items.length > 40) missing.push(`The menu, group ${g + 1}: at most 40 dishes (now ${group.items.length}).`);
          const from = originOf(group.source);
          return {
            heading: t(group.heading, locale).slice(0, 80) || w.menu,
            ...(t(group.eyebrow, locale) ? { text: need(`The menu, group ${g + 1}: the line under the heading`, t(group.eyebrow, locale), 240, from) } : {}),
            items: group.items.slice(0, 40).map((item, n) => ({
              name: need(`The menu, group ${g + 1}, dish ${n + 1}: name`, t(item.title, locale), 80, originOf(item.source ?? group.source)),
              ...(t(item.body, locale) ? { text: need(`The menu, group ${g + 1}, dish ${n + 1}: description`, t(item.body, locale).replace(/\s+/g, " "), 320, originOf(item.source ?? group.source)) } : {}),
              ...(t(item.price, locale) ? { price: need(`The menu, group ${g + 1}, dish ${n + 1}: price`, t(item.price, locale), 50, originOf(item.source ?? group.source)) } : {}),
              ...(t(item.diets, locale) ? { diets: t(item.diets, locale).slice(0, 40) } : {}),
            })),
          };
        }),
        ...(menuNote ? { note: need("The menu page's note", menuNote, 600, "person") } : {}),
        seo: { title: (t(menuSpecPage.seo.title, locale) || t(menuSpecPage.title, locale) || w.menu).slice(0, 70), description: (t(menuSpecPage.seo.description, locale) || t(menuSpecPage.title, locale) || w.menu).slice(0, 170) },
      }
    : undefined;

  // The firm's own work: the first gallery with at least two pictures that have files.
  const gallerySection = firstOf("gallery");
  const galleryItems = (gallerySection?.assetIds ?? []).flatMap((id) => {
    const asset = spec.assets.find((a) => a.id === id);
    const shown = imageId(id.slice(0, 40));
    if (!asset || !shown) return [];
    const caption = (t(asset.alt, locale) || asset.description || "").slice(0, 120);
    return caption ? [{ imageId: shown, caption: { text: caption, origin: "person" as const } }] : [];
  });
  const gallery: SiteContent["gallery"] =
    // Only the directions that draw a gallery need one; the others are not held up by it.
    gallerySection && galleryItems.length >= 2 && ["atelier", "cafe"].includes(spec.brand.servicesStyle?.direction ?? "")
      ? {
          label: (t(gallerySection.eyebrow, locale) || w.work).slice(0, 60),
          heading: need("The gallery's heading", t(gallerySection.heading, locale), 110, originOf(gallerySection.source)),
          items: galleryItems.slice(0, 12),
        }
      : undefined;

  const siteName = t(spec.seo.siteName, locale);
  if (!siteName) missing.push("The site name is empty (Site settings).");
  const homeDescription = t(home.seo.description, locale) || t(spec.seo.defaultDescription, locale);
  if (!homeDescription) missing.push("The home page needs a search description.");
  if (new Set([about.slug, contact.slug, privacy.slug]).size < 3) missing.push("The About, Contact and Privacy pages need different addresses.");
  const pageSlugs = [about.slug, contact.slug, privacy.slug, ...(publications ? [publications.slug] : []), ...(menuPage ? [menuPage.slug] : []), "sent", "not-sent"];
  for (const item of services.items) {
    if (!item.page) continue;
    if (pageSlugs.includes(item.page.slug)) missing.push(`The service ${item.name.text} has the page address ${item.page.slug}, which another page already uses.`);
    pageSlugs.push(item.page.slug);
  }

  if (missing.length) return { ok: false, missing: [...new Set(missing)] };
  const signature = signatureFor(spec, locale, imageId);

  const content = {
    ...mode,
    language: locale,
    business: { name: siteName.slice(0, 60), ...(email ? { email } : {}), ...(phone ? { phone: phone.slice(0, 30) } : {}), ...(address ? { address } : {}), ...(hours ? { hours } : {}), ...(openingHours ? { openingHours } : {}), ...(bookingHref ? { booking: { href: bookingHref } } : {}) },
    assets,
    promise,
    reasons,
    services,
    firstSteps,
    proof,
    questions,
    closing,
    ...(gallery ? { gallery } : {}),
    about,
    ...(publications ? { publications } : {}),
    ...(menuPage ? { menuPage } : {}),
    contact,
    form: formContent,
    privacy,
    notFound: { heading: w.notFound, text: w.notFoundText, back: w.back },
    menu: { servicesLabel: w.menuServices, questionsLabel: w.menuQuestions },
    home: { seo: { title: (t(home.seo.title, locale) || siteName).slice(0, 70), description: homeDescription.slice(0, 170) } },
    ...(signature.kind ? { signature: signature.content } : {}),
  } as SiteContent;
  const style = spec.brand.servicesStyle ?? { direction: "editorial" as const, palette: "pine" as const };
  const concept = spec.brand.concept;
  const design: SiteDesign = {
    system: "services@0.1",
    direction: style.direction,
    palette: style.palette,
    ...(style.type ? { type: style.type } : {}),
    ...(style.motif ? { motif: style.motif } : {}),
    ...(concept?.hero ? { hero: concept.hero } : {}),
    ...(signature.kind ? { signature: signature.kind } : {}),
    ...(concept?.feel ? { feel: concept.feel } : {}),
    ...(concept?.motion ? { motion: concept.motion } : {}),
  };
  // Which built file shows each page of the spec, for the preview.
  const pagesMap: Record<string, string> = { [home.id]: "index.html" };
  if (aboutPage) pagesMap[aboutPage.id] = `${about.slug}/index.html`;
  if (contactPage) pagesMap[contactPage.id] = `${contact.slug}/index.html`;
  if (privacyPage) pagesMap[privacyPage.id] = `${privacy.slug}/index.html`;
  if (publicationsPage && publications) pagesMap[publicationsPage.id] = `${publications.slug}/index.html`;
  if (menuSpecPage && menuPage) pagesMap[menuSpecPage.id] = `${menuPage.slug}/index.html`;
  return { ok: true, content, design, pages: pagesMap };
}
