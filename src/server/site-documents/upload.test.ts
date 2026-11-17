import { describe, expect, it } from "vitest";
import { checkDocument, MAX_DOCUMENT_BYTES } from "./upload";

const pdf = new TextEncoder().encode("%PDF-1.7\n%test\n");

describe("checking a document before it is stored", () => {
  it("accepts a PDF with a title", () => {
    const result = checkDocument(pdf, "  Stadgar  ");
    expect(result).toMatchObject({ ok: true, title: "Stadgar" });
    if (result.ok) expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("refuses anything that is not a PDF, an empty file, a large file or a missing title", () => {
    expect(checkDocument(new TextEncoder().encode("<html>"), "x").ok).toBe(false);
    expect(checkDocument(new Uint8Array(), "x").ok).toBe(false);
    const big = new Uint8Array(MAX_DOCUMENT_BYTES + 1);
    big.set(pdf);
    expect(checkDocument(big, "x").ok).toBe(false);
    expect(checkDocument(pdf, " ").ok).toBe(false);
  });
});
