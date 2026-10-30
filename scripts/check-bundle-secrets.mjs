#!/usr/bin/env node
/**
 * Fails if a secret reached what the browser downloads: the static bundle and
 * the prerendered pages of a Next.js build.
 *
 *   node scripts/check-bundle-secrets.mjs [distDir]   # default .next
 *
 * It looks for the values of SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY,
 * INQUIRY_HASH_KEY, CRON_SECRET and each secret in INQUIRY_SIGNING_KEYS (and their
 * STAGING_ names) from the environment, and for anything shaped
 * like a Supabase secret key, an Anthropic key, or a service_role JWT. It
 * prints file names only, never what it found.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const dist = path.resolve(process.argv[2] ?? ".next");
const values = [
  ...["SUPABASE_SERVICE_ROLE_KEY", "STAGING_SUPABASE_SERVICE_ROLE_KEY", "ANTHROPIC_API_KEY", "STAGING_ANTHROPIC_API_KEY", "INQUIRY_HASH_KEY", "STAGING_INQUIRY_SECRET", "CRON_SECRET"]
    .map((name) => [name, process.env[name]?.trim()]),
  // "keyId:secret,keyId:secret": the secrets, not the public key ids.
  ...(process.env.INQUIRY_SIGNING_KEYS ?? "").split(",").map((entry) => ["a secret in INQUIRY_SIGNING_KEYS", entry.slice(entry.indexOf(":") + 1).trim()]),
].filter(([, value]) => value && value.length >= 8);
const SHAPES = [
  ["a Supabase secret key", /sb_secret_[A-Za-z0-9_-]{8,}/],
  ["an Anthropic API key", /sk-ant-[A-Za-z0-9_-]{8,}/],
];
const JWT = /eyJ[A-Za-z0-9_-]{10,}\.(eyJ[A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]+/g;

function* files(dir, filter) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) yield* files(full, filter);
    else if (filter(full)) yield full;
  }
}

const browserFiles = [
  ...files(path.join(dist, "static"), () => true),
  ...files(path.join(dist, "server"), (file) => /\.(html|rsc|body|json)$/.test(file) && !file.endsWith(".nft.json")),
];
if (!browserFiles.length) {
  console.error(`No build output in ${dist}. Run the build first.`);
  process.exit(1);
}

const findings = [];
for (const file of browserFiles) {
  const text = readFileSync(file, "utf8");
  const where = path.relative(process.cwd(), file);
  for (const [name, value] of values) if (text.includes(value)) findings.push(`${where}: the value of ${name}`);
  for (const [label, shape] of SHAPES) if (shape.test(text)) findings.push(`${where}: ${label}`);
  for (const match of text.matchAll(JWT)) {
    try {
      if (JSON.parse(Buffer.from(match[1], "base64url").toString("utf8")).role === "service_role") findings.push(`${where}: a service_role JWT`);
    } catch {
      // not a JWT payload
    }
  }
}

if (findings.length) {
  console.error(`Secrets found in browser-facing build output:\n${[...new Set(findings)].map((f) => `  ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`No secrets in ${browserFiles.length} browser-facing files under ${path.relative(process.cwd(), dist) || "."}.`);
