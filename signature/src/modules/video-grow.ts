/**
 * The video's showreel variant (`data-sg-variant="grow"`): the framed film
 * grows to fill the screen as it scrolls in, tied to the scroll. The layout is
 * CSS (engine.css): a tall track, pulled up so the framed film follows the
 * text before it, with the frame held on screen (sticky) and clipped to the
 * framed size. This moves one number, `--sg-grow`, from 0 to 1,
 * and measures one more, `--sg-k0`: the scale at which the film, as it fills
 * the screen, just fills the frame at the start, so the film grows with its
 * frame rather than being uncovered by it. Clip and scale only, never layout,
 * so it stays at the screen's frame rate. With reduced motion the CSS is the
 * plain framed film and nothing runs here.
 */
import { EASE, gsap, ScrollTrigger, whenMotion } from "../engine/motion";

export function mountVideoGrow(root: HTMLElement): void {
  const frame = root.querySelector<HTMLElement>("[data-sg-frame]");
  if (!frame) return;

  whenMotion(() => {
    // The film as it fills the screen, scaled just enough to fill the framed size: the same picture, smaller.
    const fit = () => {
      const style = getComputedStyle(frame);
      const width = frame.clientWidth;
      const height = frame.clientHeight;
      if (!width || !height) return;
      const framedWidth = width - 2 * Number.parseFloat(style.getPropertyValue("--sg-x0"));
      const framedHeight = height - 2 * Number.parseFloat(style.getPropertyValue("--sg-y0"));
      frame.style.setProperty("--sg-k0", Math.min(1, Math.max(framedWidth / width, framedHeight / height)).toFixed(4));
    };
    // Grows over one screen of scrolling from the moment the framed film is wholly in view (the track's top is then as
    // far below the screen's top as the frame sits inside the held screen); then holds, full screen, until the track ends.
    const inset = () => Number.parseFloat(getComputedStyle(root).getPropertyValue("--sg-y0")) || 0;
    gsap.fromTo(frame, { "--sg-grow": 0 }, { "--sg-grow": 1, ease: EASE.follow, scrollTrigger: { trigger: root, start: () => `top ${inset()}px`, end: () => `+=${window.innerHeight}`, scrub: true } });
    // The top edge waits until the frame is held, then rises to the screen's top by the same end: it never runs over the text above.
    gsap.fromTo(frame, { "--sg-rise": 0 }, { "--sg-rise": 1, ease: EASE.follow, scrollTrigger: { trigger: root, start: "top top", end: () => `top ${inset() - window.innerHeight}px`, scrub: true } });
    fit();
    ScrollTrigger.addEventListener("refresh", fit);
    return () => {
      ScrollTrigger.removeEventListener("refresh", fit);
      frame.style.removeProperty("--sg-k0");
    };
  });
}
