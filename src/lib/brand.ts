/**
 * Brand identity used by the shell. Colors and type live in src/app/theme.css.
 * Logo files in public/brand/ are copied from the Axivo website repository
 * (Ackeemmi123/axivo-website). Keep them in step with that repository.
 */
export const BRAND = {
  company: "Axivo",
  product: "Studio OS",
  /** Wordmark for light backgrounds: Ink Black letters, Periwinkle dot on the i. */
  logo: { src: "/brand/axivo-logo.svg", width: 434, height: 138 } as { src: string; width: number; height: number } | null,
  /** True once the theme uses verified Axivo values. Shown in Settings. */
  verified: true,
  source: "Axivo website repository (Ackeemmi123/axivo-website)",
};
