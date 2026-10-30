import { describe, expect, it, vi } from "vitest";
import { emptyProvenance } from "@/lib/site-assets/limits";
import { jpegImage, pngImage, SPOOFED_SVG } from "@/lib/site-assets/test-images";
import { receiveSiteAssetUpload, readProvenance, type UploadSteps } from "./upload";

vi.mock("server-only", () => ({}));

function steps(existing = false) {
  const calls: string[] = [];
  const s: UploadSteps = {
    begin: vi.fn(async (meta) => {
      calls.push(`begin ${meta.mimeType} ${meta.width}x${meta.height}`);
      return { id: "asset-1", storagePath: existing ? null : "studio/client/asset-1.png", existing };
    }),
    store: vi.fn(async (path) => void calls.push(`store ${path}`)),
    finish: vi.fn(async (id, measured) => void calls.push(`finish ${id} ${measured.sha256.length}`)),
    recordUploaded: vi.fn(async () => void calls.push("event")),
  };
  return { s, calls };
}

const provenance = { ...emptyProvenance("Strawberry cake"), rightsBasis: "client_owns" as const };

describe("receiving an upload", () => {
  it("checks the bytes, then begins, stores, finishes and records it, in that order", async () => {
    const { s, calls } = steps();
    const outcome = await receiveSiteAssetUpload({ bytes: pngImage(400, 300), declaredType: "image/png", provenance }, s);
    expect(outcome).toEqual({ status: 201, body: { assetId: "asset-1", existing: false } });
    expect(calls).toEqual(["begin image/png 400x300", "store studio/client/asset-1.png", "finish asset-1 64", "event"]);
  });

  it("stores nothing when the bytes are not a real image, or not what was declared", async () => {
    for (const [bytes, declaredType, message] of [
      [SPOOFED_SVG, "image/png", /not a JPEG, PNG or WebP/],
      [jpegImage(), "image/png", /not the type it claims/],
      [pngImage(150, 150), "image/png", /too small/],
      [pngImage(3000, 200), "image/png", /larger than 2560/],
      [new Uint8Array(), "image/png", /empty/],
    ] as const) {
      const { s } = steps();
      const outcome = await receiveSiteAssetUpload({ bytes, declaredType, provenance }, s);
      expect(outcome.status).toBe(400);
      expect(outcome.body.error).toMatch(message);
      expect(s.begin).not.toHaveBeenCalled();
      expect(s.store).not.toHaveBeenCalled();
    }
  });

  it("needs a description, and reuses an image already stored for the client", async () => {
    const { s } = steps(true);
    expect((await receiveSiteAssetUpload({ bytes: pngImage(), declaredType: "image/png", provenance: emptyProvenance() }, s)).status).toBe(400);
    const outcome = await receiveSiteAssetUpload({ bytes: pngImage(), declaredType: "image/png", provenance }, s);
    expect(outcome).toEqual({ status: 200, body: { assetId: "asset-1", existing: true } });
    expect(s.store).not.toHaveBeenCalled();
  });

  it("reads the provenance answers strictly", () => {
    expect(readProvenance(null)).toBeNull();
    expect(readProvenance({ description: "  Cake ", rightsBasis: "stolen", usePermitted: "yes", peopleBasis: "consent" })).toMatchObject({
      description: "Cake",
      rightsBasis: null,
      usePermitted: false,
      peopleBasis: "consent",
    });
  });
});
