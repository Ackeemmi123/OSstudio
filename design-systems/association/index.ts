/**
 * The association design system: a Studio OS website spec (SiteSpec v1) in, a
 * complete static site out, with no scripts. Built for member associations:
 * student and subject associations, clubs and societies, with events, a board,
 * documents to download and a membership form.
 *
 * It reads the spec as Studio OS stores it and adds only what a spec cannot
 * hold yet: the files behind each image and document, and whether the site is
 * a private prototype. Words of its own are only in CHROME.
 *
 * How it reads a spec, beyond the plain meaning of each section:
 * - A list of features whose titles start "<when> · " is a list of events. Dated
 *   events are sorted into upcoming and past by the build date, and the home
 *   page shows what is coming up.
 * - A list item with a file in `documents` is a document to download.
 * - Lines like "Label: value" become a list of details, with addresses linked.
 * - The page the spec's main call to action leads to is the menu's button.
 */
import { siteSpecSchema, type SiteSpec, type SiteSpecPage, type SiteSpecSection } from "@/lib/site-spec/schema";
import { SITE_LOCALES } from "@/lib/site-spec/catalog";
import { STYLES } from "./styles";

export interface AssociationOptions {
  /** The file each image id shows, relative to the site root. */
  files: Record<string, string>;
  /**
   * What a build made of each image: its size in pixels and the same picture at several widths
   * (files relative to the site root, narrowest first), for the browser to choose from.
   */
  pictures?: Record<string, { width: number; height: number; variants: { path: string; width: number }[] }>;
  /** A small image for the browser tab. Without it the small logo's own file is used. */
  icon?: string;
  /** The file each document list item offers, relative to the site root. */
  documents?: Record<string, string>;
  /** The image id of the small one-colour logo for the header and footer. */
  smallLogo?: string;
  /** A prototype is hidden from search and its forms are switched off. */
  status: "prototype" | "approved";
  /** Today, for sorting events into upcoming and past. */
  today: Date;
  /** Where a published site's forms send to: an absolute https address on the server that mails the client. Default /api/contact. */
  formAction?: string;
  /** The agency named on a prototype ("Prototyp av …"). Default Axivo. */
  madeBy?: string;
  /** A preview draws an image without a file as a labelled box; a build refuses it. */
  missingImages?: "refuse" | "box";
  /** Only this one of the site's languages (Studio OS's preview draws one at a time). A build makes them all. */
  language?: Locale;
}

export interface BuiltFile {
  path: string;
  text: string;
}

type Locale = SiteSpec["locales"]["default"];
type Text = Partial<Record<Locale, string>>;

interface Chrome {
  skip: string; menu: string; mainNav: string; pages: string; contact: string;
  upcoming: string; allEvents: string; past: string; download: string;
  send: string; formOff: string;
  /** Says "Axivo"; the build puts the studio's own name in its place. */
  prototype: string;
  notFound: string; backHome: string; sent: string; notSent: string; trap: string;
  /** Label of the links to the same page in the site's other languages. */
  languages: string;
  fields: { name: string; email: string; phone: string; company: string; date: string; message: string };
  /** Month under the day in an event's date block. */
  months: readonly string[];
  /** Month names as written in "<week word> 51, <month> 2026", lower case. */
  monthNames: readonly string[];
  /** The word that starts an event date by week, and the short label in the date block. */
  weekWord: string;
  week: string;
}

/** Words of the design itself in each language a site can have. Finnish follows the company design's wording. */
const CHROME: Record<Locale, Chrome> = {
  sv: {
    skip: "Hoppa till innehållet", menu: "Meny", mainNav: "Huvudmeny", pages: "Sidor", contact: "Kontakt",
    upcoming: "Kommande evenemang", allEvents: "Alla evenemang", past: "Tidigare", download: "Ladda ner",
    send: "Skicka", formOff: "Formuläret är avstängt i prototypen.", prototype: "Prototyp av Axivo. Inte offentlig.",
    notFound: "Sidan hittades inte", backHome: "Till startsidan",
    sent: "Tack! Ditt meddelande har skickats.", notSent: "Meddelandet kunde inte skickas. Skicka gärna e-post till oss i stället.",
    trap: "Lämna tomt", languages: "Språk",
    fields: { name: "Namn", email: "E-postadress", phone: "Telefonnummer", company: "Organisation", date: "Datum", message: "Meddelande" },
    months: ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"],
    monthNames: ["januari", "februari", "mars", "april", "maj", "juni", "juli", "augusti", "september", "oktober", "november", "december"],
    weekWord: "vecka",
    week: "v.",
  },
  fi: {
    skip: "Siirry sisältöön", menu: "Valikko", mainNav: "Päävalikko", pages: "Sivut", contact: "Yhteystiedot",
    upcoming: "Tulevat tapahtumat", allEvents: "Kaikki tapahtumat", past: "Menneet", download: "Lataa",
    send: "Lähetä", formOff: "Lomake ei ole käytössä prototyypissä.", prototype: "Prototyyppi: Axivo. Ei julkinen.",
    notFound: "Sivua ei löytynyt", backHome: "Etusivulle",
    sent: "Kiitos! Viestisi on lähetetty.", notSent: "Viestiä ei voitu lähettää. Lähetä meille mieluummin sähköpostia.",
    trap: "Jätä tyhjäksi", languages: "Kieli",
    fields: { name: "Nimi", email: "Sähköpostiosoite", phone: "Puhelinnumero", company: "Organisaatio", date: "Päivämäärä", message: "Viesti" },
    months: ["tammikuu", "helmikuu", "maaliskuu", "huhtikuu", "toukokuu", "kesäkuu", "heinäkuu", "elokuu", "syyskuu", "lokakuu", "marraskuu", "joulukuu"],
    monthNames: ["tammikuu", "helmikuu", "maaliskuu", "huhtikuu", "toukokuu", "kesäkuu", "heinäkuu", "elokuu", "syyskuu", "lokakuu", "marraskuu", "joulukuu"],
    weekWord: "viikko",
    week: "vk",
  },
  en: {
    skip: "Skip to content", menu: "Menu", mainNav: "Main", pages: "Pages", contact: "Contact",
    upcoming: "Coming up", allEvents: "All events", past: "Past", download: "Download",
    send: "Send", formOff: "The form is switched off in the prototype.", prototype: "Prototype by Axivo. Not public.",
    notFound: "Page not found", backHome: "Back to the front page",
    sent: "Thank you. Your message was sent.", notSent: "Your message could not be sent. Please email us instead.",
    trap: "Leave this empty", languages: "Language",
    fields: { name: "Name", email: "Email address", phone: "Phone number", company: "Organisation", date: "Date", message: "Message" },
    months: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    monthNames: ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"],
    weekWord: "week",
    week: "Wk",
  },
};

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Plain text with addresses, phone numbers and Instagram handles made into links. */
function linkify(value: string, label = ""): string {
  if (/instagram/i.test(label) && /^@[A-Za-z0-9._]+$/.test(value)) return `<a href="https://www.instagram.com/${value.slice(1)}/">${escapeHtml(value)}</a>`;
  return escapeHtml(value)
    .replace(/([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, '<a href="mailto:$1">$1</a>')
    .replace(/(\+\d{3}[\d ]{6,14}\d)/g, (phone) => `<a href="tel:${phone.replace(/ /g, "")}">${phone}</a>`)
    .replace(/(Instagram:? )@([A-Za-z0-9._]*[A-Za-z0-9_])/g, '$1<a href="https://www.instagram.com/$2/">@$2</a>')
    .replace(/(på Instagram )@([A-Za-z0-9._]*[A-Za-z0-9_])/g, '$1<a href="https://www.instagram.com/$2/">@$2</a>');
}

const DETAIL = /^([^:]{2,60}): (.+)$/;

/** A body as paragraphs, numbered lists and lists of details. */
export function richText(body: string): string {
  return body
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
      if (lines.length > 1 && lines.every((line) => /^\d+\. /.test(line))) return `<ol>${lines.map((line) => `<li>${linkify(line.replace(/^\d+\. /, ""))}</li>`).join("")}</ol>`;
      if (lines.length > 1 && lines.every((line) => DETAIL.test(line))) return `<dl class="details">${lines.map((line) => { const [, label, value] = line.match(DETAIL)!; return `<div><dt>${escapeHtml(label)}</dt><dd>${linkify(value, label)}</dd></div>`; }).join("")}</dl>`;
      return `<p>${lines.map((line) => linkify(line)).join("<br>")}</p>`;
    })
    .join("");
}

export interface EventDate {
  day: string;
  month: string;
  /** For sorting and deciding whether it has happened: the last day it could be on. */
  latest: Date | null;
}

/** "3.11.2026" or "Vecka 51, december 2026" (in Finnish "Viikko 51, joulukuu 2026"), as a date block and a date to sort by. */
export function parseWhen(when: string, chrome: Chrome = CHROME.sv): EventDate {
  const exact = when.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (exact) {
    const [, d, m, y] = exact.map(Number);
    return { day: String(d), month: `${chrome.months[m - 1]} ${y}`, latest: new Date(Date.UTC(y, m - 1, d, 23, 59)) };
  }
  const week = when.match(new RegExp(`^${chrome.weekWord} (\\d{1,2}),? (\\p{L}+) (\\d{4})$`, "iu"));
  if (week) {
    const [, w, monthName, year] = week;
    const m = chrome.monthNames.findIndex((name) => name === monthName.toLowerCase());
    const y = Number(year);
    // ISO week: the Thursday of week 1 is in the first days of January.
    const jan4 = new Date(Date.UTC(y, 0, 4));
    const monday = new Date(jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * 86400000 + (Number(w) - 1) * 7 * 86400000);
    const sunday = new Date(monday.getTime() + 6 * 86400000 + 86399000);
    return { day: `${chrome.week} ${w}`, month: m >= 0 ? `${chrome.months[m]} ${y}` : String(y), latest: sunday };
  }
  return { day: when, month: "", latest: null };
}

export interface EventItem {
  id: string;
  when: string;
  title: string;
  body: string;
  date: EventDate;
}

const WHEN = /^(.{3,40}?) · (.+)$/;

function isEventList(section: SiteSpecSection, locale: Locale): boolean {
  return section.kind === "features" && section.variant === "list" && section.items.length > 0 && section.items.every((item) => {
    const title = text(item.title, locale);
    const match = title.match(WHEN);
    return !!match && parseWhen(match[1], CHROME[locale]).latest !== null;
  });
}

function text(value: Text | undefined, locale: Locale): string {
  return value?.[locale]?.trim() ?? "";
}

export function eventsOf(spec: SiteSpec, locale: Locale): { page: SiteSpecPage; events: EventItem[] } | null {
  for (const page of spec.pages) {
    const lists = page.sections.filter((section) => isEventList(section, locale));
    if (!lists.length) continue;
    const events = lists.flatMap((section) => section.kind === "features" ? section.items.map((item) => {
      const [, when, title] = text(item.title, locale).match(WHEN)!;
      return { id: item.id, when, title, body: text(item.body, locale), date: parseWhen(when, CHROME[locale]) };
    }) : []);
    return { page, events };
  }
  return null;
}

/** A link to another language, written in that language. */
const IN_LANGUAGE: Record<Locale, string> = { sv: "På svenska", fi: "Suomeksi", en: "In English" };

interface Site {
  spec: SiteSpec;
  options: AssociationOptions;
  /** The language this part of the site is in, and where it starts: "/" for the site's main language, "/fi/" for another. */
  locale: Locale;
  root: string;
  chrome: Chrome;
  pagesById: Map<string, SiteSpecPage>;
  ctaPageId: string | undefined;
}

/** The site's main language lives at "/", each other language under its own code ("/fi/"). */
function rootOf(spec: SiteSpec, locale: Locale): string {
  return locale === spec.locales.default ? "/" : `/${locale}/`;
}

function pagePath(page: SiteSpecPage, locale: Locale, root = "/"): string {
  const slug = page.slug[locale] ?? "";
  return slug ? `${root}${slug}/` : root;
}

const isHomePage = (page: SiteSpecPage, locale: Locale) => (page.slug[locale] ?? "") === "";

function href(site: Site, pageId: string): string {
  const page = site.pagesById.get(pageId);
  if (!page) throw new Error(`A button leads to a page that does not exist: ${pageId}`);
  return pagePath(page, site.locale, site.root);
}

/**
 * How wide each picture is drawn (styles.ts), so a browser fetches the narrowest file that fills it.
 * hero: beside the words in a 1120 px page, at most 340 px above them on a phone. half: one of two
 * columns. card: one of three in a gallery. person: one of four in a board, two on a phone.
 */
const SIZES = {
  hero: "(max-width: 820px) min(340px, calc(100vw - 48px)), min(487px, calc(47.5vw - 46px))",
  half: "(max-width: 820px) calc(100vw - 48px), min(508px, calc(50vw - 52px))",
  card: "min(350px, calc(33.4vw - 24px))",
  person: "(max-width: 900px) calc(50vw - 34px), min(247px, calc(25vw - 33px))",
  footLogo: "150px",
  brandLogo: "64px",
} as const;
/** A portrait is cropped to 3:4, so a picture wider in shape than that is drawn wider than its frame by this much. */
const personSizes = (by: number) => (by > 1.02 ? `(max-width: 900px) calc((50vw - 34px) * ${by}), calc(min(247px, 25vw - 33px) * ${by})` : SIZES.person);

function image(site: Site, assetId: string | undefined, attrs: string, slot: keyof typeof SIZES): string {
  if (!assetId) return "";
  const asset = site.spec.assets.find((entry) => entry.id === assetId);
  const file = site.options.files[assetId];
  if (asset && !file && site.options.missingImages === "box") return `<div class="nofile" role="img" aria-label="${escapeHtml(text(asset.alt, site.locale))}">${escapeHtml(asset.description || text(asset.alt, site.locale) || assetId)}</div>`;
  if (!asset || !file) throw new Error(`No file for the image ${assetId}.`);
  const picture = site.options.pictures?.[assetId];
  if (!picture?.variants.length) return `<img src="${escapeHtml(fileUrl(file))}" alt="${escapeHtml(text(asset.alt, site.locale))}" ${attrs}>`;
  const srcset = picture.variants.map((variant) => `${fileUrl(variant.path)} ${variant.width}w`).join(", ");
  // A picture that was drawn at its own size keeps it: with a list of widths a browser would otherwise take the slot's width as its size.
  // And it keeps the upload's exact shape, whichever width is fetched (a narrower file's height is rounded to a whole pixel).
  // A board portrait is cropped to 3:4 by the stylesheet instead.
  const size = (/\bwidth="/.test(attrs) ? "" : ` width="${picture.width}" height="${picture.height}"`) + (slot === "person" ? "" : ` style="aspect-ratio:${picture.width}/${picture.height}"`);
  const sizes = slot === "person" ? personSizes(Math.round((picture.width / picture.height / (3 / 4)) * 100) / 100) : SIZES[slot];
  return `<img src="${escapeHtml(fileUrl(file))}" srcset="${escapeHtml(srcset)}" sizes="${sizes}" alt="${escapeHtml(text(asset.alt, site.locale))}" ${attrs}${size}>`;
}

/** A file in the site's folder, or a full address (a preview's short-lived links). */
function fileUrl(file: string): string {
  return /^https?:\/\//.test(file) ? file : `/${file}`;
}

function eventRow(event: EventItem, past: boolean): string {
  return `<li class="event${past ? " is-past" : ""}"><div class="date" aria-hidden="true"><b>${escapeHtml(event.date.day)}</b><span>${escapeHtml(event.date.month)}</span></div><div><p class="when">${escapeHtml(event.when)}</p><h3>${escapeHtml(event.title)}</h3>${event.body ? `<p>${linkify(event.body)}</p>` : ""}</div></li>`;
}

function formHtml(site: Site, formId: string | undefined): string {
  if (!formId) return "";
  const form = site.spec.forms.find((entry) => entry.id === formId);
  if (!form) throw new Error(`No form called ${formId}.`);
  const off = site.options.status === "prototype";
  const id = (field: string) => `${formId}-${field}`;
  const fields = form.fields.map((field) => {
    const label = site.chrome.fields[field];
    const control = field === "message"
      ? `<textarea id="${id(field)}" name="${field}" required></textarea>`
      : `<input id="${id(field)}" name="${field}" type="${field === "email" ? "email" : field === "phone" ? "tel" : field === "date" ? "date" : "text"}" autocomplete="${field === "name" ? "name" : field === "email" ? "email" : field === "phone" ? "tel" : field === "company" ? "organization" : "off"}" required>`;
    return `<div class="field"><label for="${id(field)}">${label}</label>${control}</div>`;
  }).join("");
  const consent = text(form.consentText, site.locale);
  // What happens after sending, from the spec: only on a working form, since a prototype's form sends nothing.
  const note = off ? "" : text(form.replyNote, site.locale);
  const trap = `<div class="trap" aria-hidden="true"><label for="${id("website")}">${site.chrome.trap}</label><input id="${id("website")}" name="website" tabindex="-1" autocomplete="off"></div>`;
  const action = site.options.formAction && /^https:\/\/[^\s"<>]+$/.test(site.options.formAction) ? site.options.formAction : "/api/contact";
  return `<form class="form" method="post" action="${escapeHtml(action)}"><input type="hidden" name="form" value="${escapeHtml(formId)}"><input type="hidden" name="lang" value="${site.spec.locales.default}">${site.root !== "/" ? `<input type="hidden" name="back" value="${site.locale}">` : ""}${fields}${trap}${consent ? `<div class="check"><input id="${id("consent")}" name="consent" type="checkbox" required><label for="${id("consent")}">${escapeHtml(consent)}</label></div>` : ""}<div><button class="btn" type="submit"${off ? " disabled" : ""}>${site.chrome.send}</button></div>${off ? `<p class="off">${site.chrome.formOff}</p>` : ""}${note ? `<p class="off">${escapeHtml(note)}</p>` : ""}</form>`;
}

/** One section. The first heading on a page is its h1. */
function section(site: Site, page: SiteSpecPage, entry: SiteSpecSection, first: boolean): string {
  const { locale } = site;
  const heading = text(entry.heading, locale);
  const H = first ? "h1" : "h2";
  const head = heading ? `<${H}>${escapeHtml(heading)}</${H}>` : "";
  // Item headings sit one level under the section's own: h2 under a page's h1, so no level is skipped.
  const I = heading && first ? "h2" : "h3";
  switch (entry.kind) {
    case "hero": {
      const buttons = entry.buttons.map((button, i) => `<a class="btn${i ? " btn--line" : ""}" href="${href(site, button.targetPageId)}">${escapeHtml(text(button.label, locale))}</a>`).join("");
      const media = image(site, entry.mediaAssetId, 'class="hero-media" width="1100" height="653" fetchpriority="high"', "hero");
      return `<section class="hero${media ? " has-media" : ""}"><div class="wrap hero-grid"><div><h1>${escapeHtml(heading)}</h1><p class="lead">${linkify(text(entry.subheading, locale))}</p>${buttons ? `<div class="actions">${buttons}</div>` : ""}</div>${media}</div></section>`;
    }
    case "text": {
      const cls = first ? "pagehead" : "sec";
      // Addresses of people the page shows on cards are given on the cards, not twice.
      const people = new Set(page.sections.flatMap((other) => (other.kind === "team" ? other.items.map((person) => person.name) : [])));
      const body = text(entry.body, locale).split(/\n{2,}/).filter((block) => !(people.size && block.split("\n").every((line) => { const match = line.trim().match(/^(.+): \S+@\S+$/); return !!match && people.has(match[1].trim()); }))).join("\n\n");
      return `<section class="${cls}"><div class="wrap narrow">${head}<div class="prose${first ? " prose--lead" : ""}">${richText(body)}</div></div></section>`;
    }
    case "text_media":
      return `<section class="sec"><div class="wrap split">${image(site, entry.mediaAssetId, 'loading="lazy"', "half")}<div>${head}<div class="prose">${richText(text(entry.body, locale))}</div></div></div></section>`;
    case "features": {
      if (isEventList(entry, locale)) {
        const events = eventsOf({ ...site.spec, pages: [{ ...page, sections: [entry] }] }, locale)!.events;
        return `<section class="sec"><div class="wrap narrow">${head}<ul class="events">${events.map((event) => eventRow(event, !!event.date.latest && event.date.latest < site.options.today)).join("")}</ul></div></section>`;
      }
      const documents = site.options.documents ?? {};
      if (entry.items.some((item) => documents[item.id])) {
        return `<section class="sec"><div class="wrap narrow">${head}<ul class="docs">${entry.items.map((item) => {
          const file = documents[item.id];
          return `<li class="doc"><div><${I}>${escapeHtml(text(item.title, locale))}</${I}><p>${escapeHtml(text(item.body, locale))}</p></div>${file ? `<a class="dl" href="/${escapeHtml(file)}">${site.chrome.download}<span class="sr"> ${escapeHtml(text(item.title, locale))}</span></a>` : ""}</li>`;
        }).join("")}</ul></div></section>`;
      }
      return `<section class="sec"><div class="wrap">${head}<div class="points points--${entry.variant}">${entry.items.map((item) => `<div class="point"><${I}>${escapeHtml(text(item.title, locale))}</${I}><p>${linkify(text(item.body, locale))}</p></div>`).join("")}</div></div></section>`;
    }
    case "services":
    case "products":
      return `<section class="sec"><div class="wrap">${head}<div class="points">${entry.items.map((item) => { const price = text(item.price, locale); return `<div class="point"><${I}>${escapeHtml(text(item.title, locale))}</${I}><p>${linkify(text(item.body, locale))}</p>${price ? `<p class="price">${escapeHtml(price)}</p>` : ""}</div>`; }).join("")}</div></div></section>`;
    case "team": {
      const emails = new Map<string, string>();
      for (const other of page.sections) if (other.kind === "text") for (const line of text(other.body, locale).split("\n")) { const match = line.match(/^(.+): (\S+@\S+)$/); if (match) emails.set(match[1].trim(), match[2]); }
      return `<section class="sec"><div class="wrap">${head}<div class="board">${entry.items.map((person) => { const email = emails.get(person.name); return `<div class="person">${image(site, person.assetId, 'width="240" height="320" loading="lazy"', "person")}<${I}>${escapeHtml(person.name)}</${I}><p class="role">${escapeHtml(text(person.role, locale))}</p>${email ? `<a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>` : ""}</div>`; }).join("")}</div></div></section>`;
    }
    case "faq":
      return `<section class="sec"><div class="wrap narrow">${head}<div class="accordion">${entry.items.map((item, i) => `<details${i === 0 ? " open" : ""}><summary>${escapeHtml(text(item.question, locale))}</summary><div class="prose">${richText(text(item.answer, locale))}</div></details>`).join("")}</div></div></section>`;
    case "cta":
      return `<section class="band"><div class="wrap band-grid"><div>${head}<p>${linkify(text(entry.body, locale))}</p></div><div><a class="btn btn--light" href="${href(site, entry.button.targetPageId)}">${escapeHtml(text(entry.button.label, locale))}</a></div></div></section>`;
    case "contact": {
      const body = text(entry.body, locale);
      const [intro, ...rest] = body.split(/\n{2,}/);
      const introIsDetails = intro.split("\n").every((line) => DETAIL.test(line.trim()));
      const lead = introIsDetails ? "" : intro;
      const details = introIsDetails ? body : rest.join("\n\n");
      const form = formHtml(site, entry.formId);
      return `<section class="${first ? "pagehead" : "sec"}"><div class="wrap">${head}${lead ? `<p class="lead">${linkify(lead)}</p>` : ""}<div class="split split--contact">${form ? `<div>${form}</div>` : ""}${details ? `<div class="box prose">${richText(details)}</div>` : ""}</div></div></section>`;
    }
    case "gallery":
      return `<section class="sec"><div class="wrap">${head}<div class="gallery">${entry.assetIds.map((assetId) => image(site, assetId, 'loading="lazy"', "card")).join("")}</div></div></section>`;
    case "testimonials":
      return `<section class="sec"><div class="wrap narrow">${head}${entry.items.map((item) => `<blockquote><p>${escapeHtml(text(item.quote, locale))}</p><footer>${escapeHtml(item.author)}</footer></blockquote>`).join("")}</div></section>`;
    case "map":
      return "";
  }
}

/** On the home page, after the opening: what is coming up, when the site has events. */
function upcomingOnHome(site: Site): string {
  const found = eventsOf(site.spec, site.locale);
  if (!found) return "";
  const upcoming = found.events.filter((event) => event.date.latest && event.date.latest >= site.options.today).sort((a, b) => a.date.latest!.getTime() - b.date.latest!.getTime()).slice(0, 3);
  if (!upcoming.length) return "";
  return `<section class="sec"><div class="wrap"><div class="head"><h2>${site.chrome.upcoming}</h2><a href="${pagePath(found.page, site.locale, site.root)}">${site.chrome.allEvents}</a></div><ul class="events">${upcoming.map((event) => eventRow(event, false)).join("")}</ul></div></section>`;
}

function document(site: Site, page: SiteSpecPage | null, title: string, description: string, main: string): string {
  const { spec, locale, chrome, options } = site;
  const siteName = text(spec.seo.siteName, locale);
  const { root } = site;
  const current = page ? pagePath(page, locale, root) : "";
  const main_ = spec.pages.filter((entry) => entry.nav === "main" && !isHomePage(entry, locale) && entry.id !== site.ctaPageId);
  const cta = site.ctaPageId ? site.pagesById.get(site.ctaPageId) : undefined;
  const link = (entry: SiteSpecPage, cls = "") => `<a${cls ? ` class="${cls}"` : ""} href="${pagePath(entry, locale, root)}"${pagePath(entry, locale, root) === current ? ' aria-current="page"' : ""}>${escapeHtml(text(entry.title, locale))}</a>`;
  const nav = main_.map((entry) => link(entry)).join("") + (cta ? link(cta, "btn") : "");
  const footerPages = [...spec.pages.filter((entry) => entry.nav === "main" && !isHomePage(entry, locale)), ...spec.pages.filter((entry) => entry.nav === "footer")];
  // The same page in the site's other languages (their front page for a page outside the spec, such as 404).
  const others = spec.locales.available.filter((other) => other !== locale);
  const languages = others.length
    ? `<nav class="langs" aria-label="${chrome.languages}">${others.map((other) => `<a href="${page ? pagePath(page, other, rootOf(spec, other)) : rootOf(spec, other)}" hreflang="${other}" lang="${other}">${IN_LANGUAGE[other]}</a>`).join("")}</nav>`
    : "";
  const contactPage = spec.pages.find((entry) => entry.id !== site.ctaPageId && entry.sections.some((s) => s.kind === "contact"));
  const contactSection = contactPage?.sections.find((s) => s.kind === "contact");
  const contactLines = contactSection ? (text(contactSection.body, locale).split(/\n{2,}/).find((block) => block.split("\n").every((line) => DETAIL.test(line.trim()))) ?? "") : "";
  const smallLogo = options.smallLogo ?? spec.brand.logoAssetId;
  const small = smallLogo ? image(site, smallLogo, 'width="150" height="91"', "footLogo") : "";
  const brandLogo = smallLogo ? image(site, smallLogo, 'width="64" height="39"', "brandLogo").replace(/alt="[^"]*"/, `alt="${escapeHtml(siteName)}"`) : "";
  const noindex = options.status !== "approved";
  return [
    "<!doctype html>",
    `<html lang="${locale}">`,
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    ...(noindex ? ['<meta name="robots" content="noindex,nofollow">'] : []),
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}">`,
    smallLogo && options.files[smallLogo] ? `<link rel="icon" href="${escapeHtml(fileUrl(options.icon ?? options.files[smallLogo]))}">` : "",
    '<link rel="stylesheet" href="/site.css">',
    '<meta name="generator" content="association@0.1">',
    "</head>",
    "<body>",
    `<a class="skip" href="#main">${chrome.skip}</a>`,
    `<header class="top"><div class="wrap bar"><a class="brand" href="${root}">${brandLogo}<span${brandLogo ? ' aria-hidden="true"' : ""}>${escapeHtml(siteName)}</span></a><nav class="nav" aria-label="${chrome.mainNav}">${nav}</nav>${languages}<details class="menu"><summary>${chrome.menu}</summary><nav aria-label="${chrome.menu}">${nav}</nav></details></div></header>`,
    `<main id="main">${main}</main>`,
    `<footer class="foot"><div class="wrap"><div class="foot-grid"><div>${small}<p>${escapeHtml(text(spec.seo.defaultDescription, locale))}</p></div>${contactLines ? `<div><h2>${chrome.contact}</h2>${richText(contactLines)}</div>` : ""}<div><h2>${chrome.pages}</h2><ul>${footerPages.map((entry) => `<li>${link(entry)}</li>`).join("")}</ul></div></div><div class="fine"><span>© ${options.today.getUTCFullYear()} ${escapeHtml(siteName)}</span>${noindex ? `<span>${escapeHtml(chrome.prototype.replace("Axivo", (options.madeBy ?? "Axivo").trim() || "Axivo"))}</span>` : ""}</div></div></footer>`,
    "</body>",
    "</html>",
    "",
  ].filter((line) => line !== "").join("\n");
}

/**
 * Texts the site's main language has and another language lacks, as paths into the spec
 * ("pages.2.title"). A site in two languages is built only when every text is in both.
 */
export function missingTranslations(spec: SiteSpec, locale: Locale): string[] {
  const main = spec.locales.default;
  const missing: string[] = [];
  const isText = (value: object) => {
    const keys = Object.keys(value);
    return keys.length > 0 && keys.every((key) => (SITE_LOCALES as readonly string[]).includes(key)) && Object.values(value).every((entry) => typeof entry === "string");
  };
  const walk = (value: unknown, path: string) => {
    if (Array.isArray(value)) return value.forEach((entry, i) => walk(entry, `${path}.${i}`));
    if (!value || typeof value !== "object") return;
    if (isText(value)) {
      const texts = value as Text;
      if (texts[main]?.trim() && !texts[locale]?.trim()) missing.push(path.slice(1));
      return;
    }
    for (const [key, entry] of Object.entries(value)) if (key !== "locales") walk(entry, `${path}.${key}`);
  };
  walk(spec, "");
  return missing;
}

/** The pages of one language, under its root, with its own events, sent and not-sent pages. */
function buildLanguage(site: Site, files: BuiltFile[]): void {
  const { spec, locale, chrome, root } = site;
  const dir = root.slice(1);
  for (const page of spec.pages) {
    const isHome = isHomePage(page, locale);
    let body = page.sections.map((entry, i) => section(site, page, entry, i === 0)).join("");
    if (isHome) {
      const [hero, ...rest] = page.sections;
      body = (hero ? section(site, page, hero, true) : "") + upcomingOnHome(site) + rest.map((entry) => section(site, page, entry, false)).join("");
    }
    const h1s = (body.match(/<h1[ >]/g) ?? []).length;
    if (h1s !== 1) throw new Error(`The page ${text(page.title, locale)} has ${h1s} main headings; it needs exactly one. Start it with a section that has a heading.`);
    files.push({ path: `${dir}${isHome ? "" : `${page.slug[locale]}/`}index.html`, text: document(site, page, text(page.seo.title, locale) || text(page.title, locale), text(page.seo.description, locale), body) });
  }
  // Where the form sends a visitor after posting, so it works without scripts.
  for (const [path, message] of [["sent", chrome.sent], ["not-sent", chrome.notSent]] as const) {
    files.push({ path: `${dir}${path}/index.html`, text: document(site, null, message, message, `<section class="pagehead"><div class="wrap narrow"><h1>${message}</h1><p><a href="${root}">${chrome.backHome}</a></p></div></section>`) });
  }
}

/** Every page of the site as a file, in each of its languages. Images and documents are copied by whoever writes the files out. */
export function build(input: unknown, options: AssociationOptions): BuiltFile[] {
  const spec = siteSpecSchema.parse(input);
  const main = spec.locales.default;
  // The main language first; then the others, each complete.
  const all = [main, ...spec.locales.available.filter((locale) => locale !== main)];
  if (options.language && !all.includes(options.language)) throw new Error(`The site has no ${options.language} version.`);
  const languages = options.language ? [options.language] : all;
  for (const locale of languages.filter((locale) => locale !== main)) {
    const missing = missingTranslations(spec, locale);
    if (missing.length) throw new Error(`The site is in ${all.join(" and ")}, but ${missing.length} ${missing.length === 1 ? "text has" : "texts have"} no ${locale} version yet (${missing.slice(0, 3).join(", ")}${missing.length > 3 ? ", …" : ""}). Write them, or take ${locale} off the site's languages.`);
  }
  const siteFor = (locale: Locale): Site => ({ spec, options, locale, root: rootOf(spec, locale), chrome: CHROME[locale], pagesById: new Map(spec.pages.map((page) => [page.id, page])), ctaPageId: spec.strategy.primaryCta?.targetPageId });
  const first = siteFor(main);
  if (first.ctaPageId) href(first, first.ctaPageId);
  for (const id of Object.keys(options.documents ?? {})) {
    const known = spec.pages.some((page) => page.sections.some((s) => (s.kind === "features" || s.kind === "services") && s.items.some((item) => item.id === id)));
    if (!known) throw new Error(`A document is attached to ${id}, which is not a list item in the spec.`);
  }
  const files: BuiltFile[] = [{ path: "site.css", text: STYLES(spec) }];
  for (const locale of languages) buildLanguage(siteFor(locale), files);
  const { chrome } = first;
  files.push({ path: "404.html", text: document(first, null, chrome.notFound, chrome.notFound, `<section class="pagehead"><div class="wrap narrow"><h1>${chrome.notFound}</h1><p><a href="/">${chrome.backHome}</a></p></div></section>`) });
  if (options.status !== "approved") files.push({ path: "robots.txt", text: "User-agent: *\nDisallow: /\n" });
  return files;
}

/**
 * One page as a single document for Studio OS's sandboxed preview frame: the
 * stylesheet inline, images through the given links, missing images as boxes.
 */
export function previewPage(input: unknown, options: Omit<AssociationOptions, "status" | "missingImages" | "language">, pageId?: string, locale?: string): { html: string; pageId: string } {
  const spec = siteSpecSchema.parse(input);
  const page = spec.pages.find((entry) => entry.id === pageId) ?? spec.pages[0];
  // The language chosen in the preview, if the site has it; otherwise its main one.
  const language = spec.locales.available.find((entry) => entry === locale) ?? spec.locales.default;
  const files = build(spec, { ...options, documents: undefined, status: "prototype", missingImages: "box", language });
  const slug = page.slug[language] ?? "";
  const path = `${rootOf(spec, language).slice(1)}${slug ? `${slug}/` : ""}index.html`;
  const html = files.find((file) => file.path === path)!.text;
  const css = files.find((file) => file.path === "site.css")!.text;
  return { pageId: page.id, html: html.replace('<link rel="stylesheet" href="/site.css">', `<style>${css}</style>`) };
}
