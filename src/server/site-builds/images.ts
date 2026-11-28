/**
 * Right-sized pictures for a built site. An uploaded picture (JPEG, PNG or
 * WebP, up to 2560 px and 3 MB) becomes WebP files at a few widths, so a
 * phone fetches a few dozen kilobytes where it used to fetch the upload.
 * Nothing here touches how pictures are stored: only what a build writes.
 *
 * sharp (libvips) does the work. It is loaded when the first picture needs
 * it, so a server where its binary is missing still builds: the caller
 * copies the upload as before and says so.
 */
import type { WebpOptions } from "sharp";

/**
 * The widths a picture is written at, in pixels. A browser takes the narrowest
 * file that is at least as wide as the place it fills, counted in the screen's
 * own pixels, so the steps sit just above what real screens ask for: a logo
 * or a small portrait lands on 256 to 640, a picture as wide as a phone on 800
 * (at 2x) or 1200 (at 3x), half a desktop page on 800 to 1600 and a full one
 * on 1600 or 2000. The widest is 2000, the same ceiling the design's stock
 * pictures have.
 */
export const PICTURE_WIDTHS = [256, 480, 640, 800, 1200, 1600, 2000] as const;

/**
 * WebP quality for photographs. 80 is libwebp's own default and reads as the
 * original at the sizes a page shows; 75 saves about a fifth more but starts
 * to smear fine texture (wood, fabric), and above 82 the files grow fast for
 * nothing a visitor sees.
 */
export const PICTURE_QUALITY = 80;

/** Fast encoding: effort 2 is about three times quicker than the default 4 for files 2 to 3 % larger. */
const EFFORT = 2;
/** The upload limit is 2560 px a side; anything far beyond it is not a picture a build should spend time on. */
const MAX_PIXELS = 40_000_000;
const ICON_SIDE = 96;

export interface PictureVariant {
  width: number;
  height: number;
  body: Uint8Array;
}

export interface Pictures {
  /** The upload's own size, as a browser shows it (turned upright). */
  width: number;
  height: number;
  /** WebP files, narrowest first. Never wider than the upload. */
  variants: PictureVariant[];
  /** A small PNG for the browser tab, when asked for. */
  icon?: Uint8Array;
}

/**
 * The widths to write for a picture this wide: the upload's own width (at most
 * 2000) and every step clearly below it. Nothing is ever made wider than the upload.
 */
export function pictureWidths(width: number): number[] {
  const widest = Math.min(Math.round(width), PICTURE_WIDTHS[PICTURE_WIDTHS.length - 1]);
  return [...PICTURE_WIDTHS.filter((step) => step < widest * 0.85), widest];
}

/**
 * The picture as WebP at each width. Transparency is kept. A PNG is written
 * without loss when that is also the smaller file (logos, drawings), otherwise
 * as a photograph. Throws when the file cannot be read as one still picture.
 */
export async function webpPictures(body: Uint8Array, options: { icon?: boolean } = {}): Promise<Pictures> {
  const { default: sharp } = await import("sharp");
  const open = () => sharp(body, { failOn: "error", limitInputPixels: MAX_PIXELS }).timeout({ seconds: 20 }).autoOrient();
  const meta = await sharp(body, { failOn: "error", limitInputPixels: MAX_PIXELS }).metadata();
  if (!meta.width || !meta.height) throw new Error("The picture has no size.");
  if ((meta.pages ?? 1) > 1) throw new Error("The picture is animated.");
  const turned = (meta.orientation ?? 1) >= 5;
  const width = turned ? meta.height : meta.width;
  const height = turned ? meta.width : meta.height;
  const widths = pictureWidths(width);

  let how: WebpOptions = { quality: PICTURE_QUALITY, alphaQuality: 100, effort: EFFORT };
  const write = async (target: number, as: WebpOptions): Promise<PictureVariant> => {
    const { data, info } = await open().resize({ width: target, withoutEnlargement: true }).webp(as).toBuffer({ resolveWithObject: true });
    return { width: info.width, height: info.height, body: new Uint8Array(data) };
  };

  // A PNG may be a logo or a photograph. The narrowest width, written both ways, tells which.
  // As a photograph it keeps full colour detail at edges (lettering on a coloured ground).
  let first: PictureVariant | undefined;
  if (meta.format === "png") {
    const photo: WebpOptions = { ...how, smartSubsample: true };
    const drawn: WebpOptions = { lossless: true, effort: EFFORT };
    const [asPhoto, asDrawn] = await Promise.all([write(widths[0], photo), write(widths[0], drawn)]);
    const lossless = asDrawn.body.byteLength <= asPhoto.body.byteLength;
    how = lossless ? drawn : photo;
    first = lossless ? asDrawn : asPhoto;
  }
  const written: PictureVariant[] = [];
  for (const target of widths) written.push(written.length === 0 && first ? first : await write(target, how));

  // An upload that is already a lean WebP is not made heavier by writing it again at its own size,
  // and a narrower file that weighs as much as the widest is left out: the widest serves better.
  const widest = written[written.length - 1];
  if (meta.format === "webp" && (meta.orientation ?? 1) === 1 && widest.width === meta.width && body.byteLength < widest.body.byteLength) widest.body = body;
  const variants = written.filter((variant) => variant === widest || variant.body.byteLength < widest.body.byteLength);

  const icon = options.icon
    ? await open()
        .resize({ width: ICON_SIDE, height: ICON_SIDE, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png({ compressionLevel: 9 })
        .toBuffer()
    : undefined;
  return { width, height, variants, ...(icon ? { icon: new Uint8Array(icon) } : {}) };
}
