# Website preview (WF-3)

Any saved website spec version can be opened as a working website inside
Studio OS: **Preview** on the spec page, or
`/clients/<client>/projects/<project>/site/preview?v=<version>&page=<page>&lang=<en|sv|fi>`.

It is an **internal check**, not a website: nothing is published, nothing is
written, and it is hidden from search engines. Members and viewers of the
studio can open it; signed-out visitors and other studios cannot (the spec is
read with row-level security, like the editor).

## What it shows

- Every page of the version, with its main menu and footer menu, and every
  section type in its layout variant.
- The brand: colours (with a readable text colour on the primary colour),
  type scale, corners and spacing. Fonts are named with system fallbacks; no
  web font is loaded, because loading one from Google would send visitors'
  addresses to Google.
- Each language of the website.
- Phone (390 px), tablet (768 px) and desktop (1280 px, scaled to fit), with
  a real responsive layout at each width.
- On drafts, "Show what's missing" marks every empty text and every image
  that is still a placeholder (on by default for drafts, off for approved
  versions). Images have no files yet (WF-2), so each is a labelled box.

Links and buttons inside the preview don't navigate; choose pages above it.

## How it is built

| Part | File | What it does |
| ---- | ---- | ------------ |
| Render model | `src/lib/site-render/model.ts` | One page in one language with everything resolved: menus, addresses, button targets, images, forms, missing-text markers. Platform-neutral: an external renderer will map from it too |
| Theme | `src/lib/site-render/theme.ts` | Brand settings as CSS custom properties |
| Document | `src/lib/site-render/document.tsx`, `styles.ts` | The page as static HTML and CSS. No scripts; React escapes all text |
| Page | `src/components/site-spec/site-preview.tsx` | Toolbar, and the document in `<iframe sandbox srcdoc>` |

The frame's `sandbox` attribute grants nothing: no scripts, no forms, and a
unique origin, so the preview cannot reach the app or the signed-in session,
and loads nothing from elsewhere.

## Not in WF-3

Image files, shareable client links, publishing, and any external renderer.
Build jobs and renderer adapters arrive with the first external renderer.
