/**
 * Website images (WF-2): what may be stored, how long links last, and the
 * rights questions every image answers before a person approves it. The
 * database enforces the same limits (20261031000100_site_assets.sql).
 */

export const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type ImageMimeType = (typeof IMAGE_MIME_TYPES)[number];

export const IMAGE_LIMITS = {
  /** A file as the person picks it, before processing in the browser. */
  inputBytes: 15 * 1024 * 1024,
  /** A processed file, as stored. The bucket and the database refuse more. */
  storedBytes: 3 * 1024 * 1024,
  /** Smallest side of a usable image, in pixels. */
  minSide: 200,
  /** Largest side of a stored image: the browser downscales to this. */
  maxSide: 2560,
  /** Largest side the browser accepts to process. */
  maxInputSide: 12000,
  /** Files picked at once. */
  perUpload: 10,
} as const;

/**
 * Signed links last at most this long. Supabase cannot revoke a link once
 * issued, so after an image is deleted any link already handed out stops
 * working within this time; no new link can be issued at all.
 */
export const SIGNED_URL_TTL_SECONDS = 900;

export const STORAGE_BUCKET = "site-assets";

/* -------------------------------------------------------------------------- */
/* Rights and permission                                                      */
/* -------------------------------------------------------------------------- */

/** Copyright and licensing: who holds the rights. */
export const RIGHTS_BASES = ["client_owns", "studio_created", "licensed", "other"] as const;
export type RightsBasis = (typeof RIGHTS_BASES)[number];

/** The lawful basis the studio relies on for showing identifiable people. Consent is one option, not the default. */
export const PEOPLE_BASES = ["consent", "contract", "legitimate_interests", "other"] as const;
export type PeopleBasis = (typeof PEOPLE_BASES)[number];

export const RIGHTS_BASIS_LABELS: Record<RightsBasis, string> = {
  client_owns: "The client owns the rights",
  studio_created: "Created by the studio",
  licensed: "Licensed (stock or other licence)",
  other: "Other",
};

export const PEOPLE_BASIS_LABELS: Record<PeopleBasis, string> = {
  consent: "Consent",
  contract: "Contract (for example an employee's or performer's agreement)",
  legitimate_interests: "Legitimate interests",
  other: "Other",
};

export const NOTE_MAX_LENGTH = 500;

/** The answers recorded for an image. */
export interface ImageProvenance {
  description: string;
  sourceNote: string;
  rightsBasis: RightsBasis | null;
  licenceNote: string;
  usePermitted: boolean;
  usePermissionNote: string;
  identifiablePeople: boolean;
  peopleBasis: PeopleBasis | null;
  peopleBasisNote: string;
}

export function emptyProvenance(description = ""): ImageProvenance {
  return {
    description,
    sourceNote: "",
    rightsBasis: null,
    licenceNote: "",
    usePermitted: false,
    usePermissionNote: "",
    identifiablePeople: false,
    peopleBasis: null,
    peopleBasisNote: "",
  };
}

/** What stops these answers from supporting an approval. The database checks the same. */
export function approvalProblems(p: ImageProvenance): string[] {
  const problems: string[] = [];
  if (!p.description.trim()) problems.push("Describe what the image shows.");
  if (!p.rightsBasis) problems.push("Say who holds the rights (copyright and licensing).");
  if ((p.rightsBasis === "licensed" || p.rightsBasis === "other") && !p.licenceNote.trim()) {
    problems.push("Record the licence: its name, a link, or the agreement it comes from.");
  }
  if (!p.usePermitted) problems.push("Confirm there is permission to use the image on this client's website.");
  else if (!p.usePermissionNote.trim()) problems.push("Note who gave permission to use it, and where that is recorded.");
  if (p.identifiablePeople) {
    if (!p.peopleBasis) problems.push("Choose the lawful basis for showing the people in it.");
    if (!p.peopleBasisNote.trim()) problems.push("Note where the basis for showing the people is documented.");
  }
  for (const [label, value] of [
    ["description", p.description],
    ["source note", p.sourceNote],
    ["licence note", p.licenceNote],
    ["permission note", p.usePermissionNote],
    ["basis note", p.peopleBasisNote],
  ] as const) {
    if (value.length > NOTE_MAX_LENGTH) problems.push(`Keep the ${label} under ${NOTE_MAX_LENGTH} characters.`);
  }
  return problems;
}
