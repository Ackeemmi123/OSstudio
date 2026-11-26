/**
 * Ink field: a slow, flowing field of ink in the site's colours, drawn by a
 * shader, that the pointer stirs as it passes. It sits behind a hero and is
 * never the content: the page's still gradient stays underneath, so text is
 * readable before, during and without it.
 *
 * Plain WebGL through the engine's shader stage, about 4 KB: a flat field
 * needs no 3D library.
 *
 * Markup: <div data-sg="ink-field" data-colors="#151922 #4a5bb5 #879dc7 #c3bcf2 #c9d9f0">
 *           <canvas data-sg-canvas aria-hidden="true"></canvas>
 *         </div>
 */
import type { Capabilities } from "../engine/capabilities";
import { createShaderStage } from "../engine/shader-stage";
import { NOISE } from "./noise";

const FRAGMENT = /* glsl */ `
uniform float uTime;
uniform vec2 uResolution;
uniform vec2 uPointer;
uniform float uStir;
uniform float uOctaves;
uniform vec3 uInk;
uniform vec3 uDeep;
uniform vec3 uMid;
uniform vec3 uGlow;
uniform vec3 uLight;
varying vec2 vUv;
${NOISE}
float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  mat2 turn = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 6; i++) {
    if (float(i) >= uOctaves) break;
    value += amplitude * snoise(p);
    p = turn * p * 2.02;
    amplitude *= 0.5;
  }
  return value;
}
void main() {
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  vec2 scale = vec2(aspect, 1.0) * 0.95;
  vec2 p = (vUv - 0.5) * scale;
  vec2 pointer = (uPointer - 0.5) * scale;
  float t = uTime * 0.028;

  // The pointer stirs: a soft swirl around it that fades with distance.
  vec2 toPointer = p - pointer;
  float near = exp(-dot(toPointer, toPointer) * 5.0);
  vec2 swirl = vec2(-toPointer.y, toPointer.x) * uStir * near * 0.9;

  // Two gentle rounds of domain warping: large, slow shapes, like ink settling in water.
  vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, 1.3) - t));
  vec2 r = vec2(fbm(p + 1.5 * q + vec2(1.7, 9.2) + 0.6 * t + swirl), fbm(p + 1.5 * q + vec2(8.3, 2.8) - 0.5 * t - swirl));
  float v = fbm(p + 1.7 * r) * 0.5 + 0.5;

  vec3 colour = uInk;
  colour = mix(colour, uDeep, smoothstep(0.38, 0.78, v));
  colour = mix(colour, uMid, smoothstep(0.58, 0.92, v) * 0.55);
  colour = mix(colour, uGlow, smoothstep(0.45, 0.95, length(r)) * smoothstep(0.45, 0.8, v) * 0.5);
  colour = mix(colour, uLight, smoothstep(0.82, 1.0, v) * 0.25);

  // Darker toward the lower left, where the headline sits, so text keeps its contrast.
  float open = smoothstep(1.25, 0.1, length((vUv - vec2(0.7, 0.72)) * vec2(1.1, 1.0)));
  colour = mix(uInk, colour, 0.22 + 0.78 * open);

  // A trace of grain so the gradients never band.
  float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  colour += (grain - 0.5) * (2.0 / 255.0);
  gl_FragColor = vec4(colour, 1.0);
}`;

const DEFAULT_COLOURS = ["#151922", "#4a5bb5", "#879dc7", "#c3bcf2", "#c9d9f0"];

/** A hex colour as linear RGB, which is what the shader mixes in. */
function linear(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  const channel = (byte: number) => {
    const c = byte / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return [channel((value >> 16) & 255), channel((value >> 8) & 255), channel(value & 255)];
}

export function mountInkField(root: HTMLElement, capabilities: Capabilities, allowSoftware = false): (() => void) | null {
  const canvas = root.querySelector<HTMLCanvasElement>("[data-sg-canvas]");
  if (!canvas) return null;
  const colours = (root.dataset.colors?.split(/\s+/).filter(Boolean) ?? []).concat(DEFAULT_COLOURS).slice(0, 5).map(linear);

  // The pointer is followed with a little weight, and stirs harder the faster it moves.
  const target = [0.7, 0.62];
  const pointer = [0.7, 0.62];
  let stir = 0;
  let stirred = 0;
  const onPointer = (event: PointerEvent) => {
    const box = canvas.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width;
    const y = 1 - (event.clientY - box.top) / box.height;
    stir = Math.min(1.6, stir + Math.hypot(x - target[0], y - target[1]) * 6);
    target[0] = x;
    target[1] = y;
  };

  const stage = createShaderStage(canvas, {
    fragment: FRAGMENT,
    allowSoftware,
    // A soft field: drawn at three quarters of its size (half on weak devices), 30 times a second.
    // `data-resolution` overrides it, for stills; `data-time` starts the flow at another moment.
    maxPixelRatio: Number(root.dataset.resolution) || (capabilities.lowPower ? 0.5 : 0.75),
    fps: 30,
    timeOffset: Number(root.dataset.time) || 0,
    uniforms: {
      uTime: 0,
      uResolution: [1, 1],
      uPointer: [0.7, 0.62],
      uStir: 0,
      uOctaves: capabilities.lowPower ? 3 : 4,
      uInk: colours[0],
      uDeep: colours[1],
      uMid: colours[2],
      uGlow: colours[3],
      uLight: colours[4],
    },
    frame: (_time, delta, set) => {
      const follow = Math.min(1, delta * 2.5);
      pointer[0] += (target[0] - pointer[0]) * follow;
      pointer[1] += (target[1] - pointer[1]) * follow;
      stir *= Math.pow(0.35, delta);
      stirred += (stir - stirred) * Math.min(1, delta * 4);
      set("uPointer", [pointer[0], pointer[1]]);
      set("uStir", stirred);
    },
    // Show the canvas once it has something to show, over the still gradient underneath.
    shown: () => root.classList.add("is-live"),
    lost: () => {
      root.classList.remove("is-live");
      root.dataset.sgState = "still";
    },
  });
  if (!stage) {
    root.dataset.sgState = "still";
    return null;
  }

  if (capabilities.finePointer) window.addEventListener("pointermove", onPointer, { passive: true });
  root.dataset.sgState = "webgl";

  return () => {
    window.removeEventListener("pointermove", onPointer);
    root.classList.remove("is-live");
    root.dataset.sgState = "still";
    stage.dispose();
  };
}
