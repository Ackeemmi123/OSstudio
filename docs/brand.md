# Brand: what is set and what is missing

Studio OS is meant to carry Axivo's visual identity. **None of Axivo's brand
assets were available** when the interface was redesigned (October 2026):

- The repository, its Git history and the project files contain no Axivo logo,
  color values, typeface, brand guidelines or design references.
- The first version used a warm beige and olive theme taken from a written
  design brief, not from Axivo's brand.

So the current theme is a **neutral, provisional placeholder**. It is not
Axivo's palette and should not be presented as such. Settings says the same in
the app.

## Missing

| Item                  | Needed as                                    | Where it goes                         |
| --------------------- | -------------------------------------------- | ------------------------------------- |
| Logo                  | SVG (light background), plus a square mark   | `public/brand/`, then `src/lib/brand.ts` |
| Primary color         | Hex value                                    | `--brand-primary` in `src/app/theme.css` |
| Accent or secondary   | Hex values                                   | `--brand-accent`, `--brand-accent-tint` |
| Neutral scale, if any | Hex values                                   | `--brand-neutral-*`                   |
| Typeface              | Name and license (web font files or Google Fonts) | `src/app/layout.tsx`, `--brand-font` |
| Usage rules           | Contrast, logo clear space, do's and don'ts  | This file                             |

## How the theme is built

`src/app/theme.css` has two layers:

1. **Brand primitives** (`--brand-*`). The only values to replace with Axivo's.
2. **Semantic tokens** (`--color-canvas`, `--color-ink`, `--color-primary`,
   `--color-focus`, …). Components use only these, through Tailwind classes
   such as `bg-primary` or `text-ink-muted`. They point at the primitives.

Status colors (positive, caution, critical, info) are functional and stay
separate from the brand palette, so status stays readable whatever the brand
colors are.

## Swapping in Axivo's identity

1. Replace the `--brand-*` values in `src/app/theme.css`. Check that text on
   `--brand-primary` (buttons) and `--color-ink-subtle` on the canvas keep at
   least 4.5:1 contrast.
2. Add the logo to `public/brand/` and set `BRAND.logo` in `src/lib/brand.ts`.
   The top bar switches from the plain-text name to the logo automatically.
3. Load the typeface in `src/app/layout.tsx` and point `--brand-font` at it.
4. Set `BRAND.verified = true` so Settings stops calling the theme provisional.
