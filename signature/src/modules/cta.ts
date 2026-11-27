/**
 * Call to action (`data-sg="cta"`): the page's own link ("Boka tid", "Boka
 * bord"), written where it belongs in the page. Without JavaScript it is just
 * that link. With it, while the link's own place is out of view and the
 * visitor has scrolled past the first screen, the same link floats as a pill
 * at the bottom centre of the screen. Its place keeps its height meanwhile, so
 * nothing moves.
 *
 * The pill steps out of the way while reading down and comes back at the
 * first move up, like the menu button. Nearing its place it comes out to meet
 * it, even reading down, and when the place reaches the pill's own line the
 * pill glides into it; reading back up past the place, it glides out again.
 * Both ways it moves from where it was seen, so it never jumps or cuts.
 *
 * It gives way while the page's footer, or anything marked `data-sg-cta-end`
 * (the page's own closing call to action), is in view, so there are never
 * two. It never covers the focused element: while it shows, the page keeps
 * room for it at the bottom (`scroll-padding-bottom`, which focus and anchors
 * scroll by), and it stays away while the focused element is in that room.
 * Focused itself, it always shows. With reduced motion it fades instead of
 * sliding, and changes place without gliding (engine.css).
 *
 * Markup: <p data-sg="cta"><a href="…">Boka tid</a></p>
 */
import { onHeading } from "../engine/heading";

/** The glide between the place and the float: quick out, soft landing. */
const GLIDE: KeyframeAnimationOptions = { duration: 650, easing: "cubic-bezier(0.16, 1, 0.3, 1)" };

export function mountCta(root: HTMLElement): void {
  const link = root.querySelector<HTMLAnchorElement>("a[href]");
  if (!link || root.classList.contains("is-ready")) return;
  root.classList.add("is-ready");
  const html = document.documentElement;
  const motion = matchMedia("(prefers-reduced-motion: no-preference)");
  let near = false;
  let floating = false;
  let tucked = false;
  let frame = 0;
  // The floating pill's distance from the foot of the screen, read once it floats.
  let bottom = 16;
  const ends = new Set<Element>();

  /** Where the floating pill's top edge sits: its place docks it on reaching this line. */
  const line = () => innerHeight - bottom - link.offsetHeight;
  /** The room the page keeps for the pill while it shows. */
  const room = () => link.offsetHeight + bottom + 12;

  /** Whether the focused element (other than the pill) lies where the pill would show. */
  const inRoom = () => {
    const at = document.activeElement;
    if (!at || at === link || at === document.body) return false;
    const box = at.getBoundingClientRect();
    return box.bottom > innerHeight - room() && box.top < innerHeight;
  };

  /** Ends the glide under way at once, if any. */
  let settle: (() => void) | null = null;

  /**
   * Moves the link between its place and the float. The link itself changes
   * place hidden (unless it has focus, which only a key press moves), so the
   * browser never sees a visible box jump: no layout shift. Seen on both sides
   * of the move, a stand-in, a copy no one can reach, glides from where it was
   * to where it now is and hands over to the link; seen only after, the link
   * fades in at its new place; seen after by no one, it simply moves.
   */
  const setFloating = (next: boolean, shown: boolean) => {
    settle?.();
    const onScreen = (box: DOMRect) => box.bottom > 0 && box.top < innerHeight;
    const focused = document.activeElement === link;
    const from = link.getBoundingClientRect();
    const seenBefore = (!floating || root.classList.contains("is-shown")) && onScreen(from);
    const shadow = getComputedStyle(link).boxShadow;
    if (!focused) link.style.opacity = "0";
    // Leaving its place, the place keeps its height; coming back, the link fills it again.
    root.style.minHeight = next ? `${root.offsetHeight}px` : "";
    link.style.transition = "none";
    root.classList.toggle("is-floating", next);
    root.classList.toggle("is-shown", shown);
    floating = next;
    if (next) bottom = Number.parseFloat(getComputedStyle(link).bottom) || bottom;
    const to = link.getBoundingClientRect();
    link.style.transition = "";
    if (focused || !((!next || shown) && onScreen(to))) {
      link.style.opacity = "";
      return;
    }

    const dx = from.left - to.left;
    const dy = from.top - to.top;
    if (!seenBefore || !motion.matches || Math.abs(dy) > innerHeight * 0.4) {
      // On the next frame it shows at its new place: with a short fade, or at once with reduced motion.
      const frame = requestAnimationFrame(() => {
        settle?.();
        if (motion.matches) link.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250, easing: "ease-out" });
      });
      settle = () => {
        cancelAnimationFrame(frame);
        link.style.opacity = "";
        settle = null;
      };
      return;
    }
    // The stand-in: floating, it is fixed where the pill now rests; docking, it sits in the place and scrolls with it.
    const ghost = document.createElement("span");
    ghost.setAttribute("aria-hidden", "true");
    ghost.inert = true;
    const copy = link.cloneNode(true) as HTMLElement;
    copy.removeAttribute("style");
    Object.assign(copy.style, { margin: "0", width: "100%", height: "100%", boxShadow: getComputedStyle(link).boxShadow });
    ghost.append(copy);
    const box = root.getBoundingClientRect();
    if (!next) root.style.position = "relative";
    Object.assign(ghost.style, {
      position: next ? "fixed" : "absolute",
      left: `${next ? to.left : to.left - box.left}px`,
      top: `${next ? to.top : to.top - box.top}px`,
      width: `${to.width}px`,
      height: `${to.height}px`,
      zIndex: "8",
      pointerEvents: "none",
    });
    root.append(ghost);
    const glide = ghost.animate([{ translate: `${dx}px ${dy}px` }, { translate: "0px 0px" }], GLIDE);
    copy.animate([{ boxShadow: shadow }, { boxShadow: copy.style.boxShadow }], GLIDE);
    const done = () => {
      glide.cancel();
      ghost.remove();
      root.style.position = "";
      link.style.opacity = "";
      settle = null;
    };
    settle = done;
    glide.finished.then(
      () => settle === done && done(),
      () => undefined,
    );
  };
  // Never let a key press find the link hidden mid-glide.
  document.addEventListener("keydown", () => settle?.(), true);

  const update = () => {
    frame = 0;
    let home = false;
    let meeting = false;
    if (near) {
      const place = root.getBoundingClientRect();
      const at = line();
      // A few pixels' grace before it leaves again, so it never flickers at the line.
      home = place.bottom > 0 && place.top <= at + (floating ? 0 : 8);
      // Its place is coming up from below: the pill comes out to meet it.
      meeting = !home && place.top < at + innerHeight * 0.6 && (scrollY > innerHeight || place.top < innerHeight);
    }
    const shown = !home && (document.activeElement === link || (!ends.size && !inRoom() && (meeting || (scrollY > innerHeight && !tucked))));
    if (home === floating) setFloating(!home, shown);
    else root.classList.toggle("is-shown", shown);
    html.style.scrollPaddingBottom = shown ? `${room()}px` : "";
  };
  const schedule = () => {
    frame ||= requestAnimationFrame(update);
  };

  // Near its place (from a screen below until it has left the top), its exact position is followed on every scroll.
  new IntersectionObserver(
    ([entry]) => {
      near = entry.isIntersecting;
      if (near) addEventListener("scroll", schedule, { passive: true });
      else removeEventListener("scroll", schedule);
      update();
    },
    { rootMargin: "0px 0px 100% 0px" },
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
  addEventListener("resize", schedule, { passive: true });
  document.addEventListener("focusin", update);
  document.addEventListener("focusout", () => requestAnimationFrame(update));
}
