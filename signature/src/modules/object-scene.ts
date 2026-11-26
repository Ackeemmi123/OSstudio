/**
 * The 3D half of the object module: twelve curved segments of clear glass,
 * each with a narrow silver collar like the clasp of a necklace, scattered at
 * first, that sweep together into one fine ring as the visitor scrolls, with
 * seams that breathe once it is whole.
 *
 * Made to be looked at closely: physically based glass (refraction,
 * dispersion, a trace of iridescence) and satin silver, lit like a product photograph (a dark studio with
 * softbox strips, so every edge carries a crisp highlight), filmic tone
 * mapping, a soft bloom on the brightest highlights, antialiasing. Made to move well: the scroll drives a critically
 * damped spring rather than the scene directly, each blade travels on a curve,
 * and once whole the crown breathes and tilts a little toward the pointer.
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
  InstancedMesh,
  MathUtils,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Quaternion,
  Scene,
  SphereGeometry,
  TorusGeometry,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
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

const SEGMENTS = 12;
const RADIUS = 2.1;
const TUBE = 0.2;
/** Each segment's share of the ring; the rest is the seam. */
const ARC = ((Math.PI * 2) / SEGMENTS) * 0.985;
/** The silver collar at the start of each segment, slightly thicker than the glass. */
const COLLAR = 0.07;

/** A repeatable random number in [0, 1), so the scattered state is the same on every visit. */
const random = (seed: number) => {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};
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
 * The section's ink with a coloured glow behind the ring and a faint word for
 * the glass to bend. Drawn at the canvas's own proportions, so nothing is
 * stretched; redrawn when they change.
 */
function paintBackdrop(canvas: HTMLCanvasElement, aspect: number, ink: string, glow: string, tint: string, centre: number): void {
  const height = 1024;
  const width = Math.round(height * Math.min(3, Math.max(0.5, aspect)));
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d")!;
  context.fillStyle = ink;
  context.fillRect(0, 0, width, height);
  const orb = (x: number, y: number, r: number, colour: string, alpha: string) => {
    const gradient = context.createRadialGradient(x, y, 0, x, y, r);
    gradient.addColorStop(0, `${colour}${alpha}`);
    gradient.addColorStop(1, `${colour}00`);
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
  };
  orb(width * centre, height * 0.5, height * 0.62, tint, "cc");
  orb(width * centre, height * 0.46, height * 0.3, glow, "99");
  orb(width * Math.min(0.9, centre + 0.45), height * 0.28, height * 0.5, tint, "22");
  context.font = `700 ${Math.round(height * 0.3)}px Archivo, "Archivo fallback", Arial, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "rgba(255,255,255,0.055)";
  context.fillText("axivo", width * centre, height * 0.52);
}

/**
 * A dark studio with softbox strips, as product photographers light glass:
 * the environment the blades reflect. Built in code, nothing downloaded.
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
  // A large overhead softbox, two tall side strips, a coloured rim from behind, a soft bounce from below and a front fill.
  strip(16, 6, "#ffffff", 5, new Vector3(0, 10, 2), new Euler());
  strip(3, 14, "#ffffff", 4, new Vector3(-11, 1, 3), new Euler());
  strip(2.4, 12, "#ffffff", 3, new Vector3(11, -1, 3), new Euler());
  strip(12, 6, glow, 6, new Vector3(0, 2, -12), new Euler());
  strip(14, 4, "#8a9cff", 1.6, new Vector3(0, -10, 2), new Euler());
  strip(10, 8, "#ffffff", 1.4, new Vector3(0, 0, 15), new Euler());
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
   * 2 = refracting glass, bloom, up to twice the pixels; 1 = no bloom, fewer
   * pixels; 0 = smoked glass that reflects instead of refracting. A device that
   * looks modest on paper starts one step down; any device steps down if it
   * cannot hold a smooth frame rate, and never steps back up mid-visit.
   */
  let level: number = options.quality ?? (options.lowPower ? 1 : 2);
  const fixed = options.quality !== undefined;
  const pixelRatio = () => Math.min(window.devicePixelRatio || 1, level === 2 ? 2 : level === 1 ? 1.25 : 1);
  renderer.setPixelRatio(pixelRatio());
  renderer.toneMapping = AgXToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.outputColorSpace = SRGBColorSpace;
  // Refraction samples a copy of the scene; three quarters of its size is invisible in the result and much cheaper.
  renderer.transmissionResolutionScale = 0.75;

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
  scene.environmentIntensity = 1.1;

  const camera = new PerspectiveCamera(28, 1, 0.1, 100);
  camera.position.set(0, 0, 10);
  const key = new DirectionalLight("#ffffff", 1.6);
  key.position.set(3, 5, 6);
  const rim = new DirectionalLight(new Color(glow), 2.4);
  rim.position.set(-5, -3, -3);
  scene.add(key, rim);

  // A soft bloom on the brightest highlights only, at the top level.
  const composer = new EffectComposer(renderer);
  let bloom: UnrealBloomPass | null = null;
  {
    composer.renderTarget1.texture.type = HalfFloatType;
    composer.renderTarget2.texture.type = HalfFloatType;
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new Vector2(256, 256), 0.16, 0.45, 0.93);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  }
  const render = () => (level === 2 ? composer.render() : renderer.render(scene, camera));

  // One curved segment of the ring and its collar, moved so that both turn about the segment's middle.
  const centre = (geometry: TorusGeometry) => geometry.translate(-Math.cos(ARC / 2) * RADIUS, -Math.sin(ARC / 2) * RADIUS, 0);
  const geometry = centre(new TorusGeometry(RADIUS, TUBE, 40, 40, ARC));
  const collarGeometry = centre(new TorusGeometry(RADIUS, TUBE * 1.08, 40, 6, COLLAR));
  const glass = new MeshPhysicalMaterial({
    color: "#ffffff",
    roughness: 0.04,
    metalness: 0,
    transmission: 1,
    thickness: 1.6,
    ior: 1.5,
    dispersion: 5,
    attenuationColor: new Color(tint).lerp(new Color("#ffffff"), 0.35),
    attenuationDistance: 2.6,
    iridescence: 0.3,
    iridescenceIOR: 1.3,
    iridescenceThicknessRange: [200, 420],
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    specularIntensity: 1,
  });
  // The lowest level: tinted glass you see through, with sharp reflections, but no refraction pass: still glass, far cheaper.
  const smoked = new MeshPhysicalMaterial({
    color: new Color(tint).lerp(new Color("#ffffff"), 0.25),
    roughness: 0.02,
    metalness: 0,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    clearcoat: 1,
    clearcoatRoughness: 0.01,
    iridescence: 0.45,
    iridescenceIOR: 1.3,
    iridescenceThicknessRange: [220, 460],
    specularIntensity: 1,
    envMapIntensity: 1.8,
  });
  // Satin silver rather than mirror chrome: a mirror in a dark room reads as black.
  const metal = new MeshPhysicalMaterial({ color: metalColour, roughness: 0.14, metalness: 1, clearcoat: 1, clearcoatRoughness: 0.04 });
  const glassMesh = new InstancedMesh(geometry, glass, SEGMENTS);
  const metalMesh = new InstancedMesh(collarGeometry, metal, SEGMENTS);
  const crown = new Group();
  crown.add(glassMesh, metalMesh);
  scene.add(crown);

  // Each segment: where it waits, the curve it travels, where it ends.
  const blades = Array.from({ length: SEGMENTS }, (_, i) => {
    const start0 = (i / SEGMENTS) * Math.PI * 2;
    const angle = start0 + ARC / 2;
    const end = new Vector3(Math.cos(angle) * RADIUS, Math.sin(angle) * RADIUS, 0);
    const endRotation = new Quaternion().setFromEuler(new Euler(0, 0, start0));
    const r = 3.4 + random(i + 1) * 2.4;
    const theta = angle + (random(i + 2) - 0.5) * 1.2;
    const start = new Vector3(Math.cos(theta) * r * 1.3, Math.sin(theta) * r * 0.9, -2.2 - random(i + 3) * 3.5);
    // The curve bows outward and toward the viewer, so segments sweep in rather than slide.
    const control = start.clone().lerp(end, 0.5).add(new Vector3(Math.cos(angle) * 1.6, Math.sin(angle) * 1.6, 2.4 + random(i + 4)));
    const startRotation = new Quaternion().setFromEuler(new Euler(random(i + 5) * Math.PI * 2, random(i + 6) * Math.PI * 2, random(i + 7) * Math.PI * 2));
    return { angle, start, control, end, startRotation, endRotation, delay: (i / SEGMENTS) * 0.26 + random(i + 8) * 0.12 };
  });

  const matrix = new Matrix4();
  const position = new Vector3();
  const a = new Vector3();
  const b = new Vector3();
  const rotation = new Quaternion();
  const scale = new Vector3(1, 1, 1);
  const place = (progress: number, time: number) => {
    for (let i = 0; i < SEGMENTS; i++) {
      const blade = blades[i];
      const t = easeInOut(MathUtils.clamp((progress - blade.delay) / 0.62, 0, 1));
      // Quadratic curve: start → control → end.
      a.lerpVectors(blade.start, blade.control, t);
      b.lerpVectors(blade.control, blade.end, t);
      position.lerpVectors(a, b, t);
      // Once whole, the seams breathe: a slow wave runs round the ring, opening and closing them a hair.
      const breath = (0.5 + 0.5 * Math.sin(time * 0.9 - blade.angle * 2)) * 0.045 * t;
      position.x += Math.cos(blade.angle) * breath;
      position.y += Math.sin(blade.angle) * breath;
      position.z += Math.sin(time * 0.7 + blade.angle) * 0.03 * t;
      rotation.slerpQuaternions(blade.startRotation, blade.endRotation, t);
      matrix.compose(position, rotation, scale);
      // The segment and its collar travel as one piece.
      glassMesh.setMatrixAt(i, matrix);
      metalMesh.setMatrixAt(i, matrix);
    }
    glassMesh.instanceMatrix.needsUpdate = true;
    metalMesh.instanceMatrix.needsUpdate = true;
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
    // On wide screens the crown sits left of the text, like a product beside its caption; on narrow ones, centred and whole.
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
    // Turned away while scattered, facing the visitor once whole; a slow turn in its own plane always.
    crown.rotation.z += delta * 0.06;
    pointerX = damp(pointerX, pointerTargetX, tiltX, 0.7, delta);
    pointerY = damp(pointerY, pointerTargetY, tiltY, 0.7, delta);
    crown.position.x = offsetX;
    // A three-quarter view once whole: tilted and turned, so the glass shows its depth.
    crown.rotation.y = 0.36 + (1 - progress) * 0.7 + pointerX * 0.3 + Math.sin(time * 0.3) * 0.07;
    crown.rotation.x = -0.42 + (1 - progress) * 0.4 - pointerY * 0.24 + Math.sin(time * 0.23) * 0.05;
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
    if (level === 1) renderer.transmissionResolutionScale = 0.5;
    if (level === 0) glassMesh.material = smoked;
    canvas.dataset.quality = String(level);
    fit();
  };
  canvas.dataset.quality = String(level);
  canvas.dataset.frameBudget = ((options.frameBudget ?? 1 / 42) * 1000).toFixed(1);
  if (level <= 1) renderer.transmissionResolutionScale = 0.5;
  if (level === 0) glassMesh.material = smoked;

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
    collarGeometry.dispose();
    glass.dispose();
    smoked.dispose();
    metal.dispose();
    glassMesh.dispose();
    metalMesh.dispose();
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
      crown.rotation.z = at * 0.06;
      pose(0);
      place(progress, time);
      render();
    },
    dispose,
  };
}
