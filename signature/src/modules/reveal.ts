/**
 * Image effect: a picture that arrives behind an organic, noisy edge as it
 * scrolls into view, and under a mouse swells softly like a lens, with a trace
 * of colour split at its edge. Drawn by a shader over the real <img>, which
 * stays in the page for screen readers, search and every visitor without
 * WebGL or with reduced motion: they simply see the picture.
 *
 * A picture that may have been seen is never taken away again. The <img>
 * stays as it is until a shader is known to work (one already drawing on the
 * page, or this picture's own stage); without one it never changes. Only then,
 * and only if the picture has not been on screen and is still below it, is it
 * held back to arrive: its frame says `data-sg-picture="waiting"`, then
 * "arriving", then "shown". Any other picture is "shown" at once and does not
 * arrive. Once shown, the <img> stays visible under the shader's copy, so a
 * frame the shader has not drawn yet shows the picture, never an empty frame.
 *
 * Markup: <div data-sg="reveal"><img src alt width height><canvas data-sg-canvas aria-hidden="true"></canvas></div>
 * The element is the frame: a caption goes outside it. The image must be from
 * the same origin, so the shader may read it.
 */
import type { Capabilities } from "../engine/capabilities";
import { createShaderStage, type ShaderStage } from "../engine/shader-stage";
import { gsap, ScrollTrigger, whenMotion } from "../engine/motion";
import { NOISE } from "./noise";

const FRAGMENT = /* glsl */ `
uniform float uTime;
uniform vec2 uResolution;
uniform sampler2D uImage;
uniform vec2 uImageSize;
uniform float uReveal;
uniform vec2 uPointer;
uniform float uHover;
varying vec2 vUv;
${NOISE}
// Fill the frame like CSS object-fit: cover.
vec2 cover(vec2 uv) {
  float frame = uResolution.x / max(uResolution.y, 1.0);
  float image = uImageSize.x / max(uImageSize.y, 1.0);
  vec2 scale = frame > image ? vec2(1.0, image / frame) : vec2(frame / image, 1.0);
  return (uv - 0.5) * scale + 0.5;
}
void main() {
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  vec2 uv = vUv;

  // The lens: a soft swell around the pointer, strongest at its centre.
  vec2 toPointer = (uv - uPointer) * vec2(aspect, 1.0);
  float lens = smoothstep(0.38, 0.0, length(toPointer)) * uHover;
  vec2 swell = -toPointer / vec2(aspect, 1.0) * lens * 0.09;

  // The reveal: an edge that rises from the bottom, roughened by noise.
  float grain = snoise(vUv * vec2(aspect, 1.0) * 2.4 + uTime * 0.06) * 0.5 + 0.5;
  float edge = vUv.y * 0.78 + grain * 0.22;
  float front = uReveal * 1.15;
  float shown = smoothstep(edge - 0.05, edge, front);
  // Just behind the edge the picture is still settling: it rises the last little way.
  float settling = 1.0 - smoothstep(0.0, 0.2, front - edge);

  vec2 st = cover(uv + swell + vec2(0.0, settling * 0.025));
  // A slight zoom that eases off as the picture arrives.
  st = (st - 0.5) / (1.0 + 0.06 * (1.0 - uReveal)) + 0.5;
  float split = (lens * 0.006) + settling * 0.004;
  vec3 colour = vec3(
    texture2D(uImage, st + vec2(split, 0.0)).r,
    texture2D(uImage, st).g,
    texture2D(uImage, st - vec2(split, 0.0)).b
  );
  gl_FragColor = vec4(colour * shown, shown);
}`;

export function mountReveal(frame: HTMLElement, capabilities: Capabilities, allowSoftware: boolean): void {
  const image = frame.querySelector("img");
  const canvas = frame.querySelector<HTMLCanvasElement>("[data-sg-canvas]");
  if (!image || !canvas || capabilities.saveData) return;

  whenMotion(() => {
    let stage: ShaderStage | null = null;
    let trigger: ScrollTrigger | null = null;
    let cancelled = false;
    let live = false;
    let seen = false;
    let giveUp = 0;
    const state = { reveal: 0, hover: 0 };
    const pointer = { x: 0.5, y: 0.5 };

    // From here the picture stays: no arrival can start over it.
    const show = () => {
      window.clearTimeout(giveUp);
      gsap.killTweensOf(state, "reveal");
      state.reveal = 1;
      frame.dataset.sgPicture = "shown";
    };
    const arrive = () => {
      if (frame.dataset.sgPicture !== "waiting") return;
      frame.dataset.sgPicture = "arriving";
      gsap.to(state, { reveal: 1, duration: 1.8, ease: "power2.inOut", onComplete: show });
    };
    const held = () => frame.dataset.sgPicture === "waiting" || frame.dataset.sgPicture === "arriving";
    // Held back only if it cannot have been seen: never on screen, still below it, not flown in from the previous
    // page by a shared view transition. It then arrives once, as it comes into view.
    const unseen = () =>
      !seen &&
      frame.getBoundingClientRect().top >= window.innerHeight &&
      !(document.documentElement.dataset.sgArrived === "transition" && getComputedStyle(frame).viewTransitionName !== "none");
    const holdBack = () => {
      frame.dataset.sgPicture = "waiting";
      trigger = ScrollTrigger.create({ trigger: frame, start: "top 85%", once: true, onEnter: arrive });
    };
    // A shader already drawing on the page shows the hardware is good: the picture can wait from now, early
    // enough to arrive. Otherwise it waits for its own stage to start.
    if ((document.documentElement.dataset.sgWebgl === "on" || document.querySelector('[data-sg-state="webgl"]')) && unseen()) holdBack();
    // Notes when the picture has been on screen. One held back is not kept waiting there for a shader that has
    // not drawn yet: it shows as it is.
    const watcher = new IntersectionObserver(([entry]) => {
      window.clearTimeout(giveUp);
      if (entry.isIntersecting) seen = true;
      if (entry.isIntersecting && !live && held()) giveUp = window.setTimeout(show, 800);
    });
    watcher.observe(frame);

    const start = async () => {
      if (cancelled) return;
      const started = await createShaderStage(canvas, {
        fragment: FRAGMENT,
        allowSoftware,
        transparent: true,
        image,
        maxPixelRatio: capabilities.lowPower ? 1 : 1.5,
        uniforms: { uTime: 0, uResolution: [1, 1], uReveal: state.reveal, uPointer: [0.5, 0.5], uHover: 0 },
        frame: (_time, _delta, set) => {
          set("uReveal", state.reveal);
          set("uHover", state.hover);
          set("uPointer", [pointer.x, pointer.y]);
        },
        shown: () => {
          live = true;
          window.clearTimeout(giveUp);
          frame.classList.add("is-live");
        },
        lost: () => {
          live = false;
          frame.classList.remove("is-live");
          frame.dataset.sgState = "still";
          show();
        },
      });
      if (cancelled) return started?.dispose();
      stage = started;
      frame.dataset.sgState = stage ? "webgl" : "still";
      if (!stage) return show();
      if (frame.dataset.sgPicture) return;
      if (unseen()) holdBack();
      else show();
    };
    const onLoad = () => void start();
    if (image.complete && image.naturalWidth) void start();
    else image.addEventListener("load", onLoad, { once: true });

    // The lens follows the mouse with a little weight.
    const toX = gsap.quickTo(pointer, "x", { duration: 0.5, ease: "power3.out" });
    const toY = gsap.quickTo(pointer, "y", { duration: 0.5, ease: "power3.out" });
    const move = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const box = frame.getBoundingClientRect();
      toX((event.clientX - box.left) / box.width);
      toY(1 - (event.clientY - box.top) / box.height);
    };
    const enter = (event: PointerEvent) => {
      if (event.pointerType === "mouse") gsap.to(state, { hover: 1, duration: 0.6, ease: "power2.out" });
    };
    const leave = () => void gsap.to(state, { hover: 0, duration: 0.8, ease: "power2.out" });
    frame.addEventListener("pointermove", move, { passive: true });
    frame.addEventListener("pointerenter", enter);
    frame.addEventListener("pointerleave", leave);

    return () => {
      cancelled = true;
      window.clearTimeout(giveUp);
      watcher.disconnect();
      image.removeEventListener("load", onLoad);
      frame.removeEventListener("pointermove", move);
      frame.removeEventListener("pointerenter", enter);
      frame.removeEventListener("pointerleave", leave);
      trigger?.kill();
      gsap.killTweensOf(state);
      gsap.killTweensOf(pointer);
      stage?.dispose();
      stage = null;
      frame.classList.remove("is-live");
      frame.dataset.sgState = "still";
      delete frame.dataset.sgPicture;
    };
  });
}
