import "server-only";
import { createHash } from "node:crypto";
import { inspectImage } from "@/lib/site-assets/inspect";
import { IMAGE_LIMITS, NOTE_MAX_LENGTH, PEOPLE_BASES, RIGHTS_BASES, type ImageProvenance } from "@/lib/site-assets/limits";

/** What the database measured and stores for a checked file. */
export interface MeasuredImage {
  mimeType: string;
  byteSize: number;
  width: number;
  height: number;
  sha256: string;
}

export interface UploadSteps {
  /** begin_site_asset_upload, as the person. */
  begin(meta: MeasuredImage & ImageProvenance): Promise<{ id: string; storagePath: string | null; existing: boolean }>;
  /** Uploads to Storage, as the person (the storage policies apply). */
  store(path: string, bytes: Uint8Array, mimeType: string): Promise<void>;
  /** finish_site_asset_upload, as the server's service role. */
  finish(id: string, measured: MeasuredImage): Promise<void>;
  /** The activity entry, as the person. */
  recordUploaded(description: string): Promise<void>;
}

export type UploadOutcome = { status: number; body: { assetId?: string; existing?: boolean; error?: string } };

const refuse = (error: string): UploadOutcome => ({ status: 400, body: { error } });

/** The provenance answers as sent by the browser, trimmed and limited. Unknown values become empty. */
export function readProvenance(raw: unknown): ImageProvenance | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, NOTE_MAX_LENGTH) : "");
  return {
    description: text(r.description),
    sourceNote: text(r.sourceNote),
    rightsBasis: (RIGHTS_BASES as readonly unknown[]).includes(r.rightsBasis) ? (r.rightsBasis as ImageProvenance["rightsBasis"]) : null,
    licenceNote: text(r.licenceNote),
    usePermitted: r.usePermitted === true,
    usePermissionNote: text(r.usePermissionNote),
    identifiablePeople: r.identifiablePeople === true,
    peopleBasis: (PEOPLE_BASES as readonly unknown[]).includes(r.peopleBasis) ? (r.peopleBasis as ImageProvenance["peopleBasis"]) : null,
    peopleBasisNote: text(r.peopleBasisNote),
  };
}

/**
 * Checks an uploaded file from its bytes, then stores it. Nothing is stored
 * and no row is created when the bytes are not a well-formed JPEG, PNG or
 * WebP image of an allowed size, or when they disagree with what the
 * browser declared. The server's measurements, not the browser's, are what
 * the database keeps.
 */
export async function receiveSiteAssetUpload(
  input: { bytes: Uint8Array; declaredType: string; provenance: ImageProvenance },
  steps: UploadSteps,
): Promise<UploadOutcome> {
  const { bytes, declaredType, provenance } = input;
  if (bytes.length === 0) return refuse("The file is empty.");
  if (bytes.length > IMAGE_LIMITS.storedBytes) return refuse("The image is larger than 3 MB after processing.");
  const inspected = inspectImage(bytes);
  if (!inspected.ok) return refuse(inspected.reason);
  if (declaredType !== inspected.mimeType) return refuse("The file is not the type it claims to be.");
  const { width, height } = inspected;
  if (Math.min(width, height) < IMAGE_LIMITS.minSide) return refuse(`The image is too small: each side needs at least ${IMAGE_LIMITS.minSide} pixels.`);
  if (Math.max(width, height) > IMAGE_LIMITS.maxSide) return refuse(`The image is larger than ${IMAGE_LIMITS.maxSide} pixels on a side. Upload it through Studio OS, which resizes it.`);
  if (!provenance.description) return refuse("Describe what the image shows.");

  const measured: MeasuredImage = {
    mimeType: inspected.mimeType,
    byteSize: bytes.length,
    width,
    height,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
  const begun = await steps.begin({ ...measured, ...provenance });
  if (begun.existing || !begun.storagePath) return { status: 200, body: { assetId: begun.id, existing: true } };
  await steps.store(begun.storagePath, bytes, measured.mimeType);
  await steps.finish(begun.id, measured);
  await steps.recordUploaded(provenance.description);
  return { status: 201, body: { assetId: begun.id, existing: false } };
}
