import { describe, expect, it } from "vitest";
import { filePath, serveBuild, underPrefix, withBase } from "./serve";

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

  it("pins relative links to the page's own folder, with or without a closing slash", async () => {
    files["s/b/kontakt/index.html"] = '<html><head><link rel="stylesheet" href="../site.css"></head><body></body></html>';
    const html = await (await serveBuild(token, ["kontakt"], deps())).text();
    expect(html).toContain(`<head><base href="/s/${token}/kontakt/"><link rel="stylesheet" href="../site.css">`);
    expect(new URL("../site.css", new URL(`/s/${token}/kontakt/`, "https://studio.example")).pathname).toBe(`/s/${token}/site.css`);
    expect(withBase("<html><head></head></html>", "/s/x", "404.html")).toContain('<base href="/s/x/">');
    expect(withBase("<h1>No head</h1>", "/s/x", "index.html")).toBe("<h1>No head</h1>");
  });

  it("maps paths to files", () => {
    expect(filePath([])).toBe("index.html");
    expect(filePath(["om-oss"])).toBe("om-oss/index.html");
    expect(filePath(["dokument", "stadgar.pdf"])).toBe("dokument/stadgar.pdf");
    expect(filePath([".."])).toBeNull();
    expect(underPrefix('<a href="//cdn.example">', "/s/x")).toBe('<a href="//cdn.example">');
  });

  it("moves every file of a srcset under the link, and leaves full addresses alone", () => {
    expect(underPrefix('<img src="/img/a-960.webp" srcset="/img/a-320.webp 320w, /img/a-960.webp 960w" sizes="(max-width: 820px) 100vw, 50vw">', "/s/x")).toBe(
      '<img src="/s/x/img/a-960.webp" srcset="/s/x/img/a-320.webp 320w, /s/x/img/a-960.webp 960w" sizes="(max-width: 820px) 100vw, 50vw">',
    );
    expect(underPrefix('<img srcset="https://images.example/a.jpg?w=480 480w, //cdn.example/a.jpg 800w, ./a.webp 2x">', "/s/x")).toBe('<img srcset="https://images.example/a.jpg?w=480 480w, //cdn.example/a.jpg 800w, ./a.webp 2x">');
  });
});

describe("closed links in the agency's brand", () => {
  const token = "c".repeat(40);
  const brand = { name: "Byrå <Test>", website: "https://byra.example", email: "hej@byra.example", color: "#7A1F2B", logoUrl: null };
  const base = (over: Partial<{ expiresAt: string; revokedAt: string | null }>) => ({
    find: async () => ({ storagePrefix: "studio-1/build-1", expiresAt: "2026-12-01T00:00:00Z", revokedAt: null, ...over }),
    read: async () => null,
    now: () => new Date("2026-11-18T00:00:00Z"),
  });

  it("shows the agency, never Studio OS, on an expired link", async () => {
    let asked = "";
    const response = await serveBuild(token, [], { ...base({ expiresAt: "2026-11-01T00:00:00Z" }), brand: async (studio) => ((asked = studio), brand) });
    expect(response.status).toBe(410);
    expect(asked).toBe("studio-1");
    const html = await response.text();
    expect(html).toContain("Länken har gått ut");
    expect(html).toContain("Byrå &lt;Test&gt;");
    expect(html).toContain("mailto:hej@byra.example");
    expect(html).not.toContain("Studio OS");
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
  });

  it("falls back to plain text when the brand cannot be read", async () => {
    const response = await serveBuild(token, [], { ...base({ revokedAt: "2026-11-10T00:00:00Z" }), brand: async () => { throw new Error("down"); } });
    expect(response.status).toBe(410);
    expect(await response.text()).toBe("This link has been turned off. Ask for a new one.");
  });
});

describe("the review bar", () => {
  const token = "d".repeat(40);
  const brand = { name: "Byrå </script><b>", website: null, email: null, color: "#7A1F2B", logoUrl: null };
  const deps = (open: boolean) => ({
    find: async () => ({ storagePrefix: "studio-1/build-1", expiresAt: "2026-12-01T00:00:00Z", revokedAt: null }),
    read: async (path: string) => (path.endsWith(".html") ? new TextEncoder().encode('<html><body><a href="/om/">Om</a></body></html>') : null),
    now: () => new Date("2026-11-18T00:00:00Z"),
    review: async () => (open ? brand : null),
  });

  it("is added to pages of a link open for review, with the agency's name kept as data", async () => {
    const html = await (await serveBuild(token, [], deps(true))).text();
    expect(html).toContain("rv-bar");
    expect(html).toContain(`/s/${token}/om/`);
    expect(html.indexOf("<script>")).toBeLessThan(html.lastIndexOf("</body>"));
    // The name is inside a JSON string with "<" escaped, so it cannot close the script.
    expect(html).not.toContain("Byrå </script>");
    expect(html).toContain("Byrå \\u003c/script>\\u003cb>");
  });

  it("is left out when review is off", async () => {
    expect(await (await serveBuild(token, [], deps(false))).text()).not.toContain("rv-bar");
  });
});
