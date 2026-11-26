/**
 * GSAP with ScrollTrigger and SplitText, registered once. Modules add their
 * animations through `whenMotion`, which runs them only while the visitor has
 * not asked for reduced motion, and undoes them the moment they do: the page
 * then shows its plain, finished state.
 *
 * GSAP is used under its standard no-charge license, which allows it on any
 * website. It must not be used in a no-code visual animation builder.
 */
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

gsap.registerPlugin(ScrollTrigger, SplitText);

/** The engine's shared easing curves, so motion across a site feels like one hand made it. */
export const EASE = {
  /** Things arriving: quick start, long gentle landing. */
  arrive: "expo.out",
  /** Things tied to scroll: even, so the hand feels in control. */
  follow: "none",
  /** Small interface details. */
  detail: "power2.out",
} as const;

const media = gsap.matchMedia();

/**
 * Runs `setup` only while motion is welcome, and while `also` matches (for
 * example `(min-width: 900px)`). Anything GSAP creates inside it (tweens,
 * ScrollTriggers, SplitText) is reverted automatically when that stops being
 * true. Return a function for any other cleanup.
 */
export function whenMotion(setup: () => void | (() => void), also = ""): void {
  media.add(`(prefers-reduced-motion: no-preference)${also ? ` and ${also}` : ""}`, () => setup() ?? undefined);
}

/** Where an element ends, on screen, before it changes height. */
export const placeOf = (element: Element): number => element.getBoundingClientRect().bottom;

/**
 * Keeps what the visitor is looking at in place when a section above it has
 * just changed height (a pinned scene adds its scroll length, a scrubbed list
 * grows). Without this, a visitor who is already further down, after a reload
 * or an anchor link, would see the page jump. Applies when the section ends in
 * the upper half of the screen or above it: the visitor is then looking at
 * what comes after. Pass what `placeOf` gave before the change.
 */
export function holdPlace(element: Element, before: number): void {
  // Ending in the lower half of the screen or below: the visitor is looking at it, or at what is above it.
  if (before >= window.innerHeight * 0.5) return;
  ScrollTrigger.refresh();
  const box = element.parentElement?.classList.contains("pin-spacer") ? element.parentElement : element;
  const delta = box.getBoundingClientRect().bottom - before;
  if (Math.abs(delta) > 1) window.scrollBy({ top: delta, behavior: "instant" });
}

/** Forgets every animation the engine made, for page teardown and tests. */
export function revertAllMotion(): void {
  media.revert();
}

export { gsap, ScrollTrigger, SplitText };
