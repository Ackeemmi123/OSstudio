/**
 * What the server checks before it stores a document: a real PDF (it starts
 * with %PDF-), at most 4 MB, with a title a person can recognise.
 */
import { createHash } from "node:crypto";

export const DOCUMENT_BUCKET = "site-documents";
export const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;

export type DocumentCheck = { ok: true; title: string; sha256: string } | { ok: false; message: string };

export function checkDocument(bytes: Uint8Array, title: unknown): DocumentCheck {
  if (typeof title !== "string" || !title.trim() || title.trim().length > 200) return { ok: false, message: "Give the document a title of at most 200 characters." };
  if (bytes.byteLength === 0) return { ok: false, message: "The file is empty." };
  if (bytes.byteLength > MAX_DOCUMENT_BYTES) return { ok: false, message: "The document is larger than 4 MB." };
  const head = new TextDecoder().decode(bytes.subarray(0, 5));
  if (head !== "%PDF-") return { ok: false, message: "Only PDF files can be added." };
  return { ok: true, title: title.trim(), sha256: createHash("sha256").update(bytes).digest("hex") };
}
