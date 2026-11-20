/**
 * Builds a website spec version into a static site with its design system,
 * checks it, and hands back the files to store. Everything it touches comes in
 * through `deps`, so the rules can be tested without a database or storage.
 *
 * A build that fails a check is refused with the reasons; warnings are kept
 * with the build and shown beside its link.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { build as buildAssociation } from "../../../design-systems/association";
import type { SiteSpec } from "@/lib/site-spec/schema";
import { parseSiteSpec } from "@/lib/site-spec/validate";

export const BUILD_LINK_DAYS = 30;
/** The private Storage bucket that holds built sites (migration 20261117000100). */
export const BUILD_BUCKET = "site-builds";
const MAX_FILES = 500;
const MAX_BYTES = 100 * 1024 * 1024;

export interface StoredImage {
  /** site_assets.id, the spec asset's fileId. */
  id: string;
  storagePath: string;
  mimeType: string;
  status: "uploading" | "pending_review" | "approved" | "rejected" | "deleted";
}

export interface BuildCheck {
  level: "warning" | "error";
  message: string;
}

export interface BuiltSite {
  id: string;
  shareToken: string;
  storagePrefix: string;
  designSystem: string;
  files: { path: string; body: Uint8Array; contentType: string }[];
  checks: BuildCheck[];
  expiresAt: Date;
}

export interface StoredDocument {
  /** site_documents.id, a list item's documentFileId. */
  id: string;
  storagePath: string;
  deleted: boolean;
}

export interface BuildDeps {
  /** The client's stored images the spec points at. */
  images: (fileIds: string[]) => Promise<StoredImage[]>;
  /** The bytes of one stored image. */
  download: (storagePath: string) => Promise<Uint8Array>;
  /** The client's stored documents the spec points at. Absent: no documents. */
  documents?: (fileIds: string[]) => Promise<StoredDocument[]>;
  /** The bytes of one stored document. */
  downloadDocument?: (storagePath: string) => Promise<Uint8Array>;
  now: () => Date;
}

export class BuildRefused extends Error {
  constructor(
    message: string,
    readonly checks: BuildCheck[] = [],
  ) {
    super(message);
  }
}

const EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const TYPES: Record<string, string> = { html: "text/html; charset=utf-8", css: "text/css; charset=utf-8", txt: "text/plain; charset=utf-8", jpg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf" };

export function contentTypeOf(path: string): string {
  return TYPES[path.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
}

/** What a person reading the pages would still see as unfinished. */
export function pageChecks(html: string, path: string): BuildCheck[] {
  const checks: BuildCheck[] = [];
  if (/<script\b/i.test(html)) checks.push({ level: "error", message: `${path} contains a script.` });
  const text = html.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
  const bracket = text.match(/\[[^\]]{3,120}\]/);
  if (bracket) checks.push({ level: "warning", message: `${path} still has text in square brackets: ${bracket[0].slice(0, 80)}` });
  for (const img of html.match(/<img\b[^>]*>/gi) ?? []) {
    if (!/\salt="[^"]+"/.test(img)) checks.push({ level: "error", message: `${path} has an image without alternative text.` });
  }
  return checks;
}

function token(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * `production`: the site to publish, findable by search engines with its
 * forms sending to `formAction`. Images whose rights are not approved stop
 * it, where a preview link only warns.
 */
export async function buildSite(input: { studioId: string; specVersion: number; spec: unknown; madeBy?: string; production?: { formAction: string } }, deps: BuildDeps): Promise<BuiltSite> {
  const parsed = parseSiteSpec(input.spec);
  if (!parsed.ok) throw new BuildRefused("This version is not a valid website spec. Open it in the editor to see why.");
  const spec: SiteSpec = parsed.spec;
  const system = spec.brand.designSystem ?? "template";
  if (system !== "association@0.1") throw new BuildRefused("This spec is drawn with Studio OS's template, which only previews. Choose a design system under Brand to build a site.");

  const checks: BuildCheck[] = [];
  const fileIds = [...new Set(spec.assets.flatMap((asset) => (asset.fileId ? [asset.fileId] : [])))];
  const stored = new Map((await deps.images(fileIds)).map((image) => [image.id, image]));
  const files: BuiltSite["files"] = [];
  const imageFiles: Record<string, string> = {};

  await Promise.all(
    spec.assets.map(async (asset) => {
      const image = asset.fileId ? stored.get(asset.fileId) : undefined;
      if (!image || image.status === "deleted" || image.status === "uploading") {
        checks.push({ level: "error", message: `The image "${asset.description || asset.id}" has no stored file.` });
        return;
      }
      if (image.status === "rejected") checks.push({ level: "error", message: `The rights for "${asset.description || asset.id}" were rejected.` });
      else if (image.status !== "approved")
        checks.push(
          input.production
            ? { level: "error", message: `The rights for "${asset.description || asset.id}" are not approved, so the site cannot be published.` }
            : { level: "warning", message: `The rights for "${asset.description || asset.id}" are not decided yet. Fine for a preview link, not for publishing.` },
        );
      const path = `img/${asset.id}.${EXTENSIONS[image.mimeType] ?? "bin"}`;
      imageFiles[asset.id] = path;
      files.push({ path, body: await deps.download(image.storagePath), contentType: image.mimeType });
    }),
  );
  if (checks.some((check) => check.level === "error")) throw new BuildRefused("The site was not built.", checks);

  // Documents to download, by the list item that offers them.
  const documentFiles: Record<string, string> = {};
  const wanted = spec.pages.flatMap((page) =>
    page.sections.flatMap((section) => (section.kind === "features" ? section.items.flatMap((item) => (item.documentFileId ? [{ itemId: item.id, fileId: item.documentFileId }] : [])) : [])),
  );
  if (wanted.length) {
    const found = new Map((deps.documents ? await deps.documents([...new Set(wanted.map((w) => w.fileId))]) : []).map((d) => [d.id, d]));
    const fetched = new Map<string, string>();
    await Promise.all(
      wanted.map(async ({ itemId, fileId }) => {
        const document = found.get(fileId);
        if (!document || document.deleted || !deps.downloadDocument) {
          checks.push({ level: "warning", message: "A list item points at a document that no longer exists, so it has no download link." });
          return;
        }
        const path = `dokument/${fileId}.pdf`;
        documentFiles[itemId] = path;
        if (!fetched.has(fileId)) {
          fetched.set(fileId, path);
          files.push({ path, body: await deps.downloadDocument(document.storagePath), contentType: "application/pdf" });
        }
      }),
    );
  }

  let built;
  try {
    built = buildAssociation(spec, { files: imageFiles, documents: documentFiles, status: input.production ? "approved" : "prototype", today: deps.now(), madeBy: input.madeBy, formAction: input.production?.formAction });
  } catch (failure) {
    throw new BuildRefused(failure instanceof Error ? failure.message : "The design system could not build this spec.", checks);
  }
  const encoder = new TextEncoder();
  for (const file of built) {
    if (file.path.endsWith(".html")) checks.push(...pageChecks(file.text, file.path));
    files.push({ path: file.path, body: encoder.encode(file.text), contentType: contentTypeOf(file.path) });
  }
  if (checks.some((check) => check.level === "error")) throw new BuildRefused("The site was not built.", checks);
  const bytes = files.reduce((sum, file) => sum + file.body.byteLength, 0);
  if (files.length > MAX_FILES || bytes > MAX_BYTES) throw new BuildRefused(`The site is too large to store (${files.length} files, ${Math.round(bytes / 1024 / 1024)} MB).`, checks);

  const id = randomUUID();
  const now = deps.now();
  return {
    id,
    shareToken: token(),
    storagePrefix: `${input.studioId}/${id}`,
    designSystem: system,
    files: files.sort((a, b) => a.path.localeCompare(b.path)),
    checks,
    expiresAt: new Date(now.getTime() + BUILD_LINK_DAYS * 86400000),
  };
}
