/**
 * A horizontal story: on wide screens with motion, the section holds still
 * while its panels slide past sideways as you scroll down. Everywhere else
 * (phones, reduced motion, no JavaScript) the panels simply stack.
 *
 * It holds with CSS sticky, like the scene, the growing film and the stack:
 * the section becomes the runway (as tall as what it shows plus the slide)
 * and one box inside it, made here around its content, stays on screen. A
 * pin by position: fixed would be scored by the browser as a layout shift
 * each time it took hold or let go, which counts in a visitor's CLS.
 *
 * Keyboard users are never lost: when focus moves into a panel that is out of
 * view, the page scrolls to where that panel is shown.
 *
 * Markup: <section data-sg="story"> … <div data-sg-viewport>
 *           <ol data-sg-track> <li data-sg-panel>…</li> … </ol></div></section>
 */
import { gsap, holdPlace, placeOf, ScrollTrigger, whenMotion } from "../engine/motion";

export function mountStory(section: HTMLElement): void {
  const viewport = section.querySelector<HTMLElement>("[data-sg-viewport]");
  const track = section.querySelector<HTMLElement>("[data-sg-track]");
  const panels = [...section.querySelectorAll<HTMLElement>("[data-sg-panel]")];
  if (!viewport || !track || panels.length < 2) return;

  whenMotion(() => {
    const before = placeOf(section);
    const hold = document.createElement("div");
    hold.className = "story-hold";
    hold.append(...section.childNodes);
    section.append(hold);
    section.classList.add("is-horizontal");
    const distance = () => Math.max(0, track.scrollWidth - viewport.clientWidth);
    // Tall enough for the hold to stay put through exactly the slide; measured again before every refresh.
    const fit = () => void (section.style.height = `${hold.offsetHeight + distance()}px`);
    fit();
    ScrollTrigger.addEventListener("refreshInit", fit);
    const slide = gsap.to(track, {
      x: () => -distance(),
      ease: "none",
      scrollTrigger: { trigger: section, start: "top top", end: () => `+=${distance()}`, scrub: 0.8, invalidateOnRefresh: true },
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
      ScrollTrigger.removeEventListener("refreshInit", fit);
      section.removeEventListener("focusin", onFocus);
      section.classList.remove("is-horizontal");
      section.style.removeProperty("height");
      section.append(...hold.childNodes);
      hold.remove();
    };
  }, "(min-width: 900px)");
}
