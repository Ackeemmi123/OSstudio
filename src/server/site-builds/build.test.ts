import { describe, expect, it } from "vitest";
import type { SiteSpec } from "@/lib/site-spec/schema";
import { briefClient, companySpec, completeSpec } from "@/lib/site-spec/test-helpers";
import { BuildRefused, buildSite, contentTypeOf, pageChecks, type StoredImage } from "./build";
import { SIGNATURE_PRESETS } from "@/lib/site-spec/catalog";
import { DIRECTION_PRESETS } from "../../../signature/layer/enhance.mjs";

const now = new Date("2026-11-17T10:00:00Z");
const studioId = "11111111-1111-4111-8111-111111111111";

/** The complete test spec, set to build with the association design. */
function spec(): SiteSpec {
  const value = structuredClone(completeSpec(briefClient()));
  value.brand.designSystem = "association@0.1";
  value.locales = { available: ["sv"], default: "sv" };
  const toSv = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(toSv);
    if (node && typeof node === "object") {
      const entries = Object.entries(node as Record<string, unknown>);
      const keys = entries.map(([key]) => key);
      if (keys.length && keys.every((key) => key === "en" || key === "sv" || key === "fi")) {
        const text = (node as Record<string, string>).sv ?? (node as Record<string, string>).en ?? (node as Record<string, string>).fi;
        return { sv: text };
      }
      return Object.fromEntries(entries.map(([key, child]) => [key, toSv(child)]));
    }
    return node;
  };
  return toSv(value) as SiteSpec;
}

function deps(images: StoredImage[] = []) {
  return {
    images: async (ids: string[]) => images.filter((image) => ids.includes(image.id)),
    download: async () => new Uint8Array([1, 2, 3]),
    now: () => now,
  };
}

function withImages(value: SiteSpec, status: StoredImage["status"]) {
  const images: StoredImage[] = [];
  value.assets.forEach((asset, i) => {
    const fileId = `00000000-0000-4000-8000-00000000000${i}`;
    asset.fileId = fileId;
    images.push({ id: fileId, storagePath: `${studioId}/client/${i}.webp`, mimeType: "image/webp", status });
  });
  return images;
}

describe("building a site from a spec", () => {
  it("refuses a spec that uses Studio OS's template", async () => {
    const value = spec();
    delete value.brand.designSystem;
    await expect(buildSite({ studioId, specVersion: 1, spec: value }, deps())).rejects.toThrow(/template, which only previews/);
  });

  it("refuses when an image has no stored file", async () => {
    const value = spec();
    if (!value.assets.length) return;
    await expect(buildSite({ studioId, specVersion: 1, spec: value }, deps())).rejects.toBeInstanceOf(BuildRefused);
  });

  it("builds every page with the images, a long random link and a 30-day expiry", async () => {
    const value = spec();
    const images = withImages(value, "approved");
    const site = await buildSite({ studioId, specVersion: 2, spec: value }, deps(images));
    expect(site.designSystem).toBe("association@0.1");
    expect(site.files.some((file) => file.path === "index.html")).toBe(true);
    expect(site.files.filter((file) => file.path.startsWith("img/"))).toHaveLength(value.assets.length);
    expect(site.shareToken).toMatch(/^[A-Za-z0-9_-]{32,64}$/);
    expect(site.storagePrefix).toBe(`${studioId}/${site.id}`);
    expect(site.expiresAt.getTime() - now.getTime()).toBe(30 * 86400000);
    const home = new TextDecoder().decode(site.files.find((file) => file.path === "index.html")!.body);
    expect(home).toContain("noindex");
  });

  it("warns, but builds, when image rights are not decided yet", async () => {
    const value = spec();
    const images = withImages(value, "pending_review");
    if (!images.length) return;
    const site = await buildSite({ studioId, specVersion: 1, spec: value }, deps(images));
    expect(site.checks.some((check) => check.level === "warning" && /not decided/.test(check.message))).toBe(true);
  });

  it("refuses rejected images", async () => {
    const value = spec();
    const images = withImages(value, "rejected");
    if (!images.length) return;
    await expect(buildSite({ studioId, specVersion: 1, spec: value }, deps(images))).rejects.toBeInstanceOf(BuildRefused);
  });
});

describe("documents in a build", () => {
  function withDocument(value: SiteSpec) {
    const page = value.pages[0];
    page.sections.push({ id: "docs", kind: "features", variant: "list", heading: { sv: "Dokument" }, items: [{ id: "minutes-1", title: { sv: "M\u00f6te 1/26" }, body: { sv: "PDF." }, documentFileId: "00000000-0000-4000-8000-0000000000d1" }] });
    return value;
  }

  it("adds the PDF and links the list item to it", async () => {
    const value = withDocument(spec());
    const images = withImages(value, "approved");
    const site = await buildSite({ studioId, specVersion: 1, spec: value }, {
      ...deps(images),
      documents: async (ids) => ids.map((id) => ({ id, storagePath: `${studioId}/c/${id}.pdf`, deleted: false })),
      downloadDocument: async () => new TextEncoder().encode("%PDF-1.7"),
    });
    const pdf = site.files.find((file) => file.path === "dokument/00000000-0000-4000-8000-0000000000d1.pdf");
    expect(pdf?.contentType).toBe("application/pdf");
    const home = new TextDecoder().decode(site.files.find((file) => file.path === "index.html")!.body);
    expect(home).toContain('href="/dokument/00000000-0000-4000-8000-0000000000d1.pdf"');
  });

  it("warns, and leaves the link out, when the document was deleted", async () => {
    const value = withDocument(spec());
    const images = withImages(value, "approved");
    const site = await buildSite({ studioId, specVersion: 1, spec: value }, {
      ...deps(images),
      documents: async (ids) => ids.map((id) => ({ id, storagePath: "x", deleted: true })),
      downloadDocument: async () => new Uint8Array(),
    });
    expect(site.checks.some((check) => /no longer exists/.test(check.message))).toBe(true);
    expect(site.files.some((file) => file.path.endsWith(".pdf"))).toBe(false);
  });
});

describe("building with the company design", () => {
  const fontDeps = (images: StoredImage[] = []) => ({ ...deps(images), font: (name: string) => new TextEncoder().encode(name) });

  it("builds a prototype with its fonts, kept from search engines, the form switched off", async () => {
    const value = companySpec();
    const images = withImages(value, "approved");
    const site = await buildSite({ studioId, specVersion: 2, spec: value, madeBy: "Axivo" }, fontDeps(images));
    const paths = site.files.map((file) => file.path);
    expect(paths).toContain("index.html");
    expect(paths).toContain("robots.txt");
    expect(paths.some((path) => path.startsWith("fonts/") && path.endsWith(".woff2"))).toBe(true);
    expect(site.files.find((file) => file.path.endsWith(".woff2"))?.contentType).toBe("font/woff2");
    const home = new TextDecoder().decode(site.files.find((file) => file.path === "index.html")!.body);
    expect(home).toContain("Axivo");
    expect(home).toContain("noindex");
    expect(home).toMatch(/disabled/);
  });

  it("builds the client's site with the approver's name and the hosted form address", async () => {
    const value = companySpec();
    value.assets = [];
    for (const section of value.pages.flatMap((page) => page.sections)) if ("mediaAssetId" in section) delete section.mediaAssetId;
    const formAction = "https://studio.example/api/site-forms/key";
    const site = await buildSite({ studioId, specVersion: 2, spec: value, production: { formAction, approvedBy: "Erik Testlund (TEST)", approvedOn: "2026-11-20" } }, fontDeps());
    const pages = site.files.filter((file) => file.path.endsWith(".html")).map((file) => new TextDecoder().decode(file.body));
    expect(pages.some((page) => page.includes(`action="${formAction}"`))).toBe(true);
    expect(pages.every((page) => !page.includes("noindex"))).toBe(true);
    expect(site.files.some((file) => file.path === "robots.txt")).toBe(false);
  });

  it("refuses a production build nobody approved", async () => {
    const value = companySpec();
    value.assets = [];
    for (const section of value.pages.flatMap((page) => page.sections)) if ("mediaAssetId" in section) delete section.mediaAssetId;
    await expect(buildSite({ studioId, specVersion: 2, spec: value, production: { formAction: "https://studio.example/f" } }, fontDeps())).rejects.toBeInstanceOf(BuildRefused);
  });

  it("with Axivo Signature motion, adds the layer's files and its head block to every page, and still passes the page checks", async () => {
    const value = companySpec();
    value.brand.concept = { ...value.brand.concept, signatureMotion: true };
    const site = await buildSite({ studioId, specVersion: 2, spec: value, madeBy: "Axivo" }, fontDeps(withImages(value, "approved")));
    const paths = site.files.map((file) => file.path);
    expect(paths).toContain("signature/layer.js");
    expect(paths).toContain("signature/layer.css");
    expect(paths).toContain("signature/site.js");
    expect(site.files.find((file) => file.path === "signature/layer.js")?.contentType).toMatch(/javascript/);
    const pages = site.files.filter((file) => file.path.endsWith(".html")).map((file) => new TextDecoder().decode(file.body));
    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) expect(page).toMatch(/<!-- signature-layer [\w.-]+ -->[\s\S]*signature\/site\.js[\s\S]*<!-- \/signature-layer -->/);
    expect(site.checks.filter((check) => check.level === "error")).toEqual([]);
  });

  it("without it, builds pages with no script at all", async () => {
    const value = companySpec();
    const site = await buildSite({ studioId, specVersion: 2, spec: value, madeBy: "Axivo" }, fontDeps(withImages(value, "approved")));
    expect(site.files.some((file) => file.path.startsWith("signature/"))).toBe(false);
    const pages = site.files.filter((file) => file.path.endsWith(".html")).map((file) => new TextDecoder().decode(file.body));
    expect(pages.every((page) => !/<script\b/i.test(page))).toBe(true);
  });

  it("gives each direction the same Signature preset as the layer does", () => {
    expect(SIGNATURE_PRESETS).toEqual(DIRECTION_PRESETS);
  });

  it("refuses, naming the parts, when the company design cannot draw the spec", async () => {
    const value = companySpec();
    value.pages = value.pages.filter((page) => !page.sections.some((s) => s.kind === "contact"));
    await expect(buildSite({ studioId, specVersion: 2, spec: value, madeBy: "Axivo" }, fontDeps(withImages(value, "approved")))).rejects.toThrow();
  });
});

describe("page checks", () => {
  it("finds scripts, images without alternative text and text left in square brackets", () => {
    const checks = pageChecks('<p>[Write the story here]</p><img src="a.jpg" alt=""><script>x</script>', "index.html");
    expect(checks.map((check) => check.level).sort()).toEqual(["error", "error", "warning"]);
  });

  it("accepts Axivo Signature's own head block once, and no other script", () => {
    const block = (base: string) =>
      `<!-- signature-layer 1a2b3c -->\n<link rel="stylesheet" href="${base}signature/layer.css">\n<link rel="modulepreload" href="${base}signature/layer.js">\n<script type="module" src="${base}signature/site.js" blocking="render"></script>\n<!-- /signature-layer -->`;
    expect(pageChecks(`<head>${block("./")}</head><h1>Hej</h1>`, "index.html")).toEqual([]);
    expect(pageChecks(`<head>${block("../")}</head><h1>Hej</h1>`, "om/index.html")).toEqual([]);
    expect(pageChecks(`<head>${block("./")}${block("./")}</head>`, "index.html").map((c) => c.level)).toContain("error");
    expect(pageChecks(`<head>${block("./")}</head><script>alert(1)</script>`, "index.html").map((c) => c.level)).toContain("error");
    expect(pageChecks(`<head>${block("https://evil.example/")}</head>`, "index.html").map((c) => c.level)).toContain("error");
  });

  it("passes a clean page", () => {
    expect(pageChecks('<h1>Hej</h1><img src="a.jpg" alt="Logotyp">', "index.html")).toEqual([]);
  });

  it("names content types by extension", () => {
    expect(contentTypeOf("om-oss/index.html")).toMatch(/^text\/html/);
    expect(contentTypeOf("img/a.webp")).toBe("image/webp");
    expect(contentTypeOf("dokument/x.pdf")).toBe("application/pdf");
    // Axivo Signature's module scripts must be served as JavaScript, or the browser refuses to run them on the review link.
    expect(contentTypeOf("signature/layer.js")).toMatch(/^text\/javascript/);
  });
});
