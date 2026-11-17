"use client";

import { inspectImage } from "@/lib/site-assets/inspect";
import { IMAGE_LIMITS } from "@/lib/site-assets/limits";
import { encodingPlan } from "@/lib/site-assets/encoding";

export type ProcessedImage = { ok: true; file: Blob; width: number; height: number } | { ok: false; reason: string };

/**
 * Prepares a picked file for upload, in the browser: checks it is a real
 * JPEG, PNG or WebP image, downscales it to at most 2560 px and re-encodes
 * it. A PNG stays a PNG while it fits, because lossy WebP drops the colour of
 * half-transparent edges (a logo's soft outline); other images become WebP,
 * or JPEG where WebP cannot be encoded. Re-encoding drops all metadata,
 * including camera details and GPS location.
 *
 * This is a convenience, not a security check: the server checks the bytes
 * again before anything is stored.
 */
export async function processImage(file: File): Promise<ProcessedImage> {
  if (file.size > IMAGE_LIMITS.inputBytes) return { ok: false, reason: `${file.name}: larger than 15 MB.` };
  const inspected = inspectImage(new Uint8Array(await file.arrayBuffer()));
  if (!inspected.ok) return { ok: false, reason: `${file.name}: ${inspected.reason}` };

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { ok: false, reason: `${file.name}: the image could not be read. It may be damaged.` };
  }
  const { width, height } = bitmap;
  if (Math.min(width, height) < IMAGE_LIMITS.minSide) {
    bitmap.close();
    return { ok: false, reason: `${file.name}: too small. Each side needs at least ${IMAGE_LIMITS.minSide} pixels.` };
  }
  if (Math.max(width, height) > IMAGE_LIMITS.maxInputSide) {
    bitmap.close();
    return { ok: false, reason: `${file.name}: larger than ${IMAGE_LIMITS.maxInputSide} pixels on a side.` };
  }

  const scale = Math.min(1, IMAGE_LIMITS.maxSide / Math.max(width, height));
  const target = { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
  const canvas = document.createElement("canvas");
  canvas.width = target.width;
  canvas.height = target.height;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    return { ok: false, reason: "This browser cannot process images." };
  }
  context.drawImage(bitmap, 0, 0, target.width, target.height);
  bitmap.close();

  const encode = (type: string, quality: number) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  for (const step of encodingPlan(inspected.mimeType)) {
    if (step.type === "image/png") {
      const png = await encode("image/png", 1);
      if (png && png.type === "image/png" && png.size <= IMAGE_LIMITS.storedBytes) return { ok: true, file: png, ...target };
      continue;
    }
    const quality = step.quality;
    let blob = await encode("image/webp", quality);
    if (!blob || blob.type !== "image/webp") {
      // No WebP encoder: JPEG has no transparency, so paint a white background first.
      context.globalCompositeOperation = "destination-over";
      context.fillStyle = "#FFFFFF";
      context.fillRect(0, 0, target.width, target.height);
      blob = await encode("image/jpeg", quality);
    }
    if (blob && blob.size <= IMAGE_LIMITS.storedBytes) return { ok: true, file: blob, ...target };
  }
  return { ok: false, reason: `${file.name}: still larger than 3 MB after resizing.` };
}
