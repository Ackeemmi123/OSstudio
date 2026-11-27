/**
 * A full-screen fragment shader on one canvas, in plain WebGL: no 3D library,
 * a few kilobytes. For fields, gradients and image effects; the 3D band
 * (band-scene.ts) draws its own two programs the same way, without a library.
 *
 * Where the browser allows it the stage draws in a worker, on an
 * OffscreenCanvas (offscreen.ts): the first WebGL context in a fresh browser,
 * the compile and every frame happen there, and the page never waits for
 * them. Elsewhere it draws on the main thread, with the same code
 * (stage-core.ts). Either way it compiles the shader in the background where
 * the browser can (KHR_parallel_shader_compile), draws only while the canvas
 * is on screen and the tab is visible, caps the pixel ratio, and gives up
 * cleanly if the graphics context is lost.
 */

import { attach, type Port } from "./offscreen";
import type { Picture, StageCore, StageSpec, Uniform } from "./stage-core";

export type { Uniform };

export interface ShaderStageOptions {
  fragment: string;
  /** Draw even on a software renderer. For tests and demos only. */
  allowSoftware?: boolean;
  uniforms: Record<string, Uniform>;
  /** The highest device pixel ratio worth paying for. Under 1 draws fewer pixels than CSS has, for soft fields. */
  maxPixelRatio: number;
  /** Frames per second. Slow fields look the same at 30 and cost half. */
  fps?: number;
  /** Seconds added to the clock, so two fields with the same shader show different moments. */
  timeOffset?: number;
  /** An image (same origin, loaded) for the shader as `uImage`, with its size as `uImageSize`. */
  image?: HTMLImageElement;
  /** A transparent canvas, for effects that reveal what is underneath; the shader writes premultiplied colour. */
  transparent?: boolean;
  /** Draw on the main thread, so the canvas can be read back (the art tool's stills). */
  mainThread?: boolean;
  /** Called before each frame with seconds since start and since the last frame. */
  frame?: (time: number, delta: number, set: (name: string, value: Uniform) => void) => void;
  /** Called once, after the first frame is on screen. */
  shown?: () => void;
  /** Called if the stage cannot draw any more (context lost, shader refused). */
  lost?: () => void;
}

export interface ShaderStage {
  set: (name: string, value: Uniform) => void;
  dispose: () => void;
}

/** How many horizontal bands a picture is uploaded in, one per frame. */
const BANDS = 4;

/**
 * The picture's pixels for the texture, decoded away from the main thread in
 * horizontal bands. Handing an <img> straight to WebGL decodes it on the main
 * thread inside the upload: 120–200 ms for a large picture on a phone with a
 * slow CPU, as the picture scrolls into view. Here the browser decodes the
 * bytes (from its cache, where the <img> left them) in the background, and
 * each band is uploaded in a frame of its own. Same pixels: flipped while
 * decoding, since WebGL ignores its own flip for a bitmap, and not
 * premultiplied, as WebGL leaves an <img>.
 */
async function decodeBands(image: HTMLImageElement): Promise<Picture> {
  const response = await fetch(image.currentSrc || image.src, { cache: "force-cache" });
  if (!response.ok) throw new Error(String(response.status));
  const blob = await response.blob();
  const { width, height } = await pixelSize(blob);
  const rows = Math.ceil(height / BANDS);
  const tops: number[] = [];
  for (let top = 0; top < height; top += rows) tops.push(top);
  const bands = await Promise.all(
    tops.map(async (top) => {
      const band = Math.min(rows, height - top);
      const bitmap = await createImageBitmap(blob, 0, top, width, band, { imageOrientation: "flipY", premultiplyAlpha: "none", colorSpaceConversion: "default" });
      // Flipped, the band's first row is the picture's row top + band - 1, which belongs at this texture row.
      return { row: height - top - band, bitmap };
    }),
  );
  return { width, height, bands };
}

/**
 * The picture's size in pixels. Not the <img>'s natural size: from a srcset
 * that is in CSS pixels (a 2000-pixel picture shown at 412 reports 412). A
 * loaded image that is never shown or decoded reads only the file's header.
 */
async function pixelSize(blob: Blob): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(blob);
  try {
    const probe = new Image();
    probe.src = url;
    await new Promise((resolve, reject) => {
      probe.onload = resolve;
      probe.onerror = reject;
    });
    return { width: probe.naturalWidth, height: probe.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The <img> in one band, for a worker, where the picture could not be decoded from its file. */
async function wholeBitmap(image: HTMLImageElement): Promise<Picture> {
  const bitmap = await createImageBitmap(image, { imageOrientation: "flipY", premultiplyAlpha: "none", colorSpaceConversion: "default" });
  return { width: bitmap.width, height: bitmap.height, bands: [{ row: 0, bitmap }] };
}

const same = (a: Uniform | undefined, b: Uniform) => (typeof b === "number" ? a === b : Array.isArray(a) && a.length === b.length && a.every((v, i) => v === b[i]));

/**
 * Resolves to the stage once it has a WebGL context on a good enough
 * graphics card, or to null without one; nothing is drawn before `shown`.
 */
export async function createShaderStage(canvas: HTMLCanvasElement, options: ShaderStageOptions): Promise<ShaderStage | null> {
  const image = options.image;
  const spec: StageSpec = {
    fragment: options.fragment,
    allowSoftware: options.allowSoftware === true,
    uniforms: image ? { ...options.uniforms, uImageSize: [image.naturalWidth, image.naturalHeight] } : options.uniforms,
    maxPixelRatio: options.maxPixelRatio,
    fps: options.fps ?? 60,
    timeOffset: options.timeOffset ?? 0,
    transparent: options.transparent === true,
    textured: Boolean(image),
  };
  // The picture decodes while the stage starts.
  const decoded = image ? decodeBands(image) : null;
  decoded?.catch(() => undefined);

  let teardown = () => {};
  const events = {
    shown: () => options.shown?.(),
    lost: () => {
      teardown();
      options.lost?.();
    },
  };
  const worker = options.mainThread ? null : { name: "stage", spawn: () => new Worker(new URL("./stage-worker.ts", import.meta.url), { type: "module" }) };
  // On the main thread the stage calls `frame` itself, before each frame it draws.
  const port: Port<StageCore> | null = await attach(canvas, worker, spec, { ...events, frame: options.frame }, () => import("./stage-core").then(({ startStage }) => startStage));
  if (!port) {
    void decoded?.then(({ bands }) => bands.forEach(({ bitmap }) => bitmap.close()), () => undefined);
    return null;
  }
  let disposed = false;

  if (image && decoded) {
    const give = (picture: Picture) => (disposed ? picture.bands.forEach(({ bitmap }) => bitmap.close()) : port.call("picture", [picture], port.remote ? picture.bands.map(({ bitmap }) => bitmap) : []));
    // Where the browser cannot decode the file in the background, the picture is uploaded from the <img>, as it always was.
    decoded.then(give, () => {
      if (disposed) return;
      if (!port.remote) port.call("picture", [image]);
      else void wholeBitmap(image).then(give, () => undefined);
    });
  }

  // In a worker, `frame` runs here, at the stage's own pace, and only what changed is sent.
  const sent = new Map<string, Uniform>();
  const pending = new Map<string, Uniform>();
  let flushing = false;
  const flush = () => {
    flushing = false;
    if (disposed || !pending.size) return;
    for (const [name, value] of pending) sent.set(name, value);
    const values = [...pending];
    pending.clear();
    for (const [name, value] of values) port.call("set", [name, value]);
  };
  const set = (name: string, value: Uniform) => {
    if (!port.remote) return port.call("set", [name, value]);
    if (same(sent.get(name), value) && !pending.has(name)) return;
    pending.set(name, typeof value === "number" ? value : ([...value] as unknown as Uniform));
    if (!flushing) {
      flushing = true;
      queueMicrotask(flush);
    }
  };
  const interval = 1 / spec.fps - 0.002;
  let driving = false;
  let driveId = 0;
  let start = 0;
  let last = 0;
  let drawn = 0;
  const drive = () => {
    const now = performance.now() / 1000;
    if (now - drawn >= interval) {
      drawn = now;
      if (!start) start = last = now;
      options.frame?.(now - start, Math.min(now - last, 0.1), set);
      last = now;
    }
    if (driving) driveId = requestAnimationFrame(drive);
  };

  let visible = false;
  const update = () => {
    const on = visible && document.visibilityState === "visible" && !disposed;
    port.call("run", [on]);
    if (!port.remote || !options.frame) return;
    if (on && !driving) {
      driving = true;
      last = performance.now() / 1000;
      driveId = requestAnimationFrame(drive);
    } else if (!on && driving) {
      driving = false;
      cancelAnimationFrame(driveId);
    }
  };

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
    driving = false;
    cancelAnimationFrame(driveId);
    resizer.disconnect();
    watcher.disconnect();
    document.removeEventListener("visibilitychange", update);
  };

  return {
    set,
    dispose: () => {
      if (disposed) return;
      teardown();
      port.call("dispose", []);
    },
  };
}
