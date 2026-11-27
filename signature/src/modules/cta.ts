/**
 * Call to action (`data-sg="cta"`): the page's own link ("Boka tid", "Boka
 * bord"), written where it belongs in the page. Without JavaScript it is just
 * that link. With it, while the link's own place is out of view and the
 * visitor has scrolled past the first screen, the same link floats as a pill
 * at the bottom centre of the screen; back at its place, it sits there again.
 * Its place keeps its height meanwhile, so nothing moves.
 *
 * The pill steps out of the way while reading down and comes back at the
 * first move up, like the menu button. It gives way while the page's footer,
 * or anything marked `data-sg-cta-end` (the page's own closing call to
 * action), is in view, so there are never two. It never covers the focused
 * element: while it shows, the page keeps room for it at the bottom
 * (`scroll-padding-bottom`, which focus and anchors scroll by), and it stays
 * away while the focused element is in that room. Focused itself, it always
 * shows. With reduced motion it fades instead of sliding (engine.css).
 *
 * Markup: <p data-sg="cta"><a href="…">Boka tid</a></p>
 */
import { onHeading } from "../engine/heading";

export function mountCta(root: HTMLElement): void {
  const link = root.querySelector<HTMLAnchorElement>("a[href]");
  if (!link || root.classList.contains("is-ready")) return;
  root.classList.add("is-ready");
  const html = document.documentElement;
  let home = true;
  let tucked = false;
  let room = 0;
  const ends = new Set<Element>();

  /** Whether the focused element (other than the pill) lies where the pill would show. */
  const inRoom = () => {
    const at = document.activeElement;
    if (!at || at === link || at === document.body) return false;
    const box = at.getBoundingClientRect();
    return box.bottom > innerHeight - room && box.top < innerHeight;
  };

  const update = () => {
    if (home === root.classList.contains("is-floating")) {
      // Leaving its place, the place keeps its height; coming back, the link fills it again.
      root.style.minHeight = home ? "" : `${root.offsetHeight}px`;
      root.classList.toggle("is-floating", !home);
      if (!home) room = link.offsetHeight + Number.parseFloat(getComputedStyle(link).bottom) + 12;
    }
    const show = !home && (document.activeElement === link || (scrollY > innerHeight && !ends.size && !tucked && !inRoom()));
    root.classList.toggle("is-shown", show);
    html.style.scrollPaddingBottom = show ? `${room}px` : "";
  };

  // Docks a little before its place comes into view, so the switch happens off screen.
  new IntersectionObserver(
    ([entry]) => {
      home = entry.isIntersecting;
      update();
    },
    { rootMargin: "10% 0px" },
  ).observe(root);
  const away = new IntersectionObserver((entries) => {
    entries.forEach((entry) => (entry.isIntersecting ? ends.add(entry.target) : ends.delete(entry.target)));
    update();
  });
  document.querySelectorAll("footer, [data-sg-cta-end]").forEach((end) => away.observe(end));

  onHeading((heading) => {
    if (heading) tucked = heading === "down";
    update();
  });
  addEventListener("resize", update, { passive: true });
  document.addEventListener("focusin", update);
  document.addEventListener("focusout", () => requestAnimationFrame(update));
}
