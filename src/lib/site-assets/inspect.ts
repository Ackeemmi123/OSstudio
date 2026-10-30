/**
 * Reads what an image file really is from its bytes: the format, the
 * dimensions, and whether its structure is complete. The file name and the
 * declared type are never trusted.
 *
 * The server runs this on every upload before anything is stored
 * (src/server/site-assets/upload.ts); the browser runs it too, only to give
 * quicker feedback. It checks structure, not every pixel: a file whose
 * headers are sound but whose compressed data is corrupt passes, and simply
 * fails to display in an <img>.
 */
import type { ImageMimeType } from "./limits";

export type ImageInspection =
  | { ok: true; mimeType: ImageMimeType; width: number; height: number }
  | { ok: false; reason: string };

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function startsWith(bytes: Uint8Array, prefix: number[], offset = 0): boolean {
  return prefix.every((b, i) => bytes[offset + i] === b);
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

const u32be = (b: Uint8Array, o: number) => ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];
const u32le = (b: Uint8Array, o: number) => b[o] + (b[o + 1] << 8) + (b[o + 2] << 16) + ((b[o + 3] << 24) >>> 0);
const u24le = (b: Uint8Array, o: number) => b[o] + (b[o + 1] << 8) + (b[o + 2] << 16);
const u16be = (b: Uint8Array, o: number) => (b[o] << 8) + b[o + 1];

let crcTable: Uint32Array | null = null;
/** CRC-32 as PNG uses it. */
export function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const refuse = (reason: string): ImageInspection => ({ ok: false, reason });

/** Walks every PNG chunk: IHDR first with a valid CRC, every chunk inside the file, IEND last and nothing after it. */
function inspectPng(b: Uint8Array): ImageInspection {
  let offset = 8;
  let width = 0;
  let height = 0;
  let first = true;
  while (offset + 12 <= b.length) {
    const length = u32be(b, offset);
    const type = ascii(b, offset + 4, 4);
    const end = offset + 12 + length;
    if (!/^[A-Za-z]{4}$/.test(type) || end > b.length) return refuse("The PNG file is damaged or cut short.");
    const crc = u32be(b, offset + 8 + length);
    if (crc32(b.subarray(offset + 4, offset + 8 + length)) !== crc) return refuse("The PNG file is damaged (a checksum does not match).");
    if (first) {
      if (type !== "IHDR" || length !== 13) return refuse("The PNG file has no valid header.");
      width = u32be(b, offset + 8);
      height = u32be(b, offset + 12);
      first = false;
    }
    if (type === "IEND") {
      if (end !== b.length) return refuse("The PNG file has extra data after its end.");
      return { ok: true, mimeType: "image/png", width, height };
    }
    offset = end;
  }
  return refuse("The PNG file is cut short (no end marker).");
}

/** Walks JPEG segments up to the scan: a frame header with dimensions, then an end marker at the end of the file. */
function inspectJpeg(b: Uint8Array): ImageInspection {
  let offset = 2;
  let width = 0;
  let height = 0;
  while (offset + 4 <= b.length) {
    if (b[offset] !== 0xff) return refuse("The JPEG file is damaged.");
    const marker = b[offset + 1];
    if (marker === 0xff) {
      offset++;
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = u16be(b, offset + 2);
    if (length < 2 || offset + 2 + length > b.length) return refuse("The JPEG file is damaged or cut short.");
    // SOF0–SOF15, except DHT (C4), JPG (C8) and DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      height = u16be(b, offset + 5);
      width = u16be(b, offset + 7);
    }
    if (marker === 0xda) break; // start of scan: compressed data follows
    offset += 2 + length;
  }
  if (!width || !height) return refuse("The JPEG file has no frame header with its size.");
  // The file must end with EOI; a few padding bytes after it are tolerated, anything more is refused.
  let end = b.length;
  while (end > 2 && b.length - end < 16 && b[end - 1] === 0x00) end--;
  if (!(b[end - 2] === 0xff && b[end - 1] === 0xd9)) return refuse("The JPEG file is cut short, or has extra data after its end.");
  return { ok: true, mimeType: "image/jpeg", width, height };
}

/** RIFF container whose size matches the file, then a VP8, VP8L or VP8X chunk with dimensions. */
function inspectWebp(b: Uint8Array): ImageInspection {
  if (b.length < 30) return refuse("The WebP file is cut short.");
  const riffSize = u32le(b, 4);
  if (riffSize + 8 !== b.length && riffSize + 9 !== b.length) return refuse("The WebP file's size does not match its contents.");
  const chunk = ascii(b, 12, 4);
  const at = 20;
  let width = 0;
  let height = 0;
  if (chunk === "VP8 ") {
    if (!(b[at + 3] === 0x9d && b[at + 4] === 0x01 && b[at + 5] === 0x2a)) return refuse("The WebP file is damaged.");
    width = (b[at + 6] | (b[at + 7] << 8)) & 0x3fff;
    height = (b[at + 8] | (b[at + 9] << 8)) & 0x3fff;
  } else if (chunk === "VP8L") {
    if (b[at] !== 0x2f) return refuse("The WebP file is damaged.");
    const bits = u32le(b, at + 1);
    width = (bits & 0x3fff) + 1;
    height = ((bits >>> 14) & 0x3fff) + 1;
  } else if (chunk === "VP8X") {
    width = u24le(b, at + 4) + 1;
    height = u24le(b, at + 7) + 1;
  } else {
    return refuse("The WebP file has an unknown structure.");
  }
  return { ok: true, mimeType: "image/webp", width, height };
}

export function inspectImage(bytes: Uint8Array): ImageInspection {
  if (bytes.length === 0) return refuse("The file is empty.");
  if (startsWith(bytes, PNG_SIGNATURE)) return inspectPng(bytes);
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return inspectJpeg(bytes);
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return inspectWebp(bytes);
  return refuse("This is not a JPEG, PNG or WebP image.");
}
