/**
 * A horizontal story: on wide screens with motion, the section holds still
 * while its panels slide past sideways as you scroll down. Everywhere else
 * (phones, reduced motion, no JavaScript) the panels simply stack.
 *
 * Keyboard users are never lost: when focus moves into a panel that is out of
 * view, the page scrolls to where that panel is shown.
 *
 * Markup: <section data-sg="story"> … <div data-sg-viewport>
 *           <ol data-sg-track> <li data-sg-panel>…</li> … </ol></div></section>
 */
import { gsap, holdPlace, placeOf, whenMotion } from "../engine/motion";

export function mountStory(section: HTMLElement): void {
  const viewport = section.querySelector<HTMLElement>("[data-sg-viewport]");
  const track = section.querySelector<HTMLElement>("[data-sg-track]");
  const panels = [...section.querySelectorAll<HTMLElement>("[data-sg-panel]")];
  if (!viewport || !track || panels.length < 2) return;

  whenMotion(() => {
    const before = placeOf(section);
    section.classList.add("is-horizontal");
    const distance = () => Math.max(0, track.scrollWidth - viewport.clientWidth);
    const slide = gsap.to(track, {
      x: () => -distance(),
      ease: "none",
      scrollTrigger: { trigger: section, start: "top top", end: () => `+=${distance()}`, pin: true, scrub: 0.8, invalidateOnRefresh: true, anticipatePin: 1 },
    });
    // Each panel's number drifts against the slide: a small depth cue.
    for (const panel of panels) {
      const number = panel.querySelector("[data-sg-number]");
      if (number) gsap.fromTo(number, { xPercent: 35 }, { xPercent: -15, ease: "none", scrollTrigger: { trigger: panel, containerAnimation: slide, start: "left right", end: "right left", scrub: true } });
    }

    const onFocus = (event: FocusEvent) => {
      const panel = (event.target as HTMLElement).closest<HTMLElement>("[data-sg-panel]");
      const trigger = slide.scrollTrigger;
      if (!panel || !trigger) return;
      const progress = distance() ? Math.min(1, panel.offsetLeft / distance()) : 0;
      window.scrollTo({ top: trigger.start + (trigger.end - trigger.start) * progress, behavior: "instant" });
    };
    section.addEventListener("focusin", onFocus);
    holdPlace(section, before);
    return () => {
      section.removeEventListener("focusin", onFocus);
      section.classList.remove("is-horizontal");
    };
  }, "(min-width: 900px)");
}
