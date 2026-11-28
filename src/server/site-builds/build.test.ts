import { describe, expect, it } from "vitest";
import type { SiteSpec } from "@/lib/site-spec/schema";
import { briefClient, companySpec, completeSpec } from "@/lib/site-spec/test-helpers";
import { BuildRefused, buildSite, contentTypeOf, pageChecks, type StoredImage } from "./build";
import { logo, photo } from "./images.fixtures";
import { serveBuild } from "./serve";
import { ASSOCIATION_SIGNATURE_PRESET, SERVICES_DIRECTIONS, SIGNATURE_PRESETS } from "@/lib/site-spec/catalog";
import { ASSOCIATION_PRESET, DIRECTION_PRESETS } from "../../../signature/layer/enhance.mjs";

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

  it("with Axivo Signature motion, builds with no errors, the layer's head block on every page and every script it loads in the build", async () => {
    const value = spec();
    value.brand.concept = { signatureMotion: true };
    const site = await buildSite({ studioId, specVersion: 2, spec: value }, deps(withImages(value, "approved")));
    expect(site.designSystem).toBe("association@0.1");
    expect(site.checks.filter((check) => check.level === "error")).toEqual([]);
    const pages = site.files.filter((file) => file.path.endsWith(".html"));
    expect(pages.length).toBeGreaterThan(3);
    for (const page of pages) {
      const html = new TextDecoder().decode(page.body);
      const up = "../".repeat(page.path.split("/").length - 1) || "./";
      expect(html.match(/<!-- signature-layer [\w.-]+ -->/g), page.path).toHaveLength(1);
      expect(html, page.path).toContain(`<script type="module" src="${up}signature/site.js" blocking="render"></script>\n<!-- /signature-layer -->\n</head>`);
    }
    const paths = new Set(site.files.map((file) => file.path));
    for (const path of ["signature/layer.js", "signature/layer.css", "signature/site.js"]) expect(paths, path).toContain(path);
    const scripts = site.files.filter((file) => file.path.startsWith("signature/") && file.path.endsWith(".js"));
    // The layer loads its modules by relative address (import, import(), new URL); a missing one fails silently in the browser.
    const loaded = scripts.flatMap((file) => [...new TextDecoder().decode(file.body).matchAll(/["'`]\.\/([\w.-]+\.js)["'`]/g)].map((match) => `signature/${match[1]}`));
    expect(loaded.length).toBeGreaterThan(0);
    for (const path of loaded) expect(paths, path).toContain(path);
    for (const file of scripts) expect(file.contentType, file.path).toMatch(/^text\/javascript/);
    // The association's own map, and calm whatever else the spec says.
    const config = new TextDecoder().decode(scripts.find((file) => file.path === "signature/site.js")!.body);
    expect(config).toContain('start({"preset":"calm","rules":[');
    expect(config).toContain("main .events > .event");
    expect(config).not.toContain("form");
  });

  it("without it, builds pages with no script at all", async () => {
    const value = spec();
    const site = await buildSite({ studioId, specVersion: 2, spec: value }, deps(withImages(value, "approved")));
    expect(site.files.some((file) => file.path.startsWith("signature/") || file.path.endsWith(".js"))).toBe(false);
    const pages = site.files.filter((file) => file.path.endsWith(".html")).map((file) => new TextDecoder().decode(file.body));
    expect(pages.every((page) => !/<script\b/i.test(page) && !page.includes("signature"))).toBe(true);
  });

  it("with it, changes nothing in a page but the head block", async () => {
    const plain = spec();
    const moving = spec();
    moving.brand.concept = { signatureMotion: true };
    const [a, b] = await Promise.all([plain, moving].map((value) => buildSite({ studioId, specVersion: 2, spec: value }, deps(withImages(value, "approved")))));
    const strip = (body: Uint8Array) => new TextDecoder().decode(body).replace(/<!-- signature-layer[\s\S]*?<!-- \/signature-layer -->\n/, "");
    for (const file of a.files) {
      const other = b.files.find((each) => each.path === file.path)!;
      expect(file.path.endsWith(".html") ? strip(other.body) : other.body, file.path).toEqual(file.path.endsWith(".html") ? strip(file.body) : file.body);
    }
    expect(b.files.filter((file) => !a.files.some((each) => each.path === file.path)).every((file) => file.path.startsWith("signature/"))).toBe(true);
  });

  it("serves a Signature build on a review link: the page's base before the layer, the review bar after, every script as JavaScript", async () => {
    const value = spec();
    value.brand.concept = { signatureMotion: true };
    const site = await buildSite({ studioId, specVersion: 2, spec: value }, deps(withImages(value, "approved")));
    const stored = new Map(site.files.map((file) => [`studio-1/build-1/${file.path}`, file.body]));
    const token = "a".repeat(40);
    const review = {
      find: async () => ({ storagePrefix: "studio-1/build-1", expiresAt: "2026-12-17T10:00:00Z", revokedAt: null }),
      read: async (path: string) => stored.get(path) ?? null,
      now: () => now,
      review: async () => ({ name: "TEST Studio", website: null, email: null, color: "#1F2A37", logoUrl: null }),
    };
    const pageFolder = site.files.find((file) => /^[^/]+\/index\.html$/.test(file.path) && !/^(sent|not-sent)\//.test(file.path))!.path.split("/")[0];
    // The home page, a page in a folder, and an address that is not there (the build's own 404 page, from the top).
    for (const [segments, folder] of [[[], ""], [[pageFolder], `${pageFolder}/`], [["finns", "inte"], ""]] as const) {
      const html = await (await serveBuild(token, segments, review)).text();
      const base = html.indexOf(`<base href="/s/${token}/${folder}">`);
      expect(base, folder).toBeGreaterThan(-1);
      expect(base).toBeLessThan(html.indexOf("<!-- signature-layer"));
      expect(html.indexOf("<!-- signature-layer")).toBeGreaterThan(-1);
      expect(html.indexOf("<!-- /signature-layer -->")).toBeLessThan(html.indexOf("rv-bar"));
      // The layer's addresses stay relative (the base places them); the site's own root links are moved under the link.
      expect(html).toContain(`src="${folder ? "../" : "./"}signature/site.js"`);
      expect(html).toContain(`href="/s/${token}/site.css"`);
    }
    for (const file of site.files.filter((each) => each.path.startsWith("signature/") && each.path.endsWith(".js"))) {
      const response = await serveBuild(token, file.path.split("/"), review);
      expect(response.status, file.path).toBe(200);
      expect(response.headers.get("Content-Type"), file.path).toMatch(/^text\/javascript/);
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(file.body);
    }
  });
});

describe("pictures in a build", () => {
  const sv = (text: string) => ({ sv: text });
  const fontDeps = (images: StoredImage[], download: (storagePath: string) => Promise<Uint8Array>) => ({ ...deps(images), download, font: (name: string) => new TextEncoder().encode(name) });
  const pagesOf = (site: Awaited<ReturnType<typeof buildSite>>) => site.files.filter((file) => file.path.endsWith(".html")).map((file) => ({ path: file.path, html: new TextDecoder().decode(file.body) }));
  const imgs = (site: Awaited<ReturnType<typeof buildSite>>) => pagesOf(site).flatMap((page) => (page.html.match(/<img\b[^>]*>/g) ?? []).map((tag) => ({ page: page.path, tag })));
  const attr = (tag: string, name: string) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
  const imageBytes = (site: Awaited<ReturnType<typeof buildSite>>) => site.files.filter((file) => file.path.startsWith("img/")).reduce((sum, file) => sum + file.body.byteLength, 0);

  /** The association TEST spec with the pictures a real one has: a logo (also its hero), a board, a picture beside text and a gallery. */
  function associationWithPictures() {
    const value = spec();
    const picture = (id: string) => ({ id, kind: "photo" as const, alt: sv(`Bild ${id}`), origin: "client_supplied" as const, description: `Bild ${id}` });
    value.assets.push({ id: "logo", kind: "logo", alt: sv("Testföreningens logotyp"), origin: "client_supplied", description: "Logotyp" }, picture("person-a"), picture("person-b"), picture("beside"), picture("gallery-1"));
    value.brand.logoAssetId = "logo";
    const home = value.pages[0];
    const hero = home.sections[0];
    if (hero.kind === "hero") Object.assign(hero, { variant: "split_image_right", mediaAssetId: "logo" });
    const base = Object.fromEntries(Object.entries(structuredClone(home.sections.find((section) => section.kind === "text")!)).filter(([key]) => key !== "body"));
    home.sections.push(
      { ...base, id: "beside-1", kind: "text_media", variant: "image_left", heading: sv("Om oss"), body: sv("En påhittad förening."), mediaAssetId: "beside", buttons: [] } as never,
      { ...base, id: "team-1", kind: "team", variant: "grid", heading: sv("Styrelsen"), items: ["a", "b"].map((n) => ({ id: `p-${n}`, name: `Person ${n}`, role: sv("Ledamot"), assetId: `person-${n}` })) } as never,
      { ...base, id: "gallery-1", kind: "gallery", variant: "grid", heading: sv("Bilder"), assetIds: ["gallery-1"] } as never,
    );
    return value;
  }

  /** Each picture by the order of the spec's assets; `images` names what was "uploaded". */
  async function uploads(value: SiteSpec, make: (assetId: string) => Promise<{ body: Uint8Array; mimeType: string }>) {
    const images: StoredImage[] = [];
    const bodies = new Map<string, Uint8Array>();
    for (const [i, asset] of value.assets.entries()) {
      const fileId = `00000000-0000-4000-8000-0000000000${String(i).padStart(2, "0")}`;
      asset.fileId = fileId;
      const made = await make(asset.id);
      bodies.set(`test/${i}`, made.body);
      images.push({ id: fileId, storagePath: `test/${i}`, mimeType: made.mimeType, status: "approved", width: 1600, height: 1000 });
    }
    return { images, download: async (storagePath: string) => bodies.get(storagePath)!, bytes: [...bodies.values()].reduce((sum, body) => sum + body.byteLength, 0) };
  }
  const real = async (assetId: string) =>
    assetId === "logo" ? { body: await logo(700, 423), mimeType: "image/png" } : assetId.startsWith("person") ? { body: await photo(240, 320), mimeType: "image/jpeg" } : { body: await photo(1200, 800), mimeType: "image/jpeg" };
  const unreadable = async () => ({ body: new Uint8Array([1, 2, 3]), mimeType: "image/jpeg" });

  for (const [name, make] of [["the association design", associationWithPictures], ["the company design", companySpec]] as const) {
    it(`with ${name}, gives every picture a list of WebP files that are in the build, and changes nothing else about it`, async () => {
      const asToday = make();
      const before = await uploads(asToday, unreadable);
      const copied = await buildSite({ studioId, specVersion: 2, spec: asToday, madeBy: "Axivo" }, fontDeps(before.images, before.download));
      const value = make();
      const after = await uploads(value, real);
      const site = await buildSite({ studioId, specVersion: 2, spec: value, madeBy: "Axivo" }, fontDeps(after.images, after.download));
      expect(site.checks.filter((check) => /could not be made smaller/.test(check.message))).toEqual([]);

      const paths = new Set(site.files.map((file) => file.path));
      const tags = imgs(site);
      const asUploaded = imgs(copied);
      expect(tags.length).toBeGreaterThan(0);
      expect(tags).toHaveLength(asUploaded.length);
      for (const [i, { tag, page }] of tags.entries()) {
        const srcset = attr(tag, "srcset");
        expect(srcset, `${page}: ${tag}`).toBeTruthy();
        const entries = srcset!.split(", ").map((entry) => entry.split(" "));
        for (const [file, width] of entries) {
          expect(file).toMatch(/^\/img\/[\w-]+-\d+\.webp$/);
          expect(paths.has(file.slice(1)), `${file} is in the build`).toBe(true);
          expect(width).toBe(`${file.match(/-(\d+)\.webp$/)![1]}w`);
        }
        expect(attr(tag, "src")).toBe(entries.at(-1)![0]);
        expect(attr(tag, "sizes"), tag).toMatch(/\d(px|vw|rem|\))/);
        // The same picture as a build that copies uploads writes: its words, its size on the page, how it loads.
        const old = asUploaded[i].tag;
        for (const name of ["alt", "class", "loading", "fetchpriority", "decoding"]) expect(attr(tag, name), `${name} of ${tag}`).toBe(attr(old, name));
        if (attr(old, "width")) expect([attr(tag, "width"), attr(tag, "height")]).toEqual([attr(old, "width"), attr(old, "height")]);
        expect(Number(attr(tag, "width"))).toBeGreaterThan(0);
        expect(Number(attr(tag, "height"))).toBeGreaterThan(0);
        expect(attr(tag, "alt")).toBeTruthy();
      }
      // Nothing but pictures and the browser-tab icon differs between the two builds' pages.
      const plain = (html: string) => html.replace(/<img\b[^>]*>/g, "<img>").replace(/<link rel="icon"[^>]*>/, "");
      expect(pagesOf(site).map((page) => plain(page.html))).toEqual(pagesOf(copied).map((page) => plain(page.html)));
      for (const file of site.files.filter((entry) => entry.path.startsWith("img/"))) expect(file.contentType).toBe(file.path.endsWith(".png") ? "image/png" : "image/webp");
      // What a phone at 2x fetches at most: for each picture, the widest file up to 800 px (a picture as wide as its screen).
      const widthOf = (path: string) => Number(path.match(/-(\d+)\.webp$/)?.[1] ?? 0);
      const phone = value.assets.reduce((sum, asset) => {
        const own = site.files.filter((file) => file.path.startsWith(`img/${asset.id}-`) && file.path.endsWith(".webp"));
        const pick = own.filter((file) => widthOf(file.path) <= 800).sort((a, b) => widthOf(b.path) - widthOf(a.path))[0] ?? own.sort((a, b) => widthOf(a.path) - widthOf(b.path))[0];
        return sum + pick.body.byteLength;
      }, 0);
      expect(phone).toBeLessThan(after.bytes / 2);
      console.log(`Pictures in a TEST build with ${name}: ${value.assets.length} uploaded, ${after.bytes} bytes, all of them fetched as today. As WebP a phone fetches at most ${phone} bytes of them; all widths together are ${imageBytes(site)} bytes in ${site.files.filter((file) => file.path.startsWith("img/")).length} files.`);
    }, 60_000);
  }

  it("never writes a picture wider than its upload, and draws a picture without a set size at its own", async () => {
    const value = associationWithPictures();
    const { images, download } = await uploads(value, real);
    const site = await buildSite({ studioId, specVersion: 2, spec: value }, fontDeps(images, download));
    const widths = (id: string) => site.files.flatMap((file) => (file.path.startsWith(`img/${id}-`) && file.path.endsWith(".webp") ? [Number(file.path.match(/-(\d+)\.webp$/)![1])] : []));
    expect(Math.max(...widths("logo"))).toBe(700);
    expect(widths("person-a")).toEqual([240]);
    expect(widths("beside").sort((a, b) => a - b)).toEqual([256, 480, 640, 800, 1200]);
    const home = pagesOf(site).find((page) => page.path === "index.html")!.html;
    expect(home).toMatch(/<img src="\/img\/gallery-1-1200\.webp"[^>]* loading="lazy" width="1200" height="800" style="aspect-ratio:1200\/800">/);
    expect(home).toContain('<link rel="icon" href="/img/logo-icon.png">');
    expect(site.files.find((file) => file.path === "img/logo-icon.png")?.contentType).toBe("image/png");
  }, 30_000);

  it("copies a picture it cannot read as uploaded, with a warning, and still builds", async () => {
    const value = associationWithPictures();
    const { images, download } = await uploads(value, async (assetId) => (assetId === "beside" ? unreadable() : real(assetId)));
    const site = await buildSite({ studioId, specVersion: 2, spec: value }, fontDeps(images, download));
    expect(site.checks).toEqual([{ level: "warning", message: 'The image "Bild beside" could not be made smaller for the web, so it is used as uploaded.' }]);
    const copied = site.files.find((file) => file.path === "img/beside.jpg")!;
    expect([...copied.body]).toEqual([1, 2, 3]);
    expect(copied.contentType).toBe("image/jpeg");
    const home = pagesOf(site).find((page) => page.path === "index.html")!.html;
    expect(home).toContain('<img src="/img/beside.jpg" alt="Bild beside" loading="lazy">');
    expect(home).toMatch(/<img src="\/img\/gallery-1-1200\.webp" srcset=/);
  }, 30_000);

  it("with Axivo Signature motion, keeps every picture's list of files: the layer changes only the head", async () => {
    const build = async (motion: boolean) => {
      const value = companySpec();
      if (motion) value.brand.concept = { ...value.brand.concept, signatureMotion: true };
      const { images, download } = await uploads(value, real);
      return buildSite({ studioId, specVersion: 2, spec: value, madeBy: "Axivo" }, fontDeps(images, download));
    };
    const [plain, moving] = [await build(false), await build(true)];
    expect(moving.checks.filter((check) => check.level === "error")).toEqual([]);
    expect(moving.files.some((file) => file.path === "signature/layer.js")).toBe(true);
    expect(imgs(moving).map((entry) => entry.tag)).toEqual(imgs(plain).map((entry) => entry.tag));
    expect(imgs(moving).every((entry) => attr(entry.tag, "srcset"))).toBe(true);
  }, 30_000);

  it("serves a build's pictures on a review link: every file in a srcset under the link, WebP as WebP", async () => {
    const value = associationWithPictures();
    const { images, download } = await uploads(value, real);
    const site = await buildSite({ studioId, specVersion: 2, spec: value }, fontDeps(images, download));
    const stored = new Map(site.files.map((file) => [`${site.storagePrefix}/${file.path}`, file.body]));
    const serve = (segments: string[]) => serveBuild(site.shareToken, segments, { find: async () => ({ storagePrefix: site.storagePrefix, expiresAt: site.expiresAt.toISOString(), revokedAt: null }), read: async (path: string) => stored.get(path) ?? null, now: () => now });
    const home = await (await serve([])).text();
    const sets = [...home.matchAll(/\ssrcset="([^"]*)"/g)].map((match) => match[1]);
    expect(sets.length).toBeGreaterThan(3);
    for (const set of sets) {
      for (const entry of set.split(", ")) {
        expect(entry).toMatch(new RegExp(`^/s/${site.shareToken}/img/[\\w-]+\\.webp \\d+w$`));
        const picture = await serve(entry.split(" ")[0].replace(`/s/${site.shareToken}/`, "").split("/"));
        expect([picture.status, picture.headers.get("Content-Type")]).toEqual([200, "image/webp"]);
      }
    }
  }, 30_000);
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

  it("gives each direction, and the association design, the same Signature preset as the layer does", () => {
    expect(SIGNATURE_PRESETS).toEqual(DIRECTION_PRESETS);
    expect(ASSOCIATION_SIGNATURE_PRESET).toBe(ASSOCIATION_PRESET);
  });

  it.each(SERVICES_DIRECTIONS)("with Axivo Signature motion in the %s direction, builds with no errors, and every script the layer loads is in the build", async (direction) => {
    const value = companySpec();
    value.brand.servicesStyle = { direction, palette: "pine" };
    value.brand.concept = { ...value.brand.concept, signatureMotion: true };
    const site = await buildSite({ studioId, specVersion: 2, spec: value, madeBy: "Axivo" }, fontDeps(withImages(value, "approved")));
    expect(site.checks.filter((check) => check.level === "error")).toEqual([]);
    const scripts = site.files.filter((file) => file.path.startsWith("signature/") && file.path.endsWith(".js"));
    const paths = new Set(site.files.map((file) => file.path));
    // The layer loads its modules by relative address (import, import(), new URL); a missing one fails silently in the browser.
    const loaded = scripts.flatMap((file) => [...new TextDecoder().decode(file.body).matchAll(/["'`]\.\/([\w.-]+\.js)["'`]/g)].map((match) => `signature/${match[1]}`));
    expect(loaded.length).toBeGreaterThan(0);
    for (const path of loaded) expect(paths, path).toContain(path);
    for (const file of scripts) expect(file.contentType, file.path).toMatch(/^text\/javascript/);
  });

  it("serves a Signature build on a review link: the page's base before the layer, the review bar after, every script as JavaScript", async () => {
    const value = companySpec();
    value.brand.concept = { ...value.brand.concept, signatureMotion: true };
    const site = await buildSite({ studioId, specVersion: 2, spec: value, madeBy: "Axivo" }, fontDeps(withImages(value, "approved")));
    const stored = new Map(site.files.map((file) => [`studio-1/build-1/${file.path}`, file.body]));
    const token = "e".repeat(40);
    const review = {
      find: async () => ({ storagePrefix: "studio-1/build-1", expiresAt: "2026-12-17T10:00:00Z", revokedAt: null }),
      read: async (path: string) => stored.get(path) ?? null,
      now: () => now,
      review: async () => ({ name: "TEST Studio", website: null, email: null, color: "#1F2A37", logoUrl: null }),
    };
    const pageFolder = site.files.find((file) => /^[^/]+\/index\.html$/.test(file.path))!.path.split("/")[0];
    for (const segments of [[], [pageFolder]]) {
      const html = await (await serveBuild(token, segments, review)).text();
      const base = html.indexOf(`<base href="/s/${token}/`);
      expect(base).toBeGreaterThan(-1);
      expect(base).toBeLessThan(html.indexOf("<!-- signature-layer"));
      expect(html.indexOf("<!-- /signature-layer -->")).toBeLessThan(html.indexOf("rv-bar"));
    }
    for (const file of site.files.filter((each) => each.path.startsWith("signature/") && each.path.endsWith(".js"))) {
      const response = await serveBuild(token, file.path.split("/"), review);
      expect(response.status, file.path).toBe(200);
      expect(response.headers.get("Content-Type"), file.path).toMatch(/^text\/javascript/);
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(file.body);
    }
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
