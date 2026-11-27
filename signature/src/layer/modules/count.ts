/**
 * A figure in the site's own text that counts up to its value as it comes
 * into view. The engine's `count` needs its own markup and the motion
 * engine; this one works on whatever element the map points at, in about
 * half a kilobyte.
 *
 * An element counts when its text holds exactly one whole number ("1998",
 * "25 vuotta", "yli 1 200 asiakasta"); a price, a decimal, "24/7" or opening
 * hours are left alone. While it counts,
 * the digits sit in a box exactly as wide as the final number, so nothing
 * around them moves, and screen readers get the real value once from hidden
 * text. When it lands, the element is put back exactly as it was written.
 */
export function mountCount(element: HTMLElement, duration: number): void {
  const html = document.documentElement;
  if (!duration || !html.classList.contains("sgl")) return;
  // One whole number and no other: "24/7", "7.30–17" and "89,50 €" are not figures that count.
  const NUMBER = /\d+(?:[   ]\d{3})*(?:[.,]\d+)?/g;
  const all = (element.textContent ?? "").match(NUMBER) ?? [];
  if (all.length !== 1 || /[.,]/.test(all[0])) return;
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode() as Text | null;
  let match: RegExpExecArray | null = null;
  for (; node; node = walker.nextNode() as Text | null) {
    match = new RegExp(NUMBER.source).exec(node.data);
    if (match) break;
  }
  if (!node || !match || match[0] !== all[0]) return;
  // Thousands written apart ("1 200") keep their own separator while counting.
  const gap = /\D/.exec(match[0])?.[0] ?? "";
  const write = (value: number) => (gap ? String(value).replace(/\B(?=(\d{3})+$)/g, gap) : String(value));
  const to = Number(match[0].replace(/\D/g, ""));
  const range = document.createRange();
  range.setStart(node, match.index);
  range.setEnd(node, match.index + match[0].length);
  const boxes = range.getClientRects();
  if (boxes.length !== 1 || !to) return;

  const original = node;
  const text = node.data;
  const box = document.createElement("span");
  box.className = "sgl-n";
  box.style.width = `${boxes[0].width}px`;
  const said = document.createElement("span");
  said.className = "sg-sr";
  said.textContent = match[0];
  const digits = document.createElement("span");
  digits.setAttribute("aria-hidden", "true");
  box.append(said, digits);
  // A year counts its last decades, anything else from nothing.
  const from = to > 1200 && to < 2200 ? to - 40 : 0;
  digits.textContent = write(from);
  const pieces = [document.createTextNode(text.slice(0, match.index)), box, document.createTextNode(text.slice(match.index + match[0].length))];
  node.replaceWith(...pieces);

  const restore = () => {
    if (!box.parentNode) return;
    box.replaceWith(original);
    pieces[0].remove();
    pieces[2].remove();
  };
  let begin = 0;
  const tick = (now: number) => {
    begin ||= now;
    const t = Math.min(1, (now - begin) / duration);
    if (t >= 1 || !html.classList.contains("sgl")) return restore();
    // A long ease-out, like a needle coming to rest.
    digits.textContent = write(Math.round(from + (to - from) * (1 - Math.pow(2, -10 * t))));
    requestAnimationFrame(tick);
  };
  new IntersectionObserver(
    ([entry], watcher) => {
      if (!entry.isIntersecting) return;
      watcher.disconnect();
      requestAnimationFrame(tick);
    },
    { rootMargin: "0px 0px -12% 0px" },
  ).observe(element);
}
