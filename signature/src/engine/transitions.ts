/**
 * Picture transitions: other ways for a picture to arrive than the image
 * effect's own living edge (src/modules/reveal.ts), chosen in markup with
 * `data-sg-transition="wipe|dissolve|warp|slices"`. Each is a fragment shader
 * for the shader stage, with the image effect's uniforms: `uReveal` runs from
 * 0 (nothing) to 1 (the whole picture), and the lens under the mouse is the
 * same. Its own chunk, fetched only by a page that names a transition, and
 * counted with the WebGL shaders in the weight budget.
 *
 * The four are adapted from gl-transitions
 * (https://github.com/gl-transitions/gl-transitions), each from one file whose
 * header names its author and the MIT licence; the header is kept above the
 * adapted code, inside the shader, so it travels with every copy. A
 * gl-transition blends a "from" picture into a "to" picture; here "from" is
 * the empty frame (transparent) and "to" is the picture, so each one is an
 * arrival. Their parameters are fixed here to suit a picture arriving on a
 * calm page, and what else was changed is said above each.
 *
 * gl-transitions' licence:
 *
 * MIT License
 *
 * Copyright (c) 2017-present gl-transitions contributors
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
import { NOISE } from "../modules/noise";

export interface Transition {
  fragment: string;
  /** Seconds from nothing to the whole picture. */
  duration: number;
  /** A GSAP ease. */
  ease: string;
}

/**
 * What every transition is written against, as in gl-transitions: `progress`,
 * `ratio`, `getFromColor` and `getToColor`. The picture fills the frame like
 * CSS object-fit: cover, swells under the pointer and eases out of a slight
 * zoom as it arrives, as in the image effect.
 */
const HEAD = /* glsl */ `
uniform vec2 uResolution;
uniform sampler2D uImage;
uniform vec2 uImageSize;
uniform float uReveal;
uniform vec2 uPointer;
uniform float uHover;
varying vec2 vUv;
#define progress uReveal
#define ratio (uResolution.x / max(uResolution.y, 1.0))
vec2 cover(vec2 uv) {
  float image = uImageSize.x / max(uImageSize.y, 1.0);
  vec2 scale = ratio > image ? vec2(1.0, image / ratio) : vec2(ratio / image, 1.0);
  return (uv - 0.5) * scale + 0.5;
}
vec4 getFromColor(vec2 uv) {
  return vec4(0.0);
}
vec4 getToColor(vec2 uv) {
  vec2 toPointer = (vUv - uPointer) * vec2(ratio, 1.0);
  float lens = smoothstep(0.38, 0.0, length(toPointer)) * uHover;
  vec2 st = cover(uv - toPointer / vec2(ratio, 1.0) * lens * 0.09);
  st = (st - 0.5) / (1.06 - 0.06 * uReveal) + 0.5;
  vec2 split = vec2(lens * 0.006, 0.0);
  return vec4(texture2D(uImage, st + split).r, texture2D(uImage, st).g, texture2D(uImage, st - split).b, 1.0);
}`;

// "From" is transparent black and "to" is opaque, so their mix is already premultiplied, as the stage wants it.
const MAIN = /* glsl */ `
void main() {
  gl_FragColor = transition(vUv);
}`;

/**
 * A soft wipe. Changed: the direction and the softness are fixed (left to
 * right, leaning a little, with a wide feather).
 */
const WIPE = /* glsl */ `
// gl-transitions/transitions/DirectionalWipe.glsl
// Author: gre
// License: MIT
const vec2 direction = vec2(1.0, -0.3);
const float smoothness = 0.45;
const vec2 center = vec2(0.5, 0.5);
vec4 transition (vec2 uv) {
  vec2 v = normalize(direction);
  v /= abs(v.x)+abs(v.y);
  float d = v.x * center.x + v.y * center.y;
  float m =
    (1.0-step(progress, 0.0)) *
    (1.0 - smoothstep(-smoothness, 0.0, v.x * uv.x + v.y * uv.y - (d-0.5+progress*(1.+smoothness))));
  return mix(getFromColor(uv), getToColor(uv), m);
}`;

/**
 * A dissolve in fine grain. Changed: the grain is two pixels wide instead of
 * one value per fragment, so it is the same grain on every screen; each grain
 * fades in over a short while instead of switching on; and a slow field of
 * simplex noise (Ashima Arts, MIT, src/modules/noise.ts) lets the picture
 * develop in soft patches, like a print, instead of evenly like static.
 */
const DISSOLVE = /* glsl */ `
${NOISE}
// gl-transitions/transitions/NoiseDissolve.glsl
// Author: towrabbit
// License: MIT
float random (vec2 st) {
    return fract(sin(dot(st.xy,vec2(12.9898,78.233)))*43758.5453123);
}
vec4 transition (vec2 uv) {
  vec4 leftSide = getFromColor(uv);
  vec4 rightSide = getToColor(uv);
  float grain = random(floor(uv * uResolution) / uResolution);
  float patch = snoise(uv * vec2(ratio, 1.0) * 1.6) * 0.5 + 0.5;
  float at = 0.001 + 0.998 * mix(grain, patch, 0.6);
  float uvz = smoothstep(at - 0.22, at + 0.22, mix(-0.22, 1.22, progress));
  return mix(leftSide,rightSide,uvz);
}`;

/**
 * A wipe whose edge stretches the picture into place. Changed: the direction
 * and the softness are fixed (rising, leaning a little, with a wider edge).
 */
const WARP = /* glsl */ `
// gl-transitions/transitions/DirectionalWarp.glsl
// Author: pschroen
// License: MIT
const float smoothness = 0.3;
const vec2 direction = vec2(-0.3, 1.0);
const vec2 center = vec2(0.5, 0.5);
vec4 transition (vec2 uv) {
  vec2 v = normalize(direction);
  v /= abs(v.x) + abs(v.y);
  float d = v.x * center.x + v.y * center.y;
  float m = 1.0 - smoothstep(-smoothness, 0.0, v.x * uv.x + v.y * uv.y - (d - 0.5 + progress * (1.0 + smoothness)));
  return mix(getFromColor((uv - 0.5) * (1.0 - m) + 0.5), getToColor((uv - 0.5) * m + 0.5), m);
}`;

/**
 * Upright slices that widen, the bold one. Changed: the number of slices
 * follows the frame's shape, so they are as wide in a tall picture as in a
 * wide one, and their edges are one pixel soft instead of stepped.
 */
const SLICES = /* glsl */ `
// gl-transitions/transitions/WindowSlices.glsl
// Author: gre
// License: MIT
const float smoothness = 0.5;
vec4 transition (vec2 p) {
  float count = max(3.0, floor(6.0 * ratio + 0.5));
  float pixel = count / uResolution.x;
  float pr = smoothstep(-smoothness, 0.0, p.x - progress * (1.0 + smoothness)) * (1.0 + pixel);
  float s = smoothstep(pr - pixel, pr, fract(count * p.x));
  float lag = smoothstep(-smoothness, 0.0, (floor(count * p.x) + 0.5) / count - progress * (1.0 + smoothness));
  return mix(getFromColor(p), getToColor(p - vec2(0.0, 0.07 * lag)), s);
}`;

const make = (body: string, duration: number, ease: string): Transition => ({ fragment: HEAD + body + MAIN, duration, ease });

const TRANSITIONS = new Map<string, Transition>([
  ["wipe", make(WIPE, 1.6, "power2.inOut")],
  ["dissolve", make(DISSOLVE, 1.8, "sine.inOut")],
  ["warp", make(WARP, 1.8, "power2.inOut")],
  ["slices", make(SLICES, 1.5, "power3.inOut")],
]);

/** The transition of that name, or undefined: the image effect then arrives its own way. */
export const transition = (name: string): Transition | undefined => TRANSITIONS.get(name);
