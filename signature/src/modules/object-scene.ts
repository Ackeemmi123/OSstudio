/**
 * The 3D half of the object module: a ring of slats, scattered at first, that
 * fly into place as the visitor scrolls. Three.js, one instanced mesh, two
 * lights and the sky; drawn only while on screen and only while something
 * changes or the ring turns.
 *
 * Loaded on its own, only when the object is about to be seen and the
 * graphics hardware is good, so no other page pays for Three.js.
 */
import {
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  Euler,
  Group,
  HemisphereLight,
  InstancedMesh,
  MathUtils,
  Matrix4,
  MeshStandardMaterial,
  PerspectiveCamera,
  Quaternion,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { SOFTWARE_RENDERER } from "../engine/capabilities";

export interface ObjectScene {
  /** 0 = scattered, 1 = whole. */
  setProgress: (progress: number) => void;
  dispose: () => void;
}

export interface ObjectSceneOptions {
  allowSoftware: boolean;
  lowPower: boolean;
  /** Slat colours, as CSS hex. */
  colours: string[];
  shown: () => void;
  lost: () => void;
}

const COUNT = 40;
const RADIUS = 2.35;

/** A repeatable random number in [0, 1), so the scattered state is the same on every visit. */
const random = (seed: number) => {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};
const ease = (t: number) => t * t * (3 - 2 * t);

export function createObjectScene(canvas: HTMLCanvasElement, options: ObjectSceneOptions): ObjectScene | null {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: !options.lowPower, alpha: true, powerPreference: "high-performance", failIfMajorPerformanceCaveat: !options.allowSoftware });
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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, options.lowPower ? 1 : 1.75));
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.outputColorSpace = SRGBColorSpace;

  const scene = new Scene();
  const camera = new PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(0, 0.4, 10);
  camera.lookAt(0, 0, 0);
  scene.add(new HemisphereLight("#c9d9f0", "#151922", 1.4));
  const key = new DirectionalLight("#ffffff", 2.4);
  key.position.set(4, 6, 6);
  const rim = new DirectionalLight("#c3bcf2", 2);
  rim.position.set(-6, -2, -4);
  scene.add(key, rim);

  const geometry = new RoundedBoxGeometry(0.4, 0.16, 1.1, 3, 0.05);
  const material = new MeshStandardMaterial({ roughness: 0.36, metalness: 0.12 });
  const slats = new InstancedMesh(geometry, material, COUNT);
  const ring = new Group();
  ring.add(slats);
  ring.rotation.x = 0.32;
  scene.add(ring);

  // Where each slat starts (scattered) and ends (in the ring).
  const from = Array.from({ length: COUNT }, (_, i) => {
    // Scattered around and behind the ring, never between it and the camera.
    const r = 3.4 + random(i + 1) * 3;
    const theta = random(i + 101) * Math.PI * 2;
    return {
      position: new Vector3(r * Math.cos(theta) * 1.3, r * Math.sin(theta) * 0.75, -1.5 - random(i + 201) * 4.5),
      rotation: new Quaternion().setFromEuler(new Euler(random(i + 301) * 6.28, random(i + 401) * 6.28, random(i + 501) * 6.28)),
      delay: (i / COUNT) * 0.35 + random(i + 601) * 0.15,
    };
  });
  const to = Array.from({ length: COUNT }, (_, i) => {
    const angle = (i / COUNT) * Math.PI * 2;
    return { position: new Vector3(Math.cos(angle) * RADIUS, Math.sin(angle) * RADIUS, 0), rotation: new Quaternion().setFromEuler(new Euler(0, 0, angle + Math.PI / 2)) };
  });
  const colours = options.colours.map((hex) => new Color(hex));
  for (let i = 0; i < COUNT; i++) slats.setColorAt(i, colours[i % 7 === 0 ? 2 : i % 3 === 0 ? 1 : 0] ?? colours[0]);

  const matrix = new Matrix4();
  const position = new Vector3();
  const rotation = new Quaternion();
  const scale = new Vector3(1, 1, 1);
  let target = 0;
  let progress = -1;
  const place = (p: number) => {
    for (let i = 0; i < COUNT; i++) {
      const t = ease(MathUtils.clamp((p - from[i].delay) / 0.5, 0, 1));
      position.lerpVectors(from[i].position, to[i].position, t);
      rotation.slerpQuaternions(from[i].rotation, to[i].rotation, t);
      slats.setMatrixAt(i, matrix.compose(position, rotation, scale));
    }
    slats.instanceMatrix.needsUpdate = true;
  };

  const fit = () => {
    const { width, height } = canvas.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // Keep the whole ring in frame on narrow screens.
    camera.position.z = width / height < 1 ? 10 / Math.max(0.55, width / height) : 10;
    camera.updateProjectionMatrix();
  };
  const resizer = new ResizeObserver(fit);
  resizer.observe(canvas);
  fit();

  let visible = false;
  let frameId = 0;
  let last = performance.now();
  let time = 0;
  let shown = false;
  const frame = (now: number) => {
    const delta = Math.min(0.1, (now - last) / 1000);
    last = now;
    progress = progress < 0 ? target : progress + (target - progress) * Math.min(1, delta * 6);
    place(progress);
    // Turned away while scattered; facing the visitor once whole, with a slow sway so it reads as 3D.
    time += delta;
    ring.rotation.y = (1 - progress) * 1.1 + Math.sin(time * 0.35) * 0.42;
    ring.rotation.x = 0.32 + Math.sin(time * 0.23) * 0.08;
    renderer.render(scene, camera);
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
    material.dispose();
    slats.dispose();
    renderer.dispose();
  }

  return {
    setProgress: (value) => {
      target = MathUtils.clamp(value, 0, 1);
      wake();
    },
    dispose,
  };
}
