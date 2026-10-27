# Brand

Studio OS uses Axivo's visual identity, taken from the Axivo website
repository (`Ackeemmi123/axivo-website`). Its `src/styles.css` gives the five
core colors as coming from the Axivo branding document; its `public/brand/`
holds the logo files.

## Source of truth

| Item       | Value                                                   | Here                          |
| ---------- | ------------------------------------------------------- | ----------------------------- |
| Cloud White      | `#F7F9FC`, main background                        | `--brand-cloud`               |
| Ice Blue         | `#E9EEF8`, secondary surfaces                     | `--brand-ice`                 |
| Soft Blue        | `#C9D9F0`, accents, hairlines                     | `--brand-soft`                |
| Muted Periwinkle | `#879DC7`, interactive details                    | `--brand-periwinkle`          |
| Ink Black        | `#151922`, text and primary actions               | `--brand-ink`                 |
| Text font  | Inter                                                   | `src/app/layout.tsx`          |
| Heading font | Geist, weight 500, tight tracking                     | `src/app/layout.tsx`, `globals.css` |
| Logo       | `axivo-logo.svg` (light), `-reversed`, `-symbol`, `-mark` | `public/brand/`, `src/lib/brand.ts` |
| Favicon    | Website `favicon.ico`; symbol as `src/app/icon.svg`     | `src/app/`                    |

The website also uses two "extended accents" (Indigo `#4A5BB5`, Lilac
`#C3BCF2`) for marketing gradients and glows. They are not part of the branding
document's core palette, and a work tool has no use for gradients, so Studio OS
does not use them.

## How the theme is built

`src/app/theme.css` has two layers:

1. **Brand primitives** (`--brand-*`): the five colors and the two fonts.
2. **Semantic tokens** (`--color-canvas`, `--color-ink-subtle`,
   `--color-primary`, `--color-control`, …). Components use only these, via
   Tailwind classes. Derived tones use `color-mix()` from the primitives, the
   same way the website does.

Contrast: body text is Ink Black. Muted and subtle text are 6.3:1 and about
5.3:1 on Cloud White. Form outlines are 3.6:1. Periwinkle (2.6:1) is only used
for markers and underlines, never for text. Status colors (positive, caution,
critical, info) are functional and separate from the brand.

## Keeping it in step

If the brand changes on the website, update `--brand-*` in `src/app/theme.css`
and copy the files in `public/brand/`. Nothing else should need to change.
