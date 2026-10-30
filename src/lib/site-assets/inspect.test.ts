import { describe, expect, it } from "vitest";
import { inspectImage } from "./inspect";
import { approvalProblems, emptyProvenance, SIGNED_URL_TTL_SECONDS } from "./limits";
import { jpegImage, pngImage, SPOOFED_SVG, webpImage } from "./test-images";

const reason = (bytes: Uint8Array) => {
  const result = inspectImage(bytes);
  return result.ok ? "accepted" : result.reason;
};

describe("reading images from their bytes", () => {
  it("accepts real PNG, JPEG and WebP files and reads their size", () => {
    expect(inspectImage(pngImage(400, 300))).toEqual({ ok: true, mimeType: "image/png", width: 400, height: 300 });
    expect(inspectImage(jpegImage(640, 480))).toEqual({ ok: true, mimeType: "image/jpeg", width: 640, height: 480 });
    expect(inspectImage(webpImage(800, 600))).toEqual({ ok: true, mimeType: "image/webp", width: 800, height: 600 });
  });

  it("refuses files that only claim to be images", () => {
    expect(reason(SPOOFED_SVG)).toMatch(/not a JPEG, PNG or WebP/);
    expect(reason(new TextEncoder().encode("<html><script>alert(1)</script></html>"))).toMatch(/not a JPEG, PNG or WebP/);
    expect(reason(new TextEncoder().encode("GIF89a\x01\x00\x01\x00"))).toMatch(/not a JPEG, PNG or WebP/);
    expect(reason(new Uint8Array())).toMatch(/empty/);
  });

  it("refuses damaged, cut-short and padded PNG files", () => {
    const png = pngImage();
    const badCrc = png.slice();
    badCrc[29] ^= 0xff; // inside the IHDR checksum
    expect(reason(badCrc)).toMatch(/checksum/);
    expect(reason(png.slice(0, png.length - 12))).toMatch(/cut short/);
    const polyglot = new Uint8Array([...png, ...new TextEncoder().encode("<script>alert(1)</script>")]);
    expect(reason(polyglot)).toMatch(/extra data after its end|damaged/);
  });

  it("refuses JPEG files without a frame header or end marker, or with data after the end", () => {
    const jpeg = jpegImage();
    expect(reason(jpeg.slice(0, jpeg.length - 2))).toMatch(/cut short|extra data/);
    expect(reason(new Uint8Array([...jpeg, ...new TextEncoder().encode("<?php echo 1; ?>")]))).toMatch(/extra data|cut short/);
    expect(reason(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))).toMatch(/no frame header/);
  });

  it("refuses WebP files whose size does not match", () => {
    const webp = webpImage();
    expect(reason(new Uint8Array([...webp, 1, 2, 3, 4]))).toMatch(/size does not match/);
  });
});

describe("image rules", () => {
  it("keeps signed links to at most 15 minutes", () => {
    expect(SIGNED_URL_TTL_SECONDS).toBeLessThanOrEqual(900);
  });

  it("asks the three rights questions separately, and does not assume consent", () => {
    expect(approvalProblems(emptyProvenance())).toEqual([
      "Describe what the image shows.",
      "Say who holds the rights (copyright and licensing).",
      "Confirm there is permission to use the image on this client's website.",
    ]);
    const licensed = { ...emptyProvenance("Shop front"), rightsBasis: "licensed" as const, usePermitted: true, usePermissionNote: "Client email, 3 Nov" };
    expect(approvalProblems(licensed)).toEqual(["Record the licence: its name, a link, or the agreement it comes from."]);
    const people = { ...licensed, licenceNote: "Unsplash licence", identifiablePeople: true };
    expect(approvalProblems(people)).toEqual(["Choose the lawful basis for showing the people in it.", "Note where the basis for showing the people is documented."]);
    expect(approvalProblems({ ...people, peopleBasis: "contract", peopleBasisNote: "Staff agreement, HR file" })).toEqual([]);
  });
});
