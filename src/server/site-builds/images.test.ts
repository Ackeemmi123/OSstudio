import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { PICTURE_WIDTHS, pictureWidths, webpPictures } from "./images";
import { logo, photo } from "./images.fixtures";

describe("the widths a picture is written at", () => {
  it("never go beyond the upload, and stop at 2000", () => {
    expect(pictureWidths(2560)).toEqual([256, 480, 640, 800, 1200, 1600, 2000]);
    expect(pictureWidths(2000)).toEqual([256, 480, 640, 800, 1200, 1600, 2000]);
    expect(pictureWidths(1100)).toEqual([256, 480, 640, 800, 1100]);
    expect(pictureWidths(700)).toEqual([256, 480, 700]);
    expect(pictureWidths(240)).toEqual([240]);
    for (const width of [200, 333, 640, 999, 1707, 2560]) expect(Math.max(...pictureWidths(width))).toBe(Math.min(width, PICTURE_WIDTHS.at(-1)!));
  });

  it("leave out a step that is nearly the upload's own width", () => {
    expect(pictureWidths(1000)).toEqual([256, 480, 640, 800, 1000]);
    expect(pictureWidths(900)).toEqual([256, 480, 640, 900]);
    expect(pictureWidths(300)).toEqual([300]);
  });
});

describe("making a picture's WebP files", () => {
  it("writes a JPEG as WebP at each width, never larger than the upload", async () => {
    const made = await webpPictures(await photo(1100, 653));
    expect([made.width, made.height]).toEqual([1100, 653]);
    expect(made.variants.map((variant) => variant.width)).toEqual([256, 480, 640, 800, 1100]);
    for (const variant of made.variants) {
      const meta = await sharp(variant.body).metadata();
      expect(meta.format).toBe("webp");
      expect([meta.width, meta.height]).toEqual([variant.width, variant.height]);
      expect(variant.width / variant.height).toBeCloseTo(1100 / 653, 1);
    }
    const bytes = made.variants.map((variant) => variant.body.byteLength);
    expect(bytes).toEqual([...bytes].sort((a, b) => a - b));
  });

  it("writes a small picture once, at its own size", async () => {
    const made = await webpPictures(await photo(240, 320));
    expect(made.variants.map((variant) => [variant.width, variant.height])).toEqual([[240, 320]]);
  });

  it("keeps a PNG logo's transparency, at every width", async () => {
    const made = await webpPictures(await logo(700, 423));
    // A flat logo without loss is so light that a narrower file is written only where it is lighter still.
    expect(made.variants.at(-1)!.width).toBe(700);
    expect([256, 480, 700]).toEqual(expect.arrayContaining(made.variants.map((variant) => variant.width)));
    for (const variant of made.variants.slice(0, -1)) expect(variant.body.byteLength).toBeLessThan(made.variants.at(-1)!.body.byteLength);
    const textured = await webpPictures(new Uint8Array(await sharp(await photo(700, 423)).ensureAlpha(0.5).png().toBuffer()));
    expect(textured.variants.map((variant) => variant.width)).toEqual([256, 480, 700]);
    for (const variant of [...made.variants, ...textured.variants]) {
      const { data, info } = await sharp(variant.body).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      expect((await sharp(variant.body).metadata()).hasAlpha).toBe(true);
      const alphaAt = (x: number, y: number) => data[(y * info.width + x) * 4 + 3];
      // The logo: clear at the corner, solid in the middle. The half-clear photograph: half-clear everywhere.
      expect(alphaAt(0, 0)).toBeCloseTo(made.variants.includes(variant) ? 0 : 127.5, -1);
      expect(alphaAt(Math.floor(info.width / 2), Math.floor(info.height / 2))).toBeCloseTo(made.variants.includes(variant) ? 255 : 127.5, -1);
    }
  });

  it("writes a flat logo without loss and a photograph saved as PNG as a photograph", async () => {
    const flat = await logo(700, 423);
    const drawn = await webpPictures(flat);
    const back = await sharp(drawn.variants.at(-1)!.body).ensureAlpha().raw().toBuffer();
    const original = await sharp(flat).ensureAlpha().raw().toBuffer();
    expect(Buffer.compare(back, original)).toBe(0);

    const png = new Uint8Array(await sharp(await photo(900, 600)).png().toBuffer());
    const asPhoto = await webpPictures(png);
    expect(asPhoto.variants.at(-1)!.body.byteLength).toBeLessThan(png.byteLength / 3);
  });

  it("turns a photo upright as a browser shows it", async () => {
    const made = await webpPictures(await photo(800, 600, 6));
    expect([made.width, made.height]).toEqual([600, 800]);
    expect(made.variants.at(-1)).toMatchObject({ width: 600, height: 800 });
  });

  it("does not make a lean WebP heavier at its own size", async () => {
    const lean = new Uint8Array(await sharp(await photo(900, 600)).webp({ quality: 30 }).toBuffer());
    const made = await webpPictures(lean);
    expect(made.variants.at(-1)!.body.byteLength).toBeLessThanOrEqual(lean.byteLength);
    // And no narrower file weighs as much as the widest.
    for (const variant of made.variants.slice(0, -1)) expect(variant.body.byteLength).toBeLessThan(made.variants.at(-1)!.body.byteLength);
  });

  it("makes a small PNG for the browser tab when asked", async () => {
    const made = await webpPictures(await logo(700, 423), { icon: true });
    const meta = await sharp(made.icon!).metadata();
    expect([meta.format, meta.width, meta.height, meta.hasAlpha]).toEqual(["png", 96, 96, true]);
    expect((await webpPictures(await logo(700, 423))).icon).toBeUndefined();
  });

  it("refuses what is not a still picture, so the build can copy it as uploaded", async () => {
    await expect(webpPictures(new Uint8Array([1, 2, 3]))).rejects.toThrow();
    await expect(webpPictures(new TextEncoder().encode("<html>not a picture</html>"))).rejects.toThrow();
    const cut = (await photo(800, 600)).slice(0, 2000);
    await expect(webpPictures(cut)).rejects.toThrow();
  });
});
