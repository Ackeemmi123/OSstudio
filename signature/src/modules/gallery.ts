/**
 * Gallery: a row of pictures that scrolls sideways. It is a native scroller
 * with snap points, so touch, trackpad, keyboard (arrow keys once focused)
 * and screen readers all work without any script. The engine adds what a
 * mouse lacks: drag to throw it, with weight, and buttons for one picture at
 * a time, plus a progress line and a counter. The pictures drift inside their
 * frames as they pass (CSS scroll-driven animation, see engine.css).
 *
 * Markup: <section data-sg="gallery">
 *           <div data-sg-controls hidden><button data-sg-prev>…</button><button data-sg-next>…</button></div>
 *           <ul data-sg-track tabindex="0" aria-label="…" data-lenis-prevent-horizontal> <li data-sg-slide>…</li> … </ul>
 *           <div data-sg-progress hidden><span></span></div> <span data-sg-count hidden></span>
 *         </section>
 */

/** How far a throw carries: the release speed (px/ms) times this, in px. */
const THROW = 260;

export function mountGallery(root: HTMLElement): void {
  const track = root.querySelector<HTMLElement>("[data-sg-track]");
  const slides = [...root.querySelectorAll<HTMLElement>("[data-sg-slide]")];
  if (!track || slides.length < 2 || root.classList.contains("is-ready")) return;
  const prev = root.querySelector<HTMLButtonElement>("[data-sg-prev]");
  const next = root.querySelector<HTMLButtonElement>("[data-sg-next]");
  const progress = root.querySelector<HTMLElement>("[data-sg-progress]");
  const count = root.querySelector<HTMLElement>("[data-sg-count]");
  root.querySelectorAll<HTMLElement>("[data-sg-controls], [data-sg-progress], [data-sg-count]").forEach((part) => (part.hidden = false));
  root.classList.add("is-ready");

  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const behavior = (): ScrollBehavior => (reduced.matches ? "instant" : "smooth");
  const max = () => Math.max(0, track.scrollWidth - track.clientWidth);
  // Where each picture snaps to: its left edge, less the track's own padding.
  const stops = () => {
    const inset = Number.parseFloat(getComputedStyle(track).scrollPaddingInlineStart) || 0;
    return slides.map((slide) => Math.min(max(), Math.max(0, slide.offsetLeft - track.offsetLeft - inset)));
  };
  const nearest = (left: number) => {
    const points = stops();
    let best = 0;
    points.forEach((point, index) => Math.abs(point - left) < Math.abs(points[best] - left) && (best = index));
    return best;
  };
  const go = (index: number) => {
    const points = stops();
    track.scrollTo({ left: points[Math.max(0, Math.min(points.length - 1, index))], behavior: behavior() });
  };

  // Progress, counter and buttons follow the scroll, once per frame at most.
  let queued = false;
  const paint = () => {
    queued = false;
    const done = max() ? track.scrollLeft / max() : 0;
    progress?.style.setProperty("--sg-progress", done.toFixed(4));
    const at = track.scrollLeft >= max() - 2 ? slides.length - 1 : nearest(track.scrollLeft);
    if (count) count.textContent = `${String(at + 1).padStart(2, "0")} / ${String(slides.length).padStart(2, "0")}`;
    prev?.setAttribute("aria-disabled", String(track.scrollLeft <= 2));
    next?.setAttribute("aria-disabled", String(track.scrollLeft >= max() - 2));
  };
  const onScroll = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(paint);
  };
  track.addEventListener("scroll", onScroll, { passive: true });
  new ResizeObserver(onScroll).observe(track);
  paint();

  const step = (direction: 1 | -1) => {
    const points = stops();
    const here = nearest(track.scrollLeft);
    // From between two pictures, the first press goes to the next one in that direction.
    const target = direction > 0 ? (points[here] > track.scrollLeft + 2 ? here : here + 1) : points[here] < track.scrollLeft - 2 ? here : here - 1;
    go(target);
  };
  prev?.addEventListener("click", () => step(-1));
  next?.addEventListener("click", () => step(1));

  // Mouse drag: the row follows the hand, and a throw carries on to the picture it would reach.
  let dragging = false;
  let moved = 0;
  let startX = 0;
  let startLeft = 0;
  let samples: Array<[number, number]> = [];
  const down = (event: PointerEvent) => {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    dragging = true;
    moved = 0;
    startX = event.clientX;
    startLeft = track.scrollLeft;
    samples = [[event.timeStamp, event.clientX]];
  };
  const drag = (event: PointerEvent) => {
    if (!dragging) return;
    const distance = event.clientX - startX;
    if (!moved && Math.abs(distance) < 4) return;
    if (!moved) {
      track.setPointerCapture(event.pointerId);
      root.classList.add("is-dragging");
    }
    moved = Math.abs(distance);
    track.scrollLeft = startLeft - distance;
    samples.push([event.timeStamp, event.clientX]);
    if (samples.length > 6) samples.shift();
  };
  const up = (event: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    if (!moved) return;
    if (track.hasPointerCapture(event.pointerId)) track.releasePointerCapture(event.pointerId);
    const [first, last] = [samples[0], samples[samples.length - 1]];
    const speed = last[0] > first[0] && event.timeStamp - last[0] < 80 ? (last[1] - first[1]) / (last[0] - first[0]) : 0;
    // Snapping stays off until the throw has landed, or the browser would snap it short.
    go(nearest(track.scrollLeft - speed * THROW));
    const land = () => {
      clearTimeout(fallback);
      root.classList.remove("is-dragging");
    };
    const fallback = setTimeout(land, 900);
    track.addEventListener("scrollend", land, { once: true });
  };
  track.addEventListener("pointerdown", down);
  track.addEventListener("pointermove", drag);
  track.addEventListener("pointerup", up);
  track.addEventListener("pointercancel", up);
  // A drag is not a click on whatever it ended over, and pictures are not dragged out of the page.
  track.addEventListener("click", (event) => moved > 4 && event.preventDefault(), true);
  track.addEventListener("dragstart", (event) => event.preventDefault());
}
