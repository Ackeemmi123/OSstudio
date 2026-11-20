/**
 * The section kinds a SiteSpec can use, with their layout variants and
 * labels. The catalogue is platform-neutral: a renderer maps each kind and
 * variant to its own templates or components, and says which ones it
 * supports. Adding a kind or variant here is a change to SiteSpec v1's
 * vocabulary, so keep ids stable.
 */

export const SITE_LOCALES = ["en", "sv", "fi"] as const;

/**
 * What draws and builds the site. "template" is Studio OS's own preview
 * template; the others are design systems in design-systems/, by name and
 * version. Absent from a spec: the template.
 */
export const DESIGN_SYSTEMS = ["template", "association@0.1", "services@0.1"] as const;
export type DesignSystem = (typeof DESIGN_SYSTEMS)[number];
export const DESIGN_SYSTEM_LABELS: Record<DesignSystem, string> = { template: "Studio OS template", "association@0.1": "Association (association@0.1)", "services@0.1": "Company (services@0.1)" };

/** The company design's style choices (design-systems/services/content.ts siteDesign; a test keeps them equal). */
export const SERVICES_DIRECTIONS = ["editorial", "formal", "statement"] as const;
export const SERVICES_PALETTES = ["pine", "oxblood", "signal", "harbor", "dry", "measure", "brick", "verdigris", "ember", "cobalt", "gold", "navy", "timber", "plum", "hazard", "slate", "forest", "indigo", "steel", "terracotta", "teal", "ochre"] as const;
export const SERVICES_TYPES = ["wide", "grotesk"] as const;
export const SERVICES_MOTIFS = ["pipe", "drain", "scale", "ripple", "courses"] as const;
export const SERVICES_DIRECTION_LABELS: Record<(typeof SERVICES_DIRECTIONS)[number], string> = { editorial: "Editorial: a story, warm and calm", formal: "Formal: established and serious", statement: "Statement: direct and bold" };
/** What each palette looks like, for people choosing and for the AI draft's style proposals. */
export const SERVICES_PALETTE_NOTES: Record<(typeof SERVICES_PALETTES)[number], string> = {
  pine: "deep pine green on warm paper, copper accent; calm and natural",
  oxblood: "deep wine red on cream; formal and traditional",
  signal: "near-black with a lime-green action colour; sharp and modern",
  harbor: "dark sea teal with an orange action colour; coastal and energetic",
  dry: "dark navy with a sky-blue action colour; clean and technical",
  measure: "near-black with a mint action colour; precise and modern",
  brick: "brick red on warm paper; solid, warm, building trades",
  verdigris: "patina green with a copper accent; crafted and grounded",
  ember: "deep red with a bright yellow action colour; urgent and bold",
  cobalt: "cobalt blue with light blue; trustworthy and fresh",
  gold: "black with a gold action colour; premium and confident",
  navy: "navy with a warm gold accent; established and serious",
  timber: "olive wood green on warm paper, amber accent; joinery and wood",
  plum: "dark plum with a pink action colour; personal and warm",
  hazard: "black with safety yellow; industrial and direct",
  slate: "blue-grey with a rust accent; quiet and professional",
  forest: "forest green with gold; outdoors, gardens, steady",
  indigo: "indigo with an orange action colour; creative and lively",
  steel: "graphite with a lime-green action colour; mechanical and technical",
  terracotta: "terracotta red on warm paper; Mediterranean, homely",
  teal: "dark teal with a bright aqua action colour; clean, water, health",
  ochre: "ochre earth tones on warm paper; rustic and handmade",
};
/** The trade each motif comes from. */
export const SERVICES_MOTIF_NOTES: Record<(typeof SERVICES_MOTIFS)[number], string> = {
  pipe: "pipes: plumbing, heating",
  drain: "drainage and flowing water",
  scale: "a scale: law, accounting, measuring",
  ripple: "calm concentric rings: advice, water, care",
  courses: "brick or stone courses: masonry, building, renovation",
};
export type SiteLocale = (typeof SITE_LOCALES)[number];

export const SITE_LOCALE_LABELS: Record<SiteLocale, string> = { en: "English", sv: "Swedish", fi: "Finnish" };

export const SECTION_VARIANTS = {
  hero: ["centered", "split_image_right", "split_image_left", "full_bleed_image"],
  text: ["single_column", "two_column"],
  text_media: ["image_right", "image_left"],
  features: ["grid_3", "grid_4", "list"],
  services: ["cards", "list", "detailed"],
  products: ["grid_3", "grid_4"],
  testimonials: ["quotes", "carousel"],
  gallery: ["grid", "masonry"],
  team: ["grid", "list"],
  faq: ["accordion", "two_column"],
  cta: ["banner", "card"],
  contact: ["form_and_details", "form_only", "details_only"],
  map: ["wide", "inset"],
} as const;

export type SectionKind = keyof typeof SECTION_VARIANTS;
export const SECTION_KINDS = Object.keys(SECTION_VARIANTS) as SectionKind[];

export const SECTION_LABELS: Record<SectionKind, { label: string; description: string }> = {
  hero: { label: "Hero", description: "The opening of a page: a heading, a short line and up to two buttons." },
  text: { label: "Text", description: "A heading and body text." },
  text_media: { label: "Text and image", description: "Body text beside one image." },
  features: { label: "Features", description: "Short points, each with a title and a sentence." },
  services: { label: "Services", description: "What the business offers, one item per service." },
  products: { label: "Products", description: "What a shop sells, shown on the page. The shop platform keeps the live catalogue." },
  testimonials: { label: "Testimonials", description: "Quotes from customers, with their permission." },
  gallery: { label: "Gallery", description: "A set of images." },
  team: { label: "Team", description: "People, with their role. Only with each person's consent." },
  faq: { label: "Questions and answers", description: "Frequently asked questions." },
  cta: { label: "Call to action", description: "A heading and one button." },
  contact: { label: "Contact", description: "A form and the business's contact details." },
  map: { label: "Map", description: "Where the business is." },
};

export const VARIANT_LABELS: Record<string, string> = {
  centered: "Centered",
  split_image_right: "Image on the right",
  split_image_left: "Image on the left",
  full_bleed_image: "Full-width image",
  single_column: "One column",
  two_column: "Two columns",
  image_right: "Image on the right",
  image_left: "Image on the left",
  grid_3: "Grid of three",
  grid_4: "Grid of four",
  list: "List",
  cards: "Cards",
  detailed: "Detailed",
  quotes: "Quotes",
  carousel: "Carousel",
  grid: "Grid",
  masonry: "Masonry",
  accordion: "Accordion",
  banner: "Banner",
  card: "Card",
  form_and_details: "Form and details",
  form_only: "Form only",
  details_only: "Details only",
  wide: "Wide",
  inset: "Inset",
};

/** Fields a website form may ask for. Fixed, so no form collects more than the studio planned. */
export const FORM_FIELDS = ["name", "email", "phone", "company", "date", "message"] as const;
export type FormField = (typeof FORM_FIELDS)[number];

export const FORM_PURPOSES = ["contact", "quote", "booking_request"] as const;
export const STRUCTURED_DATA_TYPES = ["none", "Organization", "LocalBusiness", "Store"] as const;
export const INTEGRATIONS = ["analytics", "maps", "booking", "newsletter", "store"] as const;
export const ASSET_KINDS = ["logo", "photo", "illustration", "icon"] as const;
export const ASSET_ORIGINS = ["client_supplied", "studio_photo", "licensed", "placeholder"] as const;
export const TYPE_SCALES = ["1.125", "1.2", "1.25", "1.333"] as const;
export const RADII = ["none", "soft", "round"] as const;
export const DENSITIES = ["compact", "regular", "airy"] as const;
export const NAV_PLACEMENTS = ["main", "footer", "none"] as const;
export const MOBILE_BEHAVIOURS = ["stack", "reverse", "hide"] as const;

/** The accessibility level every SiteSpec v1 website is built and checked against. */
export const ACCESSIBILITY_TARGET = "WCAG 2.2 AA";

/** Limits that keep a spec reviewable by a person. */
export const SPEC_LIMITS = {
  pages: 30,
  sectionsPerPage: 20,
  assets: 100,
  forms: 5,
  audiences: 5,
  neutralColors: 6,
  /** Serialized size, in bytes. The database checks the same limit. */
  bytes: 512 * 1024,
} as const;

/**
 * What a person fills in for each section kind, in order. Drives the editor;
 * the schema in schema.ts defines the same fields.
 */
export type SectionFieldType = "text" | "longText" | "buttons" | "button" | "image" | "images" | "form" | "items";
export type ItemFieldType = "text" | "longText" | "plain" | "image" | "document";

export interface SectionFieldDefinition {
  key: string;
  label: string;
  type: SectionFieldType;
  /** For buttons: the most a section may have. */
  max?: number;
}

export interface ItemFieldDefinition {
  key: string;
  label: string;
  type: ItemFieldType;
}

const HEADING: SectionFieldDefinition = { key: "heading", label: "Heading", type: "text" };
const EYEBROW: SectionFieldDefinition = { key: "eyebrow", label: "Small line above the heading", type: "text" };

export const SECTION_FIELDS: Record<SectionKind, SectionFieldDefinition[]> = {
  hero: [EYEBROW, HEADING, { key: "emphasis", label: "End of the heading to set apart", type: "text" }, { key: "subheading", label: "Short line under the heading", type: "longText" }, { key: "mediaAssetId", label: "Image", type: "image" }, { key: "buttons", label: "Buttons", type: "buttons", max: 2 }, { key: "reassurance", label: "Reassurance under the buttons", type: "longText" }],
  text: [EYEBROW, HEADING, { key: "body", label: "Text", type: "longText" }],
  text_media: [EYEBROW, HEADING, { key: "body", label: "Text", type: "longText" }, { key: "mediaAssetId", label: "Image", type: "image" }, { key: "buttons", label: "Button", type: "buttons", max: 1 }],
  features: [EYEBROW, HEADING, { key: "items", label: "Features", type: "items" }],
  services: [EYEBROW, HEADING, { key: "items", label: "Services", type: "items" }],
  products: [EYEBROW, HEADING, { key: "items", label: "Products", type: "items" }],
  testimonials: [EYEBROW, HEADING, { key: "mediaAssetId", label: "Image beside the quotes", type: "image" }, { key: "items", label: "Quotes", type: "items" }],
  gallery: [EYEBROW, HEADING, { key: "assetIds", label: "Images", type: "images" }],
  team: [EYEBROW, HEADING, { key: "items", label: "People", type: "items" }],
  faq: [EYEBROW, HEADING, { key: "items", label: "Questions", type: "items" }],
  cta: [EYEBROW, HEADING, { key: "body", label: "Text", type: "longText" }, { key: "button", label: "Button", type: "button" }],
  contact: [EYEBROW, HEADING, { key: "body", label: "Text", type: "longText" }, { key: "formId", label: "Form", type: "form" }],
  map: [EYEBROW, HEADING],
};

export const ITEM_FIELDS: Partial<Record<SectionKind, ItemFieldDefinition[]>> = {
  features: [{ key: "title", label: "Title", type: "text" }, { key: "body", label: "Text", type: "longText" }, { key: "documentFileId", label: "Document to download (PDF)", type: "document" }],
  services: [{ key: "title", label: "Service", type: "text" }, { key: "body", label: "Description", type: "longText" }, { key: "price", label: "Price (only if the client confirmed it)", type: "text" }],
  products: [{ key: "title", label: "Product", type: "text" }, { key: "body", label: "Description", type: "longText" }, { key: "price", label: "Price (only if the client confirmed it)", type: "text" }, { key: "assetId", label: "Photo", type: "image" }],
  testimonials: [{ key: "quote", label: "Quote", type: "longText" }, { key: "author", label: "Who said it", type: "plain" }],
  team: [{ key: "name", label: "Name", type: "plain" }, { key: "role", label: "Role", type: "text" }, { key: "assetId", label: "Photo", type: "image" }],
  faq: [{ key: "question", label: "Question", type: "text" }, { key: "answer", label: "Answer", type: "longText" }],
};

export const ITEM_LIMITS: Partial<Record<SectionKind, number>> = { features: 12, services: 24, products: 24, testimonials: 12, team: 24, faq: 30 };

export const FORM_FIELD_LABELS: Record<FormField, string> = { name: "Name", email: "Email", phone: "Phone", company: "Company", date: "Date", message: "Message" };
export const FORM_PURPOSE_LABELS: Record<(typeof FORM_PURPOSES)[number], string> = { contact: "Contact", quote: "Quote request", booking_request: "Booking request" };
export const INTEGRATION_LABELS: Record<(typeof INTEGRATIONS)[number], string> = { analytics: "Analytics (with consent)", maps: "Map", booking: "Booking", newsletter: "Newsletter", store: "Online store" };
export const NAV_LABELS: Record<(typeof NAV_PLACEMENTS)[number], string> = { main: "Main menu", footer: "Footer", none: "Not in a menu" };
export const MOBILE_LABELS: Record<(typeof MOBILE_BEHAVIOURS)[number], string> = { stack: "Stack", reverse: "Stack, image first", hide: "Hide on phones" };
