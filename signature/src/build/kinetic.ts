/**
 * Moving headlines, split when the site is built rather than in the browser.
 *
 * `<h1 data-sg="kinetic">Rörelse som betyder något.</h1>` becomes a heading
 * whose accessible name is the whole sentence (aria-label; for a paragraph,
 * where aria-label is not allowed, hidden text), with the letters
 * in hidden spans that CSS animates. Words stay whole for line breaking; each
 * letter carries its index (`--i`) for the stagger. No JavaScript runs for
 * it, so the headline is on screen from the first paint, and nothing is
 * hidden while a script loads.
 *
 * `data-sg="mark"` is split the same way for a word mark that moves with the
 * scroll instead of on load (see engine.css).
 *
 * Only plain text inside the element is split; markup inside is left as is.
 */

const KINETIC = /<(h[1-6]|p)(\s[^>]*?\bdata-sg="(?:kinetic|mark)"[^>]*)>([^<]*)<\/\1>/g;
const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };

const decode = (text: string) => text.replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (entity) => ENTITIES[entity] ?? entity);
const escape = (text: string) => text.replace(/[&<>"]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;"));

/** Letters as a reader sees them: "å" or an emoji with modifiers is one letter. */
const letters = (word: string) => [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(word)].map((part) => part.segment);

export function splitKinetic(html: string): string {
  return html.replace(KINETIC, (whole, tag: string, attributes: string, raw: string) => {
    const text = decode(raw).replace(/\s+/g, " ").trim();
    if (!text || /\saria-label=/.test(attributes)) return whole;
    let index = 0;
    const words = text
      .split(" ")
      .map((word) => `<span class="sg-w">${letters(word).map((letter) => `<span class="sg-c" style="--i:${index++}">${escape(letter)}</span>`).join("")}</span>`)
      .join(" ");
    // Headings may carry their name in aria-label; other elements may not, so they get hidden text instead.
    if (tag.startsWith("h")) return `<${tag}${attributes} aria-label="${escape(text)}"><span aria-hidden="true">${words}</span></${tag}>`;
    return `<${tag}${attributes}><span class="sg-sr">${escape(text)}</span><span aria-hidden="true">${words}</span></${tag}>`;
  });
}
