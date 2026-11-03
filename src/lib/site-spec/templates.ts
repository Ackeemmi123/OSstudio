/**
 * A first draft of a website, from a template and the client's confirmed brief.
 * It gives the structure a person would otherwise build by hand: pages, sections,
 * menus, buttons, common headings, search titles and image placeholders. What only
 * a person can write is left as an instruction in brackets, which blocks approval
 * (isPlaceholderText) and shows in the preview, so nothing unfinished can pass.
 * The privacy notice and consent wording say outright that they are placeholders
 * needing legal review, and the shop says nothing is connected: a template must
 * not read as if those things were done.
 *
 * It uses no AI. Only confirmed brief values are copied, each with its source.
 */
import type { Client, Project } from "@/lib/domain/types";
import { type SectionKind, type SiteLocale } from "./catalog";
import { startingSpec, type StartingSpec } from "./from-brief";
import type { LocalizedText, SiteSpec, SiteSpecAsset, SiteSpecPage, SiteSpecSection, SiteSpecSource } from "./schema";

export const SITE_TEMPLATES = ["services", "shop", "single"] as const;
export type SiteTemplate = (typeof SITE_TEMPLATES)[number];

export const SITE_TEMPLATE_LABELS: Record<SiteTemplate, { label: string; pages: string; note?: string }> = {
  services: { label: "Services business", pages: "Home, Services, About, Contact, Privacy" },
  shop: { label: "Online shop", pages: "Home, Shop, About, FAQ, Contact, Privacy", note: "Only describes the pages. Products, prices, payments, shipping and shop integrations are not set up by this." },
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
  howItWorks: { en: "How it works", sv: "Så går det till", fi: "Näin se toimii" },
  ourValues: { en: "What we stand for", sv: "Det här står vi för", fi: "Arvomme" },
  theShop: { en: "About the shop", sv: "Om butiken", fi: "Tietoa kaupasta" },
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
  const items = (kind: "features" | "services" | "testimonials" | "team" | "faq", count: number, faqNote = "") =>
    Array.from({ length: count }, (_, i) => {
      const id = nextId("item");
      switch (kind) {
        case "features":
          return { id, title: all(`[Point ${i + 1}: a real strength, in 2 to 4 words]`), body: all("[One sentence with a concrete fact that backs it up]") };
        case "services":
          return { id, title: all(`[Service ${i + 1}: its plain name]`), body: all("[Who it is for, what they get, and the result they can expect]") };
        case "testimonials":
          return { id, quote: all("[A real customer's words, used with their permission]"), author: "[Their name and, if they agree, company]" };
        case "team":
          return { id, name: "[A person's name, with their consent]", role: all("[Their role]") };
        case "faq":
          return { id, question: all(`[Question ${i + 1}: something customers really ask]`), answer: all(`[A short, direct answer${faqNote}]`) };
      }
    });

  const section = (plan: SectionPlan): SiteSpecSection => ({ id: nextId(plan.kind.replace("_", "-")), ...plan }) as unknown as SiteSpecSection;

  const hero = (variant: string, target: string, photo: string, label?: Words) =>
    section({ kind: "hero", variant, heading: all(`[Headline: what ${name} does for whom, in under 10 words]`), subheading: all("[One or two sentences on why it matters to them, and why choose this business]"), mediaAssetId: image(photo), buttons: [buttonTo(target, label)] });
  const pageIntro = (headline: string, intro: string) => section({ kind: "hero", variant: "centered", heading: all(headline), subheading: all(intro), buttons: [] });
  const whatWeDo = () => {
    const { body, source } = offeringText();
    return section({ kind: "text", variant: "single_column", heading: words(WORDS.whatWeDo), body, ...(source ? { source } : {}) });
  };
  const features = (variant: string, heading: Words = WORDS.whyUs) => section({ kind: "features", variant, heading: words(heading), items: items("features", variant === "grid_4" ? 4 : 3) });
  const steps = () => section({ kind: "features", variant: "list", heading: words(WORDS.howItWorks), items: items("features", 3).map((item, i) => ({ ...item, title: all(`[Step ${i + 1}: what happens, in a few words]`), body: all("[What the customer does or gets at this step]") })) });
  const servicesList = (variant: string) => section({ kind: "services", variant, heading: words(WORDS.ourServices), items: items("services", 3) });
  const quotes = (variant = "quotes") => section({ kind: "testimonials", variant, heading: words(WORDS.customersSay), items: items("testimonials", 2) });
  const about = (variant = "image_right") => section({ kind: "text_media", variant, heading: words(WORDS.about), body: all(`[${name}'s story: how it started, who works here, and what makes them different]`), mediaAssetId: image("The people or the place behind the business"), buttons: [] });
  const team = () => section({ kind: "team", variant: "grid", heading: words(WORDS.ourTeam), items: items("team", 2) });
  const faq = (variant = "accordion", count = 4, note = "") => section({ kind: "faq", variant, heading: words(WORDS.questions), items: items("faq", count, note) });
  const cta = (variant: string, target: string, label?: Words) => section({ kind: "cta", variant, heading: all("[Invite them to take the next step, in one short line]"), body: all("[What happens after they get in touch, and how soon]"), button: buttonTo(target, label) });
  const contact = () => section({ kind: "contact", variant: "form_and_details", heading: words(WORDS.getInTouch), body: all("[Address, phone number and opening hours, as the client confirms them]"), formId: "contact-form" });
  const privacyText = () => section({ kind: "text", variant: "single_column", heading: words(WORDS.privacyHeading), body: all(`[PLACEHOLDER, NOT A PRIVACY NOTICE. Write ${name}'s own notice with them: what is collected, why, for how long, who receives it, and whom to ask. It needs client-specific details and legal review before publishing.]`) });
  const gallery = (variant: string) => section({ kind: "gallery", variant, heading: words(WORDS.products), assetIds: [image("A product, once the client has chosen what to show"), image("Another product"), image("A third product")] });
  /** Says outright that nothing is connected, so a draft cannot be read as a working shop. */
  const shopStatus = () => section({ kind: "text", variant: "single_column", heading: words(WORDS.theShop), body: all("[NOT SET UP: no products, prices, payments, shipping or shop platform are connected. Say what will be sold and how customers will buy, once the client has decided.]") });

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

  return { name, all, words, assets, page, hero, pageIntro, whatWeDo, features, steps, servicesList, quotes, about, team, faq, cta, contact, privacyText, gallery, shopStatus };
}

/**
 * A starting look for each template: a considered palette and type, so a draft
 * looks designed from the first moment. It is still a starting point: it has no
 * source, so a person must choose or keep the brand before approval. The preview
 * loads no web fonts, so these are families most computers have.
 */
const LOOKS: Record<SiteTemplate, SiteSpec["brand"]> = {
  // Quiet confidence: warm paper, deep green, an editorial serif.
  services: {
    colors: { primary: "#1E3A34", accent: "#B8763A", background: "#F6F3EC", text: "#16201D", neutral: ["#E9E4D8", "#CFC8B8", "#58625C"] },
    typography: { heading: { family: "Iowan Old Style", weight: 500 }, body: { family: "Inter", weight: 400 }, scale: "1.333" },
    radius: "none",
    density: "regular",
  },
  // Bold and tactile: espresso and terracotta, heavy tight type.
  shop: {
    colors: { primary: "#2A1A12", accent: "#C8553D", background: "#FBF6EE", text: "#21140D", neutral: ["#F0E4D3", "#D8C8B2", "#6A5849"] },
    typography: { heading: { family: "Helvetica Neue", weight: 700 }, body: { family: "Helvetica Neue", weight: 400 }, scale: "1.333" },
    radius: "soft",
    density: "regular",
  },
  // Calm and airy: sage, soft corners, a light serif with room to breathe.
  single: {
    colors: { primary: "#3C5546", accent: "#A7BCA0", background: "#F3F4EE", text: "#1C2620", neutral: ["#E4E8DE", "#C9D0C2", "#55615A"] },
    typography: { heading: { family: "Palatino", weight: 400 }, body: { family: "Inter", weight: 400 }, scale: "1.333" },
    radius: "round",
    density: "airy",
  },
};

/** The draft for this template. `locales`: the website's languages, the first being the default. */
export function templateSpec(client: Client, project: Pick<Project, "projectType">, template: SiteTemplate, locales: SiteLocale[]): StartingSpec {
  const start = startingSpec(client, project);
  const languages = locales.length ? locales : (["en"] as SiteLocale[]);
  const b = builder(client, project, languages);
  const privacy = () => b.page("privacy", WORDS.privacy, SLUGS.privacy, "footer", [b.privacyText()]);

  const pages: Record<SiteTemplate, () => SiteSpecPage[]> = {
    services: () => [
      b.page("home", WORDS.home, null, "main", [b.hero("split_image_right", "contact", "The work, or the people doing it"), b.whatWeDo(), b.servicesList("cards"), b.features("grid_3"), b.quotes(), b.cta("banner", "contact")]),
      b.page("services", WORDS.services, SLUGS.services, "main", [b.pageIntro("[Headline: what clients can hire them for]", "[One or two sentences on the kind of client and work they do best]"), b.servicesList("detailed"), b.steps(), b.faq("accordion", 3), b.cta("card", "contact")]),
      b.page("about", WORDS.about, SLUGS.about, "main", [b.about("image_left"), b.features("grid_3", WORDS.ourValues), b.team(), b.cta("banner", "contact")]),
      b.page("contact", WORDS.contact, SLUGS.contact, "main", [b.contact()]),
      privacy(),
    ],
    shop: () => [
      b.page("home", WORDS.home, null, "main", [b.hero("full_bleed_image", "shop", "A product in use, once the client has chosen it", WORDS.shop), b.whatWeDo(), b.gallery("grid"), b.features("grid_4"), b.quotes(), b.cta("banner", "shop", WORDS.shop)]),
      b.page("shop", WORDS.shop, SLUGS.shop, "main", [b.shopStatus(), b.gallery("masonry"), b.cta("card", "contact")]),
      b.page("about", WORDS.about, SLUGS.about, "main", [b.about("image_right"), b.features("grid_3", WORDS.ourValues)]),
      b.page("faq", WORDS.faq, SLUGS.faq, "main", [b.faq("accordion", 4, ". Only promise delivery, returns or payment terms the client has confirmed")]),
      b.page("contact", WORDS.contact, SLUGS.contact, "main", [b.contact()]),
      privacy(),
    ],
    single: () => [b.page("home", WORDS.home, null, "main", [b.hero("centered", "home", "The work, or the people doing it"), b.whatWeDo(), b.servicesList("cards"), b.steps(), b.about("image_left"), b.quotes("carousel"), b.faq("two_column", 3), b.contact()]), privacy()],
  };
  const built = pages[template]();

  const spec: SiteSpec = {
    ...start.spec,
    locales: { available: languages, default: languages[0] },
    brand: LOOKS[template],
    strategy: { ...start.spec.strategy, primaryCta: { label: b.words(template === "shop" ? WORDS.shop : WORDS.contactUs), targetPageId: template === "shop" ? "shop" : template === "single" ? "home" : "contact" } },
    assets: b.assets,
    pages: built,
    forms: [{ id: "contact-form", purpose: "contact", fields: ["name", "email", "message"], consentText: b.all("[PLACEHOLDER: this client's own consent wording, legally reviewed. Say what the answers are used for.]"), recipient: "client_contact" }],
    seo: { ...start.spec.seo, siteName: b.all(b.name), defaultDescription: b.all("[One sentence for search results about the business]") },
  };
  return { spec, unconfirmed: start.unconfirmed };
}
