import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { docxText, readZipEntry } from "./docx";
import { checkMaterial, materialType, splitText } from "./files";
import { checkAddress, htmlText, isPrivateAddress, readWebPage } from "./web";

/** A minimal ZIP with the given files, stored or deflated, the way Word writes a .docx. */
function zip(files: Record<string, string>, deflate = true): Uint8Array {
  const encoder = new TextEncoder();
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const raw = Buffer.from(encoder.encode(content));
    const data = deflate ? deflateRawSync(raw) : raw;
    const nameBytes = Buffer.from(encoder.encode(name));
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(deflate ? 8 : 0, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(deflate ? 8 : 0, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, data);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + data.length;
  }
  const centralBytes = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, centralBytes, end]));
}

const documentXml = `<?xml version="1.0"?><w:document><w:body>
<w:p><w:r><w:t>Protokoll 1/26</w:t></w:r></w:p>
<w:p><w:r><w:t xml:space="preserve">Mötet öppnas </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>kl. 13.08</w:t></w:r></w:p>
<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Dennis</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Föreningsdirektör</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
<w:p><w:r><w:t>A &amp; B</w:t><w:tab/><w:t>slut</w:t></w:r></w:p>
</w:body></w:document>`;

describe("reading a Word document", () => {
  it("keeps paragraphs and table cells, drops formatting and decodes characters", () => {
    const text = docxText(zip({ "[Content_Types].xml": "<Types/>", "word/document.xml": documentXml }));
    expect(text).toContain("Protokoll 1/26");
    expect(text).toContain("Mötet öppnas kl. 13.08");
    expect(text).toContain("A & B\tslut");
    expect(text).toMatch(/Dennis\s+\n?\s*Föreningsdirektör|Dennis\n\tFöreningsdirektör|Dennis/);
    expect(text).not.toContain("<");
  });

  it("reads stored entries too, and says no to what is not a Word document", () => {
    expect(new TextDecoder().decode(readZipEntry(zip({ "a.txt": "hej" }, false), "a.txt")!)).toBe("hej");
    expect(docxText(new TextEncoder().encode("%PDF-1.7"))).toBeNull();
    expect(docxText(zip({ "other.xml": "<x/>" }))).toBeNull();
  });
});

describe("keeping a file", () => {
  it("knows PDFs and images by their first bytes", () => {
    expect(materialType(new TextEncoder().encode("%PDF-1.4"))).toBe("application/pdf");
    expect(materialType(new Uint8Array([255, 216, 255, 224]))).toBe("image/jpeg");
    expect(materialType(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]))).toBe("image/png");
    expect(materialType(new TextEncoder().encode("RIFF0000WEBP"))).toBe("image/webp");
    expect(materialType(new TextEncoder().encode("<html>"))).toBeNull();
  });

  it("refuses other files, empty files and missing names", () => {
    expect(checkMaterial(new TextEncoder().encode("%PDF-1.4"), "Stadgar")).toMatchObject({ ok: true, type: "application/pdf" });
    expect(checkMaterial(new TextEncoder().encode("exe"), "x").ok).toBe(false);
    expect(checkMaterial(new Uint8Array(), "x").ok).toBe(false);
    expect(checkMaterial(new TextEncoder().encode("%PDF-1.4"), " ").ok).toBe(false);
  });

  it("splits long text at paragraphs into parts that fit a source", () => {
    const parts = splitText(Array.from({ length: 30 }, (_, i) => `Stycke ${i} ${"x".repeat(3000)}`).join("\n\n"), 10000);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((part) => part.length <= 10000)).toBe(true);
    expect(parts.join("\n\n")).toContain("Stycke 29");
  });
});

describe("reading a web page", () => {
  const publicHost = async () => ["93.184.216.34"];
  const privateHost = async () => ["10.0.0.5"];

  it("refuses private, loopback and link-local addresses", () => {
    for (const address of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "0.0.0.0"]) expect(isPrivateAddress(address)).toBe(true);
    for (const address of ["93.184.216.34", "8.8.8.8", "2606:4700::1111"]) expect(isPrivateAddress(address)).toBe(false);
  });

  it("checks the address before anything is fetched", async () => {
    expect(await checkAddress("example.fi", publicHost)).toBeInstanceOf(URL);
    expect(await checkAddress("http://intern.example.fi", privateHost)).toBe("That is not a public web address.");
    expect(await checkAddress("ftp://example.fi", publicHost)).toBe("Only http and https addresses can be read.");
    expect(await checkAddress("https://example.fi:8080", publicHost)).toBe("Only the standard web ports can be read.");
    expect(await checkAddress("https://user:pw@example.fi", publicHost)).toMatch(/user name/);
    expect(await checkAddress("http://localhost", publicHost)).toBe("That is not a public web address.");
    expect(await checkAddress("http://169.254.169.254/latest", publicHost)).toBe("That is not a public web address.");
  });

  it("keeps the text and leaves scripts, styles and markup out", () => {
    const { title, text } = htmlText('<html><head><title>Nomad &amp; co</title><meta name="description" content="Inredning i Helsingfors"><style>p{}</style></head><body><nav><a href="/">Hem</a></nav><h1>Rum</h1><p>Vi <b>skapar</b> rum.</p><script>alert(1)</script></body></html>');
    expect(title).toBe("Nomad & co");
    expect(text).toContain("Inredning i Helsingfors");
    expect(text).toContain("## Rum");
    expect(text).toContain("Vi skapar rum.");
    expect(text).not.toMatch(/alert|p\{\}|</);
  });

  it("follows a redirect only to another public address", async () => {
    const pages: Record<string, Response> = {
      "https://example.fi/": new Response(null, { status: 301, headers: { location: "https://www.example.fi/" } }),
      "https://www.example.fi/": new Response("<title>Hej</title><p>Text</p>", { headers: { "content-type": "text/html" } }),
    };
    const fake = (async (url: URL) => pages[url.toString()]) as unknown as typeof fetch;
    expect(await readWebPage("https://example.fi/", { fetch: fake, resolve: publicHost })).toMatchObject({ ok: true, title: "Hej", text: "Text" });

    const toPrivate = (async () => new Response(null, { status: 302, headers: { location: "http://10.0.0.5/" } })) as unknown as typeof fetch;
    expect(await readWebPage("https://example.fi/", { fetch: toPrivate, resolve: async (host) => (host === "10.0.0.5" ? ["10.0.0.5"] : ["93.184.216.34"]) })).toMatchObject({ ok: false, message: "That is not a public web address." });
  });

  it("refuses what is not a web page", async () => {
    const pdf = (async () => new Response("%PDF", { headers: { "content-type": "application/pdf" } })) as unknown as typeof fetch;
    expect(await readWebPage("https://example.fi/a.pdf", { fetch: pdf, resolve: publicHost })).toMatchObject({ ok: false });
  });
});
