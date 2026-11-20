import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SITES } from "../../proof/sites";
import { STRESS_SITES } from "../../proof/sites/stress";
import type { Site } from "./content";
import { build } from "./index";
import { renderStatic } from "./render";

const all: [string, Site][] = [...Object.entries(SITES).map(([name, { site }]) => [name, site] as [string, Site]), ...Object.entries(STRESS_SITES)];

/** HTML ignores attribute order and the case of attribute names: compare without them. */
function normal(html: string): string {
  return html.replace(/<([a-z][a-z0-9]*)((?:\s+[^\s=/>]+(?:="[^"]*")?)*)\s*(\/?)>/g, (_, tag: string, attrs: string, slash: string) => {
    const list = [...attrs.matchAll(/\s+([^\s=/>]+)(?:="([^"]*)")?/g)].map(([, name, value]) => `${name.toLowerCase()}="${value ?? ""}"`).sort();
    return `<${tag}${list.map((a) => ` ${a}`).join("")}${slash}>`;
  });
}

// React adds a preload link for a priority image, with a React-only attribute name; the site does not need it.
const react = (node: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(node).replace(/<link rel="preload" as="image"[^>]*\/>/g, "");

describe("the static renderer", () => {
  it("writes what React's server renderer writes, for every page of every sample site", () => {
    for (const [name, site] of all) {
      const ours = build(site).map((file) => normal(file.text));
      expect(ours, name).toEqual(build(site, react).map((file) => normal(file.text)));
    }
  });

  it("escapes text and attributes, and writes booleans and styles as React does", () => {
    const tree = createElement("p", { className: "a", "aria-hidden": true, style: { "--n": 3, marginTop: 4 } }, `<"&'>`, createElement("input", { disabled: true, required: false, tabIndex: -1 }));
    expect(normal(renderStatic(tree))).toBe(normal(renderToStaticMarkup(tree)));
  });

  it("refuses what it cannot draw", () => {
    expect(() => renderStatic({ type: Symbol.for("react.context"), props: {} } as never)).toThrow(/plain elements/);
  });
});
