/**
 * Everything that needs the motion engine, as one chunk the engine loads on
 * demand: GSAP with ScrollTrigger and SplitText, Lenis, and the modules built
 * on them. The first view never waits for it.
 */
import { ScrollTrigger } from "./motion";

export { ScrollTrigger };
export { startSmoothScroll, stopSmoothScroll } from "./scroll";
export { mountLines } from "../modules/text";
export { mountScene } from "../modules/scene";
export { mountStory } from "../modules/story";
export { mountMarquee } from "../modules/marquee";
export { mountCursor } from "../modules/cursor";
export { mountObject } from "../modules/object";
export { mountReveal } from "../modules/reveal";
export { mountGallery } from "../modules/gallery";
export { mountCount } from "../modules/count";

// Fonts change line breaks; measure scroll positions again once they are in.
void document.fonts?.ready.then(() => ScrollTrigger.refresh());
