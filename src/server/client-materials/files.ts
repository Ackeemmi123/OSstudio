/**
 * What the server checks before it keeps a client's file: a real PDF, JPEG,
 * PNG or WebP by its first bytes, at most 4 MB, with a name a person can
 * recognise. And how long text is split into source-sized parts.
 */
import { createHash } from "node:crypto";

export const MATERIAL_BUCKET = "client-materials";
export const MAX_MATERIAL_BYTES = 4 * 1024 * 1024;

export type MaterialType = "application/pdf" | "image/jpeg" | "image/png" | "image/webp";

export function materialType(bytes: Uint8Array): MaterialType | null {
  const head = (n: number) => Array.from(bytes.subarray(0, n));
  if (new TextDecoder().decode(bytes.subarray(0, 5)) === "%PDF-") return "application/pdf";
  if (head(3).join(",") === "255,216,255") return "image/jpeg";
  if (head(8).join(",") === "137,80,78,71,13,10,26,10") return "image/png";
  if (new TextDecoder().decode(bytes.subarray(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.subarray(8, 12)) === "WEBP") return "image/webp";
  return null;
}

export type MaterialCheck = { ok: true; type: MaterialType; title: string; sha256: string } | { ok: false; message: string };

export function checkMaterial(bytes: Uint8Array, title: unknown): MaterialCheck {
  if (typeof title !== "string" || !title.trim() || title.trim().length > 200) return { ok: false, message: "Give the file a name of at most 200 characters." };
  if (bytes.byteLength === 0) return { ok: false, message: "The file is empty." };
  if (bytes.byteLength > MAX_MATERIAL_BYTES) return { ok: false, message: "The file is larger than 4 MB." };
  const type = materialType(bytes);
  if (!type) return { ok: false, message: "Only PDF, JPEG, PNG and WebP files can be kept as files. Word documents are read into text instead." };
  return { ok: true, type, title: title.trim(), sha256: createHash("sha256").update(bytes).digest("hex") };
}

/** Long text split at paragraph breaks into parts that fit one source (50,000 characters). */
export function splitText(text: string, max = 48000): string[] {
  const parts: string[] = [];
  let current = "";
  for (const paragraph of text.split(/\n{2,}/)) {
    const piece = paragraph.length > max ? paragraph.match(new RegExp(`[\\s\\S]{1,${max}}`, "g")) ?? [] : [paragraph];
    for (const chunk of piece) {
      if (current && current.length + chunk.length + 2 > max) {
        parts.push(current);
        current = "";
      }
      current = current ? `${current}\n\n${chunk}` : chunk;
    }
  }
  if (current.trim()) parts.push(current);
  return parts;
}
