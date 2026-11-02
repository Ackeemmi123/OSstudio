/**
 * A first draft of a website, from a template and the client's confirmed brief.
 * It gives the structure a person would otherwise build by hand: pages, sections,
 * menus, buttons, common headings, search titles and image placeholders. What only
 * a person can write is left as an instruction in brackets, which blocks approval
 * (isPlaceholderText) and shows in the preview, so nothing unfinished can pass.
 *
 * It uses no AI. Only confirmed brief values are copied, each with its source.
 */
import type { Client, Project } from "@/lib/domain/types";
import { type SectionKind, type SiteLocale } from "./catalog";
import { startingSpec, type StartingSpec } from "./from-brief";
import type { LocalizedText, SiteSpec, SiteSpecAsset, SiteSpecPage, SiteSpecSection, SiteSpecSource } from "./schema";

export const SITE_TEMPLATES = ["services", "shop", "single"] as const;
export type SiteTemplate = (typeof SITE_TEMPLATES)[number];

export const SITE_TEMPLATE_LABELS: Record<SiteTemplate, { label: string; pages: string }> = {
  services: { label: "Services business", pages: "Home, Services, About, Contact, Privacy" },
  shop: { label: "Online shop", pages: "Home, Shop, About, FAQ, Contact, Privacy" },
  single: { label: "Single page", pages: "One long page, plus Privacy" },
};

export function suggestedTemplate(project: Pick<Project, "projectType">): SiteTemplate {
  return project.projectType === "ecommerce" || project.projectType === "website_ecommerce" ? "shop" : "services";
}

type Words = Record<SiteLocale, string>;

/** Words a visitor reads as they are, so they exist in every website language. */
const WORDS = {
  home: { en: "Home", sv: "Hem", fi: "Etusivu" },
  services: { en: "Services", sv: "Tjänster", fi: "Palvelut" },
  shop: { en: "Shop", sv: "Butik", fi: "Kauppa" },
  about: { en: "About", sv: "Om oss", fi: "Tietoa meistä" },
  faq: { en: "FAQ", sv: "Vanliga frågor", fi: "Usein kysyttyä" },
  contact: { en: "Contact", sv: "Kontakt", fi: "Yhteystiedot" },
  privacy: { en: "Privacy", sv: "Integritet", fi: "Tietosuoja" },
  contactUs: { en: "Contact us", sv: "Kontakta oss", fi: "Ota yhteyttä" },
  whatWeDo: { en: "What we do", sv: "Vad vi gör", fi: "Mitä teemme" },
  whyUs: { en: "Why choose us", sv: "Varför välja oss", fi: "Miksi valita meidät" },
  ourServices: { en: "Our services", sv: "Våra tjänster", fi: "Palvelumme" },
  customersSay: { en: "What customers say", sv: "Vad kunderna säger", fi: "Asiakkaamme kertovat" },
  ourTeam: { en: "Our team", sv: "Vårt team", fi: "Tiimimme" },
  questions: { en: "Frequently asked questions", sv: "Vanliga frågor", fi: "Usein kysytyt kysymykset" },
  getInTouch: { en: "Get in touch", sv: "Hör av dig", fi: "Ota yhteyttä" },
  findUs: { en: "Find us", sv: "Hitta till oss", fi: "Löydä meille" },
  products: { en: "Our products", sv: "Våra produkter", fi: "Tuotteemme" },
  privacyHeading: { en: "How we handle your details", sv: "Så hanterar vi dina uppgifter", fi: "Näin käsittelemme tietojasi" },
} satisfies Record<string, Words>;

const SLUGS = {
  services: { en: "services", sv: "tjanster", fi: "palvelut" },
  shop: { en: "shop", sv: "butik", fi: "kauppa" },
  about: { en: "about", sv: "om-oss", fi: "tietoa-meista" },
  faq: { en: "faq", sv: "vanliga-fragor", fi: "usein-kysyttya" },
  contact: { en: "contact", sv: "kontakt", fi: "yhteystiedot" },
  privacy: { en: "privacy", sv: "integritet", fi: "tietosuoja" },
} satisfies Record<string, Words>;

/** A section as a template describes it: its kind, layout and contents. */
type SectionPlan = { kind: SectionKind; variant: string } & Record<string, unknown>;

function builder(client: Client, project: Pick<Project, "projectType">, locales: SiteLocale[]) {
  const name = client.name.trim().slice(0, 60);
  const all = (text: string): LocalizedText => Object.fromEntries(locales.map((l) => [l, text]));
  const words = (w: Words): LocalizedText => Object.fromEntries(locales.map((l) => [l, w[l]]));
  const assets: SiteSpecAsset[] = [];
  const counts = new Map<string, number>();
  const nextId = (prefix: string) => {
    const n = (counts.get(prefix) ?? 0) + 1;
    counts.set(prefix, n);
    return `${prefix}-${n}`;
  };

  const image = (description: string): string => {
    const id = nextId("image");
    assets.push({ id, kind: "photo", alt: all("[Say what this image shows]"), origin: "placeholder", description });
    return id;
  };

  const brief = startingSpec(client, project).spec.pages[0].sections[1];
  /** The confirmed offering in the default language, to translate into the others; or an instruction. */
  const offeringText = (): { body: LocalizedText; source?: SiteSpecSource } => {
    const copied = brief.kind === "text" ? brief.body.en?.trim() : "";
    if (brief.kind !== "text" || !copied || !brief.source) return { body: all(`[Say what ${name} offers]`) };
    const body: LocalizedText = all("[Translate this from the first language]");
    body[locales[0]] = copied;
    return { body, source: brief.source };
  };

  const buttonTo = (target: string, label: Words = WORDS.contactUs) => ({ label: words(label), targetPageId: target });
  const items = (kind: "features" | "services" | "testimonials" | "team" | "faq", count: number) =>
    Array.from({ length: count }, () => {
      const id = nextId("item");
      switch (kind) {
        case "features":
          return { id, title: all("[A short reason to choose them]"), body: all("[One sentence about it]") };
        case "services":
          return { id, title: all("[Name of a service]"), body: all("[What it includes, and who it is for]") };
        case "testimonials":
          return { id, quote: all("[A real quote, used with the customer's permission]"), author: "[The customer's name]" };
        case "team":
          return { id, name: "[A person's name, with their consent]", role: all("[Their role]") };
        case "faq":
          return { id, question: all("[A question customers often ask]"), answer: all("[The answer, in a sentence or two]") };
      }
    });

  const section = (plan: SectionPlan): SiteSpecSection => ({ id: nextId(plan.kind.replace("_", "-")), ...plan }) as unknown as SiteSpecSection;

  const hero = (target: string, photo: string) =>
    section({ kind: "hero", variant: "split_image_right", heading: all(`[Say what ${name} offers, and for whom]`), subheading: all("[One line on why it matters to them]"), mediaAssetId: image(photo), buttons: [buttonTo(target)] });
  const whatWeDo = () => {
    const { body, source } = offeringText();
    return section({ kind: "text", variant: "single_column", heading: words(WORDS.whatWeDo), body, ...(source ? { source } : {}) });
  };
  const whyUs = () => section({ kind: "features", variant: "grid_3", heading: words(WORDS.whyUs), items: items("features", 3) });
  const servicesList = () => section({ kind: "services", variant: "cards", heading: words(WORDS.ourServices), items: items("services", 3) });
  const quotes = () => section({ kind: "testimonials", variant: "quotes", heading: words(WORDS.customersSay), items: items("testimonials", 2) });
  const about = () => section({ kind: "text_media", variant: "image_right", heading: words(WORDS.about), body: all(`[${name}'s story: who they are and how they work]`), mediaAssetId: image("The people or the place behind the business"), buttons: [] });
  const team = () => section({ kind: "team", variant: "grid", heading: words(WORDS.ourTeam), items: items("team", 2) });
  const faq = (count = 4) => section({ kind: "faq", variant: "accordion", heading: words(WORDS.questions), items: items("faq", count) });
  const cta = (target: string) => section({ kind: "cta", variant: "banner", heading: all("[Invite them to take the next step]"), body: all("[One line on what happens next]"), button: buttonTo(target) });
  const contact = () => section({ kind: "contact", variant: "form_and_details", heading: words(WORDS.getInTouch), body: all("[Address, phone number and opening hours]"), formId: "contact-form" });
  const privacyText = () => section({ kind: "text", variant: "single_column", heading: words(WORDS.privacyHeading), body: all("[The client's privacy notice: what is collected, why, for how long, and whom to ask]") });
  const gallery = () => section({ kind: "gallery", variant: "grid", heading: words(WORDS.products), assetIds: [image("A product"), image("Another product"), image("A third product")] });

  const page = (id: string, title: Words, slug: Words | null, nav: SiteSpecPage["nav"], sections: SiteSpecSection[]): SiteSpecPage => ({
    id,
    slug: slug ? words(slug) : all(""),
    title: words(title),
    nav,
    seo: {
      title: Object.fromEntries(locales.map((l) => [l, slug ? `${title[l]} | ${name}`.slice(0, 60) : name])),
      description: all(`[One sentence for search results about ${title.en === "Home" ? "the business" : `the ${title.en} page`}]`),
      noindex: false,
    },
    sections,
  });

  return { name, all, words, assets, page, hero, whatWeDo, whyUs, servicesList, quotes, about, team, faq, cta, contact, privacyText, gallery };
}

/** The draft for this template. `locales`: the website's languages, the first being the default. */
export function templateSpec(client: Client, project: Pick<Project, "projectType">, template: SiteTemplate, locales: SiteLocale[]): StartingSpec {
  const start = startingSpec(client, project);
  const languages = locales.length ? locales : (["en"] as SiteLocale[]);
  const b = builder(client, project, languages);
  const privacy = () => b.page("privacy", WORDS.privacy, SLUGS.privacy, "footer", [b.privacyText()]);

  const pages: Record<SiteTemplate, () => SiteSpecPage[]> = {
    services: () => [
      b.page("home", WORDS.home, null, "main", [b.hero("contact", "The work, or the people doing it"), b.whatWeDo(), b.whyUs(), b.quotes(), b.cta("contact")]),
      b.page("services", WORDS.services, SLUGS.services, "main", [b.servicesList(), b.faq(3), b.cta("contact")]),
      b.page("about", WORDS.about, SLUGS.about, "main", [b.about(), b.team()]),
      b.page("contact", WORDS.contact, SLUGS.contact, "main", [b.contact()]),
      privacy(),
    ],
    shop: () => [
      b.page("home", WORDS.home, null, "main", [b.hero("shop", "A product in use"), b.whatWeDo(), b.gallery(), b.whyUs(), b.quotes(), b.cta("shop")]),
      b.page("shop", WORDS.shop, SLUGS.shop, "main", [b.cta("contact")]),
      b.page("about", WORDS.about, SLUGS.about, "main", [b.about()]),
      b.page("faq", WORDS.faq, SLUGS.faq, "main", [b.faq()]),
      b.page("contact", WORDS.contact, SLUGS.contact, "main", [b.contact()]),
      privacy(),
    ],
    single: () => [b.page("home", WORDS.home, null, "main", [b.hero("home", "The work, or the people doing it"), b.whatWeDo(), b.servicesList(), b.about(), b.quotes(), b.faq(3), b.contact()]), privacy()],
  };
  const built = pages[template]();

  const spec: SiteSpec = {
    ...start.spec,
    locales: { available: languages, default: languages[0] },
    strategy: { ...start.spec.strategy, primaryCta: { label: b.words(template === "shop" ? WORDS.shop : WORDS.contactUs), targetPageId: template === "shop" ? "shop" : template === "single" ? "home" : "contact" } },
    assets: b.assets,
    pages: built,
    forms: [{ id: "contact-form", purpose: "contact", fields: ["name", "email", "message"], consentText: b.all("[Say what the answers are used for, as agreed with the client]"), recipient: "client_contact" }],
    seo: { ...start.spec.seo, siteName: b.all(b.name), defaultDescription: b.all("[One sentence for search results about the business]") },
  };
  return { spec, unconfirmed: start.unconfirmed };
}
