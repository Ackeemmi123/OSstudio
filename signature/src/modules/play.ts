/**
 * Shapes you can play with (`data-sg="play"`). Every toy sits on a spring
 * fastened to its place in the drawing: the pointer pushes it aside as it
 * passes, a drag pulls it away, and on release it swings back and settles. A
 * tap gives it a nudge. Toys with eyes look at the pointer.
 *
 * The drawing is the design: without JavaScript or with reduced motion the
 * toys simply sit where they were drawn. They are decoration, so the stage is
 * hidden from screen readers and nothing here needs the keyboard.
 *
 * Markup: <div data-sg="play" aria-hidden="true">
 *           <span data-sg-toy><svg>…</svg><span data-sg-eyes>…</span></span></div>
 * The script writes only `transform` on each toy, and `--ex`/`--ey` (−1…1) on
 * each pair of eyes. It rests when nothing moves and when the stage is off screen.
 */
import { whenMotion } from "../engine/motion";

interface Toy {
  element: HTMLElement;
  eyes: HTMLElement | null;
  /** Home centre inside the stage, and half its size. */
  hx: number;
  hy: number;
  half: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  spin: number;
}

const STIFFNESS = 70;
const DAMPING = 7.5;

export function mountPlay(root: HTMLElement): void {
  const elements = [...root.querySelectorAll<HTMLElement>("[data-sg-toy]")];
  if (!elements.length) return;

  whenMotion(() => {
    const toys: Toy[] = elements.map((element) => ({ element, eyes: element.querySelector<HTMLElement>("[data-sg-eyes]"), hx: 0, hy: 0, half: 0, x: 0, y: 0, vx: 0, vy: 0, angle: 0, spin: 0 }));
    let box = root.getBoundingClientRect();
    let pointer: { x: number; y: number; mouse: boolean } | null = null;
    let held: { toy: Toy; dx: number; dy: number; moved: number } | null = null;
    let frame = 0;
    let last = 0;
    let visible = false;

    const measure = () => {
      box = root.getBoundingClientRect();
      for (const toy of toys) {
        // Layout position, so a toy that is mid-swing still measures its home.
        let x = toy.element.offsetWidth / 2;
        let y = toy.element.offsetHeight / 2;
        for (let node: HTMLElement | null = toy.element; node && node !== root; node = node.offsetParent as HTMLElement | null) {
          x += node.offsetLeft;
          y += node.offsetTop;
        }
        toy.hx = x;
        toy.hy = y;
        toy.half = toy.element.offsetWidth / 2;
      }
    };

    const tick = (now: number) => {
      frame = 0;
      const dt = Math.min(0.032, (now - last) / 1000 || 0.016);
      last = now;
      box = root.getBoundingClientRect();
      let awake = false;
      for (const toy of toys) {
        if (held?.toy === toy && pointer) {
          const tx = pointer.x - box.left - held.dx - toy.hx;
          const ty = pointer.y - box.top - held.dy - toy.hy;
          toy.vx = (tx - toy.x) / dt;
          toy.vy = (ty - toy.y) / dt;
          toy.x = tx;
          toy.y = ty;
        } else {
          let fx = -STIFFNESS * toy.x - DAMPING * toy.vx;
          let fy = -STIFFNESS * toy.y - DAMPING * toy.vy;
          if (pointer?.mouse && !held) {
            // The pointer pushes a toy aside as it comes close.
            const dx = toy.hx + toy.x - (pointer.x - box.left);
            const dy = toy.hy + toy.y - (pointer.y - box.top);
            const reach = toy.half + 70;
            const distance = Math.hypot(dx, dy) || 1;
            if (distance < reach) {
              const push = (1 - distance / reach) * 2600;
              fx += (dx / distance) * push;
              fy += (dy / distance) * push;
            }
          }
          toy.vx += fx * dt;
          toy.vy += fy * dt;
          toy.x += toy.vx * dt;
          toy.y += toy.vy * dt;
        }
        // It leans the way it travels, and swings back upright.
        toy.spin += (-90 * toy.angle - 9 * toy.spin + toy.vx * 0.5) * dt;
        toy.angle += toy.spin * dt;
        const energy = Math.abs(toy.x) + Math.abs(toy.y) + Math.abs(toy.angle) + (Math.abs(toy.vx) + Math.abs(toy.vy) + Math.abs(toy.spin)) * 0.05;
        if (energy < 0.08 && held?.toy !== toy) {
          toy.x = toy.y = toy.vx = toy.vy = toy.angle = toy.spin = 0;
          toy.element.style.transform = "";
        } else {
          awake = true;
          toy.element.style.transform = `translate3d(${toy.x.toFixed(1)}px,${toy.y.toFixed(1)}px,0) rotate(${toy.angle.toFixed(2)}deg)`;
        }
        if (toy.eyes && pointer) {
          const ex = pointer.x - box.left - toy.hx - toy.x;
          const ey = pointer.y - box.top - toy.hy - toy.y;
          const far = Math.hypot(ex, ey) || 1;
          const look = Math.min(1, far / 160);
          toy.eyes.style.setProperty("--ex", ((ex / far) * look).toFixed(2));
          toy.eyes.style.setProperty("--ey", ((ey / far) * look).toFixed(2));
        }
      }
      if (visible && (awake || held || pointer?.mouse)) wake();
    };
    const wake = () => {
      if (!frame && visible) frame = requestAnimationFrame(tick);
    };

    const toyOf = (target: EventTarget | null) => toys.find((toy) => toy.element.contains(target as Node));
    const down = (event: PointerEvent) => {
      const toy = toyOf(event.target);
      if (!toy || event.button !== 0) return;
      measure();
      pointer = { x: event.clientX, y: event.clientY, mouse: event.pointerType !== "touch" };
      held = { toy, dx: event.clientX - box.left - toy.hx - toy.x, dy: event.clientY - box.top - toy.hy - toy.y, moved: 0 };
      toy.element.setPointerCapture(event.pointerId);
      root.classList.add("is-held");
      toy.element.classList.add("is-held");
      last = performance.now();
      wake();
    };
    const move = (event: PointerEvent) => {
      if (held) held.moved += Math.abs(event.movementX) + Math.abs(event.movementY);
      else if (event.pointerType === "touch") return;
      pointer = { x: event.clientX, y: event.clientY, mouse: event.pointerType !== "touch" };
      if (!frame) last = performance.now();
      wake();
    };
    const up = () => {
      if (!held) return;
      const { toy, moved } = held;
      // A tap, not a drag: a nudge and a spin.
      if (moved < 6) {
        toy.vy -= 520;
        toy.spin += (toy.hx > box.width / 2 ? -1 : 1) * 420;
      }
      toy.element.classList.remove("is-held");
      root.classList.remove("is-held");
      held = null;
      if (!pointer?.mouse) pointer = null;
      wake();
    };
    const leave = () => {
      if (held) return;
      pointer = null;
      for (const toy of toys) {
        toy.eyes?.style.removeProperty("--ex");
        toy.eyes?.style.removeProperty("--ey");
      }
    };

    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(root);
    const watcher = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) {
        last = performance.now();
        wake();
      }
    });
    watcher.observe(root);
    root.addEventListener("pointerdown", down);
    root.addEventListener("pointermove", move, { passive: true });
    root.addEventListener("pointerup", up);
    root.addEventListener("pointercancel", up);
    root.addEventListener("pointerleave", leave);
    root.classList.add("is-live");

    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      watcher.disconnect();
      root.removeEventListener("pointerdown", down);
      root.removeEventListener("pointermove", move);
      root.removeEventListener("pointerup", up);
      root.removeEventListener("pointercancel", up);
      root.removeEventListener("pointerleave", leave);
      root.classList.remove("is-live", "is-held");
      for (const toy of toys) {
        toy.element.style.transform = "";
        toy.element.classList.remove("is-held");
        toy.eyes?.style.removeProperty("--ex");
        toy.eyes?.style.removeProperty("--ey");
      }
    };
  });
}
