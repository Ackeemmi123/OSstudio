/**
 * Brand identity used by the shell. Colors and type live in src/app/theme.css.
 * `logo` stays null until an official Axivo logo file is provided (see
 * docs/brand.md); until then the name is set as plain text, not a drawn mark.
 */
export const BRAND = {
  company: "Axivo",
  product: "Studio OS",
  logo: null as { src: string; width: number; height: number } | null,
  /** False until the theme uses verified Axivo values. Shown in Settings. */
  verified: false,
};
