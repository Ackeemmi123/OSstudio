/**
 * The worker's half of `attach` (offscreen.ts): it answers the page's first
 * question (can WebGL draw here?), keeps every canvas it is given, starts a
 * scene on one when asked, and passes the page's calls on to it. Whatever the
 * scene reports (its first frame, a lost context, a measurement) goes back
 * with the scene's id.
 */
import type { FromWorker, ToWorker } from "./offscreen";

interface Scene {
  dispose: () => void;
}

type Post = (message: Record<string, unknown> & { type: string }) => void;

const scope = globalThis as unknown as {
  postMessage: (message: FromWorker) => void;
  onmessage: ((event: MessageEvent<ToWorker>) => void) | null;
};

export function host<Spec>(start: (canvas: OffscreenCanvas, spec: Spec, post: Post, forget: () => void) => Scene | null): void {
  const canvases = new Map<number, OffscreenCanvas>();
  const scenes = new Map<number, Scene>();
  scope.onmessage = ({ data }) => {
    const { id } = data;
    const post: Post = (message) => scope.postMessage({ id, ...message });
    try {
      if (data.type === "create") {
        if (data.canvas) canvases.set(data.surface, data.canvas);
        const canvas = canvases.get(data.surface);
        const scene = canvas ? start(canvas, data.spec as Spec, post, () => scenes.delete(id)) : null;
        if (scene) scenes.set(id, scene);
        post({ type: "created", ok: Boolean(scene) });
      } else {
        const scene = scenes.get(id) as unknown as Record<string, (...args: unknown[]) => void> | undefined;
        if (data.method === "dispose") scenes.delete(id);
        scene?.[data.method](...data.args);
      }
    } catch {
      // A scene that throws stops drawing; its picture underneath stays. The others go on.
      const scene = scenes.get(id);
      scenes.delete(id);
      try {
        scene?.dispose();
      } finally {
        post(data.type === "create" ? { type: "created", ok: false } : { type: "lost" });
      }
    }
  };
  // WebGL on an OffscreenCanvas, with frames paced by the display: only then is drawing here worth it.
  scope.postMessage({ type: "ready", webgl: typeof OffscreenCanvas === "function" && typeof WebGLRenderingContext === "function" && typeof requestAnimationFrame === "function" });
}
