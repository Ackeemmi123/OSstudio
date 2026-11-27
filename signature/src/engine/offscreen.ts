/**
 * Drawing off the main thread. Where the browser allows it, a WebGL scene
 * draws in a worker on an OffscreenCanvas: creating the first WebGL context in
 * a fresh browser, compiling and every frame then happen there, and the page
 * never waits for them. Elsewhere it draws on the main thread, as before.
 *
 * `attach` gives back a port to the scene either way, so the module above it
 * does not need to know where it runs. One worker per kind of scene is shared
 * by every canvas on the page; a canvas, once handed to it, stays there, and
 * the next scene on the same canvas (after reduced motion was switched on and
 * off again, say) draws in the same place.
 */
import type { Surface } from "./stage-core";

/** Every method of a scene, as the arguments it takes. */
type Calls<Scene> = { [K in keyof Scene]: Scene[K] extends (...args: infer A) => unknown ? A : never };

/** A scene in a worker or on this thread, driven by method calls. */
export interface Port<Scene> {
  call: <K extends keyof Scene & string>(method: K, args: Calls<Scene>[K], transfer?: Transferable[]) => void;
  /** True when the scene draws in a worker. */
  remote: boolean;
}

/** Messages from a worker. The first says whether it can draw WebGL at all. */
export type FromWorker = { type: "ready"; webgl: boolean } | ({ id: number; type: string } & Record<string, unknown>);
/** Messages to a worker. */
export type ToWorker =
  | { type: "create"; id: number; surface: number; canvas?: OffscreenCanvas; spec: unknown }
  | { type: "call"; id: number; method: string; args: unknown[] };

interface Link {
  post: (message: ToWorker, transfer?: Transferable[]) => void;
  listen: (id: number, listener: (message: FromWorker & { id: number }) => void) => () => void;
}

const links = new Map<string, Promise<Link | null>>();
const surfaces = new WeakMap<HTMLCanvasElement, { link: string; surface: number }>();
let ids = 0;

/** The page's worker for one kind of scene, started once; null where it cannot draw WebGL. */
function connect(name: string, spawn: () => Worker): Promise<Link | null> {
  let link = links.get(name);
  if (!link) {
    link = new Promise((resolve) => {
      let worker: Worker;
      try {
        worker = spawn();
      } catch {
        resolve(null);
        return;
      }
      const listeners = new Map<number, (message: FromWorker & { id: number }) => void>();
      let ready = false;
      const fail = () => {
        if (!ready) {
          ready = true;
          worker.terminate();
          resolve(null);
          return;
        }
        // The worker itself has failed: every scene in it is lost, and its pictures stay.
        for (const listener of [...listeners.values()]) listener({ id: -1, type: "lost" });
      };
      worker.addEventListener("error", fail);
      worker.addEventListener("message", ({ data }: MessageEvent<FromWorker>) => {
        if (!ready) {
          ready = true;
          if (data.type === "ready" && data.webgl) resolve({ post: (message, transfer = []) => worker.postMessage(message, transfer), listen: (id, listener) => (listeners.set(id, listener), () => listeners.delete(id)) });
          else {
            worker.terminate();
            resolve(null);
          }
          return;
        }
        if ("id" in data) listeners.get(data.id)?.(data);
      });
    });
    links.set(name, link);
  }
  return link;
}

/**
 * Starts a scene on the canvas: in the named worker where the browser can
 * draw WebGL there, otherwise on this thread with `local`. Resolves to null
 * when there is no (good enough) WebGL, exactly as the scene itself decides.
 */
export async function attach<Spec, Scene, E extends object>(
  canvas: HTMLCanvasElement,
  worker: { name: string; spawn: () => Worker } | null,
  spec: Spec,
  events: E,
  local: () => Promise<(canvas: Surface, spec: Spec, events: E) => Scene | null>,
): Promise<Port<Scene> | null> {
  const placed = surfaces.get(canvas);
  const possible = worker && typeof Worker === "function" && "transferControlToOffscreen" in canvas && (!placed || placed.link === worker.name);
  const link = possible ? await connect(worker.name, worker.spawn) : null;
  let surface = placed?.surface;
  let offscreen: OffscreenCanvas | undefined;
  if (link && worker && surface === undefined) {
    try {
      offscreen = canvas.transferControlToOffscreen();
      surface = ++ids;
      surfaces.set(canvas, { link: worker.name, surface });
    } catch {
      // The canvas already has a context here: it stays on this thread.
    }
  }
  if (link && surface !== undefined) {
    const id = ++ids;
    return new Promise((resolve) => {
      const unlisten = link.listen(id, (message) => {
        if (message.type === "created") {
          if (message.ok) resolve({ remote: true, call: (method, args, transfer) => (link.post({ type: "call", id, method, args: args as unknown[] }, transfer), method === "dispose" && unlisten()) });
          else {
            unlisten();
            resolve(null);
          }
          return;
        }
        if (message.type === "lost") {
          unlisten();
          resolve(null);
        }
        // What the scene reports back: its first frame on screen, the context lost, a measurement.
        (events as Record<string, ((message: unknown) => void) | undefined>)[message.type]?.(message);
      });
      link.post({ type: "create", id, surface, canvas: offscreen, spec }, offscreen ? [offscreen] : []);
    });
  }
  // On this thread: a canvas already handed to a worker can never draw here.
  if (placed) return null;
  try {
    const start = await local();
    const scene = start(canvas, spec, events);
    if (!scene) return null;
    const target = scene as Record<string, (...args: unknown[]) => void>;
    return { remote: false, call: (method, args) => target[method](...(args as unknown[])) };
  } catch {
    return null;
  }
}
