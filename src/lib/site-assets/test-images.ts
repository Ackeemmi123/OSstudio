/**
 * Small image files built in code, for tests: a real PNG any browser can
 * decode, and structurally valid JPEG and WebP headers. Nothing here is a
 * photo of anyone.
 */
import { deflateSync } from "node:zlib";
import { crc32 } from "./inspect";

function u32(n: number): number[] {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

function chunk(type: string, data: Uint8Array): number[] {
  const typed = [...type].map((c) => c.charCodeAt(0));
  const body = new Uint8Array([...typed, ...data]);
  return [...u32(data.length), ...body, ...u32(crc32(body))];
}

/** A solid-colour RGB PNG that decodes in every browser. */
export function pngImage(width = 400, height = 300, rgb: [number, number, number] = [122, 62, 43]): Uint8Array {
  const raw = new Uint8Array(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    const row = y * (1 + width * 3);
    raw[row] = 0; // filter: none
    for (let x = 0; x < width; x++) raw.set(rgb, row + 1 + x * 3);
  }
  const ihdr = new Uint8Array([...u32(width), ...u32(height), 8, 2, 0, 0, 0]);
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...chunk("IHDR", ihdr),
    ...chunk("IDAT", new Uint8Array(deflateSync(raw))),
    ...chunk("IEND", new Uint8Array()),
  ]);
}

/** SOI, a JFIF segment, a baseline frame header with the size, a scan and EOI. */
export function jpegImage(width = 640, height = 480): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x0b, 0x08, (height >> 8) & 0xff, height & 0xff, (width >> 8) & 0xff, width & 0xff, 0x01, 0x01, 0x11, 0x00,
    0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
    0x12, 0x34, 0x56,
    0xff, 0xd9,
  ]);
}

/** A RIFF/WEBP container with a lossless (VP8L) header of the given size. */
export function webpImage(width = 800, height = 600): Uint8Array {
  const bits = ((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14);
  const vp8l = [0x2f, bits & 0xff, (bits >>> 8) & 0xff, (bits >>> 16) & 0xff, (bits >>> 24) & 0xff, 0, 0, 0, 0, 0];
  const le = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
  const body = [..."WEBP", ..."VP8L"].map((c) => (typeof c === "string" ? c.charCodeAt(0) : c));
  const content = [...body, ...le(vp8l.length), ...vp8l];
  return new Uint8Array([..."RIFF"].map((c) => c.charCodeAt(0)).concat(le(content.length), content));
}

export const SPOOFED_SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
