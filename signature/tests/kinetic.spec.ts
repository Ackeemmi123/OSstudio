import { expect, test } from "@playwright/test";
import { splitKinetic } from "../src/build/kinetic";

// Pure build step: run once, not per device.
test.skip(({ isMobile }) => isMobile, "Runs once, on the desktop project.");

test("a moving headline is split into words and letters, with the whole sentence as its name", () => {
  const html = splitKinetic('<h1 class="t" data-sg="kinetic">Hej på dig &amp; er</h1>');
  expect(html).toContain('aria-label="Hej på dig &amp; er"');
  expect(html).toContain('<span aria-hidden="true">');
  // Five words (the ampersand is one), whole for line breaking; letters numbered across the sentence.
  expect(html.match(/class="sg-w"/g)).toHaveLength(5);
  expect(html).toContain('<span class="sg-c" style="--i:0">H</span>');
  expect(html).toContain('<span class="sg-c" style="--i:3">p</span><span class="sg-c" style="--i:4">å</span>');
  expect(html).toContain('<span class="sg-c" style="--i:8">&amp;</span>');
});

test("only plain text is split, and an element that already has a name is left alone", () => {
  const nested = '<h2 data-sg="kinetic">Hej <em>där</em></h2>';
  expect(splitKinetic(nested)).toBe(nested);
  const named = '<h1 data-sg="kinetic" aria-label="Annat">Hej</h1>';
  expect(splitKinetic(named)).toBe(named);
  expect(splitKinetic("<h1>Vanlig rubrik</h1>")).toBe("<h1>Vanlig rubrik</h1>");
});

test("a split paragraph keeps its words for screen readers in hidden text, since aria-label is not allowed on it", () => {
  const html = splitKinetic('<p class="m" data-sg="mark">axivo</p>');
  expect(html).not.toContain("aria-label");
  expect(html).toContain('<span class="sg-sr">axivo</span><span aria-hidden="true">');
});
