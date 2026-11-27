/**
 * The Signature layer's map for Website Factory's services system
 * (`design-systems/services`): which of its elements become which module, in
 * all six directions. The selectors are the classes that system writes
 * (`pages.tsx`, `formal.tsx`, `editorial.tsx`, `statement.tsx`, `cafe.tsx`,
 * `atelier.tsx`, `clinic.tsx`, `signature.tsx`).
 *
 * Order matters: an element arrives once, by the first rule that matches it,
 * and nothing arrives inside something that already arrives. So headlines
 * come first, then pictures, then the blocks around them.
 *
 * What is not here, on purpose:
 * - `stack`: no direction writes its steps as cards that could lie on each
 *   other (formal draws circles, atelier and clinic columns), and the
 *   statement direction already stacks its steps in CSS. Stacking the others
 *   would be a new layout, which the layer never makes.
 * - `list`: no list in the system carries a small picture per row, which is
 *   what the picture under the pointer shows to everyone without a mouse.
 * - `.pinned` (the café's note on the hero picture) and `.stack li` keep the
 *   base site's own motion; so does every picture's slow drift in its frame.
 * - Forms never arrive: a form that fades in looks unfinished, and a visitor
 *   who came for it should find it standing there.
 */

/** Website Factory's directions, and the preset each one gets unless the site says otherwise. */
export const DIRECTION_PRESETS = {
  formal: "calm",
  clinic: "calm",
  cafe: "warm",
  atelier: "editorial",
  editorial: "editorial",
  statement: "bold",
};

/** Sections where the floating call to action gives way: the form it leads to, and each page's own closing action. */
const CTA_ENDS = ".closing, .end-action, .contact-page";

export default {
  name: "services",
  presets: Object.entries(DIRECTION_PRESETS).map(([direction, preset]) => ({ when: `body.d-${direction}`, preset })),
  rules: [
    // Headlines: the page's own, then each section's.
    { module: "headline", select: ".hero h1, .page-intro h1, .plain-page h1" },
    { module: "headline", select: ".section-head h2, .closing-words h2, .memory-head h2, .work-head h2, .approach h2, .menu-card-head h2, .visit-head h2, .treatments-head h2, .visit-flow-head h2, .cafe-story h2, .crew h2, .end-action h2, .menu-group-head h2, .sig h2" },

    // Pictures. The frame opens; the picture inside settles.
    { module: "reveal", select: ".hero-image .frame, .hero-image .arch" },
    { module: "reveal", select: ".d-atelier .hero-image, .d-clinic .hero-image, .d-statement .hero-image" },
    { module: "reveal", select: ".work-item, .project-frame, .project-picture, .wide-image, .memory-image, .proof-image, .cameo, .sig-frame, .sig-portrait, .menu-card-head figure" },

    // Figures that count (never in the calm preset).
    { module: "count", select: ".sig-numbers dd, .sig-year" },

    // The first view's words.
    { module: "rise", select: ".hero-body, .hero-under" },
    { module: "rise", select: ".hero-for, .hero-meta, .hero-why, .hero-actions, .hero-reassurance, .hero-note" },
    { module: "rise", select: ".page-intro > .label, .page-intro > .page-lead, .project-facts" },

    // Sections: labels and leads, then rows, steps and cards, one after the other.
    { module: "rise", select: ".section-head > .label, .work-head > .label, .approach > .label, .approach-lead, .memory-head .page-lead, .cafe-story-lead, .visit-head > .label, .treatments-head > .label, .visit-flow-head > .label, .menu-card-head > .label, .sig > .label, .sig-lead, .sig-body" },
    { module: "rise", select: ".reason-list > li, .ledger-row, .steps > li, .approach-steps > li, .visit-steps > li, .visit-list > li, .care-list > li, .treatment, .menu-lines > li, .credentials > li, .person, .question-list > details, .pub-list > li" },
    { module: "rise", select: ".sig-days > li, .sig-places > li, .sig-numbers > div, .sig-card, .sig-book, .sig-events > li" },
    { module: "rise", select: ".memory-story, .letter-lead, .letter-story, .signature, .quote blockquote, .crew-words, .story > p, .visit-card, .desk, .work-more, .project-next, .closing-words > p, .closing-details, .contact-details, .menu-note" },

    // The page's own main action floats once its place is out of view. Not where the site already has a bar at the foot of the screen.
    { module: "cta", select: ".hero-actions > a.button, .hero-call > a.button", unless: "body.has-call-bar, body.has-book-bar", options: { end: CTA_ENDS } },
  ],
};
