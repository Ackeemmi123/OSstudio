import type { Page } from "@playwright/test";

/**
 * Devices for the WebGL tests. The engine draws in a worker on an
 * OffscreenCanvas where the browser can, so a stand-in for a device has to
 * reach the workers too: every worker the page starts is started from a small
 * module that changes the worker first and then loads the real one.
 */

type Change = "refuse-webgl" | "no-worker-webgl";

/** Every Worker the page starts runs `change` first, in the worker, then the real script. */
function changeWorkers(change: Change) {
  const Real = window.Worker;
  window.Worker = class extends Real {
    constructor(url: string | URL, options?: WorkerOptions) {
      const target = new URL(String(url), location.href).href;
      const prelude =
        change === "refuse-webgl"
          ? `{ const original = OffscreenCanvas.prototype.getContext; OffscreenCanvas.prototype.getContext = function (type, ...rest) { return /webgl/i.test(type) ? null : original.call(this, type, ...rest); }; }`
          : `delete self.WebGLRenderingContext;`;
      super(URL.createObjectURL(new Blob([`${prelude}\nawait import(${JSON.stringify(target)});`], { type: "text/javascript" })), { ...options, type: "module" });
    }
  } as typeof Worker;
}

/** A device without WebGL: on the main thread and in every worker, getContext("webgl") answers null. */
export async function withoutWebGL(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      return /webgl/i.test(type) ? null : (original as (...args: unknown[]) => RenderingContext | null).call(this, type, ...rest);
    } as typeof original;
  });
  await page.addInitScript(changeWorkers, "refuse-webgl" as Change);
}

/** A browser that has OffscreenCanvas but cannot draw WebGL in a worker (Safari 16.4 to 16.6). */
export async function withoutWorkerWebGL(page: Page): Promise<void> {
  await page.addInitScript(changeWorkers, "no-worker-webgl" as Change);
}

/** A browser without OffscreenCanvas: canvases cannot be handed to a worker. */
export async function withoutOffscreenCanvas(page: Page): Promise<void> {
  await page.addInitScript(() => {
    delete (HTMLCanvasElement.prototype as Partial<HTMLCanvasElement>).transferControlToOffscreen;
  });
}

/**
 * Watches the page's canvases without touching them: counts the WebGL contexts
 * the page creates on the main thread (`window.mainContexts`) and marks each
 * canvas it hands to a worker, for `handedToWorker`.
 */
export async function watchCanvases(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const scope = window as unknown as { mainContexts: number };
    scope.mainContexts = 0;
    const proto = HTMLCanvasElement.prototype;
    const getContext = proto.getContext;
    proto.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      if (/webgl/i.test(type)) scope.mainContexts++;
      return (getContext as (...args: unknown[]) => RenderingContext | null).call(this, type, ...rest);
    } as typeof getContext;
    const transfer = proto.transferControlToOffscreen;
    if (transfer)
      proto.transferControlToOffscreen = function (this: HTMLCanvasElement) {
        const offscreen = transfer.call(this);
        this.dataset.testHanded = "worker";
        return offscreen;
      };
  });
}

/** True when the page has handed the canvas to a worker (needs `watchCanvases`). */
export const handedToWorker = (canvas: HTMLElement) => canvas.dataset.testHanded === "worker";

/** The number of WebGL contexts the page has created on the main thread (needs `watchCanvases`). */
export const mainContexts = () => (window as unknown as { mainContexts: number }).mainContexts;
