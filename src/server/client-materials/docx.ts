/**
 * Reads the text of a Word document (.docx) without a library: a .docx is a
 * ZIP archive, and its text lives in word/document.xml. Paragraphs become
 * lines; tables become lines with tabs between cells. Formatting is dropped.
 */
import { inflateRawSync } from "node:zlib";

const MAX_XML_BYTES = 20 * 1024 * 1024;

/** One file out of a ZIP archive, by name, or null when it is not there. */
export function readZipEntry(zip: Uint8Array, name: string): Uint8Array | null {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  // The end of central directory record sits in the last 64 KB.
  let end = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) return null;
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  const decoder = new TextDecoder();
  for (let n = 0; n < count && offset + 46 <= zip.length; n++) {
    if (view.getUint32(offset, true) !== 0x02014b50) return null;
    const method = view.getUint16(offset + 10, true);
    const compressed = view.getUint32(offset + 20, true);
    const size = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const local = view.getUint32(offset + 42, true);
    const entryName = decoder.decode(zip.subarray(offset + 46, offset + 46 + nameLength));
    if (entryName === name) {
      if (size > MAX_XML_BYTES || local + 30 > zip.length) return null;
      const dataStart = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      const data = zip.subarray(dataStart, dataStart + compressed);
      if (method === 0) return data;
      if (method === 8) return new Uint8Array(inflateRawSync(data, { maxOutputLength: MAX_XML_BYTES }));
      return null;
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return null;
}

function decodeXml(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, "&");
}

/** The text of a .docx, or null when the file is not a Word document. */
export function docxText(bytes: Uint8Array): string | null {
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return null;
  const xmlBytes = readZipEntry(bytes, "word/document.xml");
  if (!xmlBytes) return null;
  const xml = new TextDecoder().decode(xmlBytes);
  const body = xml.match(/<w:body[\s\S]*<\/w:body>/)?.[0] ?? xml;
  // Only the text runs, tabs, breaks and paragraph and cell ends carry text; everything else is formatting.
  let text = "";
  for (const match of body.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br[^>]*\/>|<\/w:tc>|<\/w:p>/g)) {
    if (match[1] !== undefined) text += match[1];
    else if (match[0] === "<w:tab/>" || match[0] === "</w:tc>") text += "\t";
    else text += "\n";
  }
  return decodeXml(text)
    .split("\n")
    .map((line) => line.replace(/\t+$/, "").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
