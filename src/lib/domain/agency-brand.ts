/**
 * The agency's brand: what its clients see instead of Studio OS, on built
 * prototype sites, preview link pages, and later the client review page and
 * mail. Stored on the studio; every value is optional and checked here and
 * again in the database (update_studio_brand).
 */
import { z } from "zod";

export const BRAND_LOGO_BUCKET = "studio-brand";
export const MAX_BRAND_LOGO_BYTES = 512 * 1024;

const optional = (schema: z.ZodString) => z.union([z.literal(""), schema]).optional();

export const agencyBrandSchema = z.strictObject({
  name: optional(z.string().trim().max(80, "Keep the name under 80 characters.")),
  website: optional(z.string().trim().max(200).regex(/^https:\/\/[^\s/]+\.\S+$/, "Use a full address starting with https://.")),
  email: optional(z.string().trim().max(200).regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Use an e-mail address like hello@agency.fi.")),
  color: optional(z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Use a colour like #1A2B3C.")),
  logoPath: z.string().max(200).optional(),
});
export type AgencyBrand = z.infer<typeof agencyBrandSchema>;

/** What a client-facing page shows: the brand with the studio's own name as fallback. */
export interface ShownBrand {
  name: string;
  website: string | null;
  email: string | null;
  color: string;
  logoUrl: string | null;
}

export const DEFAULT_BRAND_COLOR = "#1F2A37";

export function shownBrand(brand: AgencyBrand & { studioName?: string }, studioName: string, logoUrl: (path: string) => string): ShownBrand {
  return {
    name: brand.name?.trim() || brand.studioName?.trim() || studioName.trim() || "Your web agency",
    website: brand.website?.trim() || null,
    email: brand.email?.trim() || null,
    color: brand.color || DEFAULT_BRAND_COLOR,
    logoUrl: brand.logoPath ? logoUrl(brand.logoPath) : null,
  };
}

/** Values without the empty ones, as the database stores them. */
export function cleanBrand(brand: AgencyBrand): AgencyBrand {
  return Object.fromEntries(Object.entries(brand).map(([k, v]) => [k, typeof v === "string" ? v.trim() : v]).filter(([, v]) => v)) as AgencyBrand;
}

/** The public address of a stored logo. */
export function brandLogoUrl(supabaseUrl: string, path: string): string {
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${BRAND_LOGO_BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`;
}
