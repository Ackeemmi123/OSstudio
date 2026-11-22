/**
 * A website spec as the company design (design-systems/services) reads it.
 *
 * The company design is a fixed composition, not a list of blocks: a home
 * page with a promise, reasons, services, first steps, proof, questions and
 * a closing form, plus about, contact and privacy pages. This finds each part
 * in the spec by its kind and place, and says exactly what is missing instead
 * of guessing. Only people and quotes marked with consent are shown.
 */
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

const WORDS: Record<SiteLocale, { services: string; steps: string; questions: string; reasons: string; people: string; details: string; name: string; email: string; phone: string; message: string; send: string; notFound: string; notFoundText: string; back: string; menuServices: string; menuQuestions: string; contact: string; privacy: string; about: string; work: string }> = {
  sv: { services: "Tjänster", steps: "Så går det till", questions: "Frågor", reasons: "Därför", people: "Vi som jobbar här", details: "Kontaktuppgifter", name: "Namn", email: "E-post", phone: "Telefon", message: "Meddelande", send: "Skicka", notFound: "Sidan hittades inte", notFoundText: "Adressen finns inte längre, eller så skrevs den fel.", back: "Till startsidan", menuServices: "Tjänster", menuQuestions: "Frågor", contact: "Kontakt", privacy: "Integritet", about: "Om oss", work: "Arbeten" },
  fi: { services: "Palvelut", steps: "Näin edetään", questions: "Kysymykset", reasons: "Miksi me", people: "Meillä töissä", details: "Yhteystiedot", name: "Nimi", email: "Sähköposti", phone: "Puhelin", message: "Viesti", send: "Lähetä", notFound: "Sivua ei löytynyt", notFoundText: "Osoite ei ole enää käytössä, tai siinä on kirjoitusvirhe.", back: "Etusivulle", menuServices: "Palvelut", menuQuestions: "Kysymykset", contact: "Yhteystiedot", privacy: "Tietosuoja", about: "Meistä", work: "Töitämme" },
  en: { services: "Services", steps: "How it works", questions: "Questions", reasons: "Why us", people: "The people", details: "Contact details", name: "Name", email: "Email", phone: "Phone", message: "Message", send: "Send", notFound: "Page not found", notFoundText: "This address no longer exists, or it was mistyped.", back: "Back to the front page", menuServices: "Services", menuQuestions: "Questions", contact: "Contact", privacy: "Privacy", about: "About", work: "Our work" },
};

const ABOUT = /^(om|about|om-oss|meista|meist|tietoa|about-us)/;
const PRIVACY = /(integritet|privacy|tietosuoja|dataskydd)/;

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

export function servicesContent(spec: SiteSpec, images: Record<string, ServicesImage>, mode: ServicesMode): ServicesResult {
  const locale = spec.locales.default;
  const w = WORDS[locale];
  const missing: string[] = [];
  const need = (label: string, text: string, max: number, origin: Statement["origin"]): Statement => {
    if (!text) missing.push(`${label} is empty.`);
    else if (text.length > max) missing.push(`${label} is too long for the company design (at most ${max} characters, now ${text.length}).`);
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
    action: { label: (t(button?.label, locale) || w.contact).slice(0, 36), by: "form" },
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

  // Services.
  const servicesSection = firstOf("services");
  if (!servicesSection || !servicesSection.items.length) missing.push("Add a services section with at least one service.");
  const services = {
    label: (t(servicesSection?.eyebrow, locale) || w.services).slice(0, 60),
    heading: need("The services section's heading", t(servicesSection?.heading, locale), 110, originOf(servicesSection?.source)),
    items: (servicesSection?.items ?? []).slice(0, 8).map((item, i) => ({
      name: need(`Service ${i + 1}: title`, t(item.title, locale), 60, originOf(item.source ?? servicesSection?.source)),
      text: need(`Service ${i + 1}: text`, t(item.body, locale), 320, originOf(item.source ?? servicesSection?.source)),
      ...(t(item.price, locale) ? { price: need(`Service ${i + 1}: price`, t(item.price, locale), 50, originOf(item.source)) } : {}),
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
      .map((person) => ({ name: person.name.slice(0, 60), role: need(`${person.name}'s role`, t(person.role, locale), 70, originOf(person.source)), ...(imageId(person.assetId) ? { imageId: imageId(person.assetId) } : {}), consent: "given" as const })),
    seo: { title: (aboutPage ? t(aboutPage.seo.title, locale) || t(aboutPage.title, locale) : w.about).slice(0, 70) || w.about, description: (aboutPage ? t(aboutPage.seo.description, locale) : "").slice(0, 170) || (leadPara?.text ?? w.about).slice(0, 170) },
  };

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

  // Address and opening hours, exactly as written in the contact section.
  const address = t(contactSection?.address, locale).slice(0, 120);
  const hours = t(contactSection?.hours, locale).slice(0, 120);

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

  if (missing.length) return { ok: false, missing: [...new Set(missing)] };

  const content = {
    ...mode,
    language: locale,
    business: { name: siteName.slice(0, 60), ...(email ? { email } : {}), ...(phone ? { phone: phone.slice(0, 30) } : {}), ...(address ? { address } : {}), ...(hours ? { hours } : {}) },
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
    contact,
    form: formContent,
    privacy,
    notFound: { heading: w.notFound, text: w.notFoundText, back: w.back },
    menu: { servicesLabel: w.menuServices, questionsLabel: w.menuQuestions },
    home: { seo: { title: (t(home.seo.title, locale) || siteName).slice(0, 70), description: homeDescription.slice(0, 170) } },
  } as SiteContent;
  const style = spec.brand.servicesStyle ?? { direction: "editorial" as const, palette: "pine" as const };
  const design: SiteDesign = { system: "services@0.1", direction: style.direction, palette: style.palette, ...(style.type ? { type: style.type } : {}), ...(style.motif ? { motif: style.motif } : {}) };
  // Which built file shows each page of the spec, for the preview.
  const pagesMap: Record<string, string> = { [home.id]: "index.html" };
  if (aboutPage) pagesMap[aboutPage.id] = `${about.slug}/index.html`;
  if (contactPage) pagesMap[contactPage.id] = `${contact.slug}/index.html`;
  if (privacyPage) pagesMap[privacyPage.id] = `${privacy.slug}/index.html`;
  return { ok: true, content, design, pages: pagesMap };
}
