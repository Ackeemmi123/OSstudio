/**
 * Image sequence (`data-sg="sequence"`): a movement as numbered pictures,
 * drawn on a canvas one at a time as the page scrolls, while the section
 * holds still (the product reveal). The pictures are made in code
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
 * asks for it. Only the frames near the one shown are kept decoded, more of
 * them ahead in the direction of reading: a 1600 × 900 frame is 5.8 MB
 * decoded, so all sixty would be 350 MB. From half a screen away they are
 * decoded, further off let go. Drawing: only when the scroll moves to another
 * frame, or when a frame it waits for arrives; meanwhile the nearest decoded
 * frame on the way to it holds, and a frame that never comes is stood in for
 * by its neighbours.
 *
 * Markup: <div data-sg="sequence" data-frames="60">
 *           <div data-sg-stage>
 *             <picture>
 *               <source media="(max-width: 699px) and (prefers-reduced-motion: reduce), (max-width: 699px) and (scripting: none)" srcset="…/telefon/59.webp" width="720" height="1560" data-sg-still="(max-width: 699px)">
 *               <source media="(prefers-reduced-motion: reduce), (scripting: none)" srcset="…/bred/59.webp" width="1600" height="900" data-sg-still>
 *               <source media="(max-width: 699px)" srcset="…/telefon/00.webp" width="720" height="1560" data-sg-frames="…/telefon/{n}.webp">
 *               <img src="…/bred/00.webp" width="1600" height="900" data-sg-frames="…/bred/{n}.webp" alt="…">
 *             </picture>
 *             … anything shown over it: `--sg-p` (0–1) on the root and the text of `[data-sg-at]` follow the frame shown.
 *           </div></div>
 * `{n}` is the frame's index from 0, two digits. A `data-sg-still` source is
 * the last frame; its value is the media it keeps with Save-Data.
 */
import type { FromLoader, ToLoader } from "./sequence-loader";

/** How much of the held distance the frames take; over the rest the last frame holds before the section moves on. */
const RUN = 0.85;
/** Frames being decoded at once. */
const DECODING = 3;
/** Decoded frames kept, in bytes (eight wide frames of 1600 × 900, ten tall ones of 720 × 1560). */
const KEEP = 48e6;

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
  const count = Number(root.dataset.frames);
  const sets = [...root.querySelectorAll<Framed>("[data-sg-frames]")];
  if (!stage || !picture || !sets.length || !(count > 1) || root.dataset.sgState) return;
  const at = root.querySelector("[data-sg-at]");
  const total = at?.textContent ?? "";
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;opacity:0";
  picture.after(canvas);
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) return;

  // The frames this screen uses: the first set whose media matches, as the <picture> chose its first frame.
  const queries = sets.map((set) => (set instanceof HTMLSourceElement && set.media ? matchMedia(set.media) : null));
  const choose = () => sets[queries.findIndex((query) => !query || query.matches)] ?? sets[sets.length - 1];

  let set: Framed | null = null;
  let generation = 0;
  const loaded = new Set<number>();
  const bitmaps = new Map<number, ImageBitmap>();
  const decoding = new Set<number>();
  let running = false;
  let seen = false;
  let wanted = 0;
  let ahead = 1;
  let shown = -1;
  let tick = 0;
  let stageHeight = 0;
  let frameWidth = 1;
  let frameHeight = 1;

  const keep = () => Math.max(4, Math.min(count, Math.floor(KEEP / (frameWidth * frameHeight * 4))));

  const release = () => {
    for (const bitmap of bitmaps.values()) bitmap.close();
    bitmaps.clear();
    shown = -1;
  };

  /** The frame the scroll has reached: 0 until the stage is held, the last for the final stretch. */
  const measure = () => {
    const box = root.getBoundingClientRect();
    const run = (box.height - stageHeight) * RUN;
    return run > 0 ? Math.round(Math.min(1, Math.max(0, -box.top / run)) * (count - 1)) : 0;
  };

  /** Fits the canvas over the stage the way the picture covers it, never with more pixels than a frame has. */
  const fit = () => {
    const width = stage.clientWidth;
    stageHeight = stage.clientHeight;
    if (!width || !stageHeight) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 1 / Math.max(width / frameWidth, stageHeight / frameHeight));
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(stageHeight * ratio);
    // Resizing clears the canvas: draw again at once, before the screen shows it empty.
    shown = -1;
    if (running) update();
  };

  const paint = (bitmap: ImageBitmap) => {
    const scale = Math.max(canvas.width / bitmap.width, canvas.height / bitmap.height);
    const width = bitmap.width * scale;
    const height = bitmap.height * scale;
    context.drawImage(bitmap, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
  };

  /** The decoded frame nearest the one wanted, between `from` and `to`. */
  const nearest = (from: number, to: number) => {
    let best = -1;
    for (const index of bitmaps.keys()) if (index >= from && index <= to && (best < 0 || Math.abs(index - wanted) < Math.abs(best - wanted))) best = index;
    return best;
  };
  /**
   * Draws the decoded frame nearest the one wanted, if it is not already the one shown. It looks first between the
   * frame shown and the one wanted, so the movement never runs past where the scroll is and comes back.
   */
  const draw = () => {
    let best = shown < 0 ? -1 : nearest(Math.min(shown, wanted), Math.max(shown, wanted));
    if (best < 0) best = nearest(0, count - 1);
    if (best < 0 || best === shown) return;
    paint(bitmaps.get(best)!);
    shown = best;
    canvas.dataset.frame = String(best);
    root.style.setProperty("--sg-p", (best / (count - 1)).toFixed(4));
    if (at) at.textContent = String(best + 1).padStart(2, "0");
    if (root.dataset.sgState !== "live") {
      canvas.style.opacity = "1";
      root.dataset.sgState = "live";
    }
  };

  let send: Promise<(message: ToLoader) => void> | null = null;
  const tell = (message: ToLoader) => void send?.then((post) => post(message));

  /** How far a frame is from the one wanted, for keeping it decoded: those behind count double. */
  const cost = (index: number) => Math.abs(index - wanted) * (Math.sign(index - wanted) === -ahead ? 2 : 1);
  /** Keeps decoded the frames nearest the one wanted, asks for the next of them, and lets the others go. */
  const decode = () => {
    if (!running || !seen) return;
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
    if (message.type === "loaded") {
      loaded.add(index);
      root.dataset.sgLoaded = String(loaded.size);
    } else if (message.type === "frame") {
      decoding.delete(index);
      if (!running || !seen) message.bitmap.close();
      else {
        bitmaps.get(index)?.close();
        bitmaps.set(index, message.bitmap);
        schedule();
      }
    } else {
      decoding.delete(index);
      loaded.delete(index);
    }
    decode();
  };

  const update = () => {
    tick = 0;
    if (!running) return;
    const next = measure();
    if (next !== wanted) {
      ahead = next > wanted ? 1 : -1;
      wanted = next;
      decode();
    }
    draw();
  };
  const schedule = () => {
    if (running && !tick) tick = requestAnimationFrame(update);
  };

  /** Starts on the frames this screen needs; called again when the screen crosses to another set. */
  const begin = () => {
    const next = choose();
    if (next === set) return;
    set = next;
    generation++;
    release();
    decoding.clear();
    loaded.clear();
    frameWidth = Number(set.getAttribute("width")) || 1;
    frameHeight = Number(set.getAttribute("height")) || 1;
    canvas.style.opacity = "0";
    root.dataset.sgState = "ready";
    fit();
    // Absolute addresses: a worker would read relative ones against its own script.
    const pattern = set.dataset.sgFrames!;
    const urls = Array.from({ length: count }, (_, index) => new URL(pattern.replace("{n}", String(index).padStart(2, "0")), document.baseURI).href);
    tell({ type: "load", generation, urls });
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
    if (at) at.textContent = "01";
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
    set = null;
    tell({ type: "stop" });
    removeEventListener("scroll", onScroll);
    watcher.disconnect();
    resizer.disconnect();
    release();
    canvas.style.opacity = "0";
    root.style.removeProperty("--sg-p");
    if (at) at.textContent = total;
    root.dataset.sgState = "still";
  };

  for (const query of queries) query?.addEventListener("change", () => running && begin());
  reduced.addEventListener("change", () => (reduced.matches ? stop() : start()));
  if (reduced.matches) root.dataset.sgState = "still";
  else start();
}
