/**
 * The 3D half of the object module, in plain WebGL: one band of brushed satin
 * metal, a Möbius loop, that starts as eight loose pieces drifting and turning
 * in space and, as the visitor scrolls, flows together into a single band:
 * many parts, one thing.
 *
 * No 3D library: two small shader programs, about 5 KB compressed instead of
 * Three.js's 140. The whole shape is computed on the graphics card from
 * flowing noise; the studio it reflects (an overhead softbox, side strips, a
 * coloured rim behind) is drawn analytically in the shader, so its highlights
 * are crisp at any size; the satin's brushed streaks come from blurring that
 * reflection along the band; filmic tone mapping, antialiasing. The scroll
 * drives a critically damped spring rather than the scene directly, and the
 * band tilts a little toward the pointer.
 *
 * Quality adapts to what the device manages, measured, not guessed: 2 = up to
 * twice the pixels and a finely divided band; 1 = fewer pixels, a coarser
 * band; 0 = one reflection sample instead of five.
 */
import { SOFTWARE_RENDERER } from "../engine/capabilities";

export interface ObjectScene {
  /** 0 = scattered, 1 = whole. The scene follows it on a spring. */
  setProgress: (progress: number) => void;
  /** Where the pointer is over the canvas, -1…1 on each axis, or null when it is away. */
  setPointer: (x: number | null, y: number) => void;
  /** Draws one frame at exactly this progress, for stills. */
  still: (progress: number, time?: number) => void;
  dispose: () => void;
}

export interface ObjectSceneOptions {
  allowSoftware: boolean;
  lowPower: boolean;
  /** Ink (background), tint, metal, glow, as CSS hex. */
  colours: string[];
  /** Keep the drawing buffer for screenshots (stills only). */
  preserve?: boolean;
  /** Centre the band in the frame, for stills, instead of placing it beside text on wide screens. */
  centred?: boolean;
  /** A fixed quality level (0–2) instead of measuring: for stills and demos. */
  quality?: 0 | 1 | 2;
  /** The longest frame (75th percentile, seconds) before quality steps down; set from the screen's own cadence. */
  frameBudget?: number;
  shown: () => void;
  lost: () => void;
}

/** The loop's radius and the band's width; how many pieces it starts in. */
const RADIUS = 1.75;
const WIDTH = 1.2;
const PIECES = 8;
/** How far the band wanders while unformed, and how much it keeps once whole. */
const TURBULENCE = 0.55;
const CALM = 0.06;

const SHAPE = /* glsl */ `
uniform float uTime;
uniform float uAmp;
uniform float uSplit;
vec3 sgMod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 sgMod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 sgPermute(vec4 x) { return sgMod289(((x * 34.0) + 10.0) * x); }
float sgNoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = sgMod289(i);
  vec4 p = sgPermute(sgPermute(sgPermute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  vec3 ns = 0.142857142857 * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = 1.79284291400159 - 0.85373472095314 * vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
float sgHash(float n) { return fract(sin(n * 91.345) * 47453.123); }
vec3 sgTurn(vec3 v, vec3 axis, float angle) {
  return v * cos(angle) + cross(axis, v) * sin(angle) + axis * dot(axis, v) * (1.0 - cos(angle));
}
vec3 sgBand(vec2 st, float piece) {
  float u = st.x * 6.28318530718;
  float t = uTime * 0.16;
  vec3 ring = vec3(cos(u), sin(u), 0.0);
  // The centre line: a circle that wanders in 3D while unformed. Sampled on the circle, so the loop stays closed.
  vec3 wander = vec3(
    sgNoise(vec3(ring.xy * 0.9, t)),
    sgNoise(vec3(ring.yx * 0.9 + 7.0, t)),
    sgNoise(vec3(ring.xy * 0.9 + 13.0, t * 0.8))
  );
  vec3 centre = ring * ${RADIUS.toFixed(3)} + wander * uAmp * vec3(1.4, 1.4, 2.0);
  // Half a turn around the loop (a Möbius band), and a wandering twist while unformed.
  float twist = u * 0.5 + sgNoise(vec3(ring.xy * 1.1 + 3.0, t * 1.2)) * uAmp * 3.2;
  vec3 across = cos(twist) * ring + sin(twist) * vec3(0.0, 0.0, 1.0);
  vec3 p = centre + across * (st.y - 0.5) * ${WIDTH.toFixed(3)};
  // While split, each piece drifts away from its place and turns about its own middle.
  if (uSplit > 0.0001) {
    // Squared, so each piece is home before its gaps close and no seam shows.
    float apart = uSplit * uSplit;
    float h1 = sgHash(piece + 1.0);
    float h2 = sgHash(piece + 2.3);
    float h3 = sgHash(piece + 3.7);
    float middle = (piece + 0.5) / ${PIECES.toFixed(1)} * 6.28318530718;
    vec3 home = vec3(cos(middle), sin(middle), 0.0) * ${RADIUS.toFixed(3)};
    vec3 axis = normalize(vec3(h1 - 0.5, h2 - 0.5, h3 - 0.5) + vec3(0.001));
    p = home + sgTurn(p - home, axis, (h1 - 0.5) * 3.0 * apart);
    p += ((vec3(h2, h3, h1) - 0.5) * vec3(2.4, 2.0, 3.2) + vec3(cos(middle), sin(middle), 0.0) * 0.8) * apart;
  }
  return p;
}
`;

const BAND_VERTEX = /* glsl */ `
attribute vec2 aUv;
uniform mat4 uModel;
uniform mat4 uViewProjection;
varying vec3 vNormal;
varying vec3 vTangent;
varying vec3 vWorld;
varying float vU;
${SHAPE}
void main() {
  float piece = min(floor(aUv.x * ${PIECES.toFixed(1)}), ${(PIECES - 1).toFixed(1)});
  vec3 p = sgBand(aUv, piece);
  vec3 alongU = sgBand(aUv + vec2(0.0005, 0.0), piece) - p;
  vec3 alongV = sgBand(aUv + vec2(0.0, 0.01), piece) - p;
  mat3 turn = mat3(uModel);
  vNormal = turn * normalize(cross(alongU, alongV));
  vTangent = turn * normalize(alongU);
  vec4 world = uModel * vec4(p, 1.0);
  vWorld = world.xyz;
  vU = aUv.x;
  gl_Position = uViewProjection * world;
}`;

const BAND_FRAGMENT = /* glsl */ `
uniform vec3 uCamera;
uniform float uSplit;
uniform vec3 uBase;
uniform vec3 uGlow;
uniform float uSamples;
uniform float uExposure;
varying vec3 vNormal;
varying vec3 vTangent;
varying vec3 vWorld;
varying float vU;

float box(float x, float extent, float soft) {
  return 1.0 - smoothstep(extent - soft, extent + soft, abs(x));
}
// One softbox: a rectangle of light seen in direction c, of angular half-size size.
vec3 softbox(vec3 d, vec3 c, vec3 up, vec2 size, vec3 colour, float soft) {
  float facing = dot(d, c);
  if (facing <= 0.0) return vec3(0.0);
  vec3 side = normalize(cross(up, c));
  vec3 top = cross(c, side);
  return colour * box(dot(d, side) / facing, size.x, soft) * box(dot(d, top) / facing, size.y, soft);
}
// The studio the band reflects: dark, with an overhead softbox, two side strips, a coloured rim behind, a faint bounce below.
vec3 studio(vec3 d, float soft) {
  vec3 light = vec3(0.03, 0.034, 0.05);
  light += softbox(d, normalize(vec3(0.0, 10.0, 2.0)), vec3(0.0, 0.0, 1.0), vec2(0.69, 0.2), vec3(3.2), soft);
  light += softbox(d, normalize(vec3(-11.0, 1.0, 3.0)), vec3(0.0, 1.0, 0.0), vec2(0.07, 0.61), vec3(4.0), soft);
  light += softbox(d, normalize(vec3(11.0, -1.0, 3.0)), vec3(0.0, 1.0, 0.0), vec2(0.053, 0.53), vec3(2.6), soft);
  light += softbox(d, normalize(vec3(0.0, 2.0, -12.0)), vec3(0.0, 1.0, 0.0), vec2(0.49, 0.25), uGlow * 5.0, soft);
  light += softbox(d, normalize(vec3(0.0, -10.0, 2.0)), vec3(0.0, 0.0, 1.0), vec2(0.69, 0.15), vec3(0.54, 0.61, 1.0) * 1.2, soft);
  light += softbox(d, normalize(vec3(4.0, 3.0, 15.0)), vec3(0.0, 1.0, 0.0), vec2(0.095, 0.063), vec3(0.6), soft);
  return light;
}

void main() {
  float at = fract(vU * ${PIECES.toFixed(1)});
  if (min(at, 1.0 - at) < uSplit * 0.13) discard;

  vec3 n = normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0);
  vec3 view = normalize(uCamera - vWorld);
  if (dot(n, view) < 0.0) n = -n;
  vec3 t = normalize(vTangent - n * dot(vTangent, n));
  vec3 across = cross(n, t);
  vec3 r = reflect(-view, n);
  float facing = max(dot(n, view), 0.0);

  // Brushed satin: the reflection blurred along the band, five samples (one at the lowest level).
  vec3 env = vec3(0.0);
  float weight = 0.0;
  for (int i = 0; i < 5; i++) {
    float k = float(i) - 2.0;
    if (abs(k) > uSamples) continue;
    vec3 d = normalize(r + across * k * 0.2);
    env += studio(d, 0.16);
    weight += 1.0;
  }
  env /= weight;

  vec3 fresnel = uBase + (1.0 - uBase) * pow(1.0 - facing, 5.0);
  // Satin is not a mirror: a broad, soft lobe of the studio under the sharp one.
  vec3 broad = studio(normalize(r + n * 0.35), 0.9);
  vec3 colour = (env * 0.75 + broad * 0.7) * fresnel;
  // A thin clear coat: a sharper, fainter reflection on top, strongest at grazing angles.
  colour += studio(r, 0.015) * (0.04 + 0.96 * pow(1.0 - facing, 5.0)) * 0.5;

  colour *= uExposure;
  colour = clamp((colour * (2.51 * colour + 0.03)) / (colour * (2.43 * colour + 0.59) + 0.14), 0.0, 1.0);
  gl_FragColor = vec4(pow(colour, vec3(1.0 / 2.2)), 1.0);
}`;

/** The studio sweep behind the band: a pool of the tint, a brighter core, the floor falling away, fine grain. */
const BACKDROP_FRAGMENT = /* glsl */ `
uniform vec2 uResolution;
uniform float uCentre;
uniform vec3 uInk;
uniform vec3 uTint;
uniform vec3 uGlow;
void main() {
  vec2 p = gl_FragCoord.xy / uResolution;
  float aspect = uResolution.x / uResolution.y;
  vec2 q = (p - vec2(uCentre, 0.54)) * vec2(aspect, 1.0 / 0.92);
  float pool = smoothstep(0.85, 0.0, length(q));
  float core = smoothstep(0.38, 0.0, length((p - vec2(uCentre, 0.58)) * vec2(aspect, 1.0)));
  vec3 colour = mix(uInk, uTint, pool * 0.7);
  colour = mix(colour, uGlow, core * core * 0.45);
  colour = mix(colour, uInk, smoothstep(0.45, 0.0, p.y) * 0.8);
  float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  gl_FragColor = vec4(colour + (grain - 0.5) * (3.0 / 255.0), 1.0);
}`;

const FULL_SCREEN = `attribute vec2 aPosition; void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }`;

type Matrix = Float32Array;
const multiply = (a: Matrix, b: Matrix): Matrix => {
  const out = new Float32Array(16);
  for (let column = 0; column < 4; column++)
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + row] * b[column * 4 + k];
      out[column * 4 + row] = sum;
    }
  return out;
};
const rotateX = (angle: number): Matrix => { const c = Math.cos(angle), s = Math.sin(angle); return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]); };
const rotateY = (angle: number): Matrix => { const c = Math.cos(angle), s = Math.sin(angle); return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]); };
const rotateZ = (angle: number): Matrix => { const c = Math.cos(angle), s = Math.sin(angle); return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); };
const translate = (x: number, y: number, z: number): Matrix => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
const perspective = (fovY: number, aspect: number, near: number, far: number): Matrix => {
  const f = 1 / Math.tan(fovY / 2);
  const range = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * range, -1, 0, 0, 2 * far * near * range, 0]);
};

/** A hex colour as linear RGB. */
const linear = (hex: string): [number, number, number] => {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  const channel = (byte: number) => {
    const c = byte / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return [channel((value >> 16) & 255), channel((value >> 8) & 255), channel(value & 255)];
};
const srgb = (hex: string): [number, number, number] => {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
};
const mix = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Slow in, slow out, with most of the travel in the middle: how real things settle. */
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** Critically damped spring toward a target: smooth whatever the frame rate, never overshooting. */
function damp(current: number, target: number, state: { velocity: number }, smoothTime: number, delta: number): number {
  const omega = 2 / smoothTime;
  const x = omega * delta;
  const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = current - target;
  const temp = (state.velocity + omega * change) * delta;
  state.velocity = (state.velocity - omega * temp) * decay;
  return target + (change + temp) * decay;
}

export function createObjectScene(canvas: HTMLCanvasElement, options: ObjectSceneOptions): ObjectScene | null {
  const gl = canvas.getContext("webgl", { antialias: true, alpha: false, depth: true, stencil: false, powerPreference: "high-performance", preserveDrawingBuffer: options.preserve === true, failIfMajorPerformanceCaveat: !options.allowSoftware });
  if (!gl) return null;
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  if (!options.allowSoftware && info && SOFTWARE_RENDERER.test(String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)))) {
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return null;
  }
  const context = gl;
  const [ink = "#151922", tint = "#4a5bb5", metalColour = "#c9d9f0", glow = "#879dc7"] = options.colours;

  let level: number = options.quality ?? (options.lowPower ? 1 : 2);
  const fixed = options.quality !== undefined;
  const pixelRatio = () => Math.min(window.devicePixelRatio || 1, level === 2 ? 2 : level === 1 ? 1.25 : 1);

  /*
   * The two programs compile in the graphics process while the page goes on:
   * asking for the link status straight away would hold the main thread until
   * the band's shader is compiled (a long task on a phone, longer still on a
   * slow driver). The frame loop asks only once the compiler is done
   * (KHR_parallel_shader_compile), or, without that extension, after a few
   * frames' grace; until then the picture underneath stays.
   */
  const compile = (vertex: string, fragment: string) => {
    const program = context.createProgram()!;
    for (const [type, source] of [[context.VERTEX_SHADER, vertex], [context.FRAGMENT_SHADER, `precision highp float;\n${fragment}`]] as const) {
      const shader = context.createShader(type)!;
      context.shaderSource(shader, source);
      context.compileShader(shader);
      context.attachShader(program, shader);
      context.deleteShader(shader);
    }
    context.linkProgram(program);
    return program;
  };
  const band = compile(BAND_VERTEX, BAND_FRAGMENT);
  const backdrop = compile(FULL_SCREEN, BACKDROP_FRAGMENT);
  const parallel = context.getExtension("KHR_parallel_shader_compile");
  context.flush();
  type Locations = Record<string, WebGLUniformLocation | null>;
  const locate = (program: WebGLProgram, names: string[]): Locations => Object.fromEntries(names.map((name) => [name, context.getUniformLocation(program, name)]));
  let u: Locations = {};
  let b: Locations = {};
  let aPosition = 0;
  let aUv = 0;
  let linked = false;
  let grace = 3;
  /** True once both programs are linked. Waits on the compiler only when `now` (stills) or when the extension is missing and the grace is over. */
  const ready = (now = false) => {
    if (linked) return true;
    if (!now) {
      if (parallel && !(context.getProgramParameter(band, parallel.COMPLETION_STATUS_KHR) && context.getProgramParameter(backdrop, parallel.COMPLETION_STATUS_KHR))) return false;
      if (!parallel && grace-- > 0) return false;
    }
    if (!context.getProgramParameter(band, context.LINK_STATUS) || !context.getProgramParameter(backdrop, context.LINK_STATUS)) {
      fail();
      return false;
    }
    u = locate(band, ["uModel", "uViewProjection", "uCamera", "uSplit", "uAmp", "uTime", "uBase", "uGlow", "uSamples", "uExposure"]);
    b = locate(backdrop, ["uResolution", "uCentre", "uInk", "uTint", "uGlow"]);
    aPosition = context.getAttribLocation(backdrop, "aPosition");
    aUv = context.getAttribLocation(band, "aUv");
    linked = true;
    return true;
  };

  // The full-screen triangle for the backdrop.
  const screen = context.createBuffer();
  context.bindBuffer(context.ARRAY_BUFFER, screen);
  context.bufferData(context.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), context.STATIC_DRAW);

  // The band: a strip divided finely along its length; coarser one step down.
  let mesh = { uv: null as WebGLBuffer | null, index: null as WebGLBuffer | null, count: 0 };
  const build = () => {
    const along = level === 2 ? 720 : 420;
    const across = level === 2 ? 14 : 8;
    const uv = new Float32Array((along + 1) * (across + 1) * 2);
    for (let i = 0, k = 0; i <= along; i++) for (let j = 0; j <= across; j++, k += 2) {
      uv[k] = i / along;
      uv[k + 1] = j / across;
    }
    const index = new Uint16Array(along * across * 6);
    for (let i = 0, k = 0; i < along; i++) for (let j = 0; j < across; j++, k += 6) {
      const a = i * (across + 1) + j;
      const c = a + across + 1;
      index.set([a, c, a + 1, a + 1, c, c + 1], k);
    }
    if (mesh.uv) context.deleteBuffer(mesh.uv);
    if (mesh.index) context.deleteBuffer(mesh.index);
    mesh = { uv: context.createBuffer(), index: context.createBuffer(), count: index.length };
    context.bindBuffer(context.ARRAY_BUFFER, mesh.uv);
    context.bufferData(context.ARRAY_BUFFER, uv, context.STATIC_DRAW);
    context.bindBuffer(context.ELEMENT_ARRAY_BUFFER, mesh.index);
    context.bufferData(context.ELEMENT_ARRAY_BUFFER, index, context.STATIC_DRAW);
  };
  build();

  // Silver with the site's tint in it: dark enough that the highlights have something to stand out from.
  const base = mix(linear(tint), linear(metalColour), 0.55);
  const glowLinear = linear(glow);
  let width = 1;
  let height = 1;
  let aspect = 1;
  let offsetX = 0;
  let cameraZ = 14;
  let centre = 0.5;
  const fit = () => {
    const box = canvas.getBoundingClientRect();
    if (!box.width || !box.height) return;
    width = canvas.width = Math.round(box.width * pixelRatio());
    height = canvas.height = Math.round(box.height * pixelRatio());
    aspect = box.width / box.height;
    // On wide screens the band sits left of the text, like a product beside its caption; on narrow ones, centred and whole.
    offsetX = aspect > 1.25 && !options.centred ? -2.25 * Math.min(1.3, aspect / 1.6) : 0;
    cameraZ = aspect < 1 ? 14 / Math.max(0.6, aspect) : 14;
    centre = 0.5 + offsetX / (2 * cameraZ * Math.tan((28 * Math.PI) / 360) * aspect);
  };
  const resizer = new ResizeObserver(fit);
  resizer.observe(canvas);
  fit();

  let target = 0;
  let progress = 0;
  const spring = { velocity: 0 };
  let pointerX = 0;
  let pointerY = 0;
  let pointerTargetX = 0;
  let pointerTargetY = 0;
  const tiltX = { velocity: 0 };
  const tiltY = { velocity: 0 };
  let time = 0;
  let spin = 0;
  let first = true;

  const draw = () => {
    context.viewport(0, 0, width, height);
    context.clear(context.COLOR_BUFFER_BIT | context.DEPTH_BUFFER_BIT);

    context.disable(context.DEPTH_TEST);
    context.useProgram(backdrop);
    context.bindBuffer(context.ARRAY_BUFFER, screen);
    context.enableVertexAttribArray(aPosition);
    context.vertexAttribPointer(aPosition, 2, context.FLOAT, false, 0, 0);
    context.uniform2f(b.uResolution, width, height);
    context.uniform1f(b.uCentre, centre);
    context.uniform3fv(b.uInk, srgb(ink));
    context.uniform3fv(b.uTint, srgb(tint));
    context.uniform3fv(b.uGlow, srgb(glow));
    context.drawArrays(context.TRIANGLES, 0, 3);
    context.disableVertexAttribArray(aPosition);

    // Turned away while unformed, a three-quarter view once whole; a slow turn in its own plane always.
    const turnY = 0.55 + (1 - progress) * 0.5 + pointerX * 0.3 + Math.sin(time * 0.3) * 0.08;
    const turnX = -0.85 + (1 - progress) * 0.5 - pointerY * 0.24 + Math.sin(time * 0.23) * 0.06;
    const model = multiply(translate(offsetX, 0, 0), multiply(rotateX(turnX), multiply(rotateY(turnY), rotateZ(spin))));
    const viewProjection = multiply(perspective((28 * Math.PI) / 180, aspect, 0.1, 100), translate(0, 0, -cameraZ));
    const join = easeInOut(clamp(progress / 0.62, 0, 1));

    context.enable(context.DEPTH_TEST);
    context.useProgram(band);
    context.bindBuffer(context.ARRAY_BUFFER, mesh.uv);
    context.enableVertexAttribArray(aUv);
    context.vertexAttribPointer(aUv, 2, context.FLOAT, false, 0, 0);
    context.bindBuffer(context.ELEMENT_ARRAY_BUFFER, mesh.index);
    context.uniformMatrix4fv(u.uModel, false, model);
    context.uniformMatrix4fv(u.uViewProjection, false, viewProjection);
    context.uniform3f(u.uCamera, 0, 0, cameraZ);
    // The pieces close up first; the band then calms, keeping a slow drift once whole.
    context.uniform1f(u.uSplit, Math.sqrt(1 - join));
    context.uniform1f(u.uAmp, TURBULENCE + (CALM - TURBULENCE) * easeInOut(progress));
    context.uniform1f(u.uTime, time);
    context.uniform3fv(u.uBase, base);
    context.uniform3fv(u.uGlow, glowLinear);
    context.uniform1f(u.uSamples, level === 0 ? 0 : 2);
    context.uniform1f(u.uExposure, 1.0);
    context.drawElements(context.TRIANGLES, mesh.count, context.UNSIGNED_SHORT, 0);
    context.disableVertexAttribArray(aUv);
  };

  let visible = false;
  let frameId = 0;
  let last = performance.now();
  let shown = false;
  /*
   * Frame-time watch. The first frames compile shaders and are slow by nature,
   * so they are skipped; then each window of 60 frames is judged on its 75th
   * percentile, which one stall cannot sway, and quality steps down only after
   * two slow windows in a row. Both are also bounded in time (the warm-up at
   * three quarters of a second, a window at one second, at least ten frames),
   * which changes nothing at 60 frames a second or more, but judges a slow
   * device as soon as a fast one: counted in frames alone, a phone drawing 12
   * a second waited 14 seconds, longer than it takes to scroll past the band.
   */
  const window60: number[] = [];
  let frames = 0;
  let warm = 0;
  let span = 0;
  let slowWindows = 0;
  const watch = (delta: number) => {
    frames++;
    warm += delta;
    if (fixed || level === 0 || (frames <= 45 && warm < 0.75)) return;
    window60.push(delta);
    span += delta;
    if (window60.length < 60 && (span < 1 || window60.length < 10)) return;
    const p75 = window60.sort((x, y) => x - y)[Math.ceil(window60.length * 0.75) - 1];
    window60.length = 0;
    span = 0;
    canvas.dataset.frameP75 = (p75 * 1000).toFixed(1);
    slowWindows = p75 > (options.frameBudget ?? 1 / 42) ? slowWindows + 1 : 0;
    if (slowWindows < 2) return;
    slowWindows = 0;
    level--;
    canvas.dataset.quality = String(level);
    if (level === 1) build();
    fit();
  };
  canvas.dataset.quality = String(level);
  canvas.dataset.frameBudget = ((options.frameBudget ?? 1 / 42) * 1000).toFixed(1);

  const frame = (now: number) => {
    if (!ready()) {
      last = now;
      frameId = visible && document.visibilityState === "visible" ? requestAnimationFrame(frame) : 0;
      return;
    }
    const raw = (now - last) / 1000;
    const delta = Math.min(0.05, raw);
    last = now;
    time += delta;
    spin += delta * 0.05;
    watch(raw);
    progress = first ? target : damp(progress, target, spring, 0.45, delta);
    first = false;
    pointerX = damp(pointerX, pointerTargetX, tiltX, 0.7, delta);
    pointerY = damp(pointerY, pointerTargetY, tiltY, 0.7, delta);
    draw();
    if (!shown) {
      shown = true;
      requestAnimationFrame(options.shown);
    }
    frameId = visible && document.visibilityState === "visible" ? requestAnimationFrame(frame) : 0;
  };
  const wake = () => {
    if (!frameId && visible && document.visibilityState === "visible") {
      last = performance.now();
      frameId = requestAnimationFrame(frame);
    }
  };
  const watcher = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    wake();
  });
  watcher.observe(canvas);
  document.addEventListener("visibilitychange", wake);
  const onLost = (event: Event) => {
    event.preventDefault();
    fail();
  };
  canvas.addEventListener("webglcontextlost", onLost);

  /** The scene cannot draw (context lost, a program refused): the picture underneath stays. */
  function fail() {
    dispose();
    options.lost();
  }

  function dispose() {
    cancelAnimationFrame(frameId);
    frameId = 0;
    visible = false;
    resizer.disconnect();
    watcher.disconnect();
    document.removeEventListener("visibilitychange", wake);
    canvas.removeEventListener("webglcontextlost", onLost);
    context.deleteBuffer(screen);
    context.deleteBuffer(mesh.uv);
    context.deleteBuffer(mesh.index);
    context.deleteProgram(band);
    context.deleteProgram(backdrop);
  }

  return {
    setProgress: (value) => {
      target = clamp(value, 0, 1);
      wake();
    },
    setPointer: (x, y) => {
      pointerTargetX = x ?? 0;
      pointerTargetY = x === null ? 0 : y;
    },
    still: (value, at = 4) => {
      if (!ready(true)) return;
      progress = target = clamp(value, 0, 1);
      time = at;
      spin = at * 0.05;
      draw();
    },
    dispose,
  };
}
