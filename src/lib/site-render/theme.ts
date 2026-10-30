/**
 * Brand settings from a SiteSpec, as CSS custom properties a renderer can
 * use. Pure: the same brand always gives the same theme.
 *
 * Values come from a validated spec (hex colours, font names of letters,
 * digits, spaces and hyphens), so they are safe to place in a stylesheet.
 * Fonts are named with system fallbacks; no web font is loaded.
 */
import type { SiteSpec } from "@/lib/site-spec/schema";
import { contrastRatio } from "@/lib/site-spec/validate";

type Brand = SiteSpec["brand"];

const BLACK = "#111111";
const WHITE = "#FFFFFF";

/** The more readable of near-black and white on the given colour. */
export function readableOn(color: string): string {
  return contrastRatio(BLACK, color) >= contrastRatio(WHITE, color) ? BLACK : WHITE;
}

const RADIUS: Record<Brand["radius"], string> = { none: "0px", soft: "8px", round: "20px" };
/** Multiplies every space in the stylesheet. */
const DENSITY: Record<Brand["density"], number> = { compact: 0.75, regular: 1, airy: 1.35 };

export const FALLBACK_SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

function fontStack(family: string): string {
  return `"${family}", ${FALLBACK_SANS}`;
}

/** Heading sizes from the type scale, from small (h4) to large (h1), in rem. */
export function headingSizes(scale: Brand["typography"]["scale"]): { h1: number; h2: number; h3: number; h4: number } {
  const ratio = Number(scale);
  const size = (steps: number) => Math.round(ratio ** steps * 1000) / 1000;
  return { h1: size(4), h2: size(3), h3: size(2), h4: size(1) };
}

export function themeVariables(brand: Brand): Record<string, string> {
  const { colors, typography } = brand;
  const sizes = headingSizes(typography.scale);
  const [surface, border, muted] = [colors.neutral[0] ?? colors.background, colors.neutral[1] ?? colors.text, colors.neutral[2] ?? colors.text];
  return {
    "--sp-primary": colors.primary,
    "--sp-on-primary": readableOn(colors.primary),
    "--sp-secondary": colors.secondary ?? colors.primary,
    "--sp-accent": colors.accent ?? colors.primary,
    "--sp-bg": colors.background,
    "--sp-text": colors.text,
    "--sp-surface": surface,
    "--sp-on-surface": readableOn(surface),
    "--sp-border": border,
    "--sp-muted": muted,
    "--sp-radius": RADIUS[brand.radius],
    "--sp-space": `${DENSITY[brand.density]}`,
    "--sp-font-heading": fontStack(typography.heading.family),
    "--sp-font-body": fontStack(typography.body.family),
    "--sp-weight-heading": `${typography.heading.weight}`,
    "--sp-weight-body": `${typography.body.weight}`,
    "--sp-h1": `${sizes.h1}rem`,
    "--sp-h2": `${sizes.h2}rem`,
    "--sp-h3": `${sizes.h3}rem`,
    "--sp-h4": `${sizes.h4}rem`,
  };
}

/** The theme as a CSS rule for the document root. */
export function themeCss(brand: Brand): string {
  return `:root{${Object.entries(themeVariables(brand))
    .map(([name, value]) => `${name}:${value}`)
    .join(";")}}`;
}
