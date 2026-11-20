/**
 * One page of a spec drawn with the company design, for Studio OS's
 * sandboxed preview frame: stylesheet inline, images through the given links.
 * Fonts fall back to the system's, as in every preview.
 */
import { build } from "../../../design-systems/services";
import type { RenderImageFile } from "@/lib/site-render/model";
import type { SiteSpec } from "./schema";
import { servicesContent } from "./to-services";

export function servicesPreview(spec: SiteSpec, imageFiles: Record<string, RenderImageFile>, pageId: string, madeBy = "Axivo"): { html: string } | { missing: string[] } {
  const images = Object.fromEntries(
    Object.entries(imageFiles).map(([fileId, file]) => [fileId, { src: file.url, width: file.width, height: file.height, source: "Preview", licence: "Preview", showsPerson: false }]),
  );
  const result = servicesContent(spec, images, { prototype: { madeBy } });
  if (!result.ok) return { missing: result.missing };
  const files = build({ content: result.content, design: result.design });
  const path = result.pages[pageId] ?? "index.html";
  const html = files.find((file) => file.path === path)?.text ?? files.find((file) => file.path === "index.html")!.text;
  const css = files.find((file) => file.path === "site.css")!.text.replace(/@font-face\{[^}]*\}/g, "");
  return { html: html.replace(/<link rel="stylesheet" href="[^"]*site\.css">/, `<style>${css}</style>`) };
}
