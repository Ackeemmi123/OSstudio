/**
 * Reveal list: rows (services, cases, materials) whose picture appears under
 * the mouse and follows it with weight, leaning into the direction it is
 * pulled and straightening as it catches up. Moving to another row slides
 * that row's picture up over the last one.
 *
 * Each row carries its own small picture in the page. That is what every
 * visitor sees without a mouse, with reduced motion and without JavaScript;
 * engine.css hides it (from the first paint) only where this module takes
 * over: a fine pointer that can hover, and motion welcome. The picture is the
 * same file, so nothing extra is fetched for it.
 *
 * Markup: <section data-sg="reveal-list"> … <li data-sg-row> … <img data-sg-thumb src="…" alt="" /></li> … </section>
 */
import { gsap, whenMotion } from "../engine/motion";

const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));

export function mountRevealList(root: HTMLElement): void {
  const rows = [...root.querySelectorAll<HTMLElement>("[data-sg-row]")];
  if (!rows.length) return;

  whenMotion(() => {
    const float = document.createElement("div");
    float.className = "sg-reveal-float";
    float.setAttribute("aria-hidden", "true");
    const pictures = rows.map((row) => {
      const picture = document.createElement("img");
      picture.alt = "";
      picture.decoding = "async";
      picture.src = row.querySelector<HTMLImageElement>("[data-sg-thumb]")?.getAttribute("src") ?? "";
      float.append(picture);
      return picture;
    });
    root.append(float);
    root.classList.add("is-live");
    gsap.set(float, { xPercent: -50, yPercent: -50, autoAlpha: 0, scale: 0.6 });

    // Weight: the picture eases toward the pointer; the further behind it lags, the more it leans.
    const toX = gsap.quickTo(float, "x", { duration: 0.75, ease: "power3.out" });
    const toY = gsap.quickTo(float, "y", { duration: 0.75, ease: "power3.out" });
    const lean = gsap.quickSetter(float, "rotation", "deg");
    let targetX = 0;
    const tilt = () => lean(clamp((targetX - Number(gsap.getProperty(float, "x"))) * 0.045, 12));

    let active = -1;
    let shown = false;
    const show = (index: number, event: PointerEvent) => {
      if (index === active) return;
      const next = pictures[index];
      // Everything but the picture on show goes back below; the next one starts there and slides up over it.
      pictures.forEach((picture, at) => at !== active && picture.classList.remove("was-active"));
      void next.offsetWidth;
      pictures[active]?.classList.replace("is-active", "was-active");
      next.classList.add("is-active");
      active = index;
      targetX = event.clientX;
      if (shown) return;
      shown = true;
      // Appear where the pointer is, not fly in from wherever the picture was last.
      toX(event.clientX, event.clientX);
      toY(event.clientY, event.clientY);
      gsap.ticker.add(tilt);
      gsap.to(float, { autoAlpha: 1, scale: 1, duration: 0.6, ease: "expo.out", overwrite: "auto" });
    };
    const hide = () => {
      if (!shown) return;
      shown = false;
      pictures[active]?.classList.remove("is-active");
      active = -1;
      gsap.to(float, { autoAlpha: 0, scale: 0.6, duration: 0.35, ease: "power2.in", overwrite: "auto", onComplete: () => void gsap.ticker.remove(tilt) });
    };

    const over = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
      const row = (event.target as Element).closest<HTMLElement>("[data-sg-row]");
      if (row) show(rows.indexOf(row), event);
      else hide();
    };
    const move = (event: PointerEvent) => {
      if (!shown) return;
      targetX = event.clientX;
      toX(event.clientX);
      toY(event.clientY);
    };
    root.addEventListener("pointerover", over);
    root.addEventListener("pointermove", move, { passive: true });
    root.addEventListener("pointerleave", hide);

    return () => {
      root.removeEventListener("pointerover", over);
      root.removeEventListener("pointermove", move);
      root.removeEventListener("pointerleave", hide);
      gsap.ticker.remove(tilt);
      root.classList.remove("is-live");
      float.remove();
    };
  }, "(hover: hover) and (pointer: fine)");
}
