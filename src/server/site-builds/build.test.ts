import { describe, expect, it } from "vitest";
import type { SiteSpec } from "@/lib/site-spec/schema";
import { briefClient, completeSpec } from "@/lib/site-spec/test-helpers";
import { BuildRefused, buildSite, contentTypeOf, pageChecks, type StoredImage } from "./build";

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

describe("page checks", () => {
  it("finds scripts, images without alternative text and text left in square brackets", () => {
    const checks = pageChecks('<p>[Write the story here]</p><img src="a.jpg" alt=""><script>x</script>', "index.html");
    expect(checks.map((check) => check.level).sort()).toEqual(["error", "error", "warning"]);
  });

  it("passes a clean page", () => {
    expect(pageChecks('<h1>Hej</h1><img src="a.jpg" alt="Logotyp">', "index.html")).toEqual([]);
  });

  it("names content types by extension", () => {
    expect(contentTypeOf("om-oss/index.html")).toMatch(/^text\/html/);
    expect(contentTypeOf("img/a.webp")).toBe("image/webp");
    expect(contentTypeOf("dokument/x.pdf")).toBe("application/pdf");
  });
});
