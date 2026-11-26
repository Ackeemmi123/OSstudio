/**
 * An object that comes together as the visitor scrolls: a 3D scene (see
 * object-scene.ts) held beside a few steps of text, driven by the scroll.
 *
 * The drawing underneath (an inline SVG of the finished object) is the design
 * without WebGL, with reduced motion and without JavaScript; the 3D scene only
 * appears over it once it is drawing.
 *
 * Markup: <section data-sg="object" data-colors="#4a5bb5 #879dc7 #c3bcf2">
 *           <div data-sg-stage><svg …poster…/><canvas data-sg-canvas aria-hidden="true"></canvas></div>
 *           <ol data-sg-steps><li data-step>…</li>…</ol></section>
 */
import type { Capabilities } from "../engine/capabilities";
import { holdPlace, placeOf, ScrollTrigger, whenMotion } from "../engine/motion";

export function mountObject(section: HTMLElement, capabilities: Capabilities, allowSoftware: boolean): void {
  const stage = section.querySelector<HTMLElement>("[data-sg-stage]");
  const canvas = section.querySelector<HTMLCanvasElement>("[data-sg-canvas]");
  const steps = [...section.querySelectorAll<HTMLElement>("[data-step]")];
  const list = section.querySelector<HTMLElement>("[data-sg-steps]");
  if (!stage || !canvas || !list) return;
  const colours = section.dataset.colors?.split(/\s+/).filter(Boolean) ?? ["#4a5bb5", "#879dc7", "#c3bcf2"];
  section.dataset.sgState = "still";

  whenMotion(() => {
    let scene: { setProgress: (p: number) => void; dispose: () => void } | null = null;
    let cancelled = false;
    const before = placeOf(section);
    section.classList.add("is-scrubbed");

    const show = (index: number) => steps.forEach((step, i) => step.toggleAttribute("data-active", i === index));
    const trigger = ScrollTrigger.create({
      // Whole exactly when the last step sits in the middle of the screen.
      trigger: list,
      start: "top 35%",
      end: "bottom 85%",
      onUpdate: (self) => {
        scene?.setProgress(self.progress);
        section.dataset.sgProgress = self.progress.toFixed(2);
        show(Math.min(steps.length - 1, Math.floor(self.progress * steps.length)));
      },
    });
    show(0);
    holdPlace(section, before);

    if (!capabilities.saveData) {
      void import("./object-scene")
        .then(({ createObjectScene }) => {
          if (cancelled) return;
          scene = createObjectScene(canvas, {
            allowSoftware,
            lowPower: capabilities.lowPower,
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
