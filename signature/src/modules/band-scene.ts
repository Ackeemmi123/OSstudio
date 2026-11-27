/**
 * The 3D band of the object module (the drawing itself is in band-core.ts).
 *
 * Where the browser allows it the band draws in a worker, on an
 * OffscreenCanvas: creating the WebGL context, compiling the two programs and
 * every frame happen there, and scrolling never waits for them. Elsewhere,
 * and for stills that must be read back, it draws on the main thread with the
 * same code. The scroll, the pointer, the canvas's size and whether it is on
 * screen are sent in; what the band measures comes back as `data-quality`,
 * `data-frame-p75` and `data-frame-budget` on the canvas.
 */
import { attach } from "../engine/offscreen";
import type { BandCore, BandReport, BandSpec } from "./band-core";

export interface ObjectScene {
  /** 0 = scattered, 1 = whole. The scene follows it on a spring. */
  setProgress: (progress: number) => void;
  /** Where the pointer is over the canvas, -1…1 on each axis, or null when it is away. */
  setPointer: (x: number | null, y: number) => void;
  /** Draws one frame at exactly this progress, for stills (only with `preserve`, on the main thread). */
  still: (progress: number, time?: number) => void;
  dispose: () => void;
}

export interface ObjectSceneOptions {
  allowSoftware: boolean;
  lowPower: boolean;
  /** Ink (background), tint, metal, glow, as CSS hex. */
  colours: string[];
  /** Keep the drawing buffer for screenshots (stills only); draws on the main thread, so the canvas can be read back. */
  preserve?: boolean;
  /** Centre the band in the frame, for stills, instead of placing it beside text on wide screens. */
  centred?: boolean;
  /** A fixed quality level (0–2) instead of measuring: for stills and demos. */
  quality?: 0 | 1 | 2;
  /** The longest frame (75th percentile, seconds) before quality steps down; set from the screen's own cadence. */
  frameBudget?: number;
  /** Stills only: a period in seconds over which `still()` loops exactly (one turn, flow and sway), for a film. */
  loop?: number;
  /** Stills only: how much closer the camera is than usual (1 = as on the page). */
  zoom?: number;
  /** Stills only: how much further the band leans back, in radians (0 = as on the page; more shows it nearer edge-on). */
  tilt?: number;
  shown: () => void;
  lost: () => void;
}

/** Resolves to the scene once it has a WebGL context on a good enough graphics card, or to null without one. */
export async function createObjectScene(canvas: HTMLCanvasElement, options: ObjectSceneOptions): Promise<ObjectScene | null> {
  const spec: BandSpec = {
    allowSoftware: options.allowSoftware,
    lowPower: options.lowPower,
    colours: options.colours,
    preserve: options.preserve === true,
    centred: options.centred === true,
    quality: options.quality,
    frameBudget: options.frameBudget ?? 1 / 42,
    loop: options.loop,
    zoom: options.zoom,
    tilt: options.tilt,
  };
  let teardown = () => {};
  const events = {
    shown: () => options.shown(),
    lost: () => {
      teardown();
      options.lost();
    },
    report: (report: BandReport) => {
      if (report.quality !== undefined) canvas.dataset.quality = report.quality;
      if (report.frameP75 !== undefined) canvas.dataset.frameP75 = report.frameP75;
      if (report.frameBudget !== undefined) canvas.dataset.frameBudget = report.frameBudget;
    },
  };
  const worker = spec.preserve ? null : { name: "band", spawn: () => new Worker(new URL("./band-worker.ts", import.meta.url), { type: "module" }) };
  const port = await attach<BandSpec, BandCore, typeof events>(canvas, worker, spec, events, () => import("./band-core").then(({ startBand }) => startBand));
  if (!port) return null;
  let disposed = false;

  let visible = false;
  const update = () => port.call("run", [visible && document.visibilityState === "visible" && !disposed]);
  const fit = () => {
    const { width, height } = canvas.getBoundingClientRect();
    if (!disposed) port.call("resize", [width, height, window.devicePixelRatio || 1]);
  };
  const resizer = new ResizeObserver(fit);
  resizer.observe(canvas);
  fit();
  const watcher = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    update();
  });
  watcher.observe(canvas);
  document.addEventListener("visibilitychange", update);

  teardown = () => {
    if (disposed) return;
    disposed = true;
    resizer.disconnect();
    watcher.disconnect();
    document.removeEventListener("visibilitychange", update);
  };

  return {
    setProgress: (progress) => !disposed && port.call("setProgress", [progress]),
    setPointer: (x, y) => !disposed && port.call("setPointer", [x, y]),
    still: (progress, time) => !disposed && port.call("still", [progress, time]),
    dispose: () => {
      if (disposed) return;
      teardown();
      port.call("dispose", []);
    },
  };
}
