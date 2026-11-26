/**
 * A line of text that runs past without end, faster when the page scrolls
 * fast, and the other way when it scrolls up. With reduced motion it is one
 * still line. Screen readers read the text once: the copies that make the
 * loop seamless are hidden from them.
 *
 * Markup: <div data-sg="marquee"><p data-sg-line>Idé · Rörelse · Hantverk · </p></div>
 */
import { gsap, ScrollTrigger, whenMotion } from "../engine/motion";

export function mountMarquee(root: HTMLElement): void {
  const line = root.querySelector<HTMLElement>("[data-sg-line]");
  if (!line) return;

  whenMotion(() => {
    // Enough copies to cover twice the width, so the loop never shows a gap.
    const copies = Math.max(1, Math.ceil((root.clientWidth * 2) / Math.max(1, line.offsetWidth)));
    const clones = Array.from({ length: copies }, () => {
      const clone = line.cloneNode(true) as HTMLElement;
      clone.setAttribute("aria-hidden", "true");
      clone.removeAttribute("data-sg-line");
      clone.classList.add("sg-marquee-copy");
      root.append(clone);
      return clone;
    });
    const parts = [line, ...clones];
    root.classList.add("is-running");

    const loop = gsap.to(parts, { xPercent: -100, ease: "none", duration: Number(root.dataset.duration ?? 18), repeat: -1 });
    // Scroll speed adds to the pace, and scrolling up turns it around; it settles back on its own.
    let direction = 1;
    const settle = gsap.quickTo(loop, "timeScale", { duration: 0.8, ease: "power3.out" });
    const trigger = ScrollTrigger.create({
      trigger: root,
      start: "top bottom",
      end: "bottom top",
      onUpdate: (self) => {
        if (self.direction !== 0) direction = self.direction;
        loop.timeScale(direction * (1 + Math.min(4, Math.abs(self.getVelocity()) / 400)));
        settle(direction);
      },
      onToggle: (self) => (self.isActive ? loop.play() : loop.pause()),
    });

    return () => {
      trigger.kill();
      loop.kill();
      clones.forEach((clone) => clone.remove());
      gsap.set(line, { clearProps: "transform" });
      root.classList.remove("is-running");
    };
  });
}
