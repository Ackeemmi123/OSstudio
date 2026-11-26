/**
 * A scene in steps: one visual holds still (CSS sticky) while its steps scroll
 * past, and the scroll position drives it. Here the visual is a ring that
 * fills and a counter that follows the step in view.
 *
 * Without motion, or without JavaScript, it is an ordinary list of steps and
 * the ring is full: nothing is hidden, nothing waits on scrolling.
 *
 * Markup: <section data-sg="scene"> … <circle data-sg-ring pathLength="1"> …
 *         <span data-sg-count>01</span> … <li data-step>…</li> … </section>
 */
import { EASE, gsap, ScrollTrigger, whenMotion } from "../engine/motion";

export function mountScene(section: HTMLElement): void {
  const ring = section.querySelector<SVGGeometryElement>("[data-sg-ring]");
  const count = section.querySelector<HTMLElement>("[data-sg-count]");
  const steps = [...section.querySelectorAll<HTMLElement>("[data-step]")];
  const list = steps[0]?.parentElement;
  if (!ring || !list || !steps.length) return;

  const show = (index: number) => {
    steps.forEach((step, i) => step.toggleAttribute("data-active", i === index));
    if (count) count.textContent = String(index + 1).padStart(2, "0");
  };

  whenMotion(() => {
    section.classList.add("is-scrubbed");
    gsap.fromTo(ring, { strokeDashoffset: 1 }, { strokeDashoffset: 0, ease: EASE.follow, scrollTrigger: { trigger: list, start: "top 60%", end: "bottom 60%", scrub: 0.6 } });
    steps.forEach((step, index) =>
      ScrollTrigger.create({ trigger: step, start: "top 60%", end: "bottom 60%", onToggle: (self) => self.isActive && show(index) }),
    );
    show(0);
    return () => {
      section.classList.remove("is-scrubbed");
      steps.forEach((step) => step.removeAttribute("data-active"));
      if (count) count.textContent = String(steps.length).padStart(2, "0");
    };
  });
}
