/**
 * A number that counts up to its value as it comes into view, settling with a
 * long ease-out like a needle coming to rest. The real value is in the page
 * from the start: screen readers read it once from hidden text, and without
 * JavaScript or with reduced motion the visitor simply sees it.
 *
 * Markup: <span data-sg="count" data-to="2.8" data-decimals="1">
 *           <span class="sg-sr">2,8</span><span aria-hidden="true" data-sg-digits>2,8</span></span>
 */
import { gsap, ScrollTrigger, whenMotion } from "../engine/motion";

export function mountCount(root: HTMLElement): void {
  const digits = root.querySelector<HTMLElement>("[data-sg-digits]");
  const to = Number(root.dataset.to);
  if (!digits || !Number.isFinite(to)) return;
  const decimals = Number(root.dataset.decimals ?? 0);
  const format = new Intl.NumberFormat(document.documentElement.lang || "sv", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const final = digits.textContent ?? format.format(to);

  whenMotion(() => {
    const state = { value: 0 };
    digits.textContent = format.format(0);
    const tween = gsap.to(state, {
      value: to,
      duration: 2.2,
      ease: "expo.out",
      paused: true,
      onUpdate: () => void (digits.textContent = format.format(state.value)),
      onComplete: () => void (digits.textContent = final),
    });
    const trigger = ScrollTrigger.create({ trigger: root, start: "top 88%", once: true, onEnter: () => void tween.play() });
    return () => {
      trigger.kill();
      tween.kill();
      digits.textContent = final;
    };
  });
}
