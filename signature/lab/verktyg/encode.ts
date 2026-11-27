/**
 * The encoder for films photographed off a page (scripts/render-dom-film.mjs):
 * it is handed each frame as a PNG, encodes them in the browser with
 * WebCodecs (H.264 into MP4, AV1 into WebM) and packs them with Mediabunny,
 * as film.ts does for the band's own films. It also lays a
 * contact sheet as the frames pass, and plays every finished file back
 * before it is saved: the browser must read the whole duration, find every
 * frame, and show the first one in the colours it was given.
 */
import { BufferTarget, EncodedPacket, EncodedVideoPacketSource, Mp4OutputFormat, Output, WebMOutputFormat } from "mediabunny";

export interface Encoding {
  file: string;
  /** A WebCodecs codec string: av01… goes into WebM, avc1… into MP4. */
  codec: string;
  /** The average it aims for, in bits per second (variable bitrate). */
  bitrate: number;
  hardware: HardwareAcceleration;
}

export interface Job {
  width: number;
  height: number;
  fps: number;
  frames: number;
  encodings: Encoding[];
  /** The contact sheet: which frames, how many across, how wide each is drawn, and its heading. */
  sheet: { frames: number[]; columns: number; thumb: number; title: string };
}

export interface Check {
  file: string;
  bytes: number;
  duration: number;
  frames: number;
  /** Mean shift per colour channel between the first frame as given and as played back, in levels. */
  shift: number[];
  /** Mean absolute difference of that frame: compression. */
  mean: number;
}

export interface Encoded {
  files: Record<string, string>;
  sheet: string;
  checks: Check[];
}

const toBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

/**
 * A file being written by Mediabunny: the encoder's chunks go in, in the order they leave it, and the finished
 * file comes out as one buffer. The encoding itself stays here (WebCodecs, configured below); Mediabunny only packs.
 */
function container(webm: boolean, codec: "avc" | "av1" | "vp9", fps: number) {
  const output = new Output({ format: webm ? new WebMOutputFormat() : new Mp4OutputFormat({ fastStart: "in-memory" }), target: new BufferTarget() });
  const source = new EncodedVideoPacketSource(codec);
  output.addVideoTrack(source, { frameRate: fps });
  let written: Promise<void> = output.start();
  // A failed write is kept until the file is finished, where it is thrown.
  let failure: unknown = null;
  return {
    add: (chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata) => {
      written = written.then(() => source.add(EncodedPacket.fromEncodedChunk(chunk), meta)).catch((error) => void (failure ??= error));
    },
    finish: async (): Promise<ArrayBuffer> => {
      await written;
      if (failure) throw failure;
      await output.finalize();
      return output.target.buffer!;
    },
  };
}

/** Makes sure the WebM says it lasts the whole film, last frame included (EBML id 0x4489, a float in milliseconds): a loop must not end as its last frame begins. */
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

/** The frame the browser shows after a seek: its media time, or null if none was presented in time. */
function presented(video: HTMLVideoElement, time: number): Promise<number | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 4000);
    video.requestVideoFrameCallback((_now, metadata) => {
      clearTimeout(timer);
      resolve(metadata.mediaTime);
    });
    video.currentTime = time;
  });
}

/** Plays a file back as a browser will: its duration, every frame it can show, and its first frame against what the encoder was given. */
async function playBack(blob: Blob, job: Job, first: ImageData): Promise<Omit<Check, "file" | "bytes">> {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  // On the page, so the browser presents its frames (a detached video's frame callbacks never fire).
  video.style.cssText = "position: fixed; left: 0; top: 0; width: 320px";
  document.body.append(video);
  video.src = URL.createObjectURL(blob);
  await new Promise((resolve, reject) => {
    video.onloadeddata = resolve;
    video.onerror = () => reject(new Error(`The browser cannot play the film back: ${video.error?.message}`));
  });
  // Every frame, sought in its middle; the browser names the frame it shows by its media time.
  const seen = new Set<number>();
  for (let pass = 0; pass < 3 && seen.size < job.frames; pass++)
    for (let i = job.frames - 1; i >= 0; i--) {
      // A later pass asks again only for frames a busy machine did not present in time.
      if (seen.has(i)) continue;
      const at = await presented(video, (i + 0.5) / job.fps);
      if (at !== null) seen.add(Math.round(at * job.fps));
    }
  // The first frame on screen, to compare.
  await presented(video, 0.5 / job.fps);
  const canvas = document.createElement("canvas");
  canvas.width = job.width;
  canvas.height = job.height;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.drawImage(video, 0, 0, job.width, job.height);
  const decoded = context.getImageData(0, 0, job.width, job.height).data;
  const shift = [0, 0, 0];
  let total = 0;
  for (let i = 0; i < decoded.length; i += 4)
    for (let c = 0; c < 3; c++) {
      const difference = decoded[i + c] - first.data[i + c];
      shift[c] += difference;
      total += Math.abs(difference);
    }
  const pixels = decoded.length / 4;
  const duration = video.duration;
  URL.revokeObjectURL(video.src);
  video.remove();
  return { duration, frames: seen.size, shift: shift.map((sum) => Math.round((sum / pixels) * 100) / 100), mean: Math.round((total / pixels / 3) * 100) / 100 };
}

interface Running {
  job: Job;
  frame: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  encoders: { encoding: Encoding; file: ReturnType<typeof container>; encoder: VideoEncoder; webm: boolean; failed: () => unknown }[];
  first: ImageData | null;
  sheet: HTMLCanvasElement;
  next: number;
}
let running: Running | null = null;

/** The contact sheet's measures, in pixels: the caption under each frame, the gap between frames, the heading. */
const LABEL = 34;
const GAP = 12;
const HEAD = 56;

function start(job: Job): void {
  const { width, height, fps } = job;
  const frame = document.createElement("canvas");
  frame.width = width;
  frame.height = height;
  const context = frame.getContext("2d", { alpha: false, willReadFrequently: true })!;
  context.imageSmoothingQuality = "high";

  const encoders = job.encodings.map((encoding) => {
    const webm = encoding.codec.startsWith("av01") || encoding.codec.startsWith("vp09");
    const file = container(webm, !webm ? "avc" : encoding.codec.startsWith("av01") ? "av1" : "vp9", fps);
    let failure: unknown = null;
    const encoder = new VideoEncoder({
      output: (chunk, meta) => file.add(chunk, meta),
      error: (error) => (failure = error),
    });
    encoder.configure({
      codec: encoding.codec,
      width,
      height,
      framerate: fps,
      bitrate: encoding.bitrate,
      bitrateMode: "variable",
      latencyMode: "quality",
      hardwareAcceleration: encoding.hardware,
      ...(webm ? {} : { avc: { format: "avc" as const } }),
    });
    return { encoding, file, encoder, webm, failed: () => failure };
  });

  const { columns, thumb } = job.sheet;
  const rows = Math.ceil(job.sheet.frames.length / columns);
  const cell = Math.round((thumb / width) * height);
  const sheet = document.createElement("canvas");
  sheet.width = GAP + columns * (thumb + GAP);
  sheet.height = HEAD + rows * (cell + LABEL + GAP);
  const paper = sheet.getContext("2d", { alpha: false })!;
  paper.fillStyle = "#0b0d12";
  paper.fillRect(0, 0, sheet.width, sheet.height);
  paper.fillStyle = "#e6ebf5";
  paper.font = "600 22px system-ui, sans-serif";
  paper.textBaseline = "middle";
  paper.fillText(job.sheet.title, GAP, HEAD / 2);
  running = { job, frame, context, encoders, first: null, sheet, next: 0 };
}

/** One frame, as a PNG in base64. Frames come in order. A capture larger than the film (supersampled) is scaled down. */
async function add(index: number, png: string): Promise<void> {
  if (!running) throw new Error("start() first");
  const { job, frame, context, encoders, sheet } = running;
  // With nothing to encode (a contact sheet alone) only the sheet's own frames come.
  if (encoders.length && index !== running.next) throw new Error(`Frame ${index} out of order: expected ${running.next}`);
  running.next++;
  const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob(), { colorSpaceConversion: "none" });
  if (bitmap.width % job.width || bitmap.height % job.height) throw new Error(`The capture is ${bitmap.width} × ${bitmap.height}, not a multiple of the film's ${job.width} × ${job.height}`);
  context.drawImage(bitmap, 0, 0, job.width, job.height);
  bitmap.close();
  if (index === 0) running.first = context.getImageData(0, 0, job.width, job.height);

  const place = job.sheet.frames.indexOf(index);
  if (place >= 0) {
    const { columns, thumb } = job.sheet;
    const cell = Math.round((thumb / job.width) * job.height);
    const x = GAP + (place % columns) * (thumb + GAP);
    const y = HEAD + Math.floor(place / columns) * (cell + LABEL + GAP);
    const paper = sheet.getContext("2d")!;
    paper.imageSmoothingQuality = "high";
    paper.drawImage(frame, x, y, thumb, cell);
    paper.fillStyle = "#b4bfd6";
    paper.font = "500 18px ui-monospace, Menlo, monospace";
    paper.textBaseline = "middle";
    paper.fillText(`${(index / job.fps).toFixed(2)} s · bild ${index}`, x, y + cell + LABEL / 2);
  }

  if (!encoders.length) return;
  const video = new VideoFrame(frame, { timestamp: Math.round((index * 1e6) / job.fps), duration: Math.round(1e6 / job.fps) });
  for (const each of encoders) {
    // A key frame every second: any player can start, scrub and loop from a cut.
    each.encoder.encode(video, { keyFrame: index % job.fps === 0 });
    while (each.encoder.encodeQueueSize > 6) await new Promise((resolve) => each.encoder.addEventListener("dequeue", resolve, { once: true }));
    if (each.failed()) throw each.failed();
  }
  video.close();
}

async function finish(): Promise<Encoded> {
  if (!running) throw new Error("start() first");
  const { job, encoders, sheet, first } = running;
  if (encoders.length && running.next !== job.frames) throw new Error(`Got ${running.next} frames, expected ${job.frames}`);
  const files: Record<string, string> = {};
  const checks: Check[] = [];
  for (const each of encoders) {
    await each.encoder.flush();
    if (each.failed()) throw each.failed();
    const buffer = await each.file.finish();
    if (each.webm) setWebmDuration(buffer, (job.frames * 1000) / job.fps);
    const blob = new Blob([buffer], { type: each.webm ? "video/webm" : "video/mp4" });
    files[each.encoding.file] = await toBase64(blob);
    checks.push({ file: each.encoding.file, bytes: buffer.byteLength, ...(await playBack(blob, job, first!)) });
    each.encoder.close();
  }
  const picture = await new Promise<Blob>((resolve) => sheet.toBlob((blob) => resolve(blob!), "image/jpeg", 0.9));
  running = null;
  return { files, sheet: await toBase64(picture), checks };
}

const api = { start, add, finish };
export type SgEncode = typeof api;
(window as unknown as { sgEncode: SgEncode }).sgEncode = api;
