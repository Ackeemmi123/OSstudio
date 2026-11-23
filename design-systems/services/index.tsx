/**
 * The services design system: one content file in, one complete static site
 * out. It has no database, no network and no connection to Studio OS, and the
 * pages it writes run no scripts.
 */
import { createElement, type ReactElement } from "react";
import { siteContent, siteDesign, type Site, type SiteContent } from "./content";
import { AtelierHome } from "./atelier";
import { CafeHome } from "./cafe";
import { EditorialHome } from "./editorial";
import { FormalHome } from "./formal";
import { AboutPage, CHROME, ContactPage, FormResultPage, NotFoundPage, PrivacyPage, PublicationsPage, type PageContext } from "./pages";
import { StatementHome } from "./statement";
import { renderStatic } from "./render";
import { STYLES } from "./styles";

export const FONT_FILES = ["fraunces-display-normal.woff2", "fraunces-display-italic.woff2", "instrument-sans-latin-wght-normal.woff2", "bodoni-moda-latin-wght-normal.woff2", "bodoni-moda-latin-wght-italic.woff2", "hanken-grotesk-latin-wght-normal.woff2", "big-shoulders-display-latin-wght-normal.woff2", "archivo-latin-wdth-normal.woff2", "young-serif-latin-normal.woff2", "figtree-latin-wght-normal.woff2", "cormorant-garamond-latin-wght-normal.woff2", "cormorant-garamond-latin-wght-italic.woff2", "work-sans-latin-wght-normal.woff2", "LICENSE-fraunces.txt", "LICENSE-instrument-sans.txt", "LICENSE-bodoni-moda.txt", "LICENSE-hanken-grotesk.txt", "LICENSE-big-shoulders-display.txt", "LICENSE-archivo.txt", "LICENSE-young-serif.txt", "LICENSE-figtree.txt", "LICENSE-cormorant-garamond.txt", "LICENSE-work-sans.txt"];

const HOMES = { editorial: EditorialHome, formal: FormalHome, statement: StatementHome, cafe: CafeHome, atelier: AtelierHome };

export interface BuiltFile {
  path: string;
  text: string;
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

type Render = (node: ReactElement) => string;

function document(site: Site, root: string, seo: SiteContent["home"]["seo"], body: ReactElement, render: Render): string {
  const { content, design } = site;
  return [
    "<!doctype html>",
    `<html lang="${content.language}">`,
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    ...(content.client ? [] : ['<meta name="robots" content="noindex,nofollow">']),
    `<title>${escapeHtml(seo.title)}</title>`,
    `<meta name="description" content="${escapeHtml(seo.description)}">`,
    `<link rel="stylesheet" href="${root}site.css">`,
    `<meta name="generator" content="${design.system}">`,
    "</head>",
    `<body class="d-${design.direction} p-${design.palette}${design.motif ? ` m-${design.motif}` : ""}${design.type ? ` t-${design.type}` : ""}${design.feel ? ` f-${design.feel}` : ""}${design.motion === "lively" ? " mo-lively" : ""}${content.promise.action.by === "phone" && content.business.phone ? " has-call-bar" : ""}">${render(body)}</body>`,
    "</html>",
  ].join("\n");
}

/** What the types cannot say: a picture must exist, and a headline must really end with its turn. */
function checkReferences(content: SiteContent, design: Site["design"]) {
  const ids = new Set(content.assets.map((asset) => asset.id));
  const used = [
    content.promise.imageId,
    content.proof.imageId,
    content.about.imageId,
    ...content.about.people.map((person) => person.imageId),
    ...(content.gallery?.items ?? []).map((item) => item.imageId),
    content.signature?.ownerLine?.imageId,
    ...(content.signature?.everyday?.items ?? []).map((item) => item.imageId),
  ];
  for (const id of used) {
    if (id && !ids.has(id)) throw new Error(`No image called ${id}.`);
  }
  const { headline, turn } = content.promise;
  if (turn && !headline.text.endsWith(turn)) throw new Error(`The headline does not end with: ${turn}`);
  if (design.signature && !content.signature?.[design.signature]) throw new Error(`The design draws the signature part ${design.signature}, but the content has none.`);
  if (content.client) checkClientSite(content);
}

/** A real client's site may not carry anything left over from a test: no stock photos, nothing without permission. */
function checkClientSite(content: SiteContent) {
  const stock = content.assets.find((asset) => asset.src.startsWith("https://images.unsplash.com/"));
  if (stock) throw new Error(`A client's site cannot use the stock photo ${stock.id}.`);
  const quote = content.proof.quotes.find((item) => item.permission !== "given");
  if (quote) throw new Error(`No permission to use the quote from ${quote.who}.`);
  const person = content.about.people.find((item) => item.consent !== "given");
  if (person) throw new Error(`No consent to show ${person.name}.`);
  const owner = content.signature?.ownerLine;
  if (owner && owner.consent !== "given") throw new Error(`No consent to quote ${owner.who}.`);
  const unconfirmed = content.signature?.numbers?.items.find((item) => item.text.origin !== "client_confirmed");
  if (unconfirmed) throw new Error(`The number ${unconfirmed.value} is not confirmed by the client.`);
}

/** Every page as a file. Fonts are copied by whoever writes the files out. */
/** `render` is for tests that compare the output with React's own server renderer. */
export function build(site: Site, render: Render = renderStatic): BuiltFile[] {
  const content = siteContent.parse(site.content);
  siteDesign.parse(site.design);
  checkReferences(content, site.design);
  const parsed = { ...site, content };
  const context = (page: PageContext["page"], root: string): PageContext => ({ content, design: site.design, root, page, formAction: site.formAction });
  return [
    { path: "site.css", text: STYLES },
    { path: "index.html", text: document(parsed, "./", content.home.seo, createElement(HOMES[site.design.direction], { context: context("home", "./") }), render) },
    { path: `${content.about.slug}/index.html`, text: document(parsed, "../", content.about.seo, <AboutPage context={context("about", "../")} />, render) },
    ...(content.publications ? [{ path: `${content.publications.slug}/index.html`, text: document(parsed, "../", content.publications.seo, <PublicationsPage context={context("publications", "../")} />, render) }] : []),
    { path: `${content.contact.slug}/index.html`, text: document(parsed, "../", content.contact.seo, <ContactPage context={context("contact", "../")} />, render) },
    { path: `${content.privacy.slug}/index.html`, text: document(parsed, "../", content.privacy.seo, <PrivacyPage context={context("privacy", "../")} />, render) },
    { path: "sent/index.html", text: document(parsed, "../", { title: CHROME[content.language].sent, description: CHROME[content.language].sent }, <FormResultPage context={context("notFound", "../")} sent />, render) },
    { path: "not-sent/index.html", text: document(parsed, "../", { title: CHROME[content.language].notSent, description: CHROME[content.language].notSent }, <FormResultPage context={context("notFound", "../")} sent={false} />, render) },
    { path: "404.html", text: document(parsed, "./", { title: content.notFound.heading, description: content.notFound.text }, <NotFoundPage context={context("notFound", "./")} />, render) },
    ...(content.client ? [] : [{ path: "robots.txt", text: "User-agent: *\nDisallow: /\n" }]),
  ];
}
