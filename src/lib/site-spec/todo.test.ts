import { describe, expect, it } from "vitest";
import { briefClient } from "./test-helpers";
import { templateSpec } from "./templates";
import { groupProblems } from "./todo";
import { approvalBlockers } from "./validate";

const client = briefClient();
const project = { projectType: "website" as const };

describe("the list of what is left", () => {
  it("groups a first draft by where the work is, most important first", () => {
    const { spec } = templateSpec(client, project, "services", ["en"]);
    const groups = groupProblems(spec, approvalBlockers(spec, client));
    expect(groups.map((g) => g.label)).toEqual(["Start here: goal and brand", "Home › Hero", "Home › What a client can rely on", "Home › What they take off a client's desk", "Home › What worries a new client most", "Home › What clients say changed for them", "Home › Questions and answers", "Home › Invite them to take the next step", "About", "Contact", "Images", "Privacy and consent", "Search texts and site name"]);
  });

  it("keeps every part of a long page small, and opens only where to start", () => {
    for (const template of ["services", "shop", "single"] as const) {
      const { spec } = templateSpec(client, project, template, ["en"]);
      const groups = groupProblems(spec, approvalBlockers(spec, client));
      for (const group of groups.filter((g) => g.key.startsWith("page-"))) expect(group.items.length, group.label).toBeLessThanOrEqual(14);
      expect(groups.filter((g) => g.first).map((g) => g.label)).toEqual(["Start here: goal and brand", "Home › Hero"]);
    }
  });

  it("does not split a page with little to do, and names a section by its finished heading", () => {
    const { spec } = templateSpec(client, project, "services", ["en"]);
    const section = spec.pages[0].sections[1];
    section.heading.en = "Three things you won't have to chase";
    const about = spec.pages[1].sections.map((_, s) => ({ path: `pages.1.sections.${s}.heading.en`, message: `About ${s}` }));
    const groups = groupProblems(spec, [{ path: "pages.0.sections.1.heading.en", message: "One" }, ...about]);
    expect(groups.map((g) => g.label)).toEqual(["Home", "About"]);
    const many = Array.from({ length: 9 }, (_, i) => ({ path: `pages.0.sections.1.items.${i}.title.en`, message: `Item ${i}` }));
    expect(groupProblems(spec, many).map((g) => g.label)).toEqual(["Home › Three things you won't have to chase"]);
  });

  it("marks privacy and consent as needing legal review", () => {
    const { spec } = templateSpec(client, project, "services", ["en"]);
    const legal = groupProblems(spec, approvalBlockers(spec, client)).find((g) => g.key === "legal")!;
    expect(legal.note).toMatch(/client-specific details and legal review/);
    expect(legal.items.map((i) => i.path)).toEqual(expect.arrayContaining(["forms.0.consentText.en", "pages.3.sections.0.body.en"]));
  });

  it("lists a field once, however many languages it needs writing in", () => {
    const { spec } = templateSpec(client, project, "services", ["en", "sv", "fi"]);
    const issues = approvalBlockers(spec, client);
    const one = groupProblems(spec, issues).flatMap((g) => g.items);
    expect(one.length).toBeLessThan(issues.length);
    expect(one.filter((i) => i.path.startsWith("pages.0.sections.0.heading"))).toHaveLength(1);
    expect(one.find((i) => i.path.startsWith("pages.0.sections.0.heading"))?.path).toBe("pages.0.sections.0.heading.en");
  });

  it("loses nothing: an empty list only when nothing is wrong", () => {
    const { spec } = templateSpec(client, project, "shop", ["en"]);
    expect(groupProblems(spec, [])).toEqual([]);
    const issues = approvalBlockers(spec, client);
    expect(new Set(groupProblems(spec, issues).flatMap((g) => g.items.map((i) => i.message))).size).toBe(new Set(issues.map((i) => i.message)).size);
  });
});
