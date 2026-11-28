/**
 * The Signature layer's map for Website Factory's association system
 * (`design-systems/association`): which of its elements become which module.
 * The selectors are the classes that system writes (`index.ts`, `styles.ts`).
 *
 * Order matters, as in `services.mjs`: an element arrives once, by the first
 * rule that matches it, and nothing arrives inside something that already
 * arrives. So headlines come first, then pictures, then the blocks around
 * them. Every selector starts in `main`: the header and the footer stand.
 *
 * The preset is `calm`, always (`ASSOCIATION_PRESET`): trust before effect.
 * These are sites for boards and members, not a showroom. Headlines fade up
 * line by line, rows and cards rise 0.6 rem, pictures fade in.
 *
 * What is mapped:
 * - `headline`: each page's h1 and each section's own h2. The headings of
 *   list items (a point, a person, a document, an event) arrive with their
 *   row, so the selectors name the section's heading by where it stands.
 * - `reveal`: the pictures that stand alone: the first view's, the one
 *   beside a text, a gallery's. Each is a bare `<img>`, so it fades and
 *   nothing settles inside a frame.
 * - `rise`: leads, texts, and the rows of every list, one after the other:
 *   events, points, documents, board members (a card with its portrait, as
 *   one), questions, quotes, the contact details, the closing band's words
 *   and button.
 *
 * What is not here, on purpose:
 * - `cta`: the menu already carries the site's main action, and the header
 *   is sticky, so the action is on screen on every page. A floating copy
 *   would be a second one. (`calm` does not allow it either.)
 * - `count`: the system writes no figures; an event's day and a price are
 *   not numbers to count up to.
 * - `list`: no row carries a small picture. An event has a date block, a
 *   document a link.
 * - `stack`: nothing is written as cards of one height that could lie on
 *   each other; stacking events or points would be a new layout, which the
 *   layer never makes.
 * - Forms never arrive (the membership and contact forms, and the `div`
 *   they stand in): a form that fades in looks unfinished, and a visitor
 *   who came for it should find it standing there.
 * - The date block's tilt (`.date`) is the site's own and stays: its row
 *   rises on `translate`, which leaves the block's `transform` alone.
 * - The header, the menu and the footer, and the short link under the
 *   heading of the 404 and "sent" pages.
 */

/** The preset every association site gets: there are no directions to choose between. */
export const ASSOCIATION_PRESET = "calm";

export default {
  name: "association",
  presets: [{ when: "body", preset: ASSOCIATION_PRESET }],
  rules: [
    // Headlines: the page's own, then each section's (never a list item's).
    { module: "headline", select: "main h1" },
    { module: "headline", select: "main .sec > .wrap > h2, main .head > h2, main .split > div > h2, main .band-grid h2" },

    // Pictures that stand alone. A board member's portrait arrives with its card.
    { module: "reveal", select: "main .hero-media, main .split > img, main .gallery > img" },

    // The first view's words.
    { module: "rise", select: "main .lead, main .hero .actions" },

    // Texts, and the link beside a section's heading.
    { module: "rise", select: "main .narrow > .prose, main .split > div > .prose, main .head > a" },

    // Rows and cards, one after the other.
    { module: "rise", select: "main .events > .event, main .points > .point, main .docs > .doc, main .board > .person, main .accordion > details, main blockquote" },

    // The contact details beside the form (the form itself stands), and the closing band.
    { module: "rise", select: "main .split--contact > .box, main .band-grid > div > p, main .band-grid > div:last-child" },
  ],
};
