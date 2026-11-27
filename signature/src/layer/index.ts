/**
 * The Signature layer: award-level motion on top of a finished site, without
 * changing its design. A site's own elements become Signature modules through
 * a map of selectors (`LayerConfig`); nothing in the site's HTML is written
 * for it. `start(config)` is called by the small `site.js` the enhancer
 * writes next to this file.
 *
 * The rules it keeps:
 *
 * - Without JavaScript nothing here runs and every rule in layer.css is
 *   behind `html.sgl`, which only this script sets: the page is the base site.
 * - With reduced motion it returns at once: the page is the base site, with
 *   whatever the base site itself does for reduced motion.
 * - It never moves layout. Arrivals are opacity, transform and clip-path.
 *   Where it has to touch the DOM (a headline split into words, a wrapper
 *   around the call to action) it measures before and after in the same
 *   task and undoes the change if anything moved by a pixel.
 * - It maps before the first paint (the script tag is render-blocking where
 *   the browser supports `blocking="render"`). Where it still runs after a
 *   paint, it leaves everything in the first view exactly as the base site
 *   showed it and only prepares what is further down.
 * - Content waits hidden only once this script is running and watching it,
 *   and anything that takes keyboard focus shows at once.
 *
 * This entry is the whole first-view cost. Smooth scrolling, the call to
 * action, counting figures and the hover list are separate chunks, fetched
 * only on pages whose map and preset use them, when they are needed.
 */
import "./layer.css";
import { PRESETS, type ModuleName, type Preset, type PresetName } from "./presets";

export { PRESETS };
export type { ModuleName, Preset, PresetName };

export interface LayerRule {
  /** Which module the matched elements become. */
  module: Exclude<ModuleName, "smooth">;
  /** The site's own selector. */
  select: string;
  /** Apply only on pages where this selector matches something (for example `body.d-cafe`). */
  when?: string;
  /** Skip on pages where this selector matches something. */
  unless?: string;
  /**
   * Module options, all selectors: `inner` (reveal: the picture inside the
   * frame, default the first img or video), `end` (cta: sections where the
   * floating link gives way), `row` and `thumb` (list: the rows and each
   * row's own picture).
   */
  options?: Record<string, string>;
}

export interface LayerConfig {
  /** A preset by name, or "auto": the first entry of `presets` whose selector matches the page. */
  preset: PresetName | "auto";
  presets?: { when: string; preset: PresetName }[];
  rules: LayerRule[];
  /** Per preset, tokens that replace the preset's own (one level deep). */
  tokens?: Partial<Record<PresetName, PresetTokens>>;
}

export interface PresetTokens {
  modules?: ModuleName[];
  headline?: Partial<Preset["headline"]>;
  rise?: Partial<Preset["rise"]>;
  reveal?: Partial<Preset["reveal"]>;
  smooth?: number | false;
  count?: number;
}

const OUT = "cubic-bezier(0.16, 1, 0.3, 1)";

function tokens(base: Preset, over: PresetTokens | undefined): Preset {
  if (!over) return base;
  return {
    modules: over.modules ?? base.modules,
    headline: { ...base.headline, ...over.headline },
    rise: { ...base.rise, ...over.rise },
    reveal: { ...base.reveal, ...over.reveal },
    smooth: over.smooth ?? base.smooth,
    count: over.count ?? base.count,
  };
}

/** When the browser has a quiet moment after load. */
function afterLoad(): Promise<void> {
  const idle = () => new Promise<void>((resolve) => ("requestIdleCallback" in window ? requestIdleCallback(() => resolve(), { timeout: 1500 }) : setTimeout(resolve, 300)));
  if (document.readyState === "complete") return idle();
  return new Promise((resolve) => addEventListener("load", () => void idle().then(resolve), { once: true }));
}

/** Runs `mount` once, when the element comes within reach of the screen. */
function whenNear(element: Element, mount: () => void): void {
  const watcher = new IntersectionObserver(
    ([entry]) => {
      if (!entry.isIntersecting) return;
      watcher.disconnect();
      mount();
    },
    { rootMargin: "25% 0px" },
  );
  watcher.observe(element);
}

/**
 * Splits a headline's text into words, each in a box of its own, so words or
 * lines can arrive one after the other. Markup inside the headline stays.
 * The split is only kept if every word stands exactly where it stood: a
 * hyphenated word, or a browser that breaks the lines differently around
 * boxes, gives `null` and the headline arrives as one block instead.
 * Returns how to undo it, and how many steps (lines or words) it has.
 */
function split(element: HTMLElement, byLine: boolean): { undo: () => void; steps: number } | null {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  const jobs: { node: Text; parts: string[] }[] = [];
  const before: number[] = [];
  const height = element.offsetHeight;
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    if (!/\S/.test(node.data)) continue;
    // Ordinary spaces only: a no-break space must stay inside its word.
    const parts = node.data.split(/([ \t\n\r]+)/);
    let at = 0;
    for (const part of parts) {
      if (/[^ \t\n\r]/.test(part)) {
        range.setStart(node, at);
        range.setEnd(node, at + part.length);
        const boxes = range.getClientRects();
        if (boxes.length !== 1) return null;
        before.push(boxes[0].left, boxes[0].top);
      }
      at += part.length;
    }
    jobs.push({ node, parts });
  }
  if (!before.length) return null;

  const words: HTMLElement[] = [];
  const added: Node[][] = [];
  for (const { node, parts } of jobs) {
    const nodes = parts.filter(Boolean).map((part) => {
      if (!/[^ \t\n\r]/.test(part)) return document.createTextNode(part);
      const word = document.createElement("span");
      word.className = "sgl-w";
      const inner = document.createElement("span");
      inner.className = "sgl-i";
      inner.textContent = part;
      word.append(inner);
      words.push(inner);
      return word;
    });
    node.replaceWith(...nodes);
    added.push(nodes);
  }
  const undo = () =>
    jobs.forEach(({ node }, at) => {
      const nodes = added[at];
      if (!nodes[0].parentNode) return;
      nodes[0].parentNode.insertBefore(node, nodes[0]);
      nodes.forEach((piece) => piece.parentNode?.removeChild(piece));
    });

  // The same place as before, word for word (a text box and the word's own box differ by the same few pixels on every line).
  const boxes = words.map((word) => word.getBoundingClientRect());
  const size = Number.parseFloat(getComputedStyle(element).fontSize) || 16;
  const same = element.offsetHeight === height && boxes.every((box, at) => Math.abs(box.left - before[at * 2]) < 1 && Math.abs(box.top - boxes[0].top - (before[at * 2 + 1] - before[1])) < size * 0.3);
  if (!same) {
    undo();
    return null;
  }
  let step = 0;
  words.forEach((word, at) => {
    if (at && (byLine ? boxes[at].top - boxes[at - 1].top > size * 0.5 : true)) step++;
    word.style.setProperty("--i", String(step));
  });
  return { undo, steps: step + 1 };
}

export function start(config: LayerConfig): void {
  const html = document.documentElement;
  const still = matchMedia("(prefers-reduced-motion: reduce)");
  // Reduced motion: nothing of the layer exists. An old browser without the Web Animations API: the same.
  if (still.matches || html.classList.contains("sgl") || !("animate" in html) || !("IntersectionObserver" in window)) return;

  const name = config.preset === "auto" ? (config.presets?.find((entry) => document.querySelector(entry.when))?.preset ?? "calm") : config.preset;
  if (!PRESETS[name]) return;
  const preset = tokens(PRESETS[name], config.tokens?.[name]);
  const { headline, rise, reveal } = preset;
  // Has the browser already shown the page? Then the first view is left as the base site drew it.
  const painted = performance.getEntriesByType("paint").length > 0;

  const set = (key: string, value: string | number) => html.style.setProperty(`--sgl-${key}`, String(value));
  set("h-y", headline.y);
  set("h-r", `${headline.rotate}deg`);
  set("h-o", headline.opacity);
  set("h-t", `${headline.duration}ms`);
  set("h-e", headline.ease);
  set("r-y", rise.y);
  set("r-o", rise.opacity);
  set("r-t", `${rise.duration}ms`);
  set("r-e", rise.ease);
  set("v-c", reveal.clip);
  set("v-z", reveal.clip === "none" ? "none" : "inset(0)");
  set("v-o", reveal.opacity);
  set("v-t", `${reveal.duration}ms`);
  set("v-e", reveal.ease);
  html.dataset.sglPreset = name;
  if (headline.mask) html.dataset.sglMask = "";
  html.classList.add("sgl", "sg-js");

  const allowed = (rule: LayerRule) => preset.modules.includes(rule.module) && (!rule.when || document.querySelector(rule.when)) && !(rule.unless && document.querySelector(rule.unless));
  const inView = (box: DOMRect) => box.top < innerHeight && box.bottom > 0;

  // What each arriving element still has to do when its motion is over.
  const finish = new Map<HTMLElement, () => void>();
  const waiting = new Set<HTMLElement>();
  const timers = new Map<HTMLElement, number>();

  /** The element is simply there: its arrival is over, or was never needed. */
  const done = (element: HTMLElement) => {
    clearTimeout(timers.get(element));
    timers.delete(element);
    waiting.delete(element);
    watcher.unobserve(element);
    element.dataset.sglS = "done";
    element.style.removeProperty("--sgl-d");
    finish.get(element)?.();
    finish.delete(element);
    whenFree?.();
  };
  // The call to action waits here until the element it stands in has arrived.
  let whenFree: (() => void) | null = null;

  /** Starts an element's arrival, `delay` ms from now. */
  const enter = (element: HTMLElement, delay: number) => {
    waiting.delete(element);
    watcher.unobserve(element);
    const kind = element.dataset.sgl;
    let length = kind === "rise" ? rise.duration : reveal.duration;
    if (kind === "headline") {
      const steps = Number(element.dataset.sglSteps ?? 1);
      // However many words, the last one starts within 0.7 s of the first.
      const gap = Math.min(headline.stagger, 700 / steps);
      element.style.setProperty("--sgl-h-s", `${gap}ms`);
      length = headline.duration + gap * (steps - 1);
    }
    if (kind === "reveal") {
      const inner = element.querySelector<HTMLElement>("[data-sgl-inner]");
      // The picture settles inside its frame, on `transform` alone, so it adds to any motion the site gives the picture itself.
      if (inner && reveal.scale !== 1) {
        const settle = inner.animate([{ transform: `scale(${reveal.scale})` }, { transform: "none" }], { duration: reveal.settle, delay, easing: OUT, fill: "backwards" });
        // A frame that does not clip by itself is made to, for as long as the picture is larger than it (see `data-sgl-clip` in layer.css).
        if ("sglOpen" in element.dataset) {
          element.dataset.sglClip = "";
          const free = () => delete element.dataset.sglClip;
          settle.finished.then(free, free);
        }
      }
    }
    element.style.setProperty("--sgl-d", `${delay}ms`);
    element.dataset.sglS = "in";
    // Over when its own animation ends (a headline: its last word's); the timer is only for an animation that never ran.
    const words = element.querySelectorAll(".sgl-i");
    const last = kind === "headline" && words.length ? words[words.length - 1] : element;
    const onEnd = (event: AnimationEvent) => {
      if (event.target !== last) return;
      element.removeEventListener("animationend", onEnd);
      done(element);
    };
    element.addEventListener("animationend", onEnd);
    timers.set(element, window.setTimeout(() => done(element), delay + length + 5000));
  };

  /** Top to bottom, then left to right: the order things arrive in when several come at once. */
  const byPlace = (a: [HTMLElement, DOMRect], b: [HTMLElement, DOMRect]) => (Math.abs(a[1].top - b[1].top) > 24 ? a[1].top - b[1].top : a[1].left - b[1].left);
  const arrive = (items: [HTMLElement, DOMRect][], lead: number) => {
    // Siblings follow each other by the preset's step (rows of a list, a label and its headline), never more than five
    // steps in. What is not a sibling does not wait: after a jump to an anchor a whole screen arrives at once, and a
    // section at its foot must not stand empty until everything above it has had its turn. Pictures open with the
    // first words, never after them: an empty frame beside finished text reads as slow.
    const turns = new Map<Element | null, number>();
    for (const [element] of items.sort(byPlace)) {
      const turn = element.dataset.sgl === "reveal" ? 0 : (turns.get(element.parentElement) ?? 0);
      if (element.dataset.sgl !== "reveal") turns.set(element.parentElement, turn + 1);
      enter(element, lead + rise.stagger * Math.min(5, turn));
    }
  };

  const watcher = new IntersectionObserver(
    (entries) =>
      arrive(
        entries.filter((entry) => entry.isIntersecting && waiting.has(entry.target as HTMLElement)).map((entry) => [entry.target as HTMLElement, entry.boundingClientRect]),
        0,
      ),
    { rootMargin: "0px 0px -8% 0px" },
  );

  const first: [HTMLElement, DOMRect][] = [];
  let cta: HTMLAnchorElement | null = null;
  let ends = "";

  for (const rule of config.rules.filter(allowed)) {
    const options = rule.options ?? {};
    const elements = [...document.querySelectorAll<HTMLElement>(rule.select)];
    for (const element of elements) {
      const box = element.getBoundingClientRect();
      // Nothing that is not laid out (a closed menu, a hidden field), and nothing the base site has already shown.
      if (!box.width && !box.height) continue;
      const seen = inView(box);
      if (painted && seen && rule.module !== "cta") continue;

      if (rule.module === "headline" || rule.module === "rise" || rule.module === "reveal") {
        // One arrival per element: the first rule wins, and nothing arrives inside something that arrives.
        if (element.closest("[data-sgl]") || element.querySelector("[data-sgl]")) continue;
        let kind: string = rule.module;
        if (kind === "headline") {
          const parts = split(element, headline.by === "line");
          if (parts) {
            element.dataset.sglSteps = String(parts.steps);
            finish.set(element, parts.undo);
          } else kind = "rise";
        }
        element.dataset.sgl = kind;
        if (kind === "reveal") {
          // A frame the site clips itself keeps its own shape: it fades in instead of being wiped.
          const style = getComputedStyle(element);
          if (style.clipPath !== "none") element.dataset.sglKeep = "";
          // The picture settles from larger than its frame. A frame that lets things show outside it (no `overflow`)
          // would let that grow the page sideways on a phone: it is clipped while the picture settles, which a wiping
          // preset does anyway, or, where the frame only fades (calm, or a shape of the site's own), the picture stays still.
          const open = style.overflowX === "visible" || style.overflowY === "visible";
          const settles = !open || (reveal.clip !== "none" && !("sglKeep" in element.dataset));
          let inner = settles && !element.matches("img, video") ? element.querySelector<HTMLElement>(options.inner ?? "img, video") : null;
          // An open frame that holds more than the picture (a caption under it): the picture would grow over the rest, so it stays still.
          if (inner && open && Math.abs(inner.getBoundingClientRect().height - box.height) > 1) inner = null;
          if (inner) inner.dataset.sglInner = "";
          if (inner && open) element.dataset.sglOpen = "";
        }
        if (seen) first.push([element, box]);
        else {
          element.dataset.sglS = "wait";
          waiting.add(element);
          watcher.observe(element);
        }
      } else if (rule.module === "stack") {
        const cards = [...element.children] as HTMLElement[];
        element.dataset.sg = "stack";
        element.style.setProperty("--n", String(cards.length));
        cards.forEach((card, at) => card.style.setProperty("--i", String(at)));
      } else if (rule.module === "count") {
        whenNear(element, () => void import("./modules/count").then(({ mountCount }) => mountCount(element, preset.count)));
      } else if (rule.module === "list") {
        // The picture under the pointer needs a pointer that hovers; everyone else keeps each row's own picture.
        if (!matchMedia("(hover: hover) and (pointer: fine)").matches) continue;
        const rows = element.querySelectorAll<HTMLElement>(options.row ?? "li");
        rows.forEach((row) => {
          row.dataset.sgRow = "";
          const thumb = row.querySelector<HTMLElement>(options.thumb ?? "img");
          if (thumb) thumb.dataset.sgThumb = "";
        });
        element.dataset.sg = "reveal-list";
        whenNear(element, () => void import("./modules/list").then(({ mountRevealList }) => mountRevealList(element)));
      } else if (rule.module === "cta" && !cta && element instanceof HTMLAnchorElement) {
        cta = element;
        ends = options.end ?? "";
      }
    }
  }
  // The first view arrives together, from the top; the page's headline leads.
  arrive(first, 60);

  // Whatever takes keyboard focus is shown at once, never left waiting for the scroll.
  const onFocus = (event: FocusEvent) => {
    const holder = (event.target as Element | null)?.closest?.<HTMLElement>('[data-sgl-s="wait"]');
    if (holder) done(holder);
  };
  document.addEventListener("focusin", onFocus);

  // The call to action: the page's own link, in a wrapper that changes nothing, or not at all.
  if (cta) {
    const link: HTMLAnchorElement = cta;
    const look = () => {
      const style = getComputedStyle(link);
      const box = link.getBoundingClientRect();
      return [box.left, box.top, box.width, box.height, style.color, style.backgroundColor, style.font, style.padding, style.borderRadius, style.boxShadow].join("|");
    };
    const before = look();
    const wrapper = document.createElement("span");
    wrapper.className = "sgl-cta";
    link.before(wrapper);
    wrapper.append(link);
    if (look() !== before) {
      wrapper.before(link);
      wrapper.remove();
    } else {
      wrapper.dataset.sg = "cta";
      // The engine keeps the place's height while the link floats. Its place there is a paragraph; here it may stand
      // beside other things, so the place keeps its width as well, measured whenever the link stands in it.
      const hold = () => {
        if (wrapper.classList.contains("is-floating")) return;
        wrapper.style.minWidth = "";
        wrapper.style.minWidth = `${wrapper.getBoundingClientRect().width}px`;
      };
      hold();
      if ("ResizeObserver" in window) new ResizeObserver(hold).observe(link);
      if (ends) document.querySelectorAll<HTMLElement>(ends).forEach((end) => (end.dataset.sgCtaEnd = ""));
      // It takes over only once nothing around the link is arriving or waiting: an element that is being moved is what
      // a floating (fixed) link inside it would be placed against, and the link would jump when the arrival ended.
      void afterLoad()
        .then(() => import("../modules/cta"))
        .then(({ mountCta }) => {
          const mount = () => {
            const holder = link.closest<HTMLElement>("[data-sgl]");
            if ((holder && holder.dataset.sglS !== "done") || !html.classList.contains("sgl")) return;
            whenFree = null;
            mountCta(wrapper);
          };
          whenFree = mount;
          mount();
        });
    }
  }

  // Smooth scrolling starts with the first sign of scrolling, never before.
  let stopSmooth: (() => void) | null = null;
  const intents = ["wheel", "touchstart", "keydown", "pointerdown"] as const;
  const onIntent = () => {
    intents.forEach((type) => removeEventListener(type, onIntent));
    const seconds = preset.smooth;
    if (seconds && html.classList.contains("sgl")) void import("./modules/smooth").then(({ startSmooth }) => (stopSmooth = html.classList.contains("sgl") ? startSmooth(seconds) : null));
  };
  if (preset.smooth && preset.modules.includes("smooth")) intents.forEach((type) => addEventListener(type, onIntent, { passive: true, once: true }));

  // The visitor asks for less motion while the page is open: everything ends where it belongs, and the layer steps back.
  still.addEventListener("change", () => {
    if (!still.matches) return;
    [...waiting, ...timers.keys()].forEach(done);
    document.removeEventListener("focusin", onFocus);
    stopSmooth?.();
    html.classList.remove("sgl");
  });
}
