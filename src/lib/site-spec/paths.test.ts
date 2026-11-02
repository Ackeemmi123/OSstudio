import { describe, expect, it } from "vitest";
import { localeOfPath, pageIndexOfPath, pathCandidates } from "./paths";

describe("paths to problems", () => {
  it("tries the field first, then what contains it", () => {
    expect(pathCandidates("pages.0.sections.1.heading.sv")).toEqual(["pages.0.sections.1.heading.sv", "pages.0.sections.1.heading", "pages.0.sections.1", "pages.0.sections", "pages.0", "pages"]);
    expect(pathCandidates("brand")).toEqual(["brand"]);
    expect(pathCandidates("")).toEqual([]);
  });

  it("finds the page and the language", () => {
    expect(pageIndexOfPath("pages.12.seo.title.en")).toBe(12);
    expect(pageIndexOfPath("pages")).toBeNull();
    expect(pageIndexOfPath("assets.0.alt.en")).toBeNull();
    expect(localeOfPath("assets.0.alt.fi")).toBe("fi");
    expect(localeOfPath("pages.0.sections")).toBeNull();
  });
});
