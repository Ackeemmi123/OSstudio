/**
 * Builds a website spec version into a static site with its design system,
 * checks it, and hands back the files to store. Everything it touches comes in
 * through `deps`, so the rules can be tested without a database or storage.
 *
 * A build that fails a check is refused with the reasons; warnings are kept
 * with the build and shown beside its link.
 */
import { siteQuality, type QualityReport } from "@/lib/quality/site-quality";
import { randomBytes, randomUUID } from "node:crypto";
import { build as buildAssociation } from "../../../design-systems/association";
import { build as buildServices, FONT_FILES } from "../../../design-systems/services";
import { ASSOCIATION_PRESET, enhanceSite, presetForDirection, type PresetName } from "../../../signature/layer/enhance.mjs";
import { servicesContent, type ServicesImage } from "@/lib/site-spec/to-services";
import type { SiteSpec } from "@/lib/site-spec/schema";
import { parseSiteSpec } from "@/lib/site-spec/validate";
import { webpPictures } from "./images";

export const BUILD_LINK_DAYS = 30;
/** The private Storage bucket that holds built sites (migration 20261117000100). */
export const BUILD_BUCKET = "site-builds";
const MAX_FILES = 500;
const MAX_BYTES = 100 * 1024 * 1024;
/** Pictures made into WebP at the same time, and how long all of them may take before the rest go in as uploaded. */
const PICTURES_AT_ONCE = 3;
const PICTURE_BUDGET_MS = 40_000;
/** The widest file a phone fetches for a picture as wide as its screen (390 px at 3x). */
const PHONE_WIDTH = 1200;

export interface StoredImage {
  /** site_assets.id, the spec asset's fileId. */
  id: string;
  storagePath: string;
  mimeType: string;
  status: "uploading" | "pending_review" | "approved" | "rejected" | "deleted";
  /** What the company design shows about the image; read when the spec uses it. */
  width?: number;
  height?: number;
  sourceNote?: string | null;
  rightsBasis?: string | null;
  licenceNote?: string | null;
  identifiablePeople?: boolean;
}

/** A picture as a build wrote it: the upload's size and its WebP files by width, narrowest first. */
export interface BuiltPicture {
  width: number;
  height: number;
  variants: { path: string; width: number }[];
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
  /** How the finished pages measure up (src/lib/quality), stored with the build's checks. */
  quality: QualityReport;
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
  /** The company design's font files, by name (design-systems/services/fonts). */
  font?: (name: string) => Uint8Array;
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
// js: Axivo Signature's scripts. A browser runs a module script only when it is served as JavaScript (with nosniff, never as octet-stream).
const TYPES: Record<string, string> = { html: "text/html; charset=utf-8", css: "text/css; charset=utf-8", js: "text/javascript; charset=utf-8", txt: "text/plain; charset=utf-8", jpg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf", woff2: "font/woff2" };

export function contentTypeOf(path: string): string {
  return TYPES[path.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
}

/**
 * Axivo Signature's head block (signature/layer/enhance.mjs): its stylesheet, a preload and
 * its module script, all from the site's own signature/ folder. Nothing else passes as it.
 */
const SIGNATURE_BLOCK =
  /<!-- signature-layer [\w.-]+ -->\s*<link rel="stylesheet" href="(?:\.\.?\/)*signature\/layer\.css">\s*<link rel="modulepreload" href="(?:\.\.?\/)*signature\/layer\.js">\s*<script type="module" src="(?:\.\.?\/)*signature\/site\.js" blocking="render"><\/script>\s*<!-- \/signature-layer -->/;

/** What a person reading the pages would still see as unfinished. */
export function pageChecks(html: string, path: string): BuildCheck[] {
  const checks: BuildCheck[] = [];
  // The one script a built page may hold is Axivo Signature's own head block, exactly as the layer writes it, once.
  if (/<script\b/i.test(html.replace(SIGNATURE_BLOCK, ""))) checks.push({ level: "error", message: `${path} contains a script.` });
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
export async function buildSite(input: { studioId: string; specVersion: number; spec: unknown; madeBy?: string; production?: { formAction: string; approvedBy?: string; approvedOn?: string } }, deps: BuildDeps): Promise<BuiltSite> {
  const parsed = parseSiteSpec(input.spec);
  if (!parsed.ok) throw new BuildRefused("This version is not a valid website spec. Open it in the editor to see why.");
  const spec: SiteSpec = parsed.spec;
  const system = spec.brand.designSystem ?? "template";
  if (system !== "association@0.1" && system !== "services@0.1") throw new BuildRefused("This spec is drawn with Studio OS's template, which only previews. Choose a design system under Brand to build a site.");

  const checks: BuildCheck[] = [];
  const fileIds = [...new Set(spec.assets.flatMap((asset) => (asset.fileId ? [asset.fileId] : [])))];
  const stored = new Map((await deps.images(fileIds)).map((image) => [image.id, image]));
  const files: BuiltSite["files"] = [];
  const imageFiles: Record<string, string> = {};
  // What the build made of each picture: its size and its WebP files, narrowest first.
  const pictures: Record<string, BuiltPicture> = {};
  let icon: string | undefined;
  const beyondPhone = new Set<string>();

  const usable: { asset: SiteSpec["assets"][number]; image: StoredImage }[] = [];
  for (const asset of spec.assets) {
    const image = asset.fileId ? stored.get(asset.fileId) : undefined;
    if (!image || image.status === "deleted" || image.status === "uploading") {
      checks.push({ level: "error", message: `The image "${asset.description || asset.id}" has no stored file.` });
      continue;
    }
    if (image.status === "rejected") checks.push({ level: "error", message: `The rights for "${asset.description || asset.id}" were rejected.` });
    else if (image.status !== "approved")
      checks.push(
        input.production
          ? { level: "error", message: `The rights for "${asset.description || asset.id}" are not approved, so the site cannot be published.` }
          : { level: "warning", message: `The rights for "${asset.description || asset.id}" are not decided yet. Fine for a preview link, not for publishing.` },
      );
    usable.push({ asset, image });
  }
  if (checks.some((check) => check.level === "error")) throw new BuildRefused("The site was not built.", checks);
  const uploads = await Promise.all(usable.map(({ image }) => deps.download(image.storagePath)));
  // Each picture becomes WebP at a few widths (images.ts), a few pictures at a time so memory stays small.
  // One that cannot be read, or that there is no time left for, goes in as it was uploaded: never a reason to stop a build.
  const started = Date.now();
  let next = 0;
  const work = async () => {
    for (let i = next++; i < usable.length; i = next++) {
      const { asset, image } = usable[i];
      const body = uploads[i];
      try {
        if (Date.now() - started > PICTURE_BUDGET_MS) throw new Error("No time left.");
        const made = await webpPictures(body, { icon: asset.id === spec.brand.logoAssetId });
        const variants = made.variants.map((variant) => ({ path: `img/${asset.id}-${variant.width}.webp`, width: variant.width }));
        made.variants.forEach((variant, n) => files.push({ path: variants[n].path, body: variant.body, contentType: "image/webp" }));
        pictures[asset.id] = { width: made.width, height: made.height, variants };
        imageFiles[asset.id] = variants[variants.length - 1].path;
        // The quality report weighs what a phone fetches: the file that fills its screen.
        for (const variant of variants) if (variant !== (variants.findLast((entry) => entry.width <= PHONE_WIDTH) ?? variants[0])) beyondPhone.add(variant.path);
        if (made.icon) {
          icon = `img/${asset.id}-icon.png`;
          files.push({ path: icon, body: made.icon, contentType: "image/png" });
          beyondPhone.add(icon);
        }
      } catch {
        const path = `img/${asset.id}.${EXTENSIONS[image.mimeType] ?? "bin"}`;
        imageFiles[asset.id] = path;
        files.push({ path, body, contentType: image.mimeType });
        checks.push({ level: "warning", message: `The image "${asset.description || asset.id}" could not be made smaller for the web, so it is used as uploaded.` });
      }
    }
  };
  await Promise.all(Array.from({ length: PICTURES_AT_ONCE }, work));
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
    if (system === "services@0.1") {
      built = servicesFiles(spec, input, stored, imageFiles, pictures, deps, files);
    } else {
      built = buildAssociation(spec, { files: imageFiles, pictures, icon, documents: documentFiles, status: input.production ? "approved" : "prototype", today: deps.now(), madeBy: input.madeBy, formAction: input.production?.formAction });
      // Axivo Signature on an association site: always the calm preset (trust before effect).
      if (spec.brand.concept?.signatureMotion) built = withSignature(built, "association", ASSOCIATION_PRESET, files);
    }
  } catch (failure) {
    if (failure instanceof BuildRefused) throw failure;
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
    quality: siteQuality({
      pages: built.filter((file) => file.path.endsWith(".html")).map((file) => ({ path: file.path, html: file.text })),
      images: files.filter((file) => file.contentType.startsWith("image/") && !beyondPhone.has(file.path)).map((file) => ({ path: file.path, bytes: file.body.byteLength })),
      industry: spec.strategy.industry,
    }),
    expiresAt: new Date(now.getTime() + BUILD_LINK_DAYS * 86400000),
  };
}

/**
 * Axivo Signature: motion added on top of the same pages; without JavaScript or with reduced
 * motion they are unchanged. Adds the layer's files to `files` and hands back the pages with its head block.
 */
function withSignature<Page extends { path: string; text: string }>(pages: Page[], map: "services" | "association", preset: PresetName, files: BuiltSite["files"]): Page[] {
  const enhanced = enhanceSite(pages, { map, preset });
  const changed = new Map(enhanced.files.map((file) => [file.path, file.text]));
  const encoder = new TextEncoder();
  for (const asset of enhanced.assets) files.push({ path: asset.path, body: encoder.encode(asset.text), contentType: asset.contentType });
  return pages.map((page) => ({ ...page, text: changed.get(page.path) ?? page.text }));
}

const RIGHTS: Record<string, string> = { client_owns: "The client's own image", studio_created: "Made by the studio", licensed: "Licensed", other: "Other" };

/** The company design: the spec translated to its content, its pages, and its fonts. */
function servicesFiles(
  spec: SiteSpec,
  input: { madeBy?: string; production?: { formAction: string; approvedBy?: string; approvedOn?: string } },
  stored: Map<string, StoredImage>,
  imageFiles: Record<string, string>,
  pictures: Record<string, BuiltPicture>,
  deps: BuildDeps,
  files: BuiltSite["files"],
) {
  const images: Record<string, ServicesImage> = {};
  for (const asset of spec.assets) {
    const image = asset.fileId ? stored.get(asset.fileId) : undefined;
    const path = imageFiles[asset.id];
    if (!image || !path || !asset.fileId) continue;
    images[asset.fileId] = {
      src: `/${path}`,
      width: pictures[asset.id]?.width ?? image.width ?? 1600,
      height: pictures[asset.id]?.height ?? image.height ?? 1000,
      source: (image.sourceNote || RIGHTS[image.rightsBasis ?? ""] || "The client").slice(0, 120),
      licence: (image.licenceNote || RIGHTS[image.rightsBasis ?? ""] || "Used with permission").slice(0, 120),
      showsPerson: Boolean(image.identifiablePeople),
      ...(pictures[asset.id] ? { variants: pictures[asset.id].variants.map((variant) => ({ src: `/${variant.path}`, width: variant.width })) } : {}),
    };
  }
  if (input.production && !input.production.approvedBy) throw new BuildRefused("A published company site names who approved it, and no approval was found.");
  const mode = input.production
    ? { client: { approvedBy: input.production.approvedBy!.slice(0, 80), approvedOn: (input.production.approvedOn ?? "").slice(0, 10) || deps.now().toISOString().slice(0, 10) } }
    : { prototype: { madeBy: (input.madeBy || "Axivo").slice(0, 60) } };
  const result = servicesContent(spec, images, mode);
  if (!result.ok) throw new BuildRefused("The company design needs more before it can build this spec.", result.missing.map((message) => ({ level: "error" as const, message })));
  const pages = buildServices({ content: result.content, design: result.design, formAction: input.production?.formAction });
  if (deps.font) {
    for (const name of FONT_FILES) files.push({ path: `fonts/${name}`, body: deps.font(name), contentType: name.endsWith(".woff2") ? "font/woff2" : "text/plain; charset=utf-8" });
  }
  if (!spec.brand.concept?.signatureMotion) return pages;
  // Axivo Signature: motion that fits the direction.
  return withSignature(pages, "services", presetForDirection(result.design.direction), files);
}
