#!/usr/bin/env node
/**
 * Sends signed TEST inquiries to a deployed Studio OS (staging or a PR
 * preview), exactly as the Axivo website's server would, and checks the
 * answers. It writes one inquiry, marked as a test, with invented data.
 *
 *   STAGING_INQUIRY=1 \
 *   STAGING_APP_URL=https://<studio-os-preview-or-staging> \
 *   STAGING_INQUIRY_KEY_ID=axivo-staging-1 \
 *   STAGING_INQUIRY_SECRET=… \            # from your own shell or password manager, never committed
 *   npm run staging:inquiry
 *
 * Optional: STAGING_PROTECTION_BYPASS (Vercel "Protection Bypass for
 * Automation"), when Deployment Protection is on.
 *
 * Checks, in order: a new submission gets 202; a retry with a new submittedAt,
 * IP, test flag and signature time gets 202 with duplicate: true and the same
 * reference; the same id with a changed message gets 409; a wrong signature
 * gets 401. Prints statuses and the reference only, never the secret.
 */
import { createHmac, randomUUID } from "node:crypto";

const env = process.env;
const appUrl = env.STAGING_APP_URL?.trim().replace(/\/+$/, "");
const keyId = env.STAGING_INQUIRY_KEY_ID?.trim();
const secret = env.STAGING_INQUIRY_SECRET?.trim();
const bypass = env.STAGING_PROTECTION_BYPASS?.trim();

if (env.STAGING_INQUIRY !== "1") stop("Set STAGING_INQUIRY=1 to confirm that one test inquiry may be written to this deployment.");
if (!appUrl || !keyId || !secret) stop("STAGING_APP_URL, STAGING_INQUIRY_KEY_ID and STAGING_INQUIRY_SECRET must be set.");
if (/(^|\.)axivo\.fi$/i.test(new URL(appUrl).hostname)) stop("STAGING_APP_URL points at the Axivo website. It must be the Studio OS deployment.");

const endpoint = `${appUrl}/api/inquiries`;
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
const check = (label, ok, detail) => results.push({ label, ok, detail });

const first = await send(payload);
check("New submission is confirmed (202)", first.status === 202 && first.body?.duplicate === false, describe(first));

const retry = await send({ ...payload, submittedAt: new Date(Date.now() + 1500).toISOString(), test: true, meta: { ip: "192.0.2.11" } }, { offset: 2 });
check(
  "Retry of the same submission is confirmed as a duplicate with the same reference",
  retry.status === 202 && retry.body?.duplicate === true && retry.body?.reference === first.body?.reference,
  describe(retry),
);

const changed = await send({ ...payload, message: "This automated staging test changes the message for the same id." });
check("Same id with different answers is refused (409)", changed.status === 409, describe(changed));

const forged = await send(payload, { secretOverride: "not-the-real-secret-but-long-enough-000" });
check("Wrong signature is refused (401)", forged.status === 401, describe(forged));

for (const { label, ok, detail } of results) console.log(`${ok ? "PASS" : "FAIL"}  ${label}  (${detail})`);
if (first.body?.reference) console.log(`\nStored test inquiry: ${first.body.reference} (contact "Staging test ${run}")`);
process.exit(results.every((r) => r.ok) ? 0 : 1);

async function send(body, { offset = 0, secretOverride } = {}) {
  const text = JSON.stringify(body);
  const timestamp = Math.floor(Date.now() / 1000) + offset;
  const signature = "v1=" + createHmac("sha256", secretOverride ?? secret).update(`${timestamp}.${text}`).digest("hex");
  const headers = {
    "content-type": "application/json",
    "studio-key-id": keyId,
    "studio-timestamp": String(timestamp),
    "studio-signature": signature,
    "idempotency-key": body.submissionId,
  };
  if (bypass) headers["x-vercel-protection-bypass"] = bypass;
  try {
    const response = await fetch(endpoint, { method: "POST", headers, body: text, signal: AbortSignal.timeout(15_000) });
    const json = await response.json().catch(() => null);
    return { status: response.status, body: json };
  } catch (error) {
    return { status: 0, body: null, error: error?.cause?.code ?? error?.name ?? "request failed" };
  }
}

function describe(result) {
  if (result.status === 0) return `no response: ${result.error}`;
  const { reference, duplicate, error } = result.body ?? {};
  return [`HTTP ${result.status}`, error, reference, duplicate === undefined ? null : `duplicate: ${duplicate}`].filter(Boolean).join(", ");
}

function stop(message) {
  console.error(message);
  process.exit(1);
}
