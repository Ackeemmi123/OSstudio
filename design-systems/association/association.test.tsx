import { describe, expect, it } from "vitest";
import { build, eventsOf, parseWhen, previewPage, richText } from "./index";
import { siteSpecSchema } from "@/lib/site-spec/schema";

/** An invented association, so the tests carry no real person or client. */
function spec() {
  const sv = (text: string) => ({ sv: text });
  const seo = (title: string) => ({ title: sv(title), description: sv(`${title}.`), noindex: false });
  return {
    specVersion: 1,
    locales: { available: ["sv"], default: "sv" },
    strategy: { goal: { text: "Testa." }, audiences: [], primaryCta: { label: sv("Bli medlem"), targetPageId: "join" }, tone: "" },
    brand: { colors: { primary: "#84091D", secondary: "#69726D", accent: "#682C14", background: "#F3F3F0", text: "#2A1A10", neutral: ["#5D625F"] }, typography: { heading: { family: "Courier New", weight: 700 }, body: { family: "system-ui", weight: 400 }, scale: "1.25" }, radius: "none", density: "regular" },
    assets: [{ id: "logo", kind: "logo", alt: sv("Påhittade föreningens logotyp"), origin: "client_supplied", description: "" }],
    pages: [
      { id: "home", slug: { sv: "" }, title: sv("Hem"), nav: "main", seo: seo("Påhittade föreningen"), sections: [
        { id: "hero-1", kind: "hero", variant: "split_image_right", heading: sv("Påhittade föreningen"), subheading: sv("En testförening."), mediaAssetId: "logo", buttons: [{ label: sv("Bli medlem"), targetPageId: "join" }] },
        { id: "cta-1", kind: "cta", variant: "banner", heading: sv("Gå med"), body: sv("Det kostar 5 €."), button: { label: sv("Bli medlem"), targetPageId: "join" } },
      ] },
      { id: "events", slug: { sv: "evenemang" }, title: sv("Evenemang"), nav: "main", seo: seo("Evenemang"), sections: [
        { id: "text-1", kind: "text", variant: "single_column", heading: sv("Evenemang"), body: sv("Allt vi gör.") },
        { id: "list-1", kind: "features", variant: "list", heading: sv("Kalender"), items: [
          { id: "e1", title: sv("Vecka 51, december 2026 · Höstmöte"), body: sv("Datum kommer.") },
          { id: "e2", title: sv("15.10.2026 · Spelkväll"), body: sv("Spel.") },
        ] },
      ] },
      { id: "docs", slug: { sv: "dokument" }, title: sv("Dokument"), nav: "main", seo: seo("Dokument"), sections: [
        { id: "text-2", kind: "text", variant: "single_column", heading: sv("Dokument"), body: sv("Läs.") },
        { id: "list-2", kind: "features", variant: "list", heading: sv("Protokoll"), items: [{ id: "d1", title: sv("Möte 1/26"), body: sv("PDF.") }] },
      ] },
      { id: "join", slug: { sv: "bli-medlem" }, title: sv("Bli medlem"), nav: "main", seo: seo("Bli medlem"), sections: [
        { id: "contact-1", kind: "contact", variant: "form_and_details", heading: sv("Bli medlem"), body: sv("Fyll i.\n\nAvgift: 5 €"), formId: "member" },
      ] },
      { id: "contact", slug: { sv: "kontakt" }, title: sv("Kontakt"), nav: "main", seo: seo("Kontakt"), sections: [
        { id: "contact-2", kind: "contact", variant: "form_and_details", heading: sv("Kontakta oss"), body: sv("Skriv till oss.\n\nE-post: info@example.org\nInstagram: @paahittad"), formId: "msg" },
      ] },
    ],
    forms: [
      { id: "member", purpose: "contact", fields: ["name", "email", "phone"], consentText: sv("Jag betalar avgiften."), recipient: "client_contact" },
      { id: "msg", purpose: "contact", fields: ["name", "email", "message"], consentText: sv(""), recipient: "client_contact" },
    ],
    integrations: { analytics: { enabled: false }, maps: { enabled: false }, booking: { enabled: false }, newsletter: { enabled: false }, store: { enabled: false } },
    seo: { siteName: sv("Påhittade föreningen"), defaultDescription: sv("En påhittad förening för tester."), structuredData: "Organization" },
    accessibility: { target: "WCAG 2.2 AA" },
  };
}

const options = { files: { logo: "img/logo.png" }, documents: { d1: "dokument/mote-1.pdf" }, smallLogo: "logo", status: "prototype" as const, today: new Date(Date.UTC(2026, 10, 16)) };
const page = (files: ReturnType<typeof build>, path: string) => files.find((file) => file.path === path)!.text;

describe("association design system", () => {
  it("reads a spec exactly as Studio OS stores it", () => {
    expect(siteSpecSchema.safeParse(spec()).success).toBe(true);
  });

  it("writes one page per spec page, each with one main heading and no scripts", () => {
    const files = build(spec(), options);
    expect(files.map((file) => file.path).sort()).toEqual(["404.html", "bli-medlem/index.html", "dokument/index.html", "evenemang/index.html", "index.html", "kontakt/index.html", "not-sent/index.html", "robots.txt", "sent/index.html", "site.css"]);
    for (const file of files.filter((entry) => entry.path.endsWith(".html"))) {
      expect(file.text.match(/<h1[ >]/g)).toHaveLength(1);
      expect(file.text).not.toMatch(/<script/i);
    }
  });

  it("keeps a prototype out of search engines and switches its forms off", () => {
    const files = build(spec(), options);
    expect(page(files, "index.html")).toContain('content="noindex,nofollow"');
    expect(page(files, "kontakt/index.html")).toMatch(/<button class="btn" type="submit" disabled>/);
    expect(page(files, "kontakt/index.html")).toContain("avstängt i prototypen");
    const approved = build(spec(), { ...options, status: "approved" });
    expect(page(approved, "index.html")).not.toContain("noindex");
    expect(approved.some((file) => file.path === "robots.txt")).toBe(false);
  });

  it("says what happens after sending on a working form, and not on a prototype's", () => {
    const withNote = spec();
    Object.assign(withNote.forms[0], { replyNote: { sv: "Ditt meddelande skickas till direktionen (test)." } });
    const contactPage = (files: ReturnType<typeof build>) => files.filter((f) => f.path.endsWith(".html")).map((f) => f.text).join("");
    expect(contactPage(build(withNote, options))).not.toContain("skickas till direktionen (test)");
    expect(contactPage(build(withNote, { ...options, status: "approved" }))).toContain("Ditt meddelande skickas till direktionen (test).");
  });

  it("sends a published site's forms to the given server, and nowhere else", () => {
    const live = page(build(spec(), { ...options, status: "approved", formAction: "https://studio.example/api/site-forms/abc" }), "kontakt/index.html");
    expect(live).toContain('action="https://studio.example/api/site-forms/abc"');
    expect(live).toMatch(/<input type="hidden" name="form" value="[^"]+">/);
    expect(live).not.toContain("disabled>");
    const odd = page(build(spec(), { ...options, status: "approved", formAction: 'javascript:alert(1)"' }), "kontakt/index.html");
    expect(odd).toContain('action="/api/contact"');
  });

  it("names the agency that made the prototype, never Studio OS", () => {
    expect(page(build(spec(), options), "index.html")).toContain("Prototyp av Axivo. Inte offentlig.");
    const other = page(build(spec(), { ...options, madeBy: "Byrå & Co" }), "index.html");
    expect(other).toContain("Prototyp av Byrå &amp; Co. Inte offentlig.");
    expect(other).not.toContain("Axivo");
    expect(other).not.toContain("Studio OS");
  });

  it("reads dated list items as events and sorts them by the build date", () => {
    expect(parseWhen("15.10.2026")).toMatchObject({ day: "15", month: "okt 2026" });
    expect(parseWhen("Vecka 51, december 2026")).toMatchObject({ day: "v. 51", month: "dec 2026" });
    expect(parseWhen("Vecka 51, december 2026").latest!.toISOString().slice(0, 10)).toBe("2026-12-20");
    expect(eventsOf(siteSpecSchema.parse(spec()), "sv")!.events.map((event) => event.title)).toEqual(["Höstmöte", "Spelkväll"]);
    const files = build(spec(), options);
    const events = page(files, "evenemang/index.html");
    expect(events).toMatch(/class="event"><div class="date"[^>]*><b>v. 51/);
    expect(events).toMatch(/class="event is-past"><div class="date"[^>]*><b>15/);
    const home = page(files, "index.html");
    expect(home).toContain("Kommande evenemang");
    expect(home).toContain("Höstmöte");
    expect(home).not.toContain("Spelkväll");
  });

  it("offers attached documents for download and refuses a document for an unknown item", () => {
    expect(page(build(spec(), options), "dokument/index.html")).toContain('<a class="dl" href="/dokument/mote-1.pdf">');
    expect(() => build(spec(), { ...options, documents: { nope: "x.pdf" } })).toThrow(/not a list item/);
  });

  it("makes the main call to action the menu's button and links details", () => {
    const home = page(build(spec(), options), "index.html");
    expect(home).toMatch(/<nav class="nav"[^>]*>.*<a class="btn" href="\/bli-medlem\/">Bli medlem<\/a><\/nav>/);
    expect(richText("E-post: info@example.org\nInstagram: @paahittad")).toContain('<a href="https://www.instagram.com/paahittad/">@paahittad</a>');
    expect(richText("1. ett\n2. två")).toBe("<ol><li>ett</li><li>två</li></ol>");
  });

  it("refuses an image without a file", () => {
    expect(() => build(spec(), { ...options, files: {} })).toThrow(/No file for the image logo/);
  });

  it("draws one page for the Studio OS preview, with inline styles, linked images and boxes for missing ones", () => {
    const linked = previewPage(spec(), { files: { logo: "https://storage.example/signed/logo.png?token=x" }, today: options.today }, "events");
    expect(linked.pageId).toBe("events");
    expect(linked.html).toContain("<style>");
    expect(linked.html).not.toContain('href="/site.css"');
    expect(linked.html).toContain("<h1>Evenemang</h1>");
    const home = previewPage(spec(), { files: { logo: "https://storage.example/signed/logo.png?token=x" }, today: options.today });
    expect(home.html).toContain('src="https://storage.example/signed/logo.png?token=x"');
    const missing = previewPage(spec(), { files: {}, today: options.today });
    expect(missing.html).toContain('class="nofile"');
    expect(previewPage(spec(), { files: {}, today: options.today }, "nope").pageId).toBe("home");
  });

  it("offers a picture at the widths a build made, sized for its place, and keeps everything else about it", () => {
    const pictures = { logo: { width: 1100, height: 653, variants: [{ path: "img/logo-320.webp", width: 320 }, { path: "img/logo-640.webp", width: 640 }, { path: "img/logo-1100.webp", width: 1100 }] } };
    const made = page(build(spec(), { ...options, files: { logo: "img/logo-1100.webp" }, pictures, icon: "img/logo-icon.png" }), "index.html");
    const set = 'srcset="/img/logo-320.webp 320w, /img/logo-640.webp 640w, /img/logo-1100.webp 1100w"';
    expect(made).toContain(`<img src="/img/logo-1100.webp" ${set} sizes="(max-width: 820px) min(340px, calc(100vw - 48px)), min(487px, calc(47.5vw - 46px))" alt="Påhittade föreningens logotyp" class="hero-media" width="1100" height="653" fetchpriority="high" style="aspect-ratio:1100/653">`);
    expect(made).toContain(`<img src="/img/logo-1100.webp" ${set} sizes="64px" alt="Påhittade föreningen" width="64" height="39" style="aspect-ratio:1100/653">`);
    expect(made).toContain(`<img src="/img/logo-1100.webp" ${set} sizes="150px" alt="Påhittade föreningens logotyp" width="150" height="91" style="aspect-ratio:1100/653">`);
    expect(made).toContain('<link rel="icon" href="/img/logo-icon.png">');
    // Without them: exactly the page as before.
    const plain = page(build(spec(), options), "index.html");
    expect(plain).not.toContain("srcset");
    expect(plain).toContain('<img src="/img/logo.png" alt="Påhittade föreningens logotyp" class="hero-media" width="1100" height="653" fetchpriority="high">');
    expect(plain).toContain('<link rel="icon" href="/img/logo.png">');
    const strip = (html: string) => html.replace(/<img\b[^>]*>/g, "<img>").replace(/<link rel="icon"[^>]*>/, "");
    expect(strip(made)).toBe(strip(plain));
  });

  it("asks for a wider file when a board portrait is wider in shape than its 3:4 frame", () => {
    const withBoard = spec();
    withBoard.assets.push({ id: "anna", kind: "photo", alt: { sv: "Anna" }, origin: "client_supplied", description: "" } as never);
    withBoard.pages[0].sections.push({ id: "team-1", kind: "team", variant: "grid", heading: { sv: "Styrelsen" }, items: [{ id: "p1", name: "Anna", role: { sv: "Ordförande" }, assetId: "anna" }] } as never);
    const board = (width: number, height: number) => page(build(withBoard, { ...options, files: { ...options.files, anna: "img/anna-640.webp" }, pictures: { anna: { width, height, variants: [{ path: "img/anna-640.webp", width: 640 }] } } }), "index.html").match(/<img src="\/img\/anna[^>]*>/)![0];
    expect(board(600, 800)).toContain('sizes="(max-width: 900px) calc(50vw - 34px), min(247px, calc(25vw - 33px))" alt="Anna" width="240" height="320" loading="lazy">');
    expect(board(1200, 800)).toContain('sizes="(max-width: 900px) calc((50vw - 34px) * 2), calc(min(247px, 25vw - 33px) * 2)"');
  });

  it("uses the brand's logo in the header when no small logo is given", () => {
    const withLogo = { ...spec(), brand: { ...spec().brand, logoAssetId: "logo" } };
    const html = page(build(withLogo, { ...options, smallLogo: undefined }), "index.html");
    expect(html).toMatch(/<a class="brand" href="\/"><img src="\/img\/logo.png"/);
  });

  it("keeps the name in the header on a phone when there is no logo, so the link home is never empty", () => {
    const files = build(spec(), { ...options, smallLogo: undefined });
    expect(page(files, "index.html")).toContain('<a class="brand" href="/"><span>Påhittade föreningen</span></a>');
    const css = page(files, "site.css");
    expect(css).toContain(".brand>*+span{display:none}");
    expect(css).not.toContain(".brand span{display:none}");
  });
});
