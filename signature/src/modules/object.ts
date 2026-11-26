/**
 * An object that comes together as the visitor scrolls: a 3D scene (see
 * object-scene.ts) held beside a few steps of text, driven by the scroll.
 *
 * The drawing underneath (an inline SVG of the finished object) is the design
 * without WebGL, with reduced motion and without JavaScript; the 3D scene only
 * appears over it once it is drawing.
 *
 * Markup: <section data-sg="object" data-colors="#151922 #4a5bb5 #c9d9f0 #879dc7">  (ink, glass, metal, glow)
 *           <div data-sg-stage><svg …poster…/><canvas data-sg-canvas aria-hidden="true"></canvas></div>
 *           <ol data-sg-steps><li data-step>…</li>…</ol></section>
 */
import type { Capabilities } from "../engine/capabilities";
import type { ObjectScene } from "./object-scene";
import { holdPlace, placeOf, ScrollTrigger, whenMotion } from "../engine/motion";

/** How often this screen draws, in seconds per frame, measured before anything heavy runs (median of 24 frames). */
function cadence(): Promise<number> {
  return new Promise((resolve) => {
    const intervals: number[] = [];
    let last = performance.now();
    const tick = (now: number) => {
      intervals.push(now - last);
      last = now;
      if (intervals.length < 24) requestAnimationFrame(tick);
      else resolve(intervals.sort((a, b) => a - b)[12] / 1000);
    };
    requestAnimationFrame(tick);
  });
}

export function mountObject(section: HTMLElement, capabilities: Capabilities, allowSoftware: boolean, quality?: 0 | 1 | 2): void {
  const stage = section.querySelector<HTMLElement>("[data-sg-stage]");
  const canvas = section.querySelector<HTMLCanvasElement>("[data-sg-canvas]");
  const steps = [...section.querySelectorAll<HTMLElement>("[data-step]")];
  const list = section.querySelector<HTMLElement>("[data-sg-steps]");
  if (!stage || !canvas || !list) return;
  const colours = section.dataset.colors?.split(/\s+/).filter(Boolean) ?? ["#151922", "#4a5bb5", "#c9d9f0", "#879dc7"];
  section.dataset.sgState = "still";

  whenMotion(() => {
    let scene: ObjectScene | null = null;
    let cancelled = false;
    const before = placeOf(section);
    section.classList.add("is-scrubbed");

    const show = (index: number) => steps.forEach((step, i) => step.toggleAttribute("data-active", i === index));
    const trigger = ScrollTrigger.create({
      // Whole exactly when the last step sits in the middle of the screen.
      trigger: list,
      start: "top 35%",
      end: "bottom bottom",
      onUpdate: (self) => {
        scene?.setProgress(self.progress);
        section.dataset.sgProgress = self.progress.toFixed(2);
        show(Math.min(steps.length - 1, Math.floor(self.progress * steps.length)));
      },
    });
    show(0);
    holdPlace(section, before);

    // With a mouse, the crown tilts a little toward the pointer.
    const onPointer = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const box = stage.getBoundingClientRect();
      scene?.setPointer(((event.clientX - box.left) / box.width) * 2 - 1, ((event.clientY - box.top) / box.height) * 2 - 1);
    };
    const onLeave = () => scene?.setPointer(null, 0);
    section.addEventListener("pointermove", onPointer, { passive: true });
    section.addEventListener("pointerleave", onLeave);

    if (!capabilities.saveData) {
      void Promise.all([import("./object-scene"), cadence()])
        .then(([{ createObjectScene }, interval]) => {
          if (cancelled) return;
          scene = createObjectScene(canvas, {
            // Step down only when the scene drops clearly below what this screen delivers anyway.
            frameBudget: Math.min(1 / 20, Math.max(1 / 50, interval * 1.45)),
            allowSoftware,
            lowPower: capabilities.lowPower,
            quality,
            colours,
            shown: () => stage.classList.add("is-live"),
            lost: () => {
              stage.classList.remove("is-live");
              section.dataset.sgState = "still";
            },
          });
          section.dataset.sgState = scene ? "webgl" : "still";
          scene?.setProgress(trigger.progress);
        })
        .catch(() => (section.dataset.sgState = "still"));
    }

    return () => {
      cancelled = true;
      section.removeEventListener("pointermove", onPointer);
      section.removeEventListener("pointerleave", onLeave);
      trigger.kill();
      scene?.dispose();
      scene = null;
      stage.classList.remove("is-live");
      section.classList.remove("is-scrubbed");
      section.dataset.sgState = "still";
      steps.forEach((step) => step.removeAttribute("data-active"));
    };
  });
}
