import { describe, expect, it } from "vitest";
import { filePath, serveBuild, underPrefix } from "./serve";

const token = "a".repeat(32);
const now = new Date("2026-11-17T10:00:00Z");
const files: Record<string, string> = {
  "s/b/index.html": '<a href="/om-oss/">Om oss</a><img src="/img/logo.png" alt="Logo"><a href="https://example.org/">x</a>',
  "s/b/om-oss/index.html": "<h1>Om oss</h1>",
  "s/b/404.html": "<h1>Sidan hittades inte</h1>",
  "s/b/img/logo.png": "png",
};

function deps(build: { expiresAt?: string; revokedAt?: string | null } | null = {}) {
  return {
    find: async (value: string) => (value === token && build ? { storagePrefix: "s/b", expiresAt: build.expiresAt ?? "2026-12-17T10:00:00Z", revokedAt: build.revokedAt ?? null } : null),
    read: async (path: string) => (files[path] === undefined ? null : new TextEncoder().encode(files[path])),
    now: () => now,
  };
}

describe("serving a build behind its link", () => {
  it("serves the home page with root links moved under the link", async () => {
    const response = await serveBuild(token, [], deps());
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    const html = await response.text();
    expect(html).toContain(`href="/s/${token}/om-oss/"`);
    expect(html).toContain(`src="/s/${token}/img/logo.png"`);
    expect(html).toContain('href="https://example.org/"');
  });

  it("serves a folder's index page and files as they are", async () => {
    expect(await (await serveBuild(token, ["om-oss"], deps())).text()).toBe("<h1>Om oss</h1>");
    const image = await serveBuild(token, ["img", "logo.png"], deps());
    expect(image.headers.get("Content-Type")).toBe("image/png");
  });

  it("answers the build's 404 page for a missing page", async () => {
    const response = await serveBuild(token, ["nope"], deps());
    expect(response.status).toBe(404);
    expect(await response.text()).toContain("Sidan hittades inte");
  });

  it("refuses unknown, expired and turned-off links, and paths that climb out", async () => {
    expect((await serveBuild("b".repeat(32), [], deps())).status).toBe(404);
    expect((await serveBuild("short", [], deps())).status).toBe(404);
    expect((await serveBuild(token, [], deps({ expiresAt: "2026-11-01T00:00:00Z" }))).status).toBe(410);
    expect((await serveBuild(token, [], deps({ revokedAt: "2026-11-16T00:00:00Z" }))).status).toBe(410);
    expect((await serveBuild(token, ["..", "other", "index.html"], deps())).status).toBe(400);
  });

  it("maps paths to files", () => {
    expect(filePath([])).toBe("index.html");
    expect(filePath(["om-oss"])).toBe("om-oss/index.html");
    expect(filePath(["dokument", "stadgar.pdf"])).toBe("dokument/stadgar.pdf");
    expect(filePath([".."])).toBeNull();
    expect(underPrefix('<a href="//cdn.example">', "/s/x")).toBe('<a href="//cdn.example">');
  });
});
