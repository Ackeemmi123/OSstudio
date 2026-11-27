/**
 * Films made in code: the lab's own 3D band, drawn frame by frame with its
 * clock pinned to each frame, so the loop closes exactly (the last frame leads
 * into the first), then encoded in the browser with WebCodecs and packed into
 * WebM and MP4. Nothing is filmed and nothing is bought: Axivo owns every
 * pixel. scripts/render-video.mjs drives this page and saves what it returns.
 */
import { ArrayBufferTarget as Mp4Target, Muxer as Mp4Muxer } from "mp4-muxer";
import { ArrayBufferTarget as WebmTarget, Muxer as WebmMuxer } from "webm-muxer";
import { createObjectScene } from "../../src/modules/band-scene";

export interface Encoding {
  file: string;
  /** A WebCodecs codec string: av01… (or vp09…) goes into WebM, avc1… into MP4. */
  codec: string;
  /** The average it aims for, in bits per second (variable bitrate). */
  bitrate: number;
  hardware: HardwareAcceleration;
}

export interface Film {
  width: number;
  height: number;
  fps: number;
  seconds: number;
  /** Drawn this many times larger, then scaled down: finer highlights than antialiasing alone gives. */
  supersample: number;
  zoom: number;
  colours: string[];
  encodings: Encoding[];
  posters: { file: string; width: number; quality: number }[];
}

export interface Rendered {
  files: Record<string, string>;
  log: string[];
}

const toBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

/**
 * webm-muxer writes the segment's duration as the last frame's start, so a
 * browser would end the loop as that frame begins and skip it at the seam.
 * This sets the duration (EBML id 0x4489, an 8-byte float in milliseconds)
 * to the whole film.
 */
function setWebmDuration(buffer: ArrayBuffer, milliseconds: number): void {
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < Math.min(bytes.length - 11, 4096); i++) {
    if (bytes[i] === 0x44 && bytes[i + 1] === 0x89 && bytes[i + 2] === 0x88) {
      new DataView(buffer).setFloat64(i + 3, milliseconds, false);
      return;
    }
  }
  throw new Error("No duration in the WebM header");
}

/**
 * Plays the film back as a browser will, and compares its first frame with
 * what the encoder was given (the poster's frame): the mean shift per colour
 * channel shows wrong colour metadata (the film would change colour as it
 * starts over its poster); the mean difference is compression. Also returns
 * the duration the browser reads, which must be the whole loop.
 */
async function againstPoster(blob: Blob, first: ImageData): Promise<{ duration: number; shift: string; mean: string }> {
  const video = document.createElement("video");
  video.muted = true;
  video.src = URL.createObjectURL(blob);
  await new Promise((resolve, reject) => {
    video.onloadeddata = resolve;
    video.onerror = () => reject(new Error(`The browser cannot play the film back: ${video.error?.message}`));
  });
  // A first frame that has been decoded and presented, not just announced.
  video.currentTime = 0;
  await new Promise((resolve) => (video.onseeked = resolve));
  await new Promise((resolve) => {
    video.requestVideoFrameCallback(() => resolve(null));
    setTimeout(resolve, 500);
  });
  const canvas = document.createElement("canvas");
  canvas.width = first.width;
  canvas.height = first.height;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.drawImage(video, 0, 0);
  const decoded = context.getImageData(0, 0, first.width, first.height).data;
  const shift = [0, 0, 0];
  let total = 0;
  for (let i = 0; i < decoded.length; i += 4)
    for (let c = 0; c < 3; c++) {
      const difference = decoded[i + c] - first.data[i + c];
      shift[c] += difference;
      total += Math.abs(difference);
    }
  const pixels = decoded.length / 4;
  URL.revokeObjectURL(video.src);
  return { duration: video.duration, shift: shift.map((sum) => (sum / pixels).toFixed(2)).join(" "), mean: (total / pixels / 3).toFixed(2) };
}

/** Scales a picture down in halves first, so fine lines stay sharp, then to the exact width. */
function scaled(source: CanvasImageSource & { width: number; height: number }, width: number): HTMLCanvasElement {
  let current: CanvasImageSource & { width: number; height: number } = source;
  while (current.width / 2 >= width) {
    const half = document.createElement("canvas");
    half.width = Math.round(current.width / 2);
    half.height = Math.round(current.height / 2);
    const context = half.getContext("2d")!;
    context.imageSmoothingQuality = "high";
    context.drawImage(current, 0, 0, half.width, half.height);
    current = half;
  }
  const out = document.createElement("canvas");
  out.width = width;
  out.height = Math.round((width / source.width) * source.height);
  const context = out.getContext("2d")!;
  context.imageSmoothingQuality = "high";
  context.drawImage(current, 0, 0, out.width, out.height);
  return out;
}

async function renderFilm(film: Film): Promise<Rendered> {
  const log: string[] = [];
  const { width, height, fps, seconds } = film;
  const frames = Math.round(fps * seconds);

  // The band draws at the page's pixel ratio (the supersample), off screen so its own frame loop never runs.
  const canvas = document.createElement("canvas");
  canvas.style.cssText = `position: fixed; left: -${width + 100}px; top: 0; width: ${width}px; height: ${height}px`;
  document.body.append(canvas);
  const scene = await createObjectScene(canvas, {
    allowSoftware: true,
    lowPower: false,
    quality: 2,
    // Kept on the main thread (never handed to the band's worker), so every frame can be read back.
    preserve: true,
    centred: true,
    loop: seconds,
    zoom: film.zoom,
    colours: film.colours,
    shown: () => undefined,
    lost: () => undefined,
  });
  if (!scene) throw new Error("WebGL is not available");
  await new Promise((resolve) => requestAnimationFrame(resolve));
  if (canvas.width !== width * film.supersample) throw new Error(`The band drew at ${canvas.width} px, not ${width * film.supersample}: set the page's device scale factor to the supersample.`);

  // The frame the encoders get, at the film's own size.
  const frame = document.createElement("canvas");
  frame.width = width;
  frame.height = height;
  const context = frame.getContext("2d", { alpha: false })!;
  context.imageSmoothingQuality = "high";

  const jobs = film.encodings.map((encoding) => {
    const webm = encoding.codec.startsWith("av01") || encoding.codec.startsWith("vp09");
    const muxer = webm
      ? new WebmMuxer({ target: new WebmTarget(), video: { codec: encoding.codec.startsWith("av01") ? "V_AV1" : "V_VP9", width, height, frameRate: fps }, type: "webm", firstTimestampBehavior: "offset" })
      : new Mp4Muxer({ target: new Mp4Target(), video: { codec: "avc", width, height, frameRate: fps }, fastStart: "in-memory", firstTimestampBehavior: "offset" });
    let failure: unknown = null;
    const encoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (error) => (failure = error),
    });
    const config: VideoEncoderConfig = {
      codec: encoding.codec,
      width,
      height,
      framerate: fps,
      bitrate: encoding.bitrate,
      bitrateMode: "variable",
      latencyMode: "quality",
      hardwareAcceleration: encoding.hardware,
      ...(webm ? {} : { avc: { format: "avc" as const } }),
    };
    encoder.configure(config);
    return { encoding, muxer, encoder, webm, failed: () => failure };
  });

  const started = performance.now();
  const files: Record<string, string> = {};
  let first: ImageData | null = null;
  for (let i = 0; i < frames; i++) {
    // The clock pinned to this frame: frame `frames` would be frame 0 again, so the loop has no seam.
    scene.still(1, i / fps);
    context.drawImage(canvas, 0, 0, width, height);
    if (i === 0) {
      for (const poster of film.posters) files[poster.file] = await toBase64(await new Promise<Blob>((resolve) => scaled(canvas, poster.width).toBlob((blob) => resolve(blob!), "image/webp", poster.quality)));
      first = context.getImageData(0, 0, width, height);
    }
    const video = new VideoFrame(frame, { timestamp: Math.round((i * 1e6) / fps), duration: Math.round(1e6 / fps) });
    for (const job of jobs) {
      job.encoder.encode(video, { keyFrame: i === 0 });
      while (job.encoder.encodeQueueSize > 6) await new Promise((resolve) => job.encoder.addEventListener("dequeue", resolve, { once: true }));
      if (job.failed()) throw job.failed();
    }
    video.close();
    if (i % 60 === 0) log.push(`frame ${i}/${frames}, ${((performance.now() - started) / (i + 1)).toFixed(0)} ms a frame`);
  }
  for (const job of jobs) {
    await job.encoder.flush();
    if (job.failed()) throw job.failed();
    job.muxer.finalize();
    const buffer = job.muxer.target.buffer;
    if (job.webm) setWebmDuration(buffer, (frames * 1000) / fps);
    const blob = new Blob([buffer], { type: job.webm ? "video/webm" : "video/mp4" });
    files[job.encoding.file] = await toBase64(blob);
    const check = await againstPoster(blob, first!);
    log.push(`${job.encoding.file}: ${Math.round(buffer.byteLength / 1024)} KB, ${check.duration.toFixed(3)} s; first frame against the poster: colour shift ${check.shift}, mean difference ${check.mean} levels`);
    if (Math.abs(check.duration - seconds) > 0.001) throw new Error(`${job.encoding.file} lasts ${check.duration} s, not ${seconds}: the loop would skip a frame`);
    if (check.shift.split(" ").some((value) => Math.abs(Number(value)) > 2)) throw new Error(`${job.encoding.file} decodes in other colours than its poster (${check.shift}): check the colour metadata`);
    job.encoder.close();
  }
  scene.dispose();
  canvas.remove();
  return { files, log };
}

(window as unknown as { renderFilm: typeof renderFilm }).renderFilm = renderFilm;
(window as unknown as { filmReady: boolean }).filmReady = true;
