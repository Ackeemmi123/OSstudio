/**
 * A full-screen fragment shader on one canvas, in plain WebGL: no 3D library,
 * a few kilobytes. For fields, gradients and image effects; real 3D scenes
 * bring Three.js with them when a module needs it.
 *
 * It compiles the shader in the background where the browser can
 * (KHR_parallel_shader_compile), so the page never freezes while it does,
 * draws only while the canvas is on screen and the tab is visible, caps the
 * pixel ratio, and gives up cleanly if the graphics context is lost.
 */

import { SOFTWARE_RENDERER } from "./capabilities";

export type Uniform = number | readonly [number, number] | readonly [number, number, number];

export interface ShaderStageOptions {
  fragment: string;
  /** Draw even on a software renderer. For tests and demos only. */
  allowSoftware?: boolean;
  uniforms: Record<string, Uniform>;
  /** The highest device pixel ratio worth paying for. Under 1 draws fewer pixels than CSS has, for soft fields. */
  maxPixelRatio: number;
  /** Frames per second. Slow fields look the same at 30 and cost half. */
  fps?: number;
  /** Seconds added to the clock, so two fields with the same shader show different moments. */
  timeOffset?: number;
  /** An image (same origin, loaded) for the shader as `uImage`, with its size as `uImageSize`. */
  image?: HTMLImageElement;
  /** A transparent canvas, for effects that reveal what is underneath; the shader writes premultiplied colour. */
  transparent?: boolean;
  /** Called before each frame with seconds since start and since the last frame. */
  frame?: (time: number, delta: number, set: (name: string, value: Uniform) => void) => void;
  /** Called once, after the first frame is on screen. */
  shown?: () => void;
  /** Called if the stage cannot draw any more (context lost, shader refused). */
  lost?: () => void;
}

export interface ShaderStage {
  set: (name: string, value: Uniform) => void;
  dispose: () => void;
}

const VERTEX = `attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

function shader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const object = gl.createShader(type);
  if (!object) return null;
  gl.shaderSource(object, source);
  gl.compileShader(object);
  return object;
}

export function createShaderStage(canvas: HTMLCanvasElement, options: ShaderStageOptions): ShaderStage | null {
  const gl = canvas.getContext("webgl", { antialias: false, alpha: options.transparent === true, premultipliedAlpha: true, depth: false, stencil: false, powerPreference: "default", preserveDrawingBuffer: false, failIfMajorPerformanceCaveat: !options.allowSoftware });
  if (!gl) return null;
  const context = gl;
  // A flowing shader on the CPU makes the whole page stutter; the still version looks better. Not every software renderer admits to being slow, so ask its name.
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  if (!options.allowSoftware && info && SOFTWARE_RENDERER.test(String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)))) {
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return null;
  }

  const vertex = shader(gl, gl.VERTEX_SHADER, VERTEX);
  const fragment = shader(gl, gl.FRAGMENT_SHADER, `precision highp float;\n${options.fragment}`);
  const program = gl.createProgram();
  if (!vertex || !fragment || !program) return null;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  const parallel = gl.getExtension("KHR_parallel_shader_compile");

  // One triangle that covers the screen.
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

  // The image, if any, as texture unit 0.
  let texture: WebGLTexture | null = null;
  if (options.image) {
    texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, options.image);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  const values = new Map<string, Uniform>(Object.entries(options.uniforms));
  if (options.image) values.set("uImageSize", [options.image.naturalWidth, options.image.naturalHeight]);
  const locations = new Map<string, WebGLUniformLocation | null>();
  let ready = false;
  let disposed = false;
  let shown = false;

  const set = (name: string, value: Uniform) => values.set(name, value);
  const upload = () => {
    for (const [name, value] of values) {
      if (!locations.has(name)) locations.set(name, gl.getUniformLocation(program, name));
      const location = locations.get(name);
      if (!location) continue;
      if (typeof value === "number") gl.uniform1f(location, value);
      else if (value.length === 2) gl.uniform2f(location, value[0], value[1]);
      else gl.uniform3f(location, value[0], value[1], value[2]);
    }
  };

  const ratio = () => Math.min(window.devicePixelRatio || 1, options.maxPixelRatio);
  const fit = () => {
    const { width, height } = canvas.getBoundingClientRect();
    if (!width || !height) return;
    canvas.width = Math.round(width * ratio());
    canvas.height = Math.round(height * ratio());
    gl.viewport(0, 0, canvas.width, canvas.height);
    set("uResolution", [canvas.width, canvas.height]);
  };

  /** True once the program is linked; with the extension, without waiting on it. */
  const linked = () => {
    if (ready) return true;
    if (parallel && !gl.getProgramParameter(program, parallel.COMPLETION_STATUS_KHR)) return false;
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      fail();
      return false;
    }
    gl.useProgram(program);
    if (texture) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(gl.getUniformLocation(program, "uImage"), 0);
    }
    const position = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    ready = true;
    return true;
  };

  let visible = false;
  let running = false;
  let frameId = 0;
  let start = 0;
  let last = 0;

  const draw = () => {
    if (!linked()) return;
    const now = performance.now() / 1000;
    if (!start) start = last = now;
    options.frame?.(now - start, Math.min(now - last, 0.1), set);
    last = now;
    set("uTime", now - start + (options.timeOffset ?? 0));
    upload();
    if (options.transparent) {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!shown) {
      shown = true;
      requestAnimationFrame(() => options.shown?.());
    }
  };
  const interval = 1 / (options.fps ?? 60) - 0.002;
  let drawn = 0;
  const loop = () => {
    const now = performance.now() / 1000;
    if (now - drawn >= interval) {
      drawn = now;
      draw();
    }
    if (running) frameId = requestAnimationFrame(loop);
  };
  const update = () => {
    const shouldRun = visible && document.visibilityState === "visible" && !disposed;
    if (shouldRun && !running) {
      running = true;
      last = performance.now() / 1000;
      frameId = requestAnimationFrame(loop);
    } else if (!shouldRun && running) {
      running = false;
      cancelAnimationFrame(frameId);
    }
  };

  const resizer = new ResizeObserver(fit);
  resizer.observe(canvas);
  fit();
  const watcher = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    update();
  });
  watcher.observe(canvas);
  document.addEventListener("visibilitychange", update);

  const onLost = (event: Event) => {
    event.preventDefault();
    fail();
  };
  canvas.addEventListener("webglcontextlost", onLost);

  function fail() {
    dispose();
    options.lost?.();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    running = false;
    cancelAnimationFrame(frameId);
    resizer.disconnect();
    watcher.disconnect();
    document.removeEventListener("visibilitychange", update);
    canvas.removeEventListener("webglcontextlost", onLost);
    context.deleteBuffer(buffer);
    if (texture) context.deleteTexture(texture);
    context.deleteProgram(program);
    context.deleteShader(vertex);
    context.deleteShader(fragment);
  }

  return { set, dispose };
}
