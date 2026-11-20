/**
 * Writes the design's pages as static HTML. The design's components are plain
 * functions (no state, effects or context), so this short renderer is enough,
 * and it runs anywhere: React's own server renderer cannot be loaded inside
 * Next.js server routes. Its output is tested to match React's for every
 * sample site (render.test.tsx): the same elements, text and attribute
 * values. Only attribute order and the case of attribute names may differ,
 * which HTML ignores, and it adds no image preload links of its own.
 */
import type { ReactNode } from "react";

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const BOOLEAN = new Set(["allowFullScreen", "async", "autoFocus", "autoPlay", "checked", "controls", "default", "defer", "disabled", "formNoValidate", "hidden", "loop", "multiple", "muted", "noValidate", "open", "playsInline", "readOnly", "required", "reversed", "selected"]);
const NAMES: Record<string, string> = { className: "class", htmlFor: "for", httpEquiv: "http-equiv", acceptCharset: "accept-charset" };
const SKIP = new Set(["children", "key", "ref", "dangerouslySetInnerHTML", "suppressHydrationWarning", "suppressContentEditableWarning", "defaultValue", "defaultChecked"]);
const UNITLESS = new Set(["flex", "flexGrow", "flexShrink", "fontWeight", "lineHeight", "opacity", "order", "orphans", "widows", "zIndex", "zoom", "gridRow", "gridColumn", "columnCount", "tabSize", "aspectRatio"]);
const FRAGMENT = Symbol.for("react.fragment");

function escape(value: string): string {
  return value.replace(/[&<>"']/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#x27;"));
}

function styleText(style: Record<string, unknown>): string {
  return Object.entries(style)
    .filter(([, value]) => value !== null && value !== undefined && value !== "" && typeof value !== "boolean")
    .map(([key, value]) => {
      const name = key.startsWith("--") ? key : key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`).replace(/^ms-/, "-ms-");
      const text = typeof value === "number" && value !== 0 && !key.startsWith("--") && !UNITLESS.has(key) ? `${value}px` : String(value).trim();
      return `${escape(name)}:${escape(text)}`;
    })
    .join(";");
}

function attributes(type: string, props: Record<string, unknown>): string {
  let out = "";
  for (const [key, value] of Object.entries(props)) {
    if (SKIP.has(key) || value === null || value === undefined || typeof value === "function" || typeof value === "symbol") continue;
    if (key === "style") {
      const text = styleText(value as Record<string, unknown>);
      if (text) out += ` style="${text}"`;
      continue;
    }
    const name = NAMES[key] ?? (key.startsWith("aria-") || key.startsWith("data-") ? key : key.toLowerCase());
    if (BOOLEAN.has(key)) {
      if (value) out += ` ${name}=""`;
      continue;
    }
    if (typeof value === "boolean") {
      if (key.startsWith("aria-") || key.startsWith("data-")) out += ` ${name}="${value}"`;
      continue;
    }
    out += ` ${name}="${escape(String(value))}"`;
  }
  if ((type === "input" || type === "textarea") && props.defaultValue !== undefined && type === "input") out += ` value="${escape(String(props.defaultValue))}"`;
  if (type === "input" && props.defaultChecked) out += ` checked=""`;
  return out;
}

/** The node as HTML, as react-dom/server's renderToStaticMarkup writes it. */
export function renderStatic(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string") return escape(node);
  if (typeof node === "number" || typeof node === "bigint") return String(node);
  if (Array.isArray(node)) return node.map(renderStatic).join("");
  if (typeof node === "object" && "type" in node && "props" in node) {
    const { type, props } = node as { type: unknown; props: Record<string, unknown> };
    if (type === FRAGMENT) return renderStatic(props.children as ReactNode);
    if (typeof type === "function") return renderStatic((type as (p: unknown) => ReactNode)(props));
    if (typeof type === "string") {
      const open = `<${type}${attributes(type, props)}`;
      if (VOID.has(type)) return `${open}/>`;
      const inner = props.dangerouslySetInnerHTML ? String((props.dangerouslySetInnerHTML as { __html?: unknown }).__html ?? "") : type === "textarea" && props.defaultValue !== undefined ? escape(String(props.defaultValue)) : renderStatic(props.children as ReactNode);
      return `${open}>${inner}</${type}>`;
    }
  }
  throw new Error("The company design can only draw plain elements and function components.");
}
