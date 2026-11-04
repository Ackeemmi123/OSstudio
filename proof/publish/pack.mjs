#!/usr/bin/env node
/**
 * Packs a client's built site for hosting, with its working contact form. It
 * refuses anything that is not ready. It publishes nothing: a person does that,
 * after the client's written approval.
 *
 *   node proof/publish/pack.mjs <built site folder> <out folder>
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export function pack(site, out) {
  const home = path.join(site, "index.html");
  if (!existsSync(home)) throw new Error(`No built site at ${site}.`);
  const html = readFileSync(home, "utf8");
  if (html.includes("noindex")) throw new Error("This is a test site or a concept, not an approved client site.");
  if (html.includes('class="test-note"')) throw new Error("This page still says it is a test or a concept.");
  rmSync(out, { recursive: true, force: true });
  cpSync(site, out, { recursive: true });
  mkdirSync(path.join(out, "api"), { recursive: true });
  mkdirSync(path.join(out, "lib"), { recursive: true });
  cpSync(path.join(here, "api/contact.js"), path.join(out, "api/contact.js"));
  cpSync(path.join(here, "contact.mjs"), path.join(out, "lib/contact.mjs"));
  writeFileSync(path.join(out, "package.json"), JSON.stringify({ private: true, type: "module" }, null, 2));
  writeFileSync(
    path.join(out, "vercel.json"),
    JSON.stringify({ headers: [{ source: "/(.*)", headers: [{ key: "X-Content-Type-Options", value: "nosniff" }, { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" }, { key: "X-Frame-Options", value: "DENY" }] }] }, null, 2),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [site, out] = process.argv.slice(2);
  pack(site, out);
  console.log(`Packed ${site} into ${out}. Needs CONTACT_TO, CONTACT_FROM and RESEND_API_KEY in the project's settings.`);
}
