/**
 * A cursor companion and magnetic buttons, for mouse and trackpad only.
 *
 * The system cursor always stays: the companion is a soft ring that follows it
 * with a little weight, grows over things you can click, and can carry a word
 * (`data-cursor-label="Öppna"`). Elements with `data-sg-magnetic` lean toward
 * the pointer when it comes close. Nothing of this exists for touch, for
 * keyboard use, or with reduced motion.
 */
import { gsap, whenMotion } from "../engine/motion";

const CLICKABLE = "a, button, [data-cursor-label], [data-sg-magnetic]";

export function mountCursor(): void {
  whenMotion(() => {
    const ring = document.createElement("div");
    ring.className = "sg-cursor";
    ring.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.className = "sg-cursor-label";
    ring.append(label);
    document.body.append(ring);

    const x = gsap.quickTo(ring, "x", { duration: 0.45, ease: "power3.out" });
    const y = gsap.quickTo(ring, "y", { duration: 0.45, ease: "power3.out" });
    let shown = false;

    const move = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
      if (!shown) {
        gsap.set(ring, { x: event.clientX, y: event.clientY });
        ring.classList.add("is-shown");
        shown = true;
      }
      x(event.clientX);
      y(event.clientY);
    };
    const over = (event: PointerEvent) => {
      const target = (event.target as Element | null)?.closest<HTMLElement>(CLICKABLE);
      ring.classList.toggle("is-over", Boolean(target));
      const word = target?.dataset.cursorLabel ?? "";
      label.textContent = word;
      ring.classList.toggle("has-label", word !== "");
    };
    const leave = () => {
      ring.classList.remove("is-shown");
      shown = false;
    };

    // Magnetic: lean toward the pointer within a margin around the element, spring back on leaving.
    const magnets = [...document.querySelectorAll<HTMLElement>("[data-sg-magnetic]")].map((element) => {
      const strength = Number(element.dataset.sgMagnetic || 0.35);
      const mx = gsap.quickTo(element, "x", { duration: 0.6, ease: "power3.out" });
      const my = gsap.quickTo(element, "y", { duration: 0.6, ease: "power3.out" });
      return { element, strength, mx, my, near: false };
    });
    const pull = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
      for (const magnet of magnets) {
        const box = magnet.element.getBoundingClientRect();
        const margin = Math.min(80, box.height);
        const inside = event.clientX > box.left - margin && event.clientX < box.right + margin && event.clientY > box.top - margin && event.clientY < box.bottom + margin;
        if (inside) {
          magnet.near = true;
          // A lean, not a leap: never further than a little, so neighbours never collide.
          const reach = Math.min(14, box.height * 0.3);
          const clamp = (value: number) => Math.max(-reach, Math.min(reach, value));
          magnet.mx(clamp((event.clientX - (box.left + box.width / 2)) * magnet.strength));
          magnet.my(clamp((event.clientY - (box.top + box.height / 2)) * magnet.strength));
        } else if (magnet.near) {
          magnet.near = false;
          gsap.to(magnet.element, { x: 0, y: 0, duration: 0.9, ease: "elastic.out(1, 0.45)" });
        }
      }
    };

    addEventListener("pointermove", move, { passive: true });
    addEventListener("pointermove", pull, { passive: true });
    document.addEventListener("pointerover", over, { passive: true });
    document.documentElement.addEventListener("pointerleave", leave);
    document.documentElement.classList.add("sg-has-cursor");

    return () => {
      removeEventListener("pointermove", move);
      removeEventListener("pointermove", pull);
      document.removeEventListener("pointerover", over);
      document.documentElement.removeEventListener("pointerleave", leave);
      document.documentElement.classList.remove("sg-has-cursor");
      magnets.forEach(({ element }) => gsap.set(element, { clearProps: "transform" }));
      ring.remove();
    };
  }, "(pointer: fine)");
}
