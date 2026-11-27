/**
 * Axivo's own short films, made of the lab's parts and nothing else: the 3D
 * band (band-core, drawn still by still), the silk pictures in lab/bilder/,
 * Archivo, and the brand's five colours. One idea in three shapes, the one
 * the showcase is built on: many parts, a direction, one thing.
 *
 *   ?film=story  9:16, 1080 × 1920, 14 s   stories on Instagram and LinkedIn
 *   ?film=loop   1:1,  1080 × 1080,  8 s   a feed post that loops without a seam
 *   ?film=wide   16:9, 1920 × 1080, 15 s   a presentation or the website
 *
 * Every cut and every entrance sits on a half-second grid (120 beats a
 * minute). Nothing here runs on a clock: the page exposes `window.sgFilm`,
 * and `seek(t)` puts the GSAP timeline, the CSS animations and the band at
 * time t, so scripts/render-dom-film.mjs gets the same frame for the same t
 * however busy the machine is.
 */
import { gsap } from "gsap";
import { SplitText } from "gsap/SplitText";
import { startBand, type BandCore } from "../../src/modules/band-core";

gsap.registerPlugin(SplitText);

/** What a page offers the film renderer (scripts/render-dom-film.mjs). */
export interface SgFilm {
  width: number;
  height: number;
  fps: number;
  /** Seconds. */
  duration: number;
  /** Puts every animation on the page at time t (seconds). The same t always gives the same picture. */
  seek: (t: number) => void;
}

declare global {
  interface Window {
    sgFilm?: SgFilm;
  }
}

const FPS = 30;
/** Half a beat's safety when comparing times: frame times are exact multiples of 1/30, cuts of 1/2. */
const EPSILON = 1e-6;
/** The lab's colours for the band: ink, tint, metal, glow. */
const BAND_COLOURS = ["#151922", "#4a5bb5", "#c9d9f0", "#879dc7"];

type Name = "story" | "loop" | "wide";
const SIZES: Record<Name, { width: number; height: number; duration: number }> = {
  story: { width: 1080, height: 1920, duration: 14 },
  loop: { width: 1080, height: 1080, duration: 8 },
  wide: { width: 1920, height: 1080, duration: 15 },
};

const query = new URLSearchParams(location.search);
const name: Name = (["story", "loop", "wide"] as const).find((film) => film === query.get("film")) ?? "story";
const size = SIZES[name];
const stage = document.getElementById("stage")!;
stage.classList.add(`film-${name}`);
stage.style.width = `${size.width}px`;
stage.style.height = `${size.height}px`;
// One unit is a hundredth of the film's width: every size in reel.css is counted in it.
stage.style.setProperty("--u", `${size.width / 100}px`);

const timeline = gsap.timeline({ paused: true });
/** What must be redrawn by hand at every seek: the bands. */
const drawers: ((t: number) => void)[] = [];
const waits: Promise<unknown>[] = [];

/** An element that is on screen from `from` until `to` (a hard cut in, a hard cut out). */
function timed<T extends HTMLElement>(element: T, from: number, to: number): T {
  element.dataset.from = String(from);
  element.dataset.to = String(to);
  return element;
}

function make(tag: string, className: string, html = ""): HTMLElement {
  const element = document.createElement(tag);
  element.className = className;
  element.innerHTML = html;
  return element;
}

/** One line of display type, in the mask its letters rise out of. */
const line = (text: string, extra = "") => `<span class="l ${extra}"><span class="l-in">${text}</span></span>`;
const mark = () => `<p class="mark-small">axivo<span>Signature</span></p>`;

function shot(from: number, to: number, className: string, html: string): HTMLElement {
  const element = timed(make("section", `shot ${className}`, html), from, to);
  // How long the shot lasts, for CSS animations that run its whole length.
  element.style.setProperty("--length", `${to - from}s`);
  stage.append(element);
  return element;
}

/** Sets a block's type so that its longest line is exactly `units` wide. */
function fit(block: HTMLElement, units: number): void {
  const widest = Math.max(...[...block.querySelectorAll<HTMLElement>(".l-in")].map((inner) => inner.getBoundingClientRect().width));
  const current = Number.parseFloat(getComputedStyle(block).fontSize);
  block.style.fontSize = `${(current * units * (size.width / 100)) / widest}px`;
}

/** The letters of a line rise out of its mask, starting on the beat `at`. */
function rise(target: Element | Element[] | NodeListOf<Element>, at: number, options: { stagger?: number; duration?: number; each?: number } = {}): void {
  const lines = target instanceof Element ? [target] : [...target];
  lines.forEach((element, index) => {
    const inner = element.matches(".l-in") ? element : element.querySelector(".l-in")!;
    const split = SplitText.create(inner, { type: "chars", charsClass: "c", aria: "none" });
    timeline.fromTo(split.chars, { yPercent: 150 }, { yPercent: 0, duration: options.duration ?? 0.7, ease: "expo.out", stagger: options.stagger ?? 0.022 }, at + index * (options.each ?? 0));
  });
}

/** A small thing (a label, a line of text) lifts into place. */
function lift(target: Element | null, at: number): void {
  if (target) timeline.fromTo(target, { yPercent: 60, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.6, ease: "expo.out" }, at);
}

interface BandShot {
  /** The band's own clock at film time t: with `loop` it comes round once per loop. */
  time: (t: number) => number;
  loop: number;
  zoom: number;
  tilt: number;
  centred: boolean;
}

/** The band in a shot: drawn at twice the film's size, one still per frame, and only while its shot is on screen. */
function band(host: HTMLElement, spec: BandShot): { state: { progress: number }; canvas: HTMLCanvasElement } {
  const canvas = document.createElement("canvas");
  canvas.className = "band-canvas";
  host.prepend(canvas);
  const state = { progress: 0 };
  const fail = () => {
    throw new Error("The band cannot draw: WebGL is not available");
  };
  const core: BandCore | null = startBand(
    canvas,
    { allowSoftware: true, lowPower: false, colours: BAND_COLOURS, preserve: true, centred: spec.centred, quality: 2, frameBudget: 1, loop: spec.loop, zoom: spec.zoom, tilt: spec.tilt },
    { shown: () => undefined, lost: fail, report: () => undefined },
  );
  if (!core) fail();
  const box = canvas.getBoundingClientRect();
  // Twice the pixels, scaled down by the browser: finer highlights on the satin than antialiasing alone gives.
  core!.resize(box.width, box.height, 2);
  const from = Number(host.dataset.from);
  const to = Number(host.dataset.to);
  drawers.push((t) => {
    if (t >= from - EPSILON && t < to - EPSILON) core!.still(state.progress, spec.time(t));
  });
  return { state, canvas };
}

/**
 * A silk picture, drawn once into a canvas so no frame ever waits for an image to decode. Full strength it is a shot
 * of its own; under a wash of paper or colour it is the satin in the light cards.
 */
function silk(host: HTMLElement, file: string): void {
  const canvas = document.createElement("canvas");
  canvas.className = "silk";
  host.prepend(canvas);
  const image = new Image();
  image.src = new URL(`../bilder/${file}.webp`, import.meta.url).href;
  waits.push(
    image.decode().then(() => {
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      canvas.getContext("2d")!.drawImage(image, 0, 0);
    }),
  );
}

/** Parts, a direction, one thing: three words over the band as it gathers. Returns the band so the film can move it. */
function gather(host: HTMLElement, starts: [number, number, number], end: number, spec: BandShot) {
  const words = ["Delar.", "Riktning.", "En sak."];
  const block = make("div", "words");
  words.forEach((word, index) => {
    const from = starts[index];
    const to = starts[index + 1] ?? end;
    block.append(timed(make("p", "word", line(word)), from, to));
  });
  const steps = make("div", "steps");
  words.forEach((_, index) => {
    const from = index === 0 ? Number(host.dataset.from) : starts[index];
    steps.append(timed(make("p", "step", `<b>0${index + 1}</b><i></i>Från delar till en sak`), from, starts[index + 1] ?? end));
  });
  const caption = make("div", "caption");
  caption.append(steps, block);
  host.append(caption);
  return { block, steps, drawn: band(host, spec) };
}

/** The closing mark: the lab's own wordmark, large, and the one line that is true of the film itself. */
const signature = () => `<div class="sign"><p class="sign-name">${line("axivo")}</p><p class="sign-sub">Signature</p><p class="sign-line">Hela filmen är ritad i kod.</p></div>`;

function story(): void {
  // 0–5: the band gathers, three words on the beat.
  const parts = shot(0, 5, "shot-band", mark());
  const { block, drawn } = gather(parts, [0.5, 2, 3.5], 5, { time: (t) => t, loop: 16, zoom: 0.86, tilt: 0.3, centred: true });
  fit(block, 84);
  rise(block.querySelectorAll(".word"), 0.5, { each: 1.5 });
  timeline.fromTo(drawn.state, { progress: 0 }, { progress: 0.62, duration: 1.5, ease: "power2.inOut" }, 2);
  timeline.to(drawn.state, { progress: 1, duration: 1, ease: "power2.out" }, 3.5);
  timeline.fromTo(drawn.canvas, { scale: 1 }, { scale: 1.1, duration: 5, ease: "none" }, 0);

  // 5–7.5: silk, and the line, a word group a beat.
  const move = shot(5, 7.5, "shot-silk", `${mark()}<div class="say">${line("Rörelse")}${line("som betyder")}${line("något.")}</div>`);
  silk(move, "siden-natt");
  fit(move.querySelector<HTMLElement>(".say")!, 84);
  rise(move.querySelectorAll(".l"), 5, { each: 0.5 });

  // 7.5–9.5: paper. What is measured.
  const measure = shot(7.5, 9.5, "shot-paper", `<div class="wash"></div>${mark()}<div class="say">${line("Varje sida")}${line("mäts innan")}${line("kunden")}${line("ser den.")}</div><i class="rule"></i>`);
  silk(measure, "siden-natt");
  fit(measure.querySelector<HTMLElement>(".say")!, 84);
  rise(measure.querySelectorAll(".l"), 7.5, { each: 0.08, duration: 0.6, stagger: 0.012 });

  // 9.5–11.5: three words, three colours, a hard cut each beat.
  counted(9.5, 11.5);

  // 11.5–14: the band, whole, and the name.
  const end = shot(11.5, 14, "shot-band shot-end", signature());
  const whole = band(end, { time: (t) => t, loop: 16, zoom: 0.86, tilt: 0.3, centred: true });
  whole.state.progress = 1;
  timeline.fromTo(whole.canvas, { scale: 1.1 }, { scale: 1, duration: 2.5, ease: "none" }, 11.5);
  rise(end.querySelector(".sign-name")!, 12, { stagger: 0.04 });
  lift(end.querySelector(".sign-sub"), 12.5);
  lift(end.querySelector(".sign-line"), 13);
}

/** Speed, accessibility, weight: each cuts in on its own beat, in its own colour, set as wide as the frame. */
function counted(from: number, to: number): void {
  const words = ["Hastighet", "Tillgänglighet", "Vikt"];
  const host = shot(from, to, "shot-count", `${mark()}<div class="count">${words.map((word, index) => `<p class="count-row count-${index + 1}">${line(word)}</p>`).join("")}</div>`);
  // The whole frame changes colour with each word: indigo, lilac, ice.
  ["indigo", "lilac", "ice"].forEach((tone, index) => {
    const field = timed(make("div", `tone tone-${tone}`), from + index * 0.5, index === 2 ? to : from + (index + 1) * 0.5);
    field.dataset.tone = tone;
    host.prepend(field);
  });
  // Under the colour the same silk goes on drifting, straight through the cuts: the cards have the depth of the dark shots.
  silk(host, "siden-natt");
  const rows = [...host.querySelectorAll<HTMLElement>(".count-row")];
  if (name === "wide") fit(host.querySelector<HTMLElement>(".count")!, 64);
  // The heavy row a little narrower: its V and t overhang their boxes, and it should look as wide as the others.
  else rows.forEach((row, index) => fit(row, index === 2 ? 81.5 : 84));
  const [speed, , weight] = rows.map((row) => row.querySelector<HTMLElement>(".l-in")!);
  // Each word moves as what it names. Speed is there at once, from the side.
  timed(rows[0], from, to);
  timeline.fromTo(speed, { xPercent: -104, skewX: -14 }, { xPercent: 0, skewX: 0, duration: 0.32, ease: "expo.out" }, from);
  // Accessibility arrives plainly and is readable from its first frame.
  timed(rows[1], from + 0.5, to);
  rise(rows[1], from + 0.5, { duration: 0.55, stagger: 0 });
  // Weight falls, lands on the beat, and puts weight on.
  const land = from + 1;
  timed(rows[2], land - 0.2, to);
  timeline.fromTo(weight, { yPercent: -150 }, { yPercent: 0, duration: 0.2, ease: "power2.in" }, land - 0.2);
  timeline.fromTo(weight, { fontWeight: 300 }, { fontWeight: 800, duration: 0.6, ease: "expo.out" }, land);
}

function wide(): void {
  // 0–5: the band beside its caption, as on the site's wide screens.
  const parts = shot(0, 5, "shot-band", mark());
  const { block, drawn } = gather(parts, [0.5, 2, 3.5], 5, { time: (t) => t, loop: 20, zoom: 1.12, tilt: 0.3, centred: false });
  fit(block, 43);
  rise(block.querySelectorAll(".word"), 0.5, { each: 1.5 });
  timeline.fromTo(drawn.state, { progress: 0 }, { progress: 0.62, duration: 1.5, ease: "power2.inOut" }, 2);
  timeline.to(drawn.state, { progress: 1, duration: 1, ease: "power2.out" }, 3.5);
  timeline.fromTo(drawn.canvas, { scale: 1 }, { scale: 1.08, duration: 5, ease: "none" }, 0);

  // 5–8: silk. The line in two rows, three entrances.
  const move = shot(5, 8, "shot-silk", `${mark()}<div class="say"><span class="row">${line("Rörelse")} ${line("som")}</span><span class="row">${line("betyder")} ${line("något.")}</span></div>`);
  silk(move, "siden-lila");
  fit2(move.querySelector<HTMLElement>(".say")!, 88);
  const [first, second, third, fourth] = [...move.querySelectorAll(".l")];
  rise(first, 5);
  rise([second, third], 5.5, { each: 0.12 });
  rise(fourth, 6);

  // 8–10.5: paper.
  const measure = shot(8, 10.5, "shot-paper", `<div class="wash"></div>${mark()}<div class="say">${line("Varje sida mäts")}${line("innan kunden ser den.")}</div><i class="rule"></i>`);
  silk(measure, "siden-natt");
  fit(measure.querySelector<HTMLElement>(".say")!, 88);
  rise(measure.querySelectorAll(".l"), 8, { each: 0.5, stagger: 0.012 });

  // 10.5–12.5: three rows.
  counted(10.5, 12.5);

  // 12.5–15: the band and the name.
  const end = shot(12.5, 15, "shot-band shot-end", signature());
  const whole = band(end, { time: (t) => t, loop: 20, zoom: 1.12, tilt: 0.3, centred: false });
  whole.state.progress = 1;
  timeline.fromTo(whole.canvas, { scale: 1.08 }, { scale: 1, duration: 2.5, ease: "none" }, 12.5);
  rise(end.querySelector(".sign-name")!, 13, { stagger: 0.04 });
  lift(end.querySelector(".sign-sub"), 13.5);
  lift(end.querySelector(".sign-line"), 14);
}

/** As `fit`, for rows made of several masks: the widest row is `units` wide. */
function fit2(block: HTMLElement, units: number): void {
  const widest = Math.max(...[...block.querySelectorAll<HTMLElement>(".row")].map((row) => row.getBoundingClientRect().width));
  const current = Number.parseFloat(getComputedStyle(block).fontSize);
  block.style.fontSize = `${(current * units * (size.width / 100)) / widest}px`;
}

function loop(): void {
  // One shot, eight seconds, four bars: the band comes apart, finds a direction, is one thing, and is named.
  const only = shot(0, 8, "shot-band", mark());
  const { block, drawn } = gather(only, [0, 2, 4], 6, { time: (t) => t, loop: 8, zoom: 1.2, tilt: 0.3, centred: true });
  fit(block, 62);
  rise(block.querySelectorAll(".word"), 0, { each: 2 });
  const sign = timed(make("div", "sign-host", signature()), 6, 8);
  only.append(sign);
  rise(sign.querySelector(".sign-name")!, 6, { stagger: 0.04 });
  lift(sign.querySelector(".sign-sub"), 6.5);
  lift(sign.querySelector(".sign-line"), 7);
  // The loop closes on the whole band: it comes apart under the first word, and is whole again when it is named.
  timeline.fromTo(drawn.state, { progress: 1 }, { progress: 0, duration: 1.5, ease: "power2.inOut" }, 0);
  timeline.to(drawn.state, { progress: 0.62, duration: 1.5, ease: "power2.inOut" }, 2);
  timeline.to(drawn.state, { progress: 1, duration: 1, ease: "power2.out" }, 4);
}

// The display type must be measured in its real font: wait for it before anything is fitted or split.
await Promise.all([
  document.fonts.load('500 100px "Archivo"'),
  document.fonts.load('800 100px "Archivo"'),
  document.fonts.load('500 20px "Instrument Sans"'),
]);
await document.fonts.ready;
({ story, loop, wide })[name]();
await Promise.all(waits);
// The timeline is as long as the film even where nothing moves at its end.
timeline.set({}, {}, size.duration);

const timedElements = [...stage.querySelectorAll<HTMLElement>("[data-from]")].map((element) => ({ element, from: Number(element.dataset.from), to: Number(element.dataset.to) }));
// CSS animations run on the film's clock, counted from the cut their shot comes in on.
const cssAnimations = document.getAnimations().map((animation) => {
  animation.pause();
  const target = animation.effect instanceof KeyframeEffect ? animation.effect.target : null;
  return { animation, from: Number(target?.closest<HTMLElement>(".shot")?.dataset.from ?? 0) };
});

function seek(t: number): void {
  let tone = "";
  for (const { element, from, to } of timedElements) {
    const on = t >= from - EPSILON && t < to - EPSILON;
    element.style.visibility = on ? "inherit" : "hidden";
    if (on && element.dataset.tone) tone = element.dataset.tone;
  }
  // The colour field on screen, for type that must change with it.
  stage.dataset.tone = tone;
  timeline.seek(t, true);
  for (const { animation, from } of cssAnimations) animation.currentTime = Math.max(0, t - from) * 1000;
  for (const draw of drawers) draw(t);
}

seek(0);
window.sgFilm = { width: size.width, height: size.height, fps: FPS, duration: size.duration, seek };

// For a person looking: the film at the screen's own pace, scaled to fit the window.
if (query.has("play")) {
  const started = performance.now();
  const scale = Math.min(1, window.innerWidth / size.width, window.innerHeight / size.height);
  stage.style.transform = `scale(${scale})`;
  const tick = (now: number) => {
    seek((Math.floor(((now - started) / 1000) * FPS) / FPS) % size.duration);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
