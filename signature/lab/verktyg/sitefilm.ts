/**
 * Lays out a site's photographed frames as a film: one view of the site, or
 * the same site without and with Signature side by side, with a small label
 * on each half. scripts/render-site-film.mjs makes the frames (the site
 * itself, stepped one frame at a time) and serves them; this page only
 * places them and sets the words, and scripts/render-dom-film.mjs films it
 * through `window.sgFilm` like any other tool page.
 *
 * Nothing is added to the site's pictures: a frame is drawn as it was
 * photographed. What this page adds stands beside the site, never as part of
 * it: the two labels, Axivo's mark, and where the firm is invented the word
 * "Esimerkki" with a line saying so.
 *
 *   ?layout=pair-wide    16:9, 1920 × 1080: two phone views and the words in the margins
 *   ?layout=pair-square  1:1,  1080 × 1080: two phone views, the words above and below
 *   ?layout=single       one view, edge to edge, at the frames' own size (&width=&height=)
 *
 *   &a=<address of a folder of frames>   the site (single), or the site without Signature (pair)
 *   &b=<address>                         the site with Signature (pair)
 *   &frames=450&fps=30                   how many frames each folder holds (000000.png, 000001.png, …)
 *   &lang=fi|sv|en                       the words (Finnish by default)
 *   &example=1&firm=Kahvila%20Lyyti      marks the firm as invented
 */
import type { SgFilm } from "./reel";

type Language = "fi" | "sv" | "en";
type Layout = "pair-wide" | "pair-square" | "single";

/** Every word the films carry. Written for each language, not word for word. */
const COPY: Record<Language, { label: string; without: string; with: string; example: string; invented: (firm: string) => string; inventedShort: string }> = {
  fi: {
    label: "Sama sivusto ilman Signaturea ja Signaturen kanssa",
    without: "Ilman Signaturea",
    with: "Signaturen kanssa",
    example: "Esimerkki",
    invented: (firm) => (firm ? `${firm} on keksitty yritys.` : "Keksitty yritys."),
    inventedShort: "Keksitty yritys",
  },
  sv: {
    label: "Samma webbplats utan och med Signature",
    without: "Utan Signature",
    with: "Med Signature",
    example: "Exempel",
    invented: (firm) => (firm ? `${firm} är ett påhittat företag.` : "Ett påhittat företag."),
    inventedShort: "Påhittat företag",
  },
  en: {
    label: "The same site without and with Signature",
    without: "Without Signature",
    with: "With Signature",
    example: "Example",
    invented: (firm) => (firm ? `${firm} is an invented firm.` : "An invented firm."),
    inventedShort: "Invented firm",
  },
};

const query = new URLSearchParams(location.search);
const layout = (["pair-wide", "pair-square", "single"] as const).find((name) => name === query.get("layout")) ?? "pair-wide";
const language = (["fi", "sv", "en"] as const).find((name) => name === query.get("lang")) ?? "fi";
const copy = COPY[language];
const fps = Number(query.get("fps") ?? 30);
const frames = Number(query.get("frames") ?? 0);
const example = query.has("example");
const firm = query.get("firm") ?? "";
const folder = (name: string) => (query.get(name) ?? "").replace(/\/?$/, "/");

const SIZES: Record<Layout, { width: number; height: number }> = {
  "pair-wide": { width: 1920, height: 1080 },
  "pair-square": { width: 1080, height: 1080 },
  single: { width: Number(query.get("width") ?? 1080), height: Number(query.get("height") ?? 1920) },
};
const size = SIZES[layout];

const stage = document.getElementById("stage")!;
document.documentElement.lang = language;
stage.classList.add(`layout-${layout}`);
stage.classList.toggle("narrow", size.width < 1200);
stage.style.width = `${size.width}px`;
stage.style.height = `${size.height}px`;
stage.style.setProperty("--u", `${size.width / 100}px`);
stage.setAttribute("aria-label", layout === "single" ? firm || "Axivo Signature" : copy.label);

function element(tag: string, className: string, text?: string): HTMLElement {
  const made = document.createElement(tag);
  made.className = className;
  if (text !== undefined) made.textContent = text;
  return made;
}

/** A view of the site: a canvas the frames are drawn on, at the pixels it covers in the film. */
interface View {
  from: string;
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
}
const views: View[] = [];
function view(from: string, className: string): HTMLElement {
  const frame = element("div", `view ${className}`);
  const canvas = document.createElement("canvas");
  frame.append(canvas);
  views.push({ from, canvas, context: canvas.getContext("2d", { alpha: false })! });
  return frame;
}

/** Axivo's mark as in the lab's films: the name, and the product in small capitals beside it. */
function mark(): HTMLElement {
  const made = element("p", "mark", "Axivo");
  made.append(element("span", "", "Signature"));
  return made;
}
/** "Esimerkki", and the sentence that says the firm does not exist. */
function exampleMark(): HTMLElement {
  const made = element("div", "example");
  made.append(element("p", "example-word", copy.example), element("p", "example-line", copy.invented(firm)));
  return made;
}

if (layout === "single") {
  stage.append(view(folder("a"), "view-full"));
  // On the film's edge, in the site's own gutter, reading upwards: beside the site, never over its words.
  if (example) stage.append(element("p", "example-tab", `${copy.example} · ${copy.inventedShort}`));
} else {
  const halves = [
    { from: folder("a"), words: copy.without, tone: "half-without", number: "01" },
    { from: folder("b"), words: copy.with, tone: "half-with", number: "02" },
  ];
  for (const half of halves) {
    const column = element("section", `half ${half.tone}`);
    const label = element("p", "label");
    label.append(element("b", "", half.number), element("i", ""), element("span", "", half.words));
    column.append(label, view(half.from, "view-phone"));
    stage.append(column);
  }
  if (example) stage.append(exampleMark());
  stage.append(mark());
}

/** The canvases take the size they are shown at, in the film's own pixels, so a frame is scaled once, with care. */
function sizeViews(): void {
  for (const each of views) {
    const box = each.canvas.getBoundingClientRect();
    each.canvas.width = Math.round(box.width * devicePixelRatio);
    each.canvas.height = Math.round(box.height * devicePixelRatio);
    each.context.imageSmoothingEnabled = true;
    each.context.imageSmoothingQuality = "high";
  }
}

async function frame(from: string, index: number): Promise<ImageBitmap> {
  const response = await fetch(`${from}${String(index).padStart(6, "0")}.png`);
  if (!response.ok) throw new Error(`No frame ${index} at ${from}`);
  return createImageBitmap(await response.blob(), { colorSpaceConversion: "none" });
}

/** Puts every view at time t: the frame photographed for that moment, and nothing else. The same t gives the same picture. */
async function seek(t: number): Promise<void> {
  const index = Math.max(0, Math.min(frames - 1, Math.round(t * fps)));
  const bitmaps = await Promise.all(views.map((each) => frame(each.from, index)));
  views.forEach((each, at) => {
    each.context.drawImage(bitmaps[at], 0, 0, each.canvas.width, each.canvas.height);
    bitmaps[at].close();
  });
}

await document.fonts.ready;
// Every face the words use, loaded before the first photograph: a late font would move a label between frames.
await Promise.all(["500 20px Archivo", "600 20px Archivo", "500 20px 'Instrument Sans'", "600 20px 'Instrument Sans'"].map((font) => document.fonts.load(font, `${copy.without}${copy.with}${copy.example}${firm}`)));
sizeViews();
if (!frames || !Number.isInteger(frames)) throw new Error("sitefilm needs &frames=<count>");
await seek(0);

const film: SgFilm = { width: size.width, height: size.height, fps, duration: frames / fps, seek };
window.sgFilm = film;
