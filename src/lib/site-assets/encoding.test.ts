import { describe, expect, it } from "vitest";
import { encodingPlan } from "./encoding";

describe("how an uploaded image is re-encoded", () => {
  it("keeps a PNG lossless first, then falls back to WebP", () => {
    expect(encodingPlan("image/png").map((step) => step.type)).toEqual(["image/png", "image/webp", "image/webp", "image/webp"]);
  });

  it("turns photos into WebP at falling quality", () => {
    expect(encodingPlan("image/jpeg")).toEqual([
      { type: "image/webp", quality: 0.85 },
      { type: "image/webp", quality: 0.7 },
      { type: "image/webp", quality: 0.55 },
    ]);
    expect(encodingPlan("image/webp")[0]).toEqual({ type: "image/webp", quality: 0.85 });
  });
});
