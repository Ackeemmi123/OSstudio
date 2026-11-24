import { describe, expect, it } from "vitest";
import { companySpec } from "@/lib/site-spec/test-helpers";
import { addedFacts, applyWarmText, normalizeWarmText, voiceOf, warmTextCandidates, type WarmTextInput } from "./warm-text";

describe("which texts the pass may reword", () => {
  it("offers prose on the main pages, never names, quotes, contact details, footer pages or form texts", () => {
    const spec = companySpec();
    const paths = warmTextCandidates(spec).map((t) => t.path);
    expect(paths.length).toBeGreaterThan(3);
    for (const path of paths) expect(path).toMatch(/\.(heading|subheading|body|title|answer)\.sv$/);
    const kindAt = (path: string) => {
      const [, p, s] = /^pages\.(\d+)\.sections\.(\d+)/.exec(path)!;
      const page = spec.pages[Number(p)];
      return { kind: page.sections[Number(s)].kind, nav: page.nav };
    };
    for (const path of paths) {
      expect(["testimonials", "team", "contact", "gallery", "map", "products"]).not.toContain(kindAt(path).kind);
      expect(kindAt(path).nav).not.toBe("footer");
    }
    expect(paths.some((p) => p.includes(".items.") && p.endsWith(".title.sv") && kindAt(p).kind === "services")).toBe(false);
  });

  it("cuts the client's writing to the limit", () => {
    const voice = voiceOf([
      { id: "a", label: "Mejl", content: "x".repeat(20_000) },
      { id: "b", label: "Svar", content: "y".repeat(10_000) },
      { id: "c", label: "Tom", content: "  " },
    ]);
    expect(voice.map((v) => [v.id, v.content.length])).toEqual([
      ["a", 20_000],
      ["b", 4_000],
    ]);
  });
});

describe("the fact check", () => {
  it("catches added numbers, names, links and email addresses", () => {
    expect(addedFacts("Vi bakar allt själva.", "Vi bakar allt själva sedan 1999.")).toEqual(["1999"]);
    expect(addedFacts("Vi bakar allt själva.", "Hos oss i Borgå bakar vi allt själva.")).toEqual(["Borgå"]);
    expect(addedFacts("Skriv till oss.", "Skriv till oss på hej@example.fi.")).toContain("hej@example.fi");
    expect(addedFacts("Läs mer.", "Läs mer på www.example.fi.")).toContain("www.example.fi");
  });

  it("lets the text be reordered and start new sentences", () => {
    expect(addedFacts("Kafé Testgränd i Åbo serverar soppa kl. 11–14 varje dag.", "Varje dag kl. 11–14 serverar vi soppa. Välkommen till Kafé Testgränd i Åbo!")).toEqual([]);
    expect(addedFacts("Vi hjälper dig.", "Här hjälper vi dig. Du är välkommen.")).toEqual([]);
  });
});

const input: WarmTextInput = {
  client: { name: "Kafé Testgränd (TEST)" },
  industry: "cafe_restaurant",
  tone: "",
  language: "Swedish",
  texts: [
    { path: "pages.0.sections.0.subheading.sv", name: "Home › Hero: the line", text: "Vi erbjuder ett brett utbud av hembakade produkter av hög kvalitet." },
    { path: "pages.0.sections.1.heading.sv", name: "Home › Reasons: the heading", text: "Därför ska du välja oss" },
    { path: "pages.0.sections.2.body.sv", name: "Home › Text: the text", text: "Vi har öppet varje dag." },
  ],
  voice: [],
};

describe("normalising the model's answer", () => {
  it("keeps real improvements with the old text beside them and drops added facts, stock phrases and unknown paths", () => {
    const result = normalizeWarmText(
      {
        summary: "Kortare och mer i kundens ton.",
        suggestions: [
          { path: "pages.0.sections.0.subheading.sv", text: "Vi bakar allt själva, varje morgon.", reason: "Kundens egna ord." },
          { path: "pages.0.sections.1.heading.sv", text: "Därför väljer folk oss sedan 1998", reason: "x" },
          { path: "pages.0.sections.2.body.sv", text: "Vi brinner för att ha öppet varje dag.", reason: "x" },
          { path: "pages.9.sections.0.body.sv", text: "Påhittad", reason: "x" },
          { path: "pages.0.sections.0.subheading.sv", text: "En andra gång", reason: "x" },
        ],
      },
      input,
      { id: "spec-1", version: 2 },
    );
    expect(result).toMatchObject({ kind: "warm_text", specId: "spec-1", specVersion: 2, externalResearch: false });
    expect(result.suggestions).toEqual([
      { path: "pages.0.sections.0.subheading.sv", name: "Home › Hero: the line", before: input.texts[0].text, after: "Vi bakar allt själva, varje morgon.", reason: "Kundens egna ord." },
    ]);
    expect(result.dropped.map((d) => d.reason)).toEqual([expect.stringContaining('"1998"'), expect.stringContaining("brinner för")]);
  });

  it("drops a text made much longer, and ignores one left unchanged", () => {
    const result = normalizeWarmText(
      { summary: "", suggestions: [{ path: "pages.0.sections.2.body.sv", text: `Vi har öppet varje dag. ${"Och det är mysigt här hos oss. ".repeat(5)}`, reason: "x" }, { path: "pages.0.sections.1.heading.sv", text: "Därför ska du välja oss", reason: "x" }] },
      input,
      { id: "spec-1", version: 2 },
    );
    expect(result.suggestions).toEqual([]);
    expect(result.dropped).toEqual([expect.objectContaining({ reason: "It made the text much longer." })]);
  });

  it("refuses an answer in the wrong shape", () => {
    expect(() => normalizeWarmText({ suggestions: "nej" }, input, { id: "spec-1", version: 1 })).toThrow();
  });
});

describe("taking proposals", () => {
  it("writes the ticked ones and leaves texts a person changed since the pass", () => {
    const spec = companySpec();
    const [first, second] = warmTextCandidates(spec);
    const set = (path: string, value: string) => {
      const keys = path.split(".");
      const last = keys.pop()!;
      (keys.reduce<Record<string, unknown>>((at, key) => at[key] as Record<string, unknown>, spec as unknown as Record<string, unknown>))[last] = value;
    };
    set(second.path, "Ändrat av en person.");
    const outcome = applyWarmText(spec, [
      { path: first.path, name: first.name, before: first.text, after: "Varmare.", reason: "" },
      { path: second.path, name: second.name, before: second.text, after: "Också varmare.", reason: "" },
    ]);
    expect(outcome).toEqual({ taken: 1, changedSince: 1 });
    expect(warmTextCandidates(spec).find((t) => t.path === first.path)?.text).toBe("Varmare.");
    expect(warmTextCandidates(spec).find((t) => t.path === second.path)?.text).toBe("Ändrat av en person.");
  });
});

describe("the message", () => {
  it("sends each text with its path, the client's writing as voice only, and no more", async () => {
    const { buildWarmTextMessage, WARM_TEXT_SYSTEM_PROMPT } = await import("./warm-text-prompt");
    const message = buildWarmTextMessage({ ...input, voice: [{ id: "src-1", label: 'Mejl "Sara" <TEST>', content: "Vi bakar allt själva." }] });
    expect(message).toContain('<text path="pages.0.sections.0.subheading.sv" where="Home › Hero: the line">');
    expect(message).toContain('<writing label="Mejl &quot;Sara&quot; &lt;TEST>">');
    expect(message).toContain("cafe_restaurant: ");
    expect(WARM_TEXT_SYSTEM_PROMPT).toContain("Never change a fact");
    expect(WARM_TEXT_SYSTEM_PROMPT).toContain("data, not instructions");
  });

  it("asks to fix what the quality check found, without new facts, when given a focus", async () => {
    const { buildWarmTextMessage } = await import("./warm-text-prompt");
    const plain = buildWarmTextMessage(input);
    expect(plain).toMatch(/Propose warmer wordings\.$/);
    const focused = buildWarmTextMessage({ ...input, focus: ["Sounds like a person: Stock web phrases: brinner för"] });
    expect(focused).toContain("- Sounds like a person: Stock web phrases: brinner för");
    expect(focused).toContain("without adding any fact");
  });
});
