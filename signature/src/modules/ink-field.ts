/**
 * Ink field: a slow, flowing field of silk in the site's colours, drawn by a
 * shader and lit like satin (long folds, a broad sheen, fine highlights), that
 * the pointer stirs as it passes. It sits behind a hero and is
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
  for (int i = 0; i < 4; i++) {
    if (float(i) >= uOctaves) break;
    value += amplitude * snoise(p);
    p = turn * p * 2.03;
    amplitude *= 0.32;
  }
  return value;
}
void main() {
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  vec2 p = (vUv - 0.5) * vec2(aspect, 1.0) * 0.8;
  vec2 pointer = (uPointer - 0.5) * vec2(aspect, 1.0) * 0.8;
  float t = uTime * 0.035;

  // The pointer stirs: a soft swirl around it that fades with distance.
  vec2 toPointer = p - pointer;
  float near = exp(-dot(toPointer, toPointer) * 9.0);
  p += vec2(-toPointer.y, toPointer.x) * uStir * near * 0.35;

  // Silk: folds drawn out along one diagonal, slowly drifting. The warp is shared by the three samples.
  mat2 lay = mat2(0.82, 0.57, -0.57, 0.82);
  vec2 s = lay * p * vec2(0.38, 1.0);
  vec2 q = vec2(fbm(s + vec2(0.0, t)), fbm(s + vec2(5.2, 1.3) - t));
  vec2 base = s * 0.8 + 0.9 * q + vec2(1.7, 9.2) + vec2(t * 0.6, 0.0);
  float e = 0.004;
  float h = fbm(base);
  vec3 n = normalize(vec3(-(fbm(base + vec2(e, 0.0)) - h) / e * 0.42, -(fbm(base + vec2(0.0, e)) - h) / e * 0.42, 1.0));

  // Satin light: a key from the upper right, a broad sheen, a fine highlight, glowing flanks.
  vec3 light = normalize(vec3(0.5, 0.6, 0.62));
  vec3 halfway = normalize(light + vec3(0.0, 0.0, 1.0));
  float diffuse = pow(max(dot(n, light), 0.0), 1.6);
  float facing = max(dot(n, halfway), 0.0);
  float flank = pow(1.0 - max(n.z, 0.0), 2.0);
  vec3 cloth = mix(uInk, uDeep, smoothstep(-0.6, 0.5, h));
  cloth = mix(cloth, uMid, smoothstep(0.1, 0.8, h) * 0.3);
  vec3 colour = cloth * (0.06 + 1.1 * diffuse);
  colour += uGlow * flank * 0.2;
  colour += mix(uMid, uLight, 0.35) * pow(facing, 7.0) * 0.38;
  colour += uLight * pow(facing, 46.0) * 0.42;

  // Deep silk, not pale: the light lives in the folds. Darker still toward the lower left, where the headline sits.
  colour *= 0.55;
  float open = smoothstep(1.05, 0.12, length((vUv - vec2(0.74, 0.72)) * vec2(1.05, 1.0)));
  colour = mix(uInk * 0.55, colour, 0.06 + 0.94 * open);

  // A filmic curve (ACES, Narkowicz's fit) so highlights roll off, then screen colour, then a trace of grain.
  colour = clamp((colour * (2.51 * colour + 0.03)) / (colour * (2.43 * colour + 0.59) + 0.14), 0.0, 1.0);
  colour = pow(colour, vec3(1.0 / 2.2));
  float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  colour += (grain - 0.5) * (2.5 / 255.0);
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
      uOctaves: capabilities.lowPower ? 2 : 3,
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
