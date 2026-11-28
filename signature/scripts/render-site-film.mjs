/**
 * Films any site, deterministically, into signature/films/sites/: a phone
 * film (9:16), a desktop film (16:9) and, given the same site without
 * Signature, a before/after film (16:9 and 1:1) with the two side by side.
 *
 *   npm run site-film -- --site <address> --name <name>                    phone and desktop films of a site
 *   npm run site-film -- --site <address> --plain <address> --name <name>  and the before/after films
 *   npm run site-film -- --examples                                        the four invented example firms, built,
 *                                                                          enhanced and served by this script
 *   npm run site-film -- --examples --only kahvila --lang fi,sv,en
 *
 *   --device phone,desktop    which single films to make (default both; the before/after films use the phone)
 *   --lang fi,sv,en           the words on the before/after films (default fi); single films take the first
 *   --firm "Kahvila Lyyti"    the firm's name, for the mark
 *   --example                 the firm is invented: every film says so ("Esimerkki", "Exempel", "Example")
 *   --stops "<stop>; <stop>"  where the scroll rests, each `selector @part hold` (`.menu-card h2 @0.3 1.4`: that
 *                             element's top at 30 % of the screen's height, for 1.4 s); without it the script finds
 *                             the page's headlines, pictures and form itself
 *   --cta <selector>          the last rest when the script finds the stops itself (default: the last form)
 *   --duration 16             the longest a film may be, 12 to 20 seconds
 *   --square-lang fi          languages of the 1:1 film (default: the same as --lang)
 *   --keep-frames             keep the photographed frames (films/sites/<name>/.frames/, about 1 GB a film)
 *   --capture-only            photograph and check, compose nothing (the frames are kept)
 *   --reuse-frames            compose from the frames kept by an earlier run, photographing only what is missing
 *   --still 2.5,9             compose only those moments of each film, as PNG
 *   --verify-all              the second pass photographs every frame, not twelve (a frame that differs is kept
 *                             beside the first pass's as NNNNNN.second-pass.png)
 *   --sheet-only              compose only each film's contact sheet (twelve frames): for judging a path or a layout
 *   --yield                   before every render, wait (at most 20 minutes) while a film review, Lighthouse or a
 *                             Playwright run is measuring on this machine
 *   --port 4610               the port for the frames and the example sites (4600 to 4699; the lab's dev server
 *                             for the layout page is started on the next one)
 *
 * How a film is made, and why the same site gives the same film:
 *
 * 1. Time. A script that runs before the site's own replaces the page's clocks: `performance.now`, `Date`,
 *    `requestAnimationFrame`, timers and idle callbacks all read one counter that only this script moves, one
 *    frame (1/30 s) at a time. CSS animations, transitions and Web Animations are taken off the wall clock the
 *    moment they exist (paused, and moved by the same counter, finished through `finish()` so their events fire).
 *    Scroll-driven animations follow the scroll, as always. (Chrome's own virtual time,
 *    `Emulation.setVirtualTimePolicy`, was tried first: in the installed Chrome a page never finishes loading while
 *    it is paused, and animation frames keep the wall clock's timestamps, so Lenis ran on real time.)
 * 2. Scroll. A scripted path of eased moves and rests. On a desktop it is sent as wheel events, one per frame, the
 *    way a trackpad sends them: a site with smooth scrolling (Lenis) takes them and moves as it would for a visitor;
 *    on a site that does not take them the page is scrolled by the same amount, as the browser would. On a phone the
 *    page is scrolled directly, as under a finger (Lenis leaves touch alone), with the touch events around each move.
 * 3. Rest. After each step the script waits for what the step set off: lazy pictures (fetched and decoded), chunks
 *    the site imports, animations that begin. Intersection observers are worked out by the browser as always, but
 *    their reports are handed to the page here, at one fixed point of the frame, and only from frame 0 on (fonts and
 *    the first screen's pictures in). Then the screen is emptied for a painted frame and brought back, so Chrome
 *    draws the page afresh, and it is photographed until two photographs are identical.
 * 4. Proof. A frame depends on everything before it, so frames cannot be sought out of order as
 *    render-dom-film.mjs does. Instead the site is loaded a second time in a fresh browser context and stepped
 *    through the whole film again; a spread of frames (all of them with --verify-all) is photographed and must match
 *    the first pass to the pixel, and the scroll position must be the same on every frame. No film is made from a
 *    site that fails. The composed film is then rendered by render-dom-film.mjs, which runs its own out-of-order
 *    check on the layout page.
 *
 * Nothing is added to the site: no effect, no cursor, no blur. What the layout page adds stands beside it (the
 * labels, Axivo's mark, the word "Esimerkki").
 *
 * Not driven: `<video>`, GIFs and anything in a worker or an `<iframe>` still run on the wall clock, and timers
 * with a delay do not fire while the page loads. A site that has those needs them still or loaded before frame 0.
 *
 * Uses the installed Chrome (as render-dom-film.mjs does: its WebCodecs encode H.264).
 */
import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { createServer as createHttpServer } from "node:http";
import { cpSync, createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, normalize, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, devices } from "@playwright/test";
import { createServer as createViteServer } from "vite";
import { enhanceSite, presetForDirection } from "../layer/enhance.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const FILMS = join(HERE, "films");
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name, fallback) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : fallback);

const FPS = 30;
const PORT = Number(value("port", 4610));
const LANGS = value("lang", "fi").split(",");
const SQUARE_LANGS = value("square-lang", LANGS.join(",")).split(",");
const DEVICES = value("device", "phone,desktop").split(",");
const MAX_SECONDS = Number(value("duration", 16));
/** How many frames the second pass photographs again. */
const VERIFY = 12;
for (const lang of [...LANGS, ...SQUARE_LANGS]) if (!["fi", "sv", "en"].includes(lang)) throw new Error(`--lang is fi, sv or en, not ${lang}`);
if (!(MAX_SECONDS >= 12 && MAX_SECONDS <= 20)) throw new Error("--duration is 12 to 20 seconds");

/**
 * The two screens. Each is laid out at the width a visitor has and photographed at the scale that gives a full HD
 * film: 390 px → 1080 × 1920, 1440 px → 1920 × 1080.
 */
const SCREENS = {
  phone: { width: 390, height: 694, film: { width: 1080, height: 1920 }, touch: true },
  desktop: { width: 1440, height: 810, film: { width: 1920, height: 1080 }, touch: false },
};

/**
 * The invented example firms (proof/concepts/industry-examples.ts, built by its .render.ts into
 * proof/out/industry-examples/). The stops are chosen by eye, per screen: rests where a headline or a picture
 * arrives, so what Signature adds can be seen, and the last one on the page's own call to action.
 */
const EXAMPLES = [
  {
    name: "kahvila",
    firm: "Kahvila Lyyti",
    stops: {
      phone: ".hero-image @0.2 1.5; .menu-card-head @0.14 1.7; .visit-head @0.14 1.5; .closing @0.1 1.8",
      desktop: ".menu-card @0.1 1.9; .visit @0.12 1.7; .questions @0.3 1.3; .closing @0.06 2",
    },
  },
  {
    name: "sisustus",
    firm: "Sisustusstudio Kuura",
    stops: {
      phone: ".hero-image @0.42 1.4; .work-head @0.12 1.4; .work-item--2 @0.3 1.3; .work-item--3 @0.3 1.2; .approach @0.12 1.3; .closing @0.1 1.6",
      desktop: ".hero-image @0.2 1.6; .work-head @0.12 1.8; .approach @0.2 1.5; .closing @0.06 2",
    },
  },
  {
    name: "hyvinvointi",
    firm: "Hoitola Vire",
    stops: {
      phone: ".hero-image @0.22 1.6; .treatments @0.1 1.7; .visit-flow @0.1 1.6; .closing @0.1 1.8",
      desktop: ".treatments @0.12 1.8; .visit-flow @0.12 1.7; .questions @0.3 1.3; .closing @0.06 2",
    },
  },
  {
    name: "juridiikka",
    firm: "Asianajotoimisto Kivelä",
    stops: {
      phone: ".hero-image @0.3 1.5; .services @0.1 1.6; .memory @0.1 1.8; .closing @0.1 1.8",
      desktop: ".reasons @0.14 1.5; .services @0.1 1.7; .memory @0.1 1.9; .closing @0.06 2",
    },
  },
];

const sha = (data) => createHash("sha256").update(data).digest("hex");
const wait = (ms) => new Promise((done) => setTimeout(done, ms));

/** On a shared machine: other agents' measurements go first. Chrome left behind by a run that ended long ago does not count. */
async function yieldToMeasurements() {
  if (!flag("yield")) return;
  for (let minute = 0; minute < 20; minute++) {
    const busy = execFileSync("ps", ["-axo", "pid,command"], { encoding: "utf8" })
      .split("\n")
      .filter((line) => /film-review|lighthouse|playwright test/.test(line) && !/Google Chrome|render-site-film/.test(line));
    if (!busy.length) return;
    if (!minute) console.log(`  waiting for a measurement on this machine to end (${busy[0].trim().slice(0, 80)})`);
    await wait(60_000);
  }
  console.log("  waited 20 minutes, going on");
}

// ---------------------------------------------------------------------------------------------------------------
// In the page: the clock. Runs before any script of the site.
// ---------------------------------------------------------------------------------------------------------------
function clock({ epoch, touch }) {
  if (window !== window.top) return;
  const native = {
    raf: window.requestAnimationFrame.bind(window),
    setInterval: window.setInterval.bind(window),
    clearInterval: window.clearInterval.bind(window),
    pause: Animation.prototype.pause,
    play: Animation.prototype.play,
    Date: window.Date,
  };
  /** Milliseconds since the page began: the only time there is. */
  let now = 0;

  Performance.prototype.now = () => now;
  function FilmDate(...parts) {
    if (!new.target) return new native.Date(epoch + now).toString();
    return Reflect.construct(native.Date, parts.length ? parts : [epoch + now], new.target);
  }
  FilmDate.prototype = native.Date.prototype;
  FilmDate.now = () => epoch + now;
  FilmDate.parse = native.Date.parse;
  FilmDate.UTC = native.Date.UTC;
  window.Date = FilmDate;

  // Timers and animation frames wait in lists; only step() (and, while the page loads, the pump below) runs them.
  let ids = 1_000_000;
  const timers = new Map();
  const frames = new Map();
  const later = (callback, delay, every, rest) => {
    const id = ++ids;
    if (typeof callback === "function") timers.set(id, { callback, due: now + Math.max(0, Number(delay) || 0), every, rest });
    return id;
  };
  window.setTimeout = (callback, delay, ...rest) => later(callback, delay, null, rest);
  window.setInterval = (callback, delay, ...rest) => later(callback, delay, Math.max(1, Number(delay) || 0), rest);
  window.clearTimeout = window.clearInterval = (id) => void timers.delete(id);
  window.requestAnimationFrame = (callback) => {
    const id = ++ids;
    frames.set(id, callback);
    return id;
  };
  window.cancelAnimationFrame = (id) => void frames.delete(id);
  window.requestIdleCallback = (callback) => later(() => callback({ didTimeout: false, timeRemaining: () => 10 }), 0, null, []);
  window.cancelIdleCallback = window.clearTimeout;

  const report = (error) => console.error(error);
  /** Runs the timers due by `until`, in order of their time, each at its own time. */
  async function runTimers(until) {
    for (let guard = 0; guard < 10_000; guard++) {
      let next = null;
      for (const [id, timer] of timers) if (timer.due <= until && (!next || timer.due < next[1].due)) next = [id, timer];
      if (!next) return;
      const [id, timer] = next;
      now = Math.max(now, timer.due);
      if (timer.every) timer.due += timer.every;
      else timers.delete(id);
      try {
        timer.callback(...timer.rest);
      } catch (error) {
        report(error);
      }
      // Promise callbacks run between timers, as in a browser.
      await null;
    }
  }
  async function runFrames() {
    const due = [...frames];
    frames.clear();
    for (const [, callback] of due) {
      try {
        callback(now);
      } catch (error) {
        report(error);
      }
      await null;
    }
  }

  // Animations on the document's timeline (CSS animations, transitions, element.animate): held, and moved by step().
  const held = new Set();
  const seen = new WeakSet();
  /** Those the page itself has paused. */
  const stopped = new WeakSet();
  let adopted = 0;
  // Not before the page's own scripts have run: asking for the animations makes the browser work out styles, which
  // starts the fonts loading early, and whether they had arrived when the site's first script measured the page
  // would then be a race. Left alone, that script meets the page as on any first visit: before its web fonts.
  let parsed = document.readyState !== "loading";
  document.addEventListener("DOMContentLoaded", () => (parsed = true));
  function adopt() {
    if (!parsed) return;
    for (const animation of document.getAnimations()) {
      if (seen.has(animation) || !(animation.timeline instanceof DocumentTimeline)) continue;
      seen.add(animation);
      // One that has not started yet holds its own starting time. One found already running has run on the wall
      // clock for a moment: it starts again from nothing.
      const fresh = animation.pending || animation.playState !== "running";
      const wasPaused = animation.playState === "paused" && !animation.pending;
      try {
        native.pause.call(animation);
        if (!fresh) animation.currentTime = 0;
      } catch {
        continue;
      }
      if (wasPaused) stopped.add(animation);
      held.add(animation);
      adopted++;
    }
  }
  Animation.prototype.pause = function () {
    stopped.add(this);
    native.pause.call(this);
  };
  Animation.prototype.play = function () {
    stopped.delete(this);
    if (!seen.has(this)) return native.play.call(this);
    const end = this.effect?.getComputedTiming().endTime;
    if (this.playState === "finished" || (Number.isFinite(end) && Number(this.currentTime) >= end)) this.currentTime = 0;
    native.pause.call(this);
    held.add(this);
  };
  function advance(by) {
    for (const animation of [...held]) {
      if (animation.playState === "idle") {
        held.delete(animation);
        continue;
      }
      if (stopped.has(animation) || animation.playState !== "paused") continue;
      const rate = animation.playbackRate || 1;
      const next = Number(animation.currentTime ?? 0) + by * rate;
      const end = animation.effect?.getComputedTiming().endTime ?? Infinity;
      try {
        if ((rate > 0 && Number.isFinite(end) && next >= end - 1e-6) || (rate < 0 && next <= 0)) {
          held.delete(animation);
          animation.finish();
        } else animation.currentTime = next;
      } catch (error) {
        held.delete(animation);
        report(error);
      }
    }
  }

  // Intersection observers. The browser works them out once a frame and reports in a task of its own, some time
  // later: on a busy machine a report could land a frame of the film late. Here the browser still does the work, but
  // its reports wait in a list and are handed to the page by settle(), so each belongs to the frame that caused it.
  // While the page loads nothing is handed over: what is on screen then depends on whether the fonts have arrived,
  // which is a race. At ready() every observer starts afresh, on the page as it stands with fonts and pictures in.
  const NativeObserver = window.IntersectionObserver;
  const observers = new Set();
  let observing = false;
  window.IntersectionObserver = class IntersectionObserver {
    #callback;
    #native;
    #targets = new Set();
    #reports = [];
    constructor(callback, options) {
      this.#callback = callback;
      this.#native = new NativeObserver((entries) => void this.#reports.push(...entries), options);
      observers.add(this);
    }
    get root() {
      return this.#native.root;
    }
    get rootMargin() {
      return this.#native.rootMargin;
    }
    get scrollMargin() {
      return this.#native.scrollMargin;
    }
    get thresholds() {
      return this.#native.thresholds;
    }
    observe(target) {
      this.#targets.add(target);
      this.#native.observe(target);
    }
    unobserve(target) {
      this.#targets.delete(target);
      this.#native.unobserve(target);
      this.#reports = this.#reports.filter((entry) => entry.target !== target);
    }
    disconnect() {
      this.#targets.clear();
      this.#native.disconnect();
      this.#reports = [];
    }
    takeRecords() {
      const reports = [...this.#reports, ...this.#native.takeRecords()];
      this.#reports = [];
      return reports;
    }
    __restart() {
      this.#native.disconnect();
      this.#reports = [];
      for (const target of this.#targets) this.#native.observe(target);
    }
    __hand() {
      const reports = this.takeRecords();
      if (!reports.length) return 0;
      try {
        this.#callback(reports, this);
      } catch (error) {
        report(error);
      }
      return reports.length;
    }
  };
  const handReports = () => {
    let handed = 0;
    if (observing) for (const observer of [...observers]) handed += observer.__hand();
    return handed;
  };

  // While the page loads, time stands at 0 and what waits for "now" still runs: timers with no delay, animation
  // frames (with the time 0), idle callbacks. Once ready() is called, only step() moves anything.
  let pumping = false;
  const pump = native.setInterval(async () => {
    if (pumping) return;
    pumping = true;
    await runTimers(0);
    await runFrames();
    adopt();
    pumping = false;
  }, 8);
  // A watcher on the real frame loop: an animation that starts between steps (an observer's callback, a picture's
  // load) is held before it is ever photographed.
  const watch = () => {
    adopt();
    native.raf(watch);
  };
  native.raf(watch);

  const realFrames = (count) => new Promise((resolve) => {
    const tick = () => (count-- > 0 ? native.raf(tick) : resolve());
    tick();
  });
  const finger = (type) => {
    const target = document.elementFromPoint(innerWidth / 2, innerHeight / 2) ?? document.documentElement;
    const point = new Touch({ identifier: 1, target, clientX: innerWidth / 2, clientY: innerHeight / 2 });
    target.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, composed: true, touches: type === "touchend" ? [] : [point], targetTouches: type === "touchend" ? [] : [point], changedTouches: [point] }));
  };

  let planned = 0;
  let moving = false;
  let last = 0;
  window.__sgSite = {
    async ready() {
      native.clearInterval(pump);
      while (pumping) await realFrames(1);
      observing = true;
      for (const observer of observers) observer.__restart();
    },
    /**
     * One frame: the scroll input for it, then the timers that fall due, then the animations, then the animation
     * frame, in the order a browser does them.
     * @param {number} time milliseconds
     * @param {number} y where the scripted path is now
     */
    async step(time, y) {
      const delta = y - planned;
      planned = y;
      if (touch) {
        // A finger: it touches, the page follows it, it lifts. Smooth-scroll layers leave touch to the browser.
        if (delta && !moving) finger("touchstart");
        if (delta) {
          finger("touchmove");
          scrollTo({ top: y, behavior: "instant" });
        } else if (moving) finger("touchend");
        moving = delta !== 0;
      } else if (delta) {
        // A trackpad: one wheel event a frame. A site that scrolls smoothly takes it (Lenis cancels it and moves the
        // page itself); otherwise the browser would scroll by that much.
        const target = document.elementFromPoint(innerWidth / 2, innerHeight / 2) ?? document.documentElement;
        const wheel = new WheelEvent("wheel", { deltaY: delta, deltaMode: 0, bubbles: true, cancelable: true, composed: true, clientX: innerWidth / 2, clientY: innerHeight / 2, view: window });
        if (target.dispatchEvent(wheel)) scrollBy({ top: delta, behavior: "instant" });
      }
      await runTimers(time);
      now = time;
      advance(time - last);
      last = time;
      await runFrames();
      adopt();
    },
    /**
     * Empties the screen for a painted frame and brings the page back, so the photograph that follows is drawn afresh
     * from the page as it stands (as render-dom-film.mjs does before every frame). Chrome otherwise keeps the drawing
     * of a moving layer from the moment it first drew it, and type that an entrance is moving comes out a pixel higher
     * or lower from one run to the next. `visibility` moves nothing and no observer sees it; a site that puts a
     * transition on `visibility` (or on `all`) would start one here, and is told so.
     */
    async redraw() {
      const style = document.documentElement.style;
      const before = [style.getPropertyValue("visibility"), style.getPropertyPriority("visibility")];
      style.setProperty("visibility", "hidden", "important");
      await realFrames(2);
      style.setProperty("visibility", before[0], before[1]);
      if (!before[0]) style.removeProperty("visibility");
      await realFrames(2);
      return document.getAnimations().some((animation) => animation.transitionProperty === "visibility");
    },
    /** For the error when a frame will not hold still: the animations that run on the wall clock. */
    running() {
      return document
        .getAnimations()
        .filter((animation) => animation.playState === "running" && animation.timeline instanceof DocumentTimeline)
        .map((animation) => {
          const target = animation.effect?.target;
          return `${animation.constructor.name} ${animation.animationName ?? animation.transitionProperty ?? ""} on ${target ? `${target.tagName.toLowerCase()}.${String(target.className.baseVal ?? target.className).replace(/\s+/g, ".")}` : "?"}${animation.effect?.pseudoElement ?? ""} at ${Math.round(Number(animation.currentTime))} ms${seen.has(animation) ? ", held before" : ""}`;
        });
    },
    /** Lets the browser deliver what the step set off, decodes the pictures on screen, and says what was new. */
    async settle() {
      await realFrames(2);
      await Promise.all(
        [...document.images]
          .filter((image) => {
            const box = image.getBoundingClientRect();
            return image.complete && image.naturalWidth && box.bottom > -innerHeight && box.top < innerHeight * 2;
          })
          .map((image) => image.decode().catch(() => undefined)),
      );
      await document.fonts.ready;
      const handed = handReports();
      adopt();
      const fresh = adopted + handed;
      adopted = 0;
      await realFrames(1);
      return { fresh, scroll: Math.round(scrollY * 100) / 100, exact: scrollY, height: document.documentElement.scrollHeight };
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// In the page: where the scroll rests.
// ---------------------------------------------------------------------------------------------------------------
function findStops({ stops, cta }) {
  const screen = innerHeight;
  const most = Math.max(0, document.documentElement.scrollHeight - screen);
  /** Where an element is laid out, whatever transform an entrance has it at just now. */
  const top = (element) => {
    let y = 0;
    for (let node = element; node; node = node.offsetParent) y += node.offsetTop;
    return y;
  };
  const rest = (element, part, hold, name) => ({ y: Math.round(Math.max(0, Math.min(most, top(element) - part * screen))), hold, name });
  if (stops) {
    return {
      screen,
      most,
      chosen: true,
      stops: stops.map((stop) => {
        const element = document.querySelector(stop.select);
        if (!element) throw new Error(`No element matches ${stop.select}`);
        return rest(element, stop.part, stop.hold, stop.select);
      }),
    };
  }
  // The page's moments: section headlines, pictures of some size, the form.
  const found = [];
  for (const element of document.querySelectorAll("h2, img, video, form")) {
    const box = element.getBoundingClientRect();
    if (box.width < 40 || box.height < 16 || getComputedStyle(element).visibility === "hidden") continue;
    if (element.matches("h2")) found.push(rest(element, 0.26, 1.3, "h2"));
    else if (element.matches("form")) found.push(rest(element, 0.2, 1.6, "form"));
    else if (box.width >= innerWidth * 0.3 && box.height >= 120) found.push(rest(element, box.height < screen * 0.76 ? (screen - box.height) / 2 / screen : 0.1, 1.5, element.tagName.toLowerCase()));
  }
  found.sort((a, b) => a.y - b.y);
  const end = cta ? document.querySelector(cta) : [...document.querySelectorAll("form")].at(-1);
  const final = end ? rest(end.closest("section") ?? end, 0.1, 1.8, "cta") : { y: most, hold: 1.8, name: "end" };
  // Not closer together than half a screen, and none after the call to action.
  const kept = [];
  let at = 0;
  for (const stop of found) {
    if (stop.y - at < screen * 0.5 || stop.y > final.y - screen * 0.5) continue;
    kept.push(stop);
    at = stop.y;
  }
  return { screen, most, chosen: false, stops: [...kept, final] };
}

/** `selector @part hold; …` → [{ select, part, hold }] */
function parseStops(text) {
  if (!text) return null;
  return text
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const match = /^(.*?)(?:\s+@([\d.]+))?(?:\s+([\d.]+))?$/.exec(item);
      return { select: match[1].trim(), part: match[2] === undefined ? 0.2 : Number(match[2]), hold: match[3] === undefined ? 1.5 : Number(match[3]) };
    });
}

/** A hand's move: off quickly, a long landing. cubic-bezier(0.32, 0, 0.14, 1), solved for x. */
function ease(x) {
  const bezier = (t, a, b) => 3 * (1 - t) * (1 - t) * t * a + 3 * (1 - t) * t * t * b + t * t * t;
  let low = 0;
  let high = 1;
  for (let i = 0; i < 40; i++) {
    const middle = (low + high) / 2;
    if (bezier(middle, 0.32, 0.14) < x) low = middle;
    else high = middle;
  }
  return bezier((low + high) / 2, 0, 1);
}

/**
 * The scroll path, frame by frame: a rest on the first screen, then for each stop a move (longer for a longer way)
 * and a rest. If the film would be longer than allowed, stops found by the script are left out from the end (all but
 * the last: the visitor flicks on to the call to action); stops given by hand have their rests shortened instead.
 */
function scrollPath(found) {
  const frames = (seconds) => Math.max(1, Math.round(seconds * FPS));
  const moveSeconds = (distance) => Math.min(2.3, Math.max(0.9, 0.62 + (0.52 * Math.abs(distance)) / found.screen));
  const stops = found.stops.filter((stop, index, all) => stop.y !== (index ? all[index - 1].y : 0));
  const opening = 2.3;
  const build = (list, shorten) => {
    const parts = [{ rest: frames(opening), y: 0 }];
    let from = 0;
    for (const stop of list) {
      parts.push({ move: frames(moveSeconds(stop.y - from)), from, y: stop.y }, { rest: frames(Math.max(0.8, stop.hold * shorten)), y: stop.y });
      from = stop.y;
    }
    return { parts, frames: parts.reduce((sum, part) => sum + (part.rest ?? part.move), 0), list };
  };
  let plan = build(stops, 1);
  if (!found.chosen) for (let list = stops; plan.frames > MAX_SECONDS * FPS && list.length > 1; plan = build(list, 1)) list = [...list.slice(0, -2), list.at(-1)];
  for (let shorten = 0.95; plan.frames > MAX_SECONDS * FPS && shorten > 0.3; shorten -= 0.05) plan = build(plan.list, shorten);
  if (plan.frames > 20 * FPS) throw new Error(`The scroll path takes ${(plan.frames / FPS).toFixed(1)} s, over 20: give fewer stops`);
  // A film under twelve seconds rests longer at the end.
  if (plan.frames < 12 * FPS) plan.parts.at(-1).rest += 12 * FPS - plan.frames;
  const path = [];
  for (const part of plan.parts) {
    if (part.rest) for (let i = 0; i < part.rest; i++) path.push(part.y);
    else for (let i = 1; i <= part.move; i++) path.push(Math.round(part.from + (part.y - part.from) * ease(i / part.move)));
  }
  return { path, stops: plan.list };
}

// ---------------------------------------------------------------------------------------------------------------
// Photographing a site.
// ---------------------------------------------------------------------------------------------------------------
let browser;
/** Responses from other hosts, kept for the run (see pass()). */
const fetched = new Map();
async function openBrowser() {
  browser ??= await chromium.launch({
    channel: process.env.CI ? undefined : "chrome",
    // As render-dom-film.mjs: one colour space, greyscale text edges, the page rasterised on the CPU. And composited
    // on the CPU too (--disable-gpu): on the graphics card, text that an entrance was moving came back a level off in
    // a handful of pixels from one photograph to the next, and no frame ever held still. WebGL draws in software.
    // Animations are worked out on the main thread (--disable-threaded-animation): a scroll-driven entrance run by
    // the compositor kept the raster of whichever moment it was first drawn at, so its text sat a pixel higher or
    // lower from one run to the next.
    args: ["--force-color-profile=srgb", "--disable-lcd-text", "--hide-scrollbars", "--enable-unsafe-swiftshader", "--disable-gpu-rasterization", "--disable-gpu", "--disable-threaded-animation"],
  });
  return browser;
}

/**
 * One pass over a site: load, wait for fonts and pictures, then every frame of the path.
 * `keep(index, png)` gets each photographed frame; `only` limits which frames are photographed (the second pass).
 */
async function pass({ address, screen, epoch, stops, cta, path, only, keep, label }) {
  const scale = screen.film.width / screen.width;
  const context = await (await openBrowser()).newContext({
    viewport: { width: screen.width, height: screen.height },
    deviceScaleFactor: scale,
    isMobile: screen.touch,
    hasTouch: screen.touch,
    ...(screen.touch ? { userAgent: devices["Pixel 7"].userAgent } : {}),
    reducedMotion: "no-preference",
    colorScheme: "light",
  });
  try {
    // No visit beforehand to fill the cache: every pass is a first visit in a fresh context, and pictures are waited
    // for as they are asked for.
    // What the site fetches from other hosts (pictures from a CDN) is fetched once and given again, byte for byte,
    // to every later pass: an image service may encode the same picture a shade differently from one request to the
    // next, and the two passes would then differ in nothing but that.
    await context.route(
      (url) => /^https?:$/.test(url.protocol) && !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname),
      async (route) => {
        const request = route.request();
        if (request.method() !== "GET") return route.continue();
        const key = `${request.url()} ${request.headers().accept ?? ""}`;
        let kept = fetched.get(key);
        if (!kept) {
          const response = await route.fetch();
          // The body comes decoded: the headers that describe its encoding on the wire go.
          const { "content-encoding": _encoding, "content-length": _length, ...headers } = response.headers();
          kept = { status: response.status(), headers, body: await response.body() };
          if (kept.status === 200) fetched.set(key, kept);
        }
        return route.fulfill(kept);
      },
    );
    const page = await context.newPage();
    const errors = [];
    page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
    page.on("pageerror", (error) => errors.push(error.message));
    const inflight = new Set();
    page.on("request", (request) => inflight.add(request));
    page.on("requestfinished", (request) => inflight.delete(request));
    page.on("requestfailed", (request) => inflight.delete(request));
    const idle = async () => {
      for (let waited = 0; inflight.size; waited += 20) {
        if (waited > 60_000) throw new Error(`${label}: the network never comes to rest (${[...inflight][0].url()})`);
        await wait(20);
      }
    };
    await page.addInitScript(clock, { epoch, touch: screen.touch });
    const cdp = await context.newCDPSession(page);
    // A window with room to spare, or Chrome's own bars would be taken out of the page (see render-dom-film.mjs).
    const { windowId } = await cdp.send("Browser.getWindowForTarget");
    await cdp.send("Browser.setWindowBounds", { windowId, bounds: { width: screen.width + 200, height: screen.height + 300 } });
    // The screen's size and scale are set again by the session that photographs: a photograph with a clip is taken
    // at that session's own scale, and without this it would put the page back at scale 1 after the first one.
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: screen.width, height: screen.height, deviceScaleFactor: scale, mobile: screen.touch });
    await page.goto(address, { waitUntil: "load", timeout: 120_000 });
    // The clip is counted from the top of the page, not of the screen: it follows the scroll.
    let top = 0;
    const photograph = async () => (await cdp.send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: top, width: screen.width, height: screen.film.height / scale, scale: 1 }, captureBeyondViewport: false, optimizeForSpeed: true })).data;

    /** Until a round finds nothing new: no request on its way, no animation that has just begun. */
    const settle = async () => {
      for (let round = 0; round < 40; round++) {
        await idle();
        const state = await page.evaluate(() => window.__sgSite.settle());
        if (!state.fresh && !inflight.size) return state;
      }
      throw new Error(`${label}: the page never comes to rest`);
    };
    let retaken = 0;
    let warned = false;
    const shoot = async (index) => {
      if ((await page.evaluate(() => window.__sgSite.redraw())) && !warned) {
        warned = true;
        console.log(`    note: the site puts a transition on visibility; emptying the screen before each photograph starts it`);
      }
      let data = await photograph();
      for (let tries = 0; ; tries++) {
        const next = await photograph();
        if (next === data) return data;
        if (tries === 8) {
          const running = await page.evaluate(() => window.__sgSite.running());
          throw new Error(`${label}: frame ${index} never comes to rest: something on the site still runs on the wall clock (${running.length ? running.slice(0, 4).join("; ") : "no animation: a video, a worker, a frame within the page?"})`);
        }
        retaken++;
        data = next;
      }
    };

    // Before frame 0: fonts in, the first screen's pictures decoded, nothing on its way.
    await idle();
    await page.evaluate(() => document.fonts.ready);
    await settle();
    await page.evaluate(() => window.__sgSite.ready());
    await settle();
    const found = await page.evaluate(findStops, { stops, cta });
    const plan = path ? { path } : scrollPath(found);

    const scrolls = [];
    let height = 0;
    for (let index = 0; index < plan.path.length; index++) {
      await page.evaluate(([time, y]) => window.__sgSite.step(time, y), [(index * 1000) / FPS, plan.path[index]]);
      const state = await settle();
      top = state.exact;
      scrolls.push(state.scroll);
      height = state.height;
      if (!only || only.includes(index)) {
        const png = await shoot(index);
        const header = Buffer.from(png.slice(0, 44), "base64");
        const [width, tall] = [header.readUInt32BE(16), header.readUInt32BE(20)];
        if (width !== screen.film.width || tall !== screen.film.height) throw new Error(`${label}: frame ${index} was photographed ${width} × ${tall}, not ${screen.film.width} × ${screen.film.height}`);
        if (index === 0) {
          const seen = await page.evaluate(() => [innerWidth, Math.round(devicePixelRatio * 1000)]);
          if (seen[0] !== screen.width || seen[1] !== Math.round(scale * 1000)) throw new Error(`${label}: photographing changed the screen (${seen[0]} px wide at scale ${seen[1] / 1000})`);
        }
        await keep(index, png);
      }
      if (!only && index % (FPS * 3) === 0) console.log(`    ${String(index).padStart(4)}/${plan.path.length}  scroll ${String(Math.round(state.scroll)).padStart(5)}`);
    }
    return { ...plan, found, scrolls, height, retaken, errors: [...new Set(errors)] };
  } finally {
    await context.close();
  }
}

/** A site photographed into a folder of frames, and proved: a second pass from a fresh load must give the same frames. */
async function capture({ address, screen, folder, stops, cta, path, label }) {
  const record = join(folder, "capture.json");
  if (flag("reuse-frames") && existsSync(record)) {
    console.log(`  ${label}: the frames photographed before (${relative(HERE, folder)})`);
    return JSON.parse(readFileSync(record, "utf8"));
  }
  await yieldToMeasurements();
  const started = Date.now();
  console.log(`  ${label}: ${address}`);
  rmSync(folder, { recursive: true, force: true });
  mkdirSync(folder, { recursive: true });
  // The page's calendar: today at noon, the same in both passes.
  const epoch = new Date().setHours(12, 0, 0, 0);
  const hashes = [];
  const digest = createHash("sha256");
  const first = await pass({
    address, screen, epoch, stops, cta, path, label,
    keep: (index, png) => {
      hashes[index] = sha(png);
      digest.update(hashes[index]);
      writeFileSync(join(folder, `${String(index).padStart(6, "0")}.png`), Buffer.from(png, "base64"));
    },
  });
  const count = first.path.length;
  const stride = Math.floor(count / VERIFY);
  const again = flag("verify-all") ? first.path.map((_, index) => index) : Array.from({ length: VERIFY }, (_, k) => Math.min(count - 1, k * stride + Math.floor(stride / 2)));
  const differing = [];
  const second = await pass({
    address, screen, epoch, stops, cta, path: first.path, only: again, label: `${label}, second pass`,
    keep: (index, png) => {
      if (sha(png) === hashes[index]) return;
      differing.push(index);
      // Kept beside the first pass's frame, so the two can be compared.
      writeFileSync(join(folder, `${String(index).padStart(6, "0")}.second-pass.png`), Buffer.from(png, "base64"));
    },
  });
  const sameScroll = first.scrolls.every((y, index) => y === second.scrolls[index]);
  const deterministic = !differing.length && sameScroll;
  console.log(`    ${count} frames, ${(count / FPS).toFixed(2)} s; stops at ${first.stops ? first.stops.map((stop) => stop.y).join(", ") : "the given path"} of ${first.found.most} px`);
  console.log(`    determinism: ${again.length - differing.length}/${again.length} frames identical in a second pass from a fresh load, scroll position ${sameScroll ? "identical on every frame" : "DIFFERENT"}; ${first.retaken} photographs retaken; ${Math.round((Date.now() - started) / 1000)} s`);
  if (first.errors.length) console.log(`    the site's console: ${first.errors.slice(0, 3).join(" | ")}`);
  if (!deterministic) console.error(`    NOT deterministic: frames ${differing.join(", ")} came back different.`);
  const result = { folder, frames: count, path: first.path, stops: first.stops, scrolls: first.scrolls, height: first.height, deterministic, verified: again, framesDigest: digest.digest("hex"), errors: first.errors };
  writeFileSync(record, JSON.stringify(result));
  return result;
}

// ---------------------------------------------------------------------------------------------------------------
// Serving: the frames (and the example sites) on one port, the lab's dev server for the layout page on the next.
// ---------------------------------------------------------------------------------------------------------------
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".json": "application/json", ".woff2": "font/woff2", ".webp": "image/webp", ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml", ".txt": "text/plain; charset=utf-8" };
/** Address prefixes and the folders they serve. */
const roots = new Map();
function serve() {
  const server = createHttpServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url, "http://x").pathname);
    // Sites without an icon: Chrome asks anyway, and a 404 would count as a console error.
    if (path === "/favicon.ico") return response.writeHead(204).end();
    const [, prefix, ...rest] = path.split("/");
    const root = roots.get(prefix);
    if (!root) return response.writeHead(404).end("Not found");
    let file = normalize(join(root, rest.join("/")));
    if (file !== root && !file.startsWith(root + sep)) return response.writeHead(403).end();
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!existsSync(file)) return response.writeHead(404).end("Not found");
    // Frames are read by the layout page on another port. Sites may be cached, as a visitor's browser caches them.
    response.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "access-control-allow-origin": "*", "cache-control": prefix === "frames" ? "no-store" : "max-age=600" });
    createReadStream(file).pipe(response);
  });
  return new Promise((done, fail) => server.once("error", fail).listen(PORT, "127.0.0.1", () => done(server)));
}

/** A film of the layout page, through render-dom-film.mjs: its encoder, its checks, its contact sheet. */
async function compose(base, name, parameters) {
  await yieldToMeasurements();
  const query = new URLSearchParams(parameters).toString();
  // Not spawnSync: this process serves the frames and the layout page to the renderer while it runs.
  const child = spawn(process.execPath, [join(HERE, "scripts/render-dom-film.mjs"), "--base", base, "--page", `verktyg/sitefilm.html?${query}`, "--name", name, ...(value("still") ? ["--still", value("still")] : flag("sheet-only") ? ["--sheet-only"] : ["--web"])], { stdio: "inherit" });
  const status = await new Promise((done) => child.on("exit", done));
  if (status !== 0) throw new Error(`render-dom-film.mjs failed for ${name}`);
}

/** The invented examples: copied, enhanced with their direction's preset, served. */
function stageExamples(only) {
  const built = join(HERE, "../proof/out/industry-examples");
  const stage = join(HERE, "../proof/out/signature-films");
  const jobs = [];
  for (const example of EXAMPLES.filter((each) => only.split(",").some((part) => each.name.includes(part)))) {
    const source = join(built, example.name);
    if (!existsSync(join(source, "index.html"))) throw new Error(`No built site at ${source}. Build the examples first: proof/concepts/industry-examples.render.ts (see the README).`);
    const plain = join(stage, example.name, "plain");
    const enhanced = join(stage, example.name, "signature");
    rmSync(join(stage, example.name), { recursive: true, force: true });
    cpSync(source, plain, { recursive: true });
    cpSync(source, enhanced, { recursive: true });
    const walk = (folder) => readdirSync(folder).flatMap((entry) => (statSync(join(folder, entry)).isDirectory() ? walk(join(folder, entry)) : [join(folder, entry)]));
    const files = walk(enhanced).filter((file) => file.endsWith(".html")).map((file) => ({ path: relative(enhanced, file).split(sep).join("/"), text: readFileSync(file, "utf8") }));
    const home = files.find((file) => file.path === "index.html").text;
    const direction = /<body[^>]*class="[^"]*\bd-([a-z]+)/.exec(home)?.[1];
    const preset = presetForDirection(direction);
    const result = enhanceSite(files, { map: "services", preset });
    for (const file of [...result.files, ...result.assets]) {
      mkdirSync(dirname(join(enhanced, file.path)), { recursive: true });
      writeFileSync(join(enhanced, file.path), file.text);
    }
    console.log(`${example.name}: direction ${direction}, preset ${preset}, Signature layer ${result.version}`);
    jobs.push({ name: example.name, firm: example.firm, example: true, site: `http://127.0.0.1:${PORT}/sites/${example.name}/signature/`, plain: `http://127.0.0.1:${PORT}/sites/${example.name}/plain/`, stops: example.stops, direction, preset });
  }
  roots.set("sites", stage);
  return jobs;
}

// ---------------------------------------------------------------------------------------------------------------
const jobs = flag("examples")
  ? stageExamples(value("only", ""))
  : [{ name: value("name", "site"), firm: value("firm", ""), example: flag("example"), site: value("site"), plain: value("plain"), stops: { phone: value("stops"), desktop: value("stops") } }];
if (!jobs.length || !jobs[0].site) {
  console.error("Usage: node scripts/render-site-film.mjs --site <address> [--plain <address>] --name <name>   or   --examples [--only <name>]");
  process.exit(1);
}

const server = await serve();
const vite = flag("capture-only") ? null : await createViteServer({ configFile: join(HERE, "vite.config.ts"), logLevel: "warn", server: { host: "127.0.0.1", port: PORT + 1, strictPort: true } });
await vite?.listen();
const BASE = `http://127.0.0.1:${PORT + 1}`;
let failed = false;

for (const job of jobs) {
  console.log(`\n${job.name}${job.firm ? `  (${job.firm}${job.example ? ", an invented firm" : ""})` : ""}`);
  const out = join(FILMS, "sites", job.name);
  const framesRoot = join(out, ".frames");
  mkdirSync(out, { recursive: true });
  roots.set("frames", framesRoot);
  const frames = (name) => `http://127.0.0.1:${PORT}/frames/${name}/`;
  const mark = { fps: FPS, ...(job.example ? { example: 1 } : {}), ...(job.firm ? { firm: job.firm } : {}) };
  const manifest = { name: job.name, firm: job.firm, example: job.example, site: job.site, plain: job.plain ?? null, preset: job.preset ?? null, fps: FPS, captures: {}, films: [] };
  const note = (name, capture) => {
    manifest.captures[name] = { frames: capture.frames, seconds: capture.frames / FPS, stops: capture.stops, pageHeight: capture.height, deterministic: capture.deterministic, framesPhotographedAgain: capture.verified, framesDigest: capture.framesDigest };
    if (!capture.deterministic) {
      writeFileSync(join(out, `${job.name}-site-films.json`), `${JSON.stringify(manifest, null, 2)}\n`);
      throw new Error(`${job.name}, ${name}: the site did not give the same frames twice (see above; the frames that differ are kept in ${relative(HERE, capture.folder)}). No film is made from it.`);
    }
  };

  // The single films: the site with Signature (or the site as it is), on each screen.
  const captures = {};
  for (const device of ["phone", "desktop"]) {
    if (!DEVICES.includes(device) && !(device === "phone" && job.plain)) continue;
    captures[device] = await capture({ address: job.site, screen: SCREENS[device], folder: join(framesRoot, device), stops: parseStops(job.stops[device]), cta: value("cta"), label: `${device}${job.plain ? ", with Signature" : ""}` });
    note(device, captures[device]);
    if (flag("capture-only") || !DEVICES.includes(device)) continue;
    const { width, height } = SCREENS[device].film;
    const film = `${job.name}${job.plain ? "-signature" : ""}-${device}-${width}x${height}${job.example ? `-${LANGS[0]}` : ""}`;
    await compose(BASE, `sites/${job.name}/${film}`, { layout: "single", a: frames(device), frames: captures[device].frames, width, height, lang: LANGS[0], ...mark });
    manifest.films.push(film);
  }

  // Before and after: the same path on the site without Signature, and the two side by side.
  if (job.plain) {
    const plain = await capture({ address: job.plain, screen: SCREENS.phone, folder: join(framesRoot, "phone-plain"), path: captures.phone.path, label: "phone, without Signature" });
    note("phone-plain", plain);
    if (plain.height !== captures.phone.height) console.log(`    note: the page is ${plain.height} px tall without Signature and ${captures.phone.height} px with it`);
    if (!flag("capture-only")) {
      const pair = { a: frames("phone-plain"), b: frames("phone"), frames: plain.frames, ...mark };
      for (const lang of LANGS) {
        const film = `${job.name}-before-after-1920x1080-${lang}`;
        await compose(BASE, `sites/${job.name}/${film}`, { layout: "pair-wide", lang, ...pair });
        manifest.films.push(film);
      }
      for (const lang of SQUARE_LANGS) {
        const film = `${job.name}-before-after-1080x1080-${lang}`;
        await compose(BASE, `sites/${job.name}/${film}`, { layout: "pair-square", lang, ...pair });
        manifest.films.push(film);
      }
    }
  }
  // Every film in the folder, also those of earlier runs from the same frames.
  manifest.films = readdirSync(out).filter((file) => file.endsWith(".mp4") && !file.endsWith("-web.mp4")).map((file) => file.slice(0, -4)).sort();
  writeFileSync(join(out, `${job.name}-site-films.json`), `${JSON.stringify(manifest, null, 2)}\n`);
  if (!flag("keep-frames") && !flag("capture-only") && !flag("sheet-only") && !value("still") && !flag("reuse-frames")) rmSync(framesRoot, { recursive: true, force: true });
}

await browser?.close();
await vite?.close();
server.close();
if (failed) {
  console.error("\nA site did not give the same frames twice: see above.");
  process.exit(1);
}
