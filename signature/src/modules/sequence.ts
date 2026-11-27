/**
 * Image sequence (`data-sg="sequence"`): a movement as numbered pictures,
 * drawn on a canvas as the page scrolls, while the section holds still (the
 * product reveal). The pictures are made in code
 * (scripts/render-sequence.mjs) or are a client's own renders, with written
 * permission.
 *
 * The page works without it. A sized <picture> is the design, and its own
 * media queries choose the picture, so nothing waits for this:
 * - with motion, CSS holds the stage on screen over a tall track, and the
 *   picture is the sequence's first frame; this draws the frame the scroll has
 *   reached on a canvas over it, starting with that same frame;
 * - with reduced motion, and without JavaScript (`scripting: none`), the
 *   picture is the last frame, and nothing is held or fetched;
 * - with Save-Data the boot shows the last frame and never loads this.
 *
 * Loading and decoding happen in a worker (sequence-loader.ts): every fourth
 * frame first (and the last), so the whole movement can be scrubbed coarsely
 * at once, then the rest, kept compressed; a frame is decoded only when this
 * asks for it. Only the frames near the one shown are
 * kept decoded, and those are the ones just ahead of the scroll, the faster
 * it moves the further ahead, so the two frames a position needs are there
 * when the scroll arrives: a 1920 × 1080 frame is 8.3 MB decoded, so all of
 * them would be 1 GB. From half a screen away they are decoded, further off
 * let go.
 *
 * Drawing: the scroll seldom stops on a frame, so the two frames either side
 * of where it is are drawn over each other, the later one as strong as the
 * scroll is far into the step between them. A slow scroll then moves on every
 * screen frame, not once per picture. While a frame is on its way, the
 * nearest decoded frame on the way to it holds, whole, and a frame that never
 * comes is stood in for by its neighbours. It draws only when the scroll
 * moves or a frame it waits for arrives.
 *
 * Markup: <div data-sg="sequence" data-frames="121">
 *           <div data-sg-stage>
 *             <picture>
 *               … the last frame, for `(prefers-reduced-motion: reduce), (scripting: none)`, per shape and format, each with `data-sg-still`
 *               <source media="(max-width: 699px)" srcset="…/telefon/00.webp" width="720" height="1560" data-sg-frames="…/telefon/{n}.webp" data-frames="61">
 *               <source type="image/avif" srcset="…/bred/000.avif" width="1920" height="1080" data-sg-frames="…/bred/{n}.avif">
 *               <img src="…/bred/00.webp" width="1600" height="900" data-sg-frames="…/bred/{n}.webp" data-frames="61" alt="…">
 *             </picture>
 *             … anything shown over it: `--sg-p` (0–1) on the root and the text of `[data-sg-at]` follow the frame shown.
 *           </div></div>
 * `{n}` is the frame's index from 0, with as many digits as the last one has.
 * A `data-sg-still` source is the last frame; its value is the media it keeps
 * with Save-Data.
 *
 * Formats: the `[data-sg-frames]` that share a media query are one movement
 * in several formats, the best first, as in any <picture>. The loader takes
 * the first whose first frame this browser decodes (AVIF: Chrome 85, Firefox
 * 93, Safari 16.4), so the canvas and the poster under it agree. A set with
 * fewer pictures says so (`data-frames`); it must start and end on the same
 * two pictures. `[data-sg-at]` counts in the root's `data-frames` either way.
 *
 * Steps (words over the picture, say): `data-sg-steps="0.25 0.7"` on the root
 * names where the movement passes from one to the next (as parts of it). The
 * root then carries the step it is in, `data-sg-step` and `--sg-step` (0, 1,
 * 2 …), which changes only once the frame shown is a little past a threshold
 * either way, so a visitor who stops near one never sees it flicker. The site
 * shows each step whole and moves between them in time, not with the scroll.
 * Without motion neither is set: the last step is the one to show.
 */
import type { FromLoader, ToLoader } from "./sequence-loader";

/** How much of the held distance the frames take; over the rest the last frame holds before the section moves on. */
const RUN = 0.85;
/** Frames being decoded at once. */
const DECODING = 2;
/**
 * Decoded frames kept: at most ten, and at most this many bytes. Seven wide frames of 1920 × 1080 (58 MB), ten of
 * 1600 × 900 (58 MB), ten tall ones of 720 × 1560 (45 MB).
 */
const KEEP = 64e6;
/** How many screen frames ahead of the scroll the decoding aims, and at most how many pictures. */
const LEAD = 2;
const FURTHEST = 3;
/** How far apart two frames may be and still be mixed, in pictures. */
const REACH = 3;
/** How far past a step's threshold the frame shown must be, either way, before the step changes (a part of the movement). */
const HYSTERESIS = 0.03;

type Framed = HTMLSourceElement | HTMLImageElement;

/** The loader in its worker, or on this thread where a worker cannot start; `receive` gets what it sends back. */
function connect(receive: (message: FromLoader) => void): Promise<(message: ToLoader) => void> {
  return new Promise((resolve) => {
    let settled = false;
    const here = () => {
      if (settled) return;
      settled = true;
      void import("./sequence-loader").then(({ loader }) => resolve(loader(receive)));
    };
    let worker: Worker;
    try {
      worker = new Worker(new URL("./sequence-worker.ts", import.meta.url), { type: "module" });
    } catch {
      return here();
    }
    worker.onmessage = ({ data }: MessageEvent<FromLoader | { type: "ready" }>) => {
      if (data.type !== "ready") return receive(data);
      settled = true;
      resolve((message) => worker.postMessage(message));
    };
    worker.onerror = () => {
      if (settled) return;
      worker.terminate();
      here();
    };
  });
}

export function mountSequence(root: HTMLElement): void {
  const stage = root.querySelector<HTMLElement>("[data-sg-stage]");
  const picture = root.querySelector("picture");
  const nominal = Number(root.dataset.frames);
  const sets = [...root.querySelectorAll<Framed>("[data-sg-frames]")];
  if (!stage || !picture || !sets.length || !(nominal > 1) || root.dataset.sgState) return;
  const at = root.querySelector("[data-sg-at]");
  const thresholds = (root.dataset.sgSteps ?? "").split(/\s+/).filter(Boolean).map(Number);
  const total = at?.textContent ?? "";
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;opacity:0";
  picture.after(canvas);
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) return;

  // The frames this screen uses: the sets under the first media query that matches, as the <picture> chose its first frame.
  const media = (set: Framed) => (set instanceof HTMLSourceElement ? set.media : "");
  const queries = sets.map((set) => (media(set) ? matchMedia(media(set)) : null));
  const choose = () => {
    const first = sets[queries.findIndex((query) => !query || query.matches)] ?? sets[sets.length - 1];
    return sets.filter((set) => media(set) === media(first));
  };
  const frames = (set: Framed) => Number(set.dataset.frames) || nominal;

  let offered: Framed[] = [];
  let count = nominal;
  let generation = 0;
  const loaded = new Set<number>();
  const bitmaps = new Map<number, ImageBitmap>();
  const decoding = new Set<number>();
  let running = false;
  let seen = false;
  /** Where the scroll is in the movement, in frames, and where the canvas is: both may lie between two frames. */
  let wanted = 0;
  let shown = -1;
  /** Where the decoding aims, in frames from the scroll: ahead of it, by as much as it moved in the last screen frames. */
  let lead = 0;
  let tick = 0;
  let stageHeight = 0;
  let frameWidth = 0;
  let frameHeight = 1;

  const keep = () => Math.max(4, Math.min(10, count, Math.floor(KEEP / (frameWidth * frameHeight * 4))));

  const release = () => {
    for (const bitmap of bitmaps.values()) bitmap.close();
    bitmaps.clear();
    shown = -1;
  };

  /** Where the scroll has reached, in frames: 0 until the stage is held, the last for the final stretch. */
  const measure = () => {
    const box = root.getBoundingClientRect();
    const run = (box.height - stageHeight) * RUN;
    return run > 0 ? Math.min(1, Math.max(0, -box.top / run)) * (count - 1) : 0;
  };

  /** Fits the canvas over the stage the way the picture covers it, never with more pixels than a frame has. */
  const fit = () => {
    const width = stage.clientWidth;
    stageHeight = stage.clientHeight;
    if (!width || !stageHeight || !frameWidth) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 1 / Math.max(width / frameWidth, stageHeight / frameHeight));
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(stageHeight * ratio);
    // Resizing clears the canvas: draw again at once, before the screen shows it empty.
    shown = -1;
    if (running) update();
  };

  const paint = (bitmap: ImageBitmap, strength: number) => {
    const scale = Math.max(canvas.width / bitmap.width, canvas.height / bitmap.height);
    const width = bitmap.width * scale;
    const height = bitmap.height * scale;
    context.globalAlpha = strength;
    context.drawImage(bitmap, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
  };

  /** The step the movement is in, from the frame shown: it moves on (or back) only once that is past the threshold by the margin. */
  let step = -1;
  const setStep = (next: number | null) => {
    step = next ?? -1;
    if (next === null) {
      delete root.dataset.sgStep;
      root.style.removeProperty("--sg-step");
    } else {
      root.dataset.sgStep = String(next);
      root.style.setProperty("--sg-step", String(next));
    }
  };
  const follow = (progress: number) => {
    let next = Math.max(0, step);
    while (next < thresholds.length && progress >= thresholds[next] + HYSTERESIS) next++;
    while (next > 0 && progress <= thresholds[next - 1] - HYSTERESIS) next--;
    if (thresholds.length && next !== step) setStep(next);
  };

  /** The decoded frame nearest where the scroll is, between `from` and `to`. */
  const nearest = (from: number, to: number) => {
    let best = -1;
    for (const index of bitmaps.keys()) if (index >= from && index <= to && (best < 0 || Math.abs(index - wanted) < Math.abs(best - wanted))) best = index;
    return best;
  };
  /**
   * Draws where the scroll is: the decoded frame before it, and over that the decoded frame after, as strong as the
   * scroll is far into the step between them. Usually they are neighbours. In a quick scroll one may be missing, and
   * the two either side of it are mixed instead, up to REACH apart, so the picture still moves with the scroll and
   * never waits and catches up. Further apart than that (the first frames to load are four apart) no mix would
   * read as one picture: the decoded frame nearest is drawn whole, and only one between what is shown and what is
   * wanted, so the movement never runs past where the scroll is, nor back from it.
   */
  const draw = () => {
    let next = wanted;
    let low = nearest(0, next);
    let high = nearest(next, count);
    if (low < 0 || high < 0 || high - low > REACH) next = low = high = shown < 0 ? nearest(0, count) : nearest(Math.min(shown, next), Math.max(shown, next));
    if (next < 0 || next === shown) return;
    paint(bitmaps.get(low)!, 1);
    if (high > low) paint(bitmaps.get(high)!, (next - low) / (high - low));
    shown = next;
    const progress = next / (count - 1);
    canvas.dataset.frame = String(Math.round(next * 100) / 100);
    root.style.setProperty("--sg-p", progress.toFixed(4));
    if (at) at.textContent = String(Math.round(progress * (nominal - 1)) + 1).padStart(total.length, "0");
    follow(progress);
    if (root.dataset.sgState !== "live") {
      canvas.style.opacity = "1";
      root.dataset.sgState = "live";
    }
  };

  let send: Promise<(message: ToLoader) => void> | null = null;
  const tell = (message: ToLoader) => void send?.then((post) => post(message));

  /** How far a frame is from where the scroll will be, for keeping it decoded; the two the scroll is between come first. */
  const cost = (index: number) => (Math.abs(index - wanted) < 1 ? 0 : Math.abs(index - wanted - lead));
  /** Keeps decoded the frames nearest the one wanted, asks for the next of them, and lets the others go. */
  const decode = () => {
    if (!running || !seen || !frameWidth) return;
    const near = [...loaded].sort((a, b) => cost(a) - cost(b)).slice(0, keep());
    for (const [index, bitmap] of bitmaps) {
      if (near.includes(index)) continue;
      bitmap.close();
      bitmaps.delete(index);
    }
    for (const index of near) {
      if (decoding.size >= DECODING) break;
      if (bitmaps.has(index) || decoding.has(index)) continue;
      decoding.add(index);
      tell({ type: "decode", generation, index });
    }
  };

  const receive = (message: FromLoader) => {
    if (message.generation !== generation) {
      if (message.type === "frame") message.bitmap.close();
      return;
    }
    const { index } = message;
    if (message.type === "set") {
      // The format is settled: its frames' size and number.
      const set = offered[index];
      count = frames(set);
      frameWidth = Number(set.getAttribute("width")) || 1;
      frameHeight = Number(set.getAttribute("height")) || 1;
      fit();
      wanted = measure();
    } else if (message.type === "loaded") {
      loaded.add(index);
      root.dataset.sgLoaded = String(loaded.size);
    } else if (message.type === "frame") {
      decoding.delete(index);
      if (!running || !seen) message.bitmap.close();
      else {
        bitmaps.get(index)?.close();
        bitmaps.set(index, message.bitmap);
        // Drawn at once, before the frames far from the scroll are let go below: in a fast scroll a frame arrives
        // when the scroll has already left it behind, and it is still the nearest picture there is.
        draw();
      }
    } else {
      decoding.delete(index);
      loaded.delete(index);
    }
    decode();
  };

  const update = () => {
    tick = 0;
    if (!running || !frameWidth) return;
    const next = measure();
    if (next !== wanted) {
      lead = Math.max(-FURTHEST, Math.min(FURTHEST, (next - wanted) * LEAD));
      wanted = next;
      decode();
    }
    draw();
  };
  const schedule = () => {
    if (running && !tick) tick = requestAnimationFrame(update);
  };

  /** Starts on the frames this screen needs; called again when the screen crosses to another shape. */
  const begin = () => {
    const next = choose();
    if (next[0] === offered[0]) return;
    offered = next;
    generation++;
    release();
    decoding.clear();
    loaded.clear();
    frameWidth = 0;
    canvas.style.opacity = "0";
    root.dataset.sgState = "ready";
    // Absolute addresses: a worker would read relative ones against its own script.
    tell({
      type: "load",
      generation,
      sets: offered.map((set) => {
        const digits = String(frames(set) - 1).length;
        return Array.from({ length: frames(set) }, (_, index) => new URL(set.dataset.sgFrames!.replace("{n}", String(index).padStart(digits, "0")), document.baseURI).href);
      }),
    });
  };

  const onScroll = () => schedule();
  // Decoded from half a screen away, so the first frame is ready before the stage shows; let go beyond that.
  const watcher = new IntersectionObserver(
    (entries) => {
      seen = entries[entries.length - 1].isIntersecting;
      if (seen) {
        wanted = measure();
        decode();
        schedule();
      } else release();
    },
    { rootMargin: "50% 0px" },
  );
  const resizer = new ResizeObserver(fit);

  const start = () => {
    if (running) return;
    running = true;
    send ??= connect(receive);
    root.style.setProperty("--sg-p", "0");
    if (at) at.textContent = "1".padStart(total.length, "0");
    if (thresholds.length) setStep(0);
    begin();
    addEventListener("scroll", onScroll, { passive: true });
    watcher.observe(root);
    resizer.observe(stage);
  };
  const stop = () => {
    running = false;
    seen = false;
    // Whatever is still on its way is dropped; a later start fetches again (from the browser's cache).
    generation++;
    offered = [];
    tell({ type: "stop" });
    removeEventListener("scroll", onScroll);
    watcher.disconnect();
    resizer.disconnect();
    release();
    canvas.style.opacity = "0";
    root.style.removeProperty("--sg-p");
    if (at) at.textContent = total;
    setStep(null);
    root.dataset.sgState = "still";
  };

  for (const query of queries) query?.addEventListener("change", () => running && begin());
  reduced.addEventListener("change", () => (reduced.matches ? stop() : start()));
  if (reduced.matches) root.dataset.sgState = "still";
  else start();
}
