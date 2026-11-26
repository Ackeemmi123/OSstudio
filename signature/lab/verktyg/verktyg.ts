/**
 * Renders the lab's artworks in code, so Axivo owns every pixel: satin
 * stills from the shader below, and the engine's glass ring at full quality.
 * scripts/render-art.mjs reads them off this page and saves them as WebP in
 * lab/bilder/.
 */
import { createShaderStage } from "../../src/engine/shader-stage";
import { NOISE } from "../../src/modules/noise";
import { createObjectScene } from "../../src/modules/band-scene";

/**
 * Silk: a height field of slow, stretched noise, lit like satin. Folds catch a
 * key light from the upper left, their flanks glow in the accent colour, and a
 * soft vignette holds the eye in the frame. For stills only: it never ships.
 */
const SILK = /* glsl */ `
uniform float uTime;
uniform vec2 uResolution;
uniform vec3 uInk;
uniform vec3 uDeep;
uniform vec3 uMid;
uniform vec3 uGlow;
uniform vec3 uLight;
uniform float uAngle;
uniform float uSeed;
uniform float uScale;
varying vec2 vUv;
${NOISE}
float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  mat2 turn = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) {
    value += amplitude * snoise(p);
    p = turn * p * 2.03;
    amplitude *= 0.32;
  }
  return value;
}
float height(vec2 p) {
  vec2 q = vec2(fbm(p + uSeed), fbm(p + vec2(5.2, 1.3) - uSeed));
  return fbm(p * 0.8 + 0.9 * q + vec2(1.7, 9.2));
}
void main() {
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  vec2 p = (vUv - 0.5) * vec2(aspect, 1.0) * uScale;
  float c = cos(uAngle);
  float s = sin(uAngle);
  p = mat2(c, s, -s, c) * p;
  // Folds run along one direction, like cloth that has been drawn.
  p *= vec2(0.36, 1.0);

  float e = 0.0025;
  float h = height(p);
  float dx = (height(p + vec2(e, 0.0)) - h) / e;
  float dy = (height(p + vec2(0.0, e)) - h) / e;
  vec3 n = normalize(vec3(-dx * 0.42, -dy * 0.42, 1.0));

  vec3 light = normalize(vec3(-0.55, 0.62, 0.56));
  vec3 halfway = normalize(light + vec3(0.0, 0.0, 1.0));
  float diffuse = pow(max(dot(n, light), 0.0), 1.6);
  float spec = pow(max(dot(n, halfway), 0.0), 46.0);
  float sheen = pow(max(dot(n, halfway), 0.0), 7.0);
  float flank = pow(1.0 - max(n.z, 0.0), 2.0);

  vec3 base = mix(uInk, uDeep, smoothstep(-0.6, 0.5, h));
  base = mix(base, uMid, smoothstep(0.1, 0.8, h) * 0.35);
  vec3 colour = base * (0.06 + 1.15 * diffuse);
  colour += uGlow * flank * 0.22;
  colour += mix(uMid, uLight, 0.35) * sheen * 0.42;
  colour += uLight * spec * 0.5;

  // The eye rests in the frame: darker toward the edges, a breath of light upper left.
  vec2 centred = (vUv - vec2(0.42, 0.58)) * vec2(aspect, 1.0);
  colour *= mix(0.45, 1.05, smoothstep(1.15, 0.15, length(centred)));

  // A filmic curve (ACES, Narkowicz's fit) so highlights roll off instead of clipping, then screen colour.
  colour = clamp((colour * (2.51 * colour + 0.03)) / (colour * (2.43 * colour + 0.59) + 0.14), 0.0, 1.0);
  colour = pow(colour, vec3(1.0 / 2.2));
  float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  colour += (grain - 0.5) * (3.0 / 255.0);
  gl_FragColor = vec4(colour, 1.0);
}`;

/** A hex colour as linear RGB. */
const linear = (hex: string): [number, number, number] => {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  const channel = (byte: number) => {
    const c = byte / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return [channel((value >> 16) & 255), channel((value >> 8) & 255), channel(value & 255)];
};

const frames = [...document.querySelectorAll<HTMLElement>("[data-art]")];
let ready = 0;

for (const frame of frames) {
  if (frame.dataset.kind === "silk") {
    const canvas = frame.querySelector("canvas")!;
    const colours = (frame.dataset.colors ?? "").split(/\s+/).map(linear);
    createShaderStage(canvas, {
      fragment: SILK,
      allowSoftware: true,
      maxPixelRatio: 2,
      uniforms: {
        uTime: 0,
        uResolution: [1, 1],
        uInk: colours[0],
        uDeep: colours[1],
        uMid: colours[2],
        uGlow: colours[3],
        uLight: colours[4],
        uAngle: Number(frame.dataset.angle ?? 0.6),
        uSeed: Number(frame.dataset.seed ?? 0),
        uScale: Number(frame.dataset.scale ?? 0.75),
      },
      shown: () => ready++,
    });
  } else {
    const canvas = frame.querySelector("canvas")!;
    const scene = createObjectScene(canvas, {
      allowSoftware: true,
      lowPower: false,
      quality: 2,
      preserve: true,
      centred: true,
      colours: ["#151922", "#4a5bb5", "#c9d9f0", "#879dc7"],
      shown: () => undefined,
      lost: () => undefined,
    });
    // Let the environment and shaders settle, then draw the still twice (the second frame has the refraction ready).
    setTimeout(() => {
      scene?.still(Number(frame.dataset.progress), Number(frame.dataset.time));
      scene?.still(Number(frame.dataset.progress), Number(frame.dataset.time));
      ready++;
    }, 1500);
  }
}

(window as unknown as { artReady: () => boolean }).artReady = () => ready === frames.length;
