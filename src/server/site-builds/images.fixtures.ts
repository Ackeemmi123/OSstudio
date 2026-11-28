/** Pictures made for tests, so no image files live in the repository. */
import sharp from "sharp";

/** A photograph-like JPEG: soft colour noise, so it compresses as a photo does. */
export async function photo(width: number, height: number, orientation?: number): Promise<Uint8Array> {
  const noise = sharp({ create: { width: Math.ceil(width / 16), height: Math.ceil(height / 16), channels: 3, background: "#808080", noise: { type: "gaussian", mean: 128, sigma: 60 } } }).png();
  const picture = sharp(await noise.toBuffer()).resize(width, height, { kernel: "cubic" });
  return new Uint8Array(await (orientation ? picture.withMetadata({ orientation }) : picture).jpeg({ quality: 92 }).toBuffer());
}

/** A logo-like PNG: a flat disc on a transparent ground. */
export async function logo(width: number, height: number): Promise<Uint8Array> {
  const disc = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><circle cx="${width / 2}" cy="${height / 2}" r="${Math.min(width, height) / 2.5}" fill="#1F4E79"/></svg>`);
  return new Uint8Array(await sharp(disc).png().toBuffer());
}
