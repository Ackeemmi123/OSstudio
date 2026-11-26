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
 * Runs `setup` only while motion is welcome. Anything GSAP creates inside it
 * (tweens, ScrollTriggers, SplitText) is reverted automatically when the
 * visitor turns on reduced motion. Return a function for any other cleanup.
 */
export function whenMotion(setup: () => void | (() => void)): void {
  media.add("(prefers-reduced-motion: no-preference)", () => setup() ?? undefined);
}

/** Forgets every animation the engine made, for page teardown and tests. */
export function revertAllMotion(): void {
  media.revert();
}

export { gsap, ScrollTrigger, SplitText };
