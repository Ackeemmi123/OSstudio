/**
 * The services design system: one content file in, one complete static site
 * out. It has no database, no network and no connection to Studio OS, and the
 * pages it writes run no scripts.
 */
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { siteContent, siteDesign, type Site, type SiteContent } from "./content";
import { EditorialHome } from "./editorial";
import { FormalHome } from "./formal";
import { AboutPage, ContactPage, NotFoundPage, PrivacyPage, type PageContext } from "./pages";
import { StatementHome } from "./statement";
import { STYLES } from "./styles";

export const FONT_FILES = ["fraunces-display-normal.woff2", "fraunces-display-italic.woff2", "instrument-sans-latin-wght-normal.woff2", "bodoni-moda-latin-wght-normal.woff2", "bodoni-moda-latin-wght-italic.woff2", "hanken-grotesk-latin-wght-normal.woff2", "big-shoulders-display-latin-wght-normal.woff2", "archivo-latin-wdth-normal.woff2", "LICENSE-fraunces.txt", "LICENSE-instrument-sans.txt", "LICENSE-bodoni-moda.txt", "LICENSE-hanken-grotesk.txt", "LICENSE-big-shoulders-display.txt", "LICENSE-archivo.txt"];

const HOMES = { editorial: EditorialHome, formal: FormalHome, statement: StatementHome };

export interface BuiltFile {
  path: string;
  text: string;
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function document(site: Site, root: string, seo: SiteContent["home"]["seo"], body: ReactElement): string {
  const { content, design } = site;
  return [
    "<!doctype html>",
    `<html lang="${content.language}">`,
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta name="robots" content="noindex,nofollow">',
    `<title>${escapeHtml(seo.title)}</title>`,
    `<meta name="description" content="${escapeHtml(seo.description)}">`,
    `<link rel="stylesheet" href="${root}site.css">`,
    `<meta name="generator" content="${design.system}">`,
    "</head>",
    `<body class="d-${design.direction} p-${design.palette}${design.motif ? ` m-${design.motif}` : ""}${design.type ? ` t-${design.type}` : ""}${content.promise.action.by === "phone" && content.business.phone ? " has-call-bar" : ""}">${renderToStaticMarkup(body)}</body>`,
    "</html>",
  ].join("\n");
}

/** What the types cannot say: a picture must exist, and a headline must really end with its turn. */
function checkReferences(content: SiteContent) {
  const ids = new Set(content.assets.map((asset) => asset.id));
  const used = [content.promise.imageId, content.proof.imageId, content.about.imageId, ...content.about.people.map((person) => person.imageId)];
  for (const id of used) {
    if (id && !ids.has(id)) throw new Error(`No image called ${id}.`);
  }
  const { headline, turn } = content.promise;
  if (turn && !headline.text.endsWith(turn)) throw new Error(`The headline does not end with: ${turn}`);
}

/** Every page as a file. Fonts are copied by whoever writes the files out. */
export function build(site: Site): BuiltFile[] {
  const content = siteContent.parse(site.content);
  siteDesign.parse(site.design);
  checkReferences(content);
  const parsed = { ...site, content };
  const context = (page: PageContext["page"], root: string): PageContext => ({ content, design: site.design, root, page });
  return [
    { path: "site.css", text: STYLES },
    { path: "index.html", text: document(parsed, "./", content.home.seo, createElement(HOMES[site.design.direction], { context: context("home", "./") })) },
    { path: `${content.about.slug}/index.html`, text: document(parsed, "../", content.about.seo, <AboutPage context={context("about", "../")} />) },
    { path: `${content.contact.slug}/index.html`, text: document(parsed, "../", content.contact.seo, <ContactPage context={context("contact", "../")} />) },
    { path: `${content.privacy.slug}/index.html`, text: document(parsed, "../", content.privacy.seo, <PrivacyPage context={context("privacy", "../")} />) },
    { path: "404.html", text: document(parsed, "./", { title: content.notFound.heading, description: content.notFound.text }, <NotFoundPage context={context("notFound", "./")} />) },
  ];
}
