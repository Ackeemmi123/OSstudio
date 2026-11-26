/**
 * Body text that arrives line by line as it scrolls in (`data-sg="lines"`).
 * Only for text below the first view: text in the first view uses the CSS
 * `data-sg="rise"`, and headlines are split at build time (src/build/kinetic.ts).
 *
 * Lines keep whole words, so screen readers read the text as it is; an
 * aria-label is not allowed on a paragraph and is not needed.
 */
import { EASE, gsap, SplitText, whenMotion } from "../engine/motion";

export function mountLines(element: HTMLElement): void {
  whenMotion(() => {
    const split = SplitText.create(element, { type: "lines", mask: "lines", tag: "span", autoSplit: true, aria: "none",
      onSplit: (self) =>
        gsap.from(self.lines, {
          yPercent: 105,
          duration: 1.1,
          ease: EASE.arrive,
          stagger: 0.09,
          scrollTrigger: { trigger: element, start: "top 82%", once: true },
        }),
    });
    element.classList.add("sg-ready");
    return () => split.revert();
  });
  // With reduced motion the text is simply there.
  element.classList.add("sg-ready");
}
