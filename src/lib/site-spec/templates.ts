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
  services: { label: "Services business", pages: "Home, About, Contact, Privacy" },
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
  shop: { en: "Shop", sv: "Butik", fi: "Kauppa" },
  about: { en: "About", sv: "Om oss", fi: "Tietoa meistä" },
  faq: { en: "FAQ", sv: "Vanliga frågor", fi: "Usein kysyttyä" },
  contact: { en: "Contact", sv: "Kontakt", fi: "Yhteystiedot" },
  privacy: { en: "Privacy", sv: "Integritet", fi: "Tietosuoja" },
  contactUs: { en: "Contact us", sv: "Kontakta oss", fi: "Ota yhteyttä" },
  seeServices: { en: "See our services", sv: "Se våra tjänster", fi: "Katso palvelumme" },
  questions: { en: "Frequently asked questions", sv: "Vanliga frågor", fi: "Usein kysytyt kysymykset" },
  getInTouch: { en: "Get in touch", sv: "Hör av dig", fi: "Ota yhteyttä" },
  privacyHeading: { en: "How we handle your details", sv: "Så hanterar vi dina uppgifter", fi: "Näin käsittelemme tietojasi" },
} satisfies Record<string, Words>;

const SLUGS = {
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

  const buttonTo = (target: string, label: Words = WORDS.contactUs, sectionId?: string) => ({ label: words(label), targetPageId: target, ...(sectionId ? { targetSectionId: sectionId } : {}) });
  const points = (count: number, title: (n: number) => string, body: string) => Array.from({ length: count }, (_, i) => ({ id: nextId("item"), title: all(title(i + 1)), body: all(body) }));
  const steps = (count: number, title: string, body: string) => points(count, (n) => `[Step ${n}: ${title}]`, body);
  const items = (kind: "services" | "products" | "testimonials" | "team" | "faq", count: number, faqNote = "") =>
    Array.from({ length: count }, (_, i) => {
      const id = nextId("item");
      switch (kind) {
        case "services":
          return { id, title: all(`[Service ${i + 1}: its plain name]`), body: all("[Who it is for, what they get, and the result they can expect]"), price: all("[Only a price the client confirmed, or clear this field]") };
        case "products":
          return { id, title: all(`[Product ${i + 1}: its plain name]`), body: all("[What it is and who it suits, in one or two sentences]"), price: all("[Only a price the client confirmed, or clear this field]") };
        case "testimonials":
          return { id, quote: all("[A real customer's words, used with their permission. If there are none yet, remove this section]"), author: "[Their name and, if they agree, company]" };
        case "team":
          return { id, name: "[A person's name, with their consent]", role: all("[Their role]") };
        case "faq":
          return { id, question: all(`[Question ${i + 1}: something customers really ask]`), answer: all(`[A short, direct answer${faqNote}]`) };
      }
    });

  const section = (plan: SectionPlan): SiteSpecSection => ({ id: nextId(plan.kind.replace("_", "-")), ...plan }) as unknown as SiteSpecSection;

  const hero = (variant: string, headline: string, photo: string, buttons: ReturnType<typeof buttonTo>[]) =>
    section({
      kind: "hero",
      variant,
      eyebrow: all("[Who it is for, or where, in a few words]"),
      heading: all(headline),
      subheading: all("[One or two sentences on why it matters to them, and why choose this business]"),
      mediaAssetId: image(photo),
      buttons,
      reassurance: all("[An honest line that makes the next step feel safe, or clear this field]"),
    });
  /** The confirmed offering, with its source; or an instruction to write it. */
  const offering = (heading: string) => {
    const { body, source } = offeringText();
    return section({ kind: "text", variant: "single_column", heading: all(heading), body, ...(source ? { source } : {}) });
  };
  const features = (variant: string, heading: string, list: { id: string; title: LocalizedText; body: LocalizedText }[]) => section({ kind: "features", variant, heading: all(heading), items: list });
  const servicesList = (variant: string, heading: string) => section({ kind: "services", variant, heading: all(heading), items: items("services", 3) });
  /** No catalogue: the shop platform will own that. This only shows what the range is like. */
  const productRange = (heading: string) => section({ kind: "services", variant: "cards", heading: all(heading), items: items("products", 3) });
  const featured = (target: string) => section({ kind: "text_media", variant: "image_right", heading: all("[The one product worth seeing right now, by its name]"), body: all("[What makes it worth trying, and who it suits]"), mediaAssetId: image("The featured product, once the client has chosen it"), buttons: [buttonTo(target, WORDS.shop)] });
  const quotes = (variant = "quotes") => section({ kind: "testimonials", variant, heading: all("[What clients say changed for them, in their terms]"), items: items("testimonials", 2) });
  const about = (variant = "image_right") => section({ kind: "text_media", variant, heading: all("[A line about who they are, not the word About]"), body: all(`[${name}'s story: how it started, who works here, and what makes them different]`), mediaAssetId: image("The people or the place behind the business"), buttons: [] });
  const team = () => section({ kind: "team", variant: "grid", heading: all("[A line about the people a client will deal with]"), items: items("team", 2) });
  const faq = (variant = "accordion", count = 4, note = "") => section({ kind: "faq", variant, heading: words(WORDS.questions), items: items("faq", count, note) });
  const cta = (variant: string, button: ReturnType<typeof buttonTo>) => section({ kind: "cta", variant, heading: all("[Invite them to take the next step, in one short line]"), body: all("[What happens after they get in touch, and how soon]"), button });
  const contact = () => section({ kind: "contact", variant: "form_and_details", heading: words(WORDS.getInTouch), body: all("[Address, phone number and opening hours, as the client confirms them]"), formId: "contact-form" });
  const privacyText = () => section({ kind: "text", variant: "single_column", heading: words(WORDS.privacyHeading), body: all(`[PLACEHOLDER, NOT A PRIVACY NOTICE. Write ${name}'s own notice with them: what is collected, why, for how long, who receives it, and whom to ask. It needs client-specific details and legal review before publishing.]`) });
  const gallery = (variant: string) => section({ kind: "gallery", variant, heading: all("[A line that shows the products off, in the client's words]"), assetIds: [image("A product, once the client has chosen what to show"), image("Another product"), image("A third product")] });
  /** Says outright that nothing is connected, so a draft cannot be read as a working shop. */
  const shopStatus = () => section({ kind: "text", variant: "single_column", heading: all("[What this shop sells, in one line]"), body: all("[NOT SET UP: no products, prices, payments, shipping or shop platform are connected. Say what will be sold and how customers will buy, once the client has decided.]") });

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

  return { name, all, words, assets, buttonTo, points, steps, page, hero, offering, features, servicesList, productRange, featured, quotes, about, team, faq, cta, contact, privacyText, gallery, shopStatus };
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

/** The header's button: the shop, or straight to the form. */
function primaryCta(template: SiteTemplate, pages: SiteSpecPage[], b: ReturnType<typeof builder>) {
  if (template === "shop") return b.buttonTo("shop", WORDS.shop);
  const page = pages.find((p) => p.sections.some((s) => s.kind === "contact"))!;
  return b.buttonTo(page.id, WORDS.contactUs, page.sections.find((s) => s.kind === "contact")!.id);
}

/** The draft for this template. `locales`: the website's languages, the first being the default. */
export function templateSpec(client: Client, project: Pick<Project, "projectType">, template: SiteTemplate, locales: SiteLocale[]): StartingSpec {
  const start = startingSpec(client, project);
  const languages = locales.length ? locales : (["en"] as SiteLocale[]);
  const b = builder(client, project, languages);
  const privacy = () => b.page("privacy", WORDS.privacy, SLUGS.privacy, "footer", [b.privacyText()]);

  /** The whole story is on the home page: what you get, how it starts, who says so. */
  const services = (): SiteSpecPage[] => {
    const form = b.contact();
    const list = b.servicesList("cards", "[What they take off a client's desk, in one specific line]");
    return [
      b.page("home", WORDS.home, null, "main", [
        b.hero("split_image_right", `[Headline: the outcome a client of ${b.name} gets, in under 10 words]`, "The work, or the people doing it", [b.buttonTo("contact", WORDS.contactUs, form.id), b.buttonTo("home", WORDS.seeServices, list.id)]),
        b.features("grid_3", "[What a client can rely on, in one specific line]", b.points(3, (n) => `[Promise ${n}: such as who they deal with, the price or how fast they hear back]`, "[One sentence with a concrete fact that backs it up]")),
        list,
        b.features("list", "[What worries a new client most, and how the start goes]", b.steps(3, "what happens, in a few words", "[What the client does or gets at this step]")),
        b.quotes(),
        b.faq("accordion", 3),
        b.cta("banner", b.buttonTo("contact", WORDS.contactUs, form.id)),
      ]),
      b.page("about", WORDS.about, SLUGS.about, "main", [b.about("image_left"), b.offering("[What they do, for whom, in one specific line]"), b.team()]),
      b.page("contact", WORDS.contact, SLUGS.contact, "main", [form]),
      privacy(),
    ];
  };
  /** From wanting one, to choosing one, to knowing the terms before buying. */
  const shop = (): SiteSpecPage[] => [
    b.page("home", WORDS.home, null, "main", [
      b.hero("full_bleed_image", `[Headline: why ${b.name} is worth buying from, in 10 words]`, "A product in use, once the client has chosen it", [b.buttonTo("shop", WORDS.shop)]),
      b.featured("shop"),
      b.productRange("[What the range is, and how it makes choosing easy, in one line]"),
      b.features("list", "[The question that helps a customer choose, in their words]", b.points(3, (n) => `[Choice ${n}: a situation a customer recognises]`, "[Which product to start with, and why]")),
      b.features("grid_4", "[What a customer can count on before buying, in one line]", [
        ...b.points(1, () => "[Delivery]", "[Costs, carriers and times, only as the client confirms them]"),
        ...b.points(1, () => "[Returns]", "[What happens if something is wrong, only as the client and legal review confirm it]"),
        ...b.points(1, () => "[Payment]", "[The accepted methods, only as the client confirms them]"),
        ...b.points(1, () => "[Quality: a real strength, in 2 to 4 words]", "[One sentence with a concrete fact that backs it up]"),
      ]),
      b.quotes(),
    ]),
    b.page("shop", WORDS.shop, SLUGS.shop, "main", [b.shopStatus(), b.gallery("masonry"), b.cta("card", b.buttonTo("contact"))]),
    b.page("about", WORDS.about, SLUGS.about, "main", [b.about("image_right"), b.offering("[What they make or sell, for whom, in one specific line]")]),
    b.page("faq", WORDS.faq, SLUGS.faq, "main", [b.faq("accordion", 4, ". Only promise delivery, returns or payment terms the client has confirmed")]),
    b.page("contact", WORDS.contact, SLUGS.contact, "main", [b.contact()]),
    privacy(),
  ];
  /** One page that walks towards the form at its end. */
  const single = (): SiteSpecPage[] => {
    const form = b.contact();
    return [
      b.page("home", WORDS.home, null, "main", [
        b.hero("centered", "[Headline: what a visitor gets here, in under 10 words]", "The work, or the people doing it", [b.buttonTo("home", WORDS.contactUs, form.id)]),
        b.offering("[What it is like to come here, in one specific line]"),
        b.servicesList("list", "[What is on offer, in one specific line]"),
        b.about("image_left"),
        b.features("list", "[What the first visit is like, in one line]", b.steps(3, "what happens, in a few words", "[What the visitor does or gets at this step]")),
        b.quotes("carousel"),
        b.faq("two_column", 3),
        form,
      ]),
      privacy(),
    ];
  };
  const pages: Record<SiteTemplate, () => SiteSpecPage[]> = { services, shop, single };
  const built = pages[template]();

  const spec: SiteSpec = {
    ...start.spec,
    locales: { available: languages, default: languages[0] },
    brand: LOOKS[template],
    strategy: { ...start.spec.strategy, primaryCta: primaryCta(template, built, b) },
    assets: b.assets,
    pages: built,
    forms: [{ id: "contact-form", purpose: "contact", fields: ["name", "email", "message"], consentText: b.all("[PLACEHOLDER: this client's own consent wording, legally reviewed. Say what the answers are used for.]"), submitLabel: b.all("[The action, in 2 or 3 words]"), replyNote: b.all("[What happens after sending and how soon. Only what is true]"), recipient: "client_contact" }],
    seo: { ...start.spec.seo, siteName: b.all(b.name), defaultDescription: b.all("[One sentence for search results about the business]") },
  };
  return { spec, unconfirmed: start.unconfirmed };
}
