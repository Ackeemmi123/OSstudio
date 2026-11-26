/**
 * Axivo Signature: the engine. `boot()` reads what the visitor's device and
 * settings allow and sets up every `data-sg` module on the page. The page
 * works fully before and without it; the engine only adds motion on top.
 *
 * The first view costs almost no script: headlines and first-view text move
 * in CSS alone. The motion engine (GSAP, ScrollTrigger, SplitText, Lenis)
 * loads when a moving section comes near the screen, or when the visitor
 * first scrolls, touches or presses a key: smooth scrolling is only needed
 * once someone scrolls. The ink field's shader loads after the page has loaded
 * and checks the graphics hardware itself.
 */
import { onReducedMotionChange, readCapabilities, type Capabilities, type CapabilityOptions } from "./capabilities";

export type { Capabilities };

export interface BootOptions extends CapabilityOptions {
  /** Skip smooth scrolling even when motion is welcome. */
  nativeScroll?: boolean;
  /** Fix 3D quality (0–2) instead of measuring the device. For demos and stills. */
  quality?: 0 | 1 | 2;
}

type Dispose = () => void;

/** When the browser has a quiet moment after load, or after a short wait at the latest. */
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

// The motion engine, loaded once and shared by every module that needs it.
let motion: Promise<typeof import("./motion-modules")> | null = null;
const loadMotion = () => (motion ??= import("./motion-modules"));

/** Mounts a WebGL module when it is about to be seen, and tears it down if motion is turned off. */
function mountWebGL(root: HTMLElement, capabilities: Capabilities, allowSoftware: boolean): Dispose {
  let dispose: Dispose | null = null;
  let cancelled = false;
  const html = document.documentElement;
  whenNear(root, () => {
    void afterLoad()
      .then(() => import("../modules/ink-field"))
      .then(({ mountInkField }) => {
        if (cancelled) return;
        dispose = mountInkField(root, capabilities, allowSoftware);
        // Without good graphics hardware the field stays the still gradient it was designed to be.
        html.dataset.sgWebgl = dispose ? "on" : "off";
      })
      .catch(() => {
        root.dataset.sgState = "still";
        html.dataset.sgWebgl = "off";
      });
  });
  return () => {
    cancelled = true;
    dispose?.();
    dispose = null;
  };
}

export function boot(options: BootOptions = {}): Capabilities {
  const html = document.documentElement;
  const capabilities = readCapabilities();
  html.classList.add("sg-js");
  html.dataset.sgMotion = capabilities.reducedMotion ? "off" : "on";
  html.dataset.sgSmooth = "off";
  // WebGL only adds something when it moves; for reduced motion or saved data the still version is better.
  const webglAllowed = () => !capabilities.reducedMotion && !capabilities.saveData;
  html.dataset.sgWebgl = webglAllowed() ? "pending" : "off";
  const allowSoftware = options.forceWebGL === true;

  // Modules further down mount as they come near; the engine they need loads then.
  const moving = [...document.querySelectorAll<HTMLElement>('[data-sg="lines"], [data-sg="scene"], [data-sg="story"], [data-sg="marquee"], [data-sg="object"], [data-sg="reveal"], [data-sg="gallery"]')];
  for (const element of moving) {
    whenNear(element, () =>
      void loadMotion().then((engine) => {
        const kind = element.dataset.sg;
        if (kind === "lines") engine.mountLines(element);
        else if (kind === "scene") engine.mountScene(element);
        else if (kind === "story") engine.mountStory(element);
        else if (kind === "marquee") engine.mountMarquee(element);
        else if (kind === "object") engine.mountObject(element, capabilities, allowSoftware, options.quality);
        else if (kind === "reveal") engine.mountReveal(element, capabilities, allowSoftware);
        else if (kind === "gallery") engine.mountGallery(element);
      }),
    );
  }

  // The sound button: a few kilobytes, after load. It plays nothing until the visitor asks.
  const sound = document.querySelector<HTMLButtonElement>('[data-sg="sound"]');
  if (sound) void afterLoad().then(() => import("../modules/sound")).then(({ mountSound }) => mountSound(sound));

  // The cursor companion: mouse and trackpad only, from the first time the pointer moves.
  if (capabilities.finePointer && document.querySelector("[data-sg-cursor]")) {
    addEventListener("pointermove", () => void loadMotion().then(({ mountCursor }) => mountCursor()), { once: true, passive: true });
  }

  const smooth = () => {
    if (options.nativeScroll || capabilities.reducedMotion) return;
    void loadMotion().then(({ startSmoothScroll }) => !capabilities.reducedMotion && startSmoothScroll());
  };
  // Smooth scrolling is only needed once someone scrolls: start it on the first sign of that.
  const intents = ["wheel", "touchstart", "keydown", "pointerdown"] as const;
  const onIntent = () => {
    intents.forEach((type) => removeEventListener(type, onIntent));
    smooth();
  };
  if (!capabilities.reducedMotion) intents.forEach((type) => addEventListener(type, onIntent, { passive: true, once: true }));

  const fields = [...document.querySelectorAll<HTMLElement>('[data-sg="ink-field"]')];
  fields.forEach((field) => (field.dataset.sgState = "still"));
  let disposers: Dispose[] = webglAllowed() ? fields.map((field) => mountWebGL(field, capabilities, allowSoftware)) : [];

  onReducedMotionChange((reduced) => {
    capabilities.reducedMotion = reduced;
    html.dataset.sgMotion = reduced ? "off" : "on";
    capabilities.webgl = webglAllowed();
    if (reduced) html.dataset.sgWebgl = "off";
    if (reduced) {
      void motion?.then(({ stopSmoothScroll }) => stopSmoothScroll());
      disposers.forEach((dispose) => dispose());
      disposers = [];
    } else {
      smooth();
      if (webglAllowed() && !disposers.length) {
        html.dataset.sgWebgl = "pending";
        disposers = fields.map((field) => mountWebGL(field, capabilities, allowSoftware));
      }
    }
    void motion?.then(({ ScrollTrigger }) => ScrollTrigger.refresh());
  });

  return capabilities;
}
