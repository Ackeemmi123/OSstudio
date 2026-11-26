/**
 * The 3D half of the object module: one band of satin metal, a Möbius loop,
 * that starts as eight loose pieces drifting and turning in space and, as the
 * visitor scrolls, flows together into a single unbroken band: many parts,
 * one thing. Once whole it keeps moving slowly, like cloth in still air.
 *
 * Made to be looked at closely: brushed, anisotropic satin that draws long
 * soft highlights along the band, lit like a product photograph (a dark studio
 * with softbox strips), filmic tone mapping, a gentle bloom on the brightest
 * highlights, antialiasing. Made to move well: the whole shape is computed on
 * the graphics card from flowing noise, so nothing jumps; the scroll drives a
 * critically damped spring rather than the scene directly; and the band tilts
 * a little toward the pointer.
 *
 * Loaded on its own, only when the object is about to be seen and the
 * graphics hardware is good, so no other page pays for Three.js.
 */
import {
  AgXToneMapping,
  BackSide,
  CanvasTexture,
  Color,
  DirectionalLight,
  DoubleSide,
  Euler,
  Group,
  HalfFloatType,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import type { Material, WebGLProgramParametersWithUniforms } from "three";
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
  /** Ink (background), glass tint, metal, glow, as CSS hex. */
  colours: string[];
  /** Keep the drawing buffer for screenshots (stills only). */
  preserve?: boolean;
  /** Centre the ring in the frame, for stills, instead of placing it beside text on wide screens. */
  centred?: boolean;
  /** A fixed quality level (0–2) instead of measuring: for stills and demos. */
  quality?: 0 | 1 | 2;
  /**
   * The longest average frame, in seconds, before quality steps down. Set from
   * what the screen delivers before the scene starts, so a 30 Hz screen or a
   * phone in low-power mode is not mistaken for a slow graphics card.
   */
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

/*
 * The band, computed per vertex on the graphics card from its (u, v) place:
 * u along the loop, v across it. 3D simplex noise: Ian McEwan and Stefan
 * Gustavson (Ashima Arts), MIT licence. The centre line wanders and the band
 * twists while unformed; while split, each piece drifts and turns about its
 * own middle. The normal is found again from two neighbours, so the light
 * follows the shape exactly.
 */
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

/** Gives a material the band's shape, and cuts the gaps between pieces while it is split. */
function shape(material: Material, uniforms: Record<string, { value: number }>): void {
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${SHAPE}\nvarying float vSgU;`)
      .replace(
        "#include <beginnormal_vertex>",
        /* glsl */ `
        float sgPiece = min(floor(uv.x * ${PIECES.toFixed(1)}), ${(PIECES - 1).toFixed(1)});
        vec3 sgP = sgBand(uv, sgPiece);
        vec3 objectNormal = normalize(cross(sgBand(uv + vec2(0.0005, 0.0), sgPiece) - sgP, sgBand(uv + vec2(0.0, 0.01), sgPiece) - sgP));
        vSgU = uv.x;`,
      )
      .replace("#include <begin_vertex>", "vec3 transformed = sgP;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uSplit;\nvarying float vSgU;")
      .replace(
        "#include <clipping_planes_fragment>",
        /* glsl */ `#include <clipping_planes_fragment>
        float sgAt = fract(vSgU * ${PIECES.toFixed(1)});
        if (min(sgAt, 1.0 - sgAt) < uSplit * 0.13) discard;`,
      );
  };
  material.customProgramCacheKey = () => "sg-satin-band";
}

/** Slow in, slow out, with most of the travel in the middle: how real things settle. */
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

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

/**
 * The section's ink lit like a studio sweep: a soft pool of the tint behind the
 * sculpture, a brighter core, the floor falling away into shadow, and a fine
 * grain so the dark gradients never band. Drawn at the canvas's own
 * proportions, so nothing is stretched; redrawn when they change.
 */
function paintBackdrop(canvas: HTMLCanvasElement, aspect: number, ink: string, glow: string, tint: string, centre: number): void {
  const height = 900;
  const width = Math.round(height * Math.min(3, Math.max(0.5, aspect)));
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d")!;
  context.fillStyle = ink;
  context.fillRect(0, 0, width, height);
  const orb = (x: number, y: number, r: number, colour: string, alpha: string, squash = 1) => {
    context.save();
    context.translate(x, y);
    context.scale(1, squash);
    const gradient = context.createRadialGradient(0, 0, 0, 0, 0, r);
    gradient.addColorStop(0, `${colour}${alpha}`);
    gradient.addColorStop(0.55, `${colour}${Math.round(Number.parseInt(alpha, 16) * 0.35).toString(16).padStart(2, "0")}`);
    gradient.addColorStop(1, `${colour}00`);
    context.fillStyle = gradient;
    context.fillRect(-x, -y / squash, width, height / squash);
    context.restore();
  };
  orb(width * centre, height * 0.46, height * 0.75, tint, "b0", 0.92);
  orb(width * centre, height * 0.42, height * 0.34, glow, "70");
  // The floor: darker toward the bottom edge, as a sweep turns away from the light.
  const floor = context.createLinearGradient(0, height * 0.55, 0, height);
  floor.addColorStop(0, `${ink}00`);
  floor.addColorStop(1, `${ink}e6`);
  context.fillStyle = floor;
  context.fillRect(0, 0, width, height);
  // Grain, a trace: dark gradients band without it.
  const image = context.getImageData(0, 0, width, height);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const n = (Math.random() - 0.5) * 6;
    data[i] += n;
    data[i + 1] += n;
    data[i + 2] += n;
  }
  context.putImageData(image, 0, 0);
}

/**
 * A dark studio with softbox strips, as product photographers light glass:
 * the environment the glass reflects. Built in code, nothing downloaded.
 */
function studio(renderer: WebGLRenderer, glow: string) {
  const room = new Scene();
  room.add(new Mesh(new SphereGeometry(20, 32, 16), new MeshBasicMaterial({ color: "#05060a", side: BackSide })));
  const strip = (w: number, h: number, colour: string, intensity: number, position: Vector3, rotation: Euler) => {
    const plane = new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ color: new Color(colour).multiplyScalar(intensity), side: DoubleSide }));
    plane.position.copy(position);
    plane.rotation.copy(rotation);
    plane.lookAt(0, 0, 0);
    room.add(plane);
  };
  // An overhead softbox, two narrow side strips, a coloured rim from behind and a faint bounce from below.
  // No front fill: metal facing the camera mirrors the dark behind it, and that dark is what makes the highlights read.
  strip(14, 4, "#ffffff", 3.2, new Vector3(0, 10, 2), new Euler());
  strip(1.6, 14, "#ffffff", 4, new Vector3(-11, 1, 3), new Euler());
  strip(1.2, 12, "#ffffff", 2.6, new Vector3(11, -1, 3), new Euler());
  strip(12, 6, glow, 5, new Vector3(0, 2, -12), new Euler());
  strip(14, 3, "#8a9cff", 1.2, new Vector3(0, -10, 2), new Euler());
  strip(3, 2, "#ffffff", 0.6, new Vector3(4, 3, 15), new Euler());
  const pmrem = new PMREMGenerator(renderer);
  const texture = pmrem.fromScene(room, 0.02).texture;
  room.traverse((object) => {
    if (object instanceof Mesh) {
      object.geometry.dispose();
      (object.material as MeshBasicMaterial).dispose();
    }
  });
  pmrem.dispose();
  return texture;
}

export function createObjectScene(canvas: HTMLCanvasElement, options: ObjectSceneOptions): ObjectScene | null {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance", failIfMajorPerformanceCaveat: !options.allowSoftware, preserveDrawingBuffer: options.preserve === true });
  } catch {
    return null;
  }
  const gl = renderer.getContext();
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  if (!options.allowSoftware && info && SOFTWARE_RENDERER.test(String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)))) {
    renderer.dispose();
    renderer.forceContextLoss();
    return null;
  }
  const [ink = "#151922", tint = "#4a5bb5", metalColour = "#c9d9f0", glow = "#879dc7"] = options.colours;
  /*
   * Quality adapts to what the device actually manages, measured, not guessed:
   * 2 = full satin with clearcoat and sheen, bloom, up to twice the pixels;
   * 1 = no bloom, fewer pixels, a coarser band; 0 = plain satin. A device that
   * looks modest on paper starts one step down; any device steps down if it
   * cannot hold a smooth frame rate, and never steps back up mid-visit.
   */
  let level: number = options.quality ?? (options.lowPower ? 1 : 2);
  const fixed = options.quality !== undefined;
  const pixelRatio = () => Math.min(window.devicePixelRatio || 1, level === 2 ? 2 : level === 1 ? 1.25 : 1);
  renderer.setPixelRatio(pixelRatio());
  renderer.toneMapping = AgXToneMapping;
  renderer.toneMappingExposure = 0.85;
  renderer.outputColorSpace = SRGBColorSpace;

  const scene = new Scene();
  // The glow sits behind the ring: left of centre beside text, in the middle for stills.
  const backdropCanvas = document.createElement("canvas");
  const background = new CanvasTexture(backdropCanvas);
  background.colorSpace = SRGBColorSpace;
  scene.background = background;
  let backdropAspect = 0;
  const repaint = (aspect: number) => {
    if (Math.abs(aspect - backdropAspect) < 0.05) return;
    backdropAspect = aspect;
    const centre = options.centred || aspect <= 1.25 ? 0.5 : 0.5 + (-2.25 * Math.min(1.3, aspect / 1.6)) / (2 * 14 * Math.tan((28 * Math.PI) / 360) * aspect);
    paintBackdrop(backdropCanvas, aspect, ink, glow, tint, centre);
    background.needsUpdate = true;
  };
  const environment = studio(renderer, glow);
  scene.environment = environment;
  scene.environmentIntensity = 0.9;

  const camera = new PerspectiveCamera(28, 1, 0.1, 100);
  camera.position.set(0, 0, 10);
  const key = new DirectionalLight("#ffffff", 0.9);
  key.position.set(3, 5, 6);
  const rim = new DirectionalLight(new Color(glow), 1.8);
  rim.position.set(-5, -3, -3);
  scene.add(key, rim);

  // A soft bloom on the brightest highlights only, at the top level.
  const composer = new EffectComposer(renderer);
  let bloom: UnrealBloomPass | null = null;
  {
    composer.renderTarget1.texture.type = HalfFloatType;
    composer.renderTarget2.texture.type = HalfFloatType;
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new Vector2(256, 256), 0.08, 0.4, 0.96);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  }
  const render = () => (level === 2 ? composer.render() : renderer.render(scene, camera));

  // The band: a strip divided finely along its length, so the shape stays smooth; coarser one step down.
  const geometry = new PlaneGeometry(1, 1, level === 2 ? 720 : 420, level === 2 ? 14 : 8);
  const shaping = { uTime: { value: 0 }, uAmp: { value: TURBULENCE }, uSplit: { value: 1 } };
  // Silver with the site's tint in it: dark enough that the highlights have something to stand out from.
  const silk = new Color(tint).lerp(new Color(metalColour), 0.55);
  // Brushed satin metal: anisotropy draws the highlights out along the band, like light on satin.
  const satin = new MeshPhysicalMaterial({
    color: silk,
    metalness: 1,
    roughness: 0.13,
    anisotropy: 0.55,
    anisotropyRotation: Math.PI / 2,
    clearcoat: 0.5,
    clearcoatRoughness: 0.06,
    iridescence: 0.2,
    iridescenceIOR: 1.5,
    iridescenceThicknessRange: [240, 520],
    side: DoubleSide,
  });
  // The lowest level: the same satin without the costly layers.
  const plain = new MeshPhysicalMaterial({ color: silk, metalness: 0.9, roughness: 0.32, anisotropy: 0.6, anisotropyRotation: Math.PI / 2, side: DoubleSide });
  shape(satin, shaping);
  shape(plain, shaping);
  const sculpture = new Mesh(geometry, satin);
  // Its true shape exists only on the graphics card: never cull it on the flat strip's bounds.
  sculpture.frustumCulled = false;
  const band = new Group();
  band.add(sculpture);
  scene.add(band);

  const place = (progress: number, time: number) => {
    shaping.uTime.value = time;
    // The pieces close up first; the band then calms, keeping a slow drift once whole.
    const join = easeInOut(MathUtils.clamp(progress / 0.62, 0, 1));
    shaping.uSplit.value = Math.sqrt(1 - join);
    shaping.uAmp.value = MathUtils.lerp(TURBULENCE, CALM, easeInOut(progress));
  };

  const fit = () => {
    const { width, height } = canvas.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setPixelRatio(pixelRatio());
    renderer.setSize(width, height, false);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(width, height);
    bloom?.resolution.set(width / 2, height / 2);
    const aspect = width / height;
    camera.aspect = aspect;
    repaint(aspect);
    // On wide screens the band sits left of the text, like a product beside its caption; on narrow ones, centred and whole.
    offsetX = aspect > 1.25 && !options.centred ? -2.25 * Math.min(1.3, aspect / 1.6) : 0;
    camera.position.z = aspect < 1 ? 14 / Math.max(0.6, aspect) : 14;
    camera.updateProjectionMatrix();
  };
  let offsetX = 0;
  const resizer = new ResizeObserver(fit);
  resizer.observe(canvas);
  fit();

  let target = 0;
  let progress = 0;
  const progressSpring = { velocity: 0 };
  let pointerX = 0;
  let pointerY = 0;
  let pointerTargetX = 0;
  let pointerTargetY = 0;
  const tiltX = { velocity: 0 };
  const tiltY = { velocity: 0 };
  let time = 0;
  let first = true;

  const pose = (delta: number) => {
    // Turned away while unformed, a three-quarter view once whole; a slow turn in its own plane always.
    band.rotation.z += delta * 0.05;
    pointerX = damp(pointerX, pointerTargetX, tiltX, 0.7, delta);
    pointerY = damp(pointerY, pointerTargetY, tiltY, 0.7, delta);
    band.position.x = offsetX;
    // A three-quarter view once whole: tilted and turned, so the glass shows its depth.
    band.rotation.y = 0.55 + (1 - progress) * 0.5 + pointerX * 0.3 + Math.sin(time * 0.3) * 0.08;
    band.rotation.x = -0.85 + (1 - progress) * 0.5 - pointerY * 0.24 + Math.sin(time * 0.23) * 0.06;
  };

  let visible = false;
  let frameId = 0;
  let last = performance.now();
  let shown = false;
  /*
   * Frame-time watch. The first frames compile shaders and are slow by nature,
   * so they are skipped; then each window of 60 frames is judged on its 75th
   * percentile, which one stall cannot sway, and quality steps down only after
   * two slow windows in a row.
   */
  const window60: number[] = [];
  let frames = 0;
  let slowWindows = 0;
  const watch = (delta: number) => {
    frames++;
    if (fixed || frames <= 45 || level === 0) return;
    window60.push(delta);
    if (window60.length < 60) return;
    const p75 = window60.sort((x, y) => x - y)[44];
    window60.length = 0;
    canvas.dataset.frameP75 = (p75 * 1000).toFixed(1);
    slowWindows = p75 > (options.frameBudget ?? 1 / 42) ? slowWindows + 1 : 0;
    if (slowWindows < 2) return;
    slowWindows = 0;
    level--;
    if (level === 0) sculpture.material = plain;
    canvas.dataset.quality = String(level);
    fit();
  };
  canvas.dataset.quality = String(level);
  canvas.dataset.frameBudget = ((options.frameBudget ?? 1 / 42) * 1000).toFixed(1);
  if (level === 0) sculpture.material = plain;

  const frame = (now: number) => {
    const raw = (now - last) / 1000;
    const delta = Math.min(0.05, raw);
    last = now;
    time += delta;
    watch(raw);
    progress = first ? target : damp(progress, target, progressSpring, 0.45, delta);
    first = false;
    pose(delta);
    place(progress, time);
    render();
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
    dispose();
    options.lost();
  };
  canvas.addEventListener("webglcontextlost", onLost);

  function dispose() {
    cancelAnimationFrame(frameId);
    frameId = 0;
    visible = false;
    resizer.disconnect();
    watcher.disconnect();
    document.removeEventListener("visibilitychange", wake);
    canvas.removeEventListener("webglcontextlost", onLost);
    geometry.dispose();
    satin.dispose();
    plain.dispose();
    background.dispose();
    environment.dispose();
    composer.dispose();
    renderer.dispose();
  }

  return {
    setProgress: (value) => {
      target = MathUtils.clamp(value, 0, 1);
      wake();
    },
    setPointer: (x, y) => {
      pointerTargetX = x ?? 0;
      pointerTargetY = x === null ? 0 : y;
    },
    still: (value, at = 4) => {
      progress = target = MathUtils.clamp(value, 0, 1);
      time = at;
      band.rotation.z = at * 0.06;
      pose(0);
      place(progress, time);
      render();
    },
    dispose,
  };
}
