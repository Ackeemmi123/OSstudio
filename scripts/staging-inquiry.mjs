#!/usr/bin/env node
/**
 * Sends signed TEST inquiries to a deployed Studio OS (staging or a PR
 * preview), exactly as the Axivo website's server would, and checks the
 * answers. It writes one inquiry, marked as a test, with invented data.
 *
 *   npm run staging:inquiry
 *
 * Settings come from `.env.inquiry.local` in the repository folder (git
 * ignores every .env* file). Values in that file win over the same names in
 * the shell, so an old `export` cannot get in the way. The first run creates
 * the file with empty values to fill in:
 *
 *   STAGING_INQUIRY=1                    confirms a test inquiry may be written
 *   STAGING_APP_URL=https://…            the Studio OS deployment
 *   INQUIRY_SIGNING_KEYS=keyId:secret    copied as is from the Vercel project
 *   STAGING_PROTECTION_BYPASS=…          Vercel "Protection Bypass for Automation", if protection is on
 *
 * STAGING_INQUIRY_KEY_ID and STAGING_INQUIRY_SECRET still work instead of
 * INQUIRY_SIGNING_KEYS.
 *
 * First an unsigned request checks that Studio OS itself answers (and not
 * Vercel's Deployment Protection) and that the deployment is configured. Then,
 * in order: a new submission gets 202; a retry with a new submittedAt, IP,
 * test flag and signature time gets 202 with duplicate: true and the same
 * reference; the same id with a changed message gets 409; a wrong signature
 * gets 401. Prints statuses and the reference only, never a secret.
 */
import { createHmac, randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const SETTINGS_FILE = resolve(process.cwd(), ".env.inquiry.local");
const TEMPLATE = `# Settings for \`npm run staging:inquiry\`. Git ignores this file; never commit it.
# Paste each value right after the = sign, without quotes or spaces.

# Leave this as 1: it confirms one test inquiry may be written to staging.
STAGING_INQUIRY=1

# The Studio OS staging address, for example https://studio-os-staging-….vercel.app
STAGING_APP_URL=

# Copy the value of INQUIRY_SIGNING_KEYS from Vercel (studio-os-staging → Settings → Environment Variables), e.g. axivo-staging-1:abc…
INQUIRY_SIGNING_KEYS=

# Vercel → studio-os-staging → Settings → Deployment Protection → Protection Bypass for Automation.
STAGING_PROTECTION_BYPASS=
`;

loadSettingsFile();

const env = process.env;
const appUrl = value(env.STAGING_APP_URL)?.replace(/\/+$/, "");
const bypass = value(env.STAGING_PROTECTION_BYPASS);
const { keyId, secret } = signingKey();

if (env.STAGING_INQUIRY !== "1") stop("Set STAGING_INQUIRY=1 to confirm that one test inquiry may be written to this deployment.");
if (!appUrl) stop(`STAGING_APP_URL is empty. Add the Studio OS staging address to ${SETTINGS_FILE}.`);
if (!keyId || !secret) stop(`The signing key is missing. Copy INQUIRY_SIGNING_KEYS from Vercel into ${SETTINGS_FILE}.`);
let host;
try {
  host = new URL(appUrl).hostname;
} catch {
  stop("STAGING_APP_URL is not a web address. It should start with https://");
}
if (/(^|\.)axivo\.fi$/i.test(host)) stop("STAGING_APP_URL points at the Axivo website. It must be the Studio OS deployment.");

const endpoint = `${appUrl}/api/inquiries`;
console.log(`Studio OS: ${endpoint}`);
console.log(`Signing key: ${keyId} (secret of ${secret.length} characters${/^[0-9a-f]{64}$/i.test(secret) ? "" : ", not the usual 64 hex characters"})`);
console.log(`Protection bypass: ${bypass ? "set" : "not set"}\n`);

await preflight();

const run = new Date().toISOString().replace(/\D/g, "").slice(0, 12);
const submissionId = randomUUID();
const now = new Date();
const desired = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const payload = {
  version: 1,
  source: "axivo_website",
  submissionId,
  submittedAt: now.toISOString(),
  test: true,
  locale: "en",
  contact: { name: `Staging test ${run}`, email: `staging-inquiry-${run}@example.com`, company: "Staging check (test)" },
  service: "websites",
  projectType: "website",
  budget: "3k_5k",
  timeline: "within_3_months",
  desiredDate: desired,
  message: "This is an automated staging test inquiry. It contains no customer data.",
  privacyNoticeVersion: "unpublished",
  meta: { ip: "192.0.2.10" },
};

const results = [];
const check = (label, ok, result) => results.push({ label, ok, result });

const first = await send(payload);
check("New submission is confirmed (202)", first.status === 202 && first.body?.duplicate === false, first);

const retry = await send({ ...payload, submittedAt: new Date(Date.now() + 1500).toISOString(), test: true, meta: { ip: "192.0.2.11" } }, { offset: 2 });
check(
  "Retry of the same submission is confirmed as a duplicate with the same reference",
  retry.status === 202 && retry.body?.duplicate === true && retry.body?.reference === first.body?.reference,
  retry,
);

const changed = await send({ ...payload, message: "This automated staging test changes the message for the same id." });
check("Same id with different answers is refused (409)", changed.status === 409, changed);

const forged = await send(payload, { secretOverride: "not-the-real-secret-but-long-enough-000" });
check("Wrong signature is refused by Studio OS (401)", forged.status === 401 && forged.fromStudioOs, forged);

for (const { label, ok, result } of results) console.log(`${ok ? "PASS" : "FAIL"}  ${label}  (${describe(result)})`);
if (first.body?.reference) console.log(`\nStored test inquiry: ${first.body.reference} (contact "Staging test ${run}")`);
if (first.fromStudioOs && first.status === 401) {
  console.log(
    "\nStudio OS refused the signature. The secret or key id in your settings differs from INQUIRY_SIGNING_KEYS in the Vercel environment this deployment uses (Production for main, Preview for branches), or your computer's clock is more than 5 minutes off. Vercel's logs for /api/inquiries name the reason.",
  );
}
process.exit(results.every((r) => r.ok) ? 0 : 1);

/** An unsigned request: Studio OS answers 401 "unauthorized" when it is reachable and configured. */
async function preflight() {
  const result = await post("{}", { "content-type": "application/json" });
  if (result.status === 0) stop(`Could not reach ${appUrl} (${result.error}). Check the address and your internet connection.`);
  if (!result.fromStudioOs) {
    if (result.status === 404) stop("This deployment has no /api/inquiries. Use a deployment of main from after 28 October 2026, or the staging domain.");
    if (isProtection(result)) {
      stop(
        bypass
          ? `Vercel Deployment Protection blocked the request (HTTP ${result.status}) although a bypass token was sent. The token must be the "Protection Bypass for Automation" secret of the studio-os-staging project, pasted in full. If you created it just now, copy it again from Vercel → studio-os-staging → Settings → Deployment Protection.`
          : `Vercel Deployment Protection blocked the request (HTTP ${result.status}) before it reached Studio OS. Add STAGING_PROTECTION_BYPASS to ${SETTINGS_FILE}.`,
      );
    }
    stop(`Something other than Studio OS answered (HTTP ${result.status}). Check STAGING_APP_URL.`);
  }
  if (result.status === 503) {
    stop(
      "Studio OS answered, but website inquiries are not configured on this deployment. In Vercel, add INQUIRY_SIGNING_KEYS, INQUIRY_STUDIO_ID and INQUIRY_HASH_KEY to the environment this deployment uses (Production for deployments of main), then redeploy.",
    );
  }
  if (result.status !== 401) stop(`Studio OS gave an unexpected answer to an unsigned request (HTTP ${result.status}).`);
  console.log("Reached Studio OS, and website inquiries are configured.\n");
}

async function send(body, { offset = 0, secretOverride } = {}) {
  const text = JSON.stringify(body);
  const timestamp = Math.floor(Date.now() / 1000) + offset;
  const signature = "v1=" + createHmac("sha256", secretOverride ?? secret).update(`${timestamp}.${text}`).digest("hex");
  return post(text, {
    "content-type": "application/json",
    "studio-key-id": keyId,
    "studio-timestamp": String(timestamp),
    "studio-signature": signature,
    "idempotency-key": body.submissionId,
  });
}

async function post(text, headers) {
  if (bypass) headers["x-vercel-protection-bypass"] = bypass;
  try {
    const response = await fetch(endpoint, { method: "POST", headers, body: text, redirect: "manual", signal: AbortSignal.timeout(15_000) });
    const isJson = (response.headers.get("content-type") ?? "").includes("application/json");
    const json = isJson ? await response.json().catch(() => null) : null;
    // Studio OS always answers this route with a small JSON object carrying "status" or "error".
    const fromStudioOs = json !== null && typeof json === "object" && ("error" in json || "status" in json);
    return { status: response.status, body: json, fromStudioOs, location: response.headers.get("location") ?? "" };
  } catch (error) {
    return { status: 0, body: null, fromStudioOs: false, error: error?.cause?.code ?? error?.name ?? "request failed" };
  }
}

function isProtection(result) {
  return [301, 302, 303, 307, 308, 401, 403].includes(result.status);
}

function describe(result) {
  if (result.status === 0) return `no response: ${result.error}`;
  if (!result.fromStudioOs) return `HTTP ${result.status} from Vercel, not Studio OS${isProtection(result) ? ": blocked by Deployment Protection" : ""}`;
  const { reference, duplicate, error } = result.body;
  return [`HTTP ${result.status}`, error, reference, duplicate === undefined ? null : `duplicate: ${duplicate}`].filter(Boolean).join(", ");
}

/** The signing key: the first pair of INQUIRY_SIGNING_KEYS, else STAGING_INQUIRY_KEY_ID / STAGING_INQUIRY_SECRET. */
function signingKey() {
  const pair = value(process.env.INQUIRY_SIGNING_KEYS)?.split(",")[0];
  if (pair !== undefined) {
    const at = pair.indexOf(":");
    return at < 1 ? {} : { keyId: unquote(pair.slice(0, at)), secret: unquote(pair.slice(at + 1)) };
  }
  return { keyId: value(process.env.STAGING_INQUIRY_KEY_ID), secret: value(process.env.STAGING_INQUIRY_SECRET) };
}

/** Reads KEY=value lines from .env.inquiry.local, creating the file with empty values the first time. Non-empty file values win over the shell. */
function loadSettingsFile() {
  if (!existsSync(SETTINGS_FILE)) {
    writeFileSync(SETTINGS_FILE, TEMPLATE, { mode: 0o600 });
    stop(`Created ${SETTINGS_FILE}.\nOpen it in your editor, fill in the empty values, save it, and run npm run staging:inquiry again.`);
  }
  for (const line of readFileSync(SETTINGS_FILE, "utf8").split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=(.*)$/.exec(line);
    if (match && unquote(match[2])) process.env[match[1]] = unquote(match[2]);
  }
}

function value(raw) {
  return raw === undefined ? undefined : unquote(raw) || undefined;
}

/** Trims spaces and one pair of surrounding quotes, which are easy to paste by accident. */
function unquote(raw) {
  const trimmed = raw.trim();
  return /^(["']).*\1$/.test(trimmed) && trimmed.length >= 2 ? trimmed.slice(1, -1).trim() : trimmed;
}

function stop(message) {
  console.error(message);
  process.exit(1);
}
