import type { ImageMimeType } from "./limits";

export type EncodingStep = { type: "image/png" } | { type: "image/webp"; quality: number };

/**
 * How an uploaded image is re-encoded, in the order tried until one fits
 * the stored size limit. A PNG is kept lossless first: lossy WebP drops the
 * colour of half-transparent pixels, which is where a logo's edges are.
 */
export function encodingPlan(input: ImageMimeType): EncodingStep[] {
  const lossy: EncodingStep[] = [0.85, 0.7, 0.55].map((quality) => ({ type: "image/webp", quality }));
  return input === "image/png" ? [{ type: "image/png" }, ...lossy] : lossy;
}
