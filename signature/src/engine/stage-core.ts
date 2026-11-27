/**
 * The shader stage's drawing, wherever it runs: in a worker on an
 * OffscreenCanvas, where the browser allows it (see shader-stage.ts), or on
 * the main thread. It knows nothing of the page: the canvas's size, whether it
 * is on screen, the uniforms and the picture all come in from outside, so the
 * same code draws the same pixels in both places.
 */
import { SOFTWARE_RENDERER } from "./capabilities";

export type Uniform = number | readonly [number, number] | readonly [number, number, number];

/** What a stage draws: everything here can be sent to a worker. */
export interface StageSpec {
  fragment: string;
  allowSoftware: boolean;
  uniforms: Record<string, Uniform>;
  maxPixelRatio: number;
  fps: number;
  timeOffset: number;
  transparent: boolean;
  /** Nothing is drawn until a picture has been given (`picture`). */
  textured: boolean;
}

/** A picture decoded in horizontal bands, already flipped for WebGL and not premultiplied. */
export interface Picture {
  width: number;
  height: number;
  bands: { row: number; bitmap: ImageBitmap }[];
}

export interface StageEvents {
  /** Called before each frame with seconds since start and since the last frame (main thread only). */
  frame?: (time: number, delta: number, set: (name: string, value: Uniform) => void) => void;
  /** Once, after the first frame is on screen. */
  shown: () => void;
  /** The stage cannot draw any more (context lost, shader refused). */
  lost: () => void;
}

export interface StageCore {
  set: (name: string, value: Uniform) => void;
  /** The canvas's size in CSS pixels, and the device pixel ratio. */
  resize: (width: number, height: number, ratio: number) => void;
  /** Draw while on: on screen and in a visible tab. */
  run: (on: boolean) => void;
  /** The picture, decoded in bands; or, on the main thread, the <img> itself where it could not be decoded in the background. */
  picture: (picture: Picture | TexImageSource) => void;
  dispose: () => void;
}

export type Surface = HTMLCanvasElement | OffscreenCanvas;

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

export function startStage(canvas: Surface, spec: StageSpec, events: StageEvents): StageCore | null {
  const gl = (canvas as HTMLCanvasElement).getContext("webgl", { antialias: false, alpha: spec.transparent, premultipliedAlpha: true, depth: false, stencil: false, powerPreference: "default", preserveDrawingBuffer: false, failIfMajorPerformanceCaveat: !spec.allowSoftware });
  if (!gl) return null;
  const context = gl;
  // A flowing shader on the CPU makes the whole page stutter; the still version looks better. Not every software renderer admits to being slow, so ask its name.
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  if (!spec.allowSoftware && info && SOFTWARE_RENDERER.test(String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)))) {
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return null;
  }

  const vertex = shader(gl, gl.VERTEX_SHADER, VERTEX);
  const fragment = shader(gl, gl.FRAGMENT_SHADER, `precision highp float;\n${spec.fragment}`);
  const program = gl.createProgram();
  if (!vertex || !fragment || !program) return null;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  const parallel = gl.getExtension("KHR_parallel_shader_compile");
  // Hand the compile to the graphics process now, not at the end of this task.
  gl.flush();

  // One triangle that covers the screen.
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

  // The picture, if any, as texture unit 0: nothing is drawn before it is uploaded.
  let texture: WebGLTexture | null = null;
  let textured = !spec.textured;
  if (spec.textured) {
    texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }
  /** Each band of a decoded picture in a frame of its own, so no single frame waits for the whole upload. */
  const uploadBands = async ({ width, height, bands }: Picture) => {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    for (const { row, bitmap } of bands) {
      await new Promise(requestAnimationFrame);
      if (!disposed) {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, row, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
      }
      bitmap.close();
    }
    textured = true;
  };
  /** An <img> as it always was uploaded, decoded inside the call. */
  const uploadWhole = (image: TexImageSource) => {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    textured = true;
  };
  const picture = (source: Picture | TexImageSource) => {
    if ("bands" in source) {
      if (disposed || !texture) source.bands.forEach(({ bitmap }) => bitmap.close());
      else void uploadBands(source);
    } else if (!disposed && texture) uploadWhole(source);
  };

  const values = new Map<string, Uniform>(Object.entries(spec.uniforms));
  const locations = new Map<string, WebGLUniformLocation | null>();
  let ready = false;
  let disposed = false;
  let shown = false;

  const set = (name: string, value: Uniform) => void values.set(name, value);
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

  const resize = (width: number, height: number, ratio: number) => {
    if (!width || !height || disposed) return;
    const scale = Math.min(ratio || 1, spec.maxPixelRatio);
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    gl.viewport(0, 0, canvas.width, canvas.height);
    set("uResolution", [canvas.width, canvas.height]);
  };

  /**
   * True once the program is linked and the picture (if any) uploaded. With
   * the extension it never waits on the compiler; without it, the first few
   * frames are left to the compiler before asking, which would wait.
   */
  let grace = 3;
  const linked = () => {
    if (ready) return true;
    if (!textured) return false;
    if (parallel && !gl.getProgramParameter(program, parallel.COMPLETION_STATUS_KHR)) return false;
    if (!parallel && grace-- > 0) return false;
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

  let wanted = false;
  let running = false;
  let frameId = 0;
  let start = 0;
  let last = 0;

  const draw = () => {
    if (!linked()) return;
    const now = performance.now() / 1000;
    if (!start) start = last = now;
    events.frame?.(now - start, Math.min(now - last, 0.1), set);
    last = now;
    set("uTime", now - start + spec.timeOffset);
    upload();
    if (spec.transparent) {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!shown) {
      shown = true;
      requestAnimationFrame(() => !disposed && events.shown());
    }
  };
  const interval = 1 / spec.fps - 0.002;
  let drawn = 0;
  const loop = () => {
    const now = performance.now() / 1000;
    if (now - drawn >= interval) {
      drawn = now;
      draw();
    }
    if (running) frameId = requestAnimationFrame(loop);
  };
  const run = (on: boolean) => {
    wanted = on;
    const shouldRun = wanted && !disposed;
    if (shouldRun && !running) {
      running = true;
      last = performance.now() / 1000;
      frameId = requestAnimationFrame(loop);
    } else if (!shouldRun && running) {
      running = false;
      cancelAnimationFrame(frameId);
    }
  };

  const onLost = (event: Event) => {
    event.preventDefault();
    fail();
  };
  canvas.addEventListener("webglcontextlost", onLost);

  function fail() {
    if (disposed) return;
    dispose();
    events.lost();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    running = false;
    cancelAnimationFrame(frameId);
    canvas.removeEventListener("webglcontextlost", onLost);
    context.deleteBuffer(buffer);
    if (texture) context.deleteTexture(texture);
    context.deleteProgram(program);
    context.deleteShader(vertex);
    context.deleteShader(fragment);
  }

  return { set, resize, run, picture, dispose };
}
