/**
 * Website inquiries: the request the Axivo website's server sends to
 * POST /api/inquiries (handoff contract v1, revision 3).
 *
 * The ids below are the contract between the two sites. Labels can change on
 * either side; ids change only with a new contract version. The Axivo
 * website keeps its own copy of this schema (src/lib/contact/schema.ts there),
 * so both validate the same payload.
 */
import { z } from "zod";
import { isValidWebAddress } from "@/lib/domain/validation";

export const INQUIRY_SOURCES = ["axivo_website"] as const;
export const INQUIRY_LOCALES = ["en", "sv", "fi"] as const;
export const INQUIRY_SERVICES = ["websites", "marketing", "other"] as const;
export const INQUIRY_PROJECT_TYPES = ["website", "ecommerce", "website_ecommerce", "brand_website", "not_sure"] as const;
/** Indicative ranges, not prices. Nothing in Studio OS rejects or ranks an inquiry by budget. */
export const INQUIRY_BUDGETS = ["under_1k", "1k_3k", "3k_5k", "5k_10k", "over_10k", "not_sure", "custom"] as const;
export const INQUIRY_TIMELINES = ["asap", "within_3_months", "3_6_months", "flexible"] as const;

export const BUDGET_AMOUNT = { min: 100, max: 10_000_000 } as const;
export const INQUIRY_LIMITS = { name: 100, email: 254, company: 120, website: 254, messageMin: 20, messageMax: 4000, privacyNoticeVersion: 40, ip: 64 } as const;
/** Request bodies larger than this are refused before they are parsed. */
export const MAX_INQUIRY_BODY_BYTES = 16 * 1024;
/** How far submittedAt may be from the server's clock. */
export const SUBMITTED_AT_TOLERANCE_MS = 24 * 60 * 60 * 1000;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Control characters and invisible bidi or zero-width characters. Multi-line text may keep newlines and tabs. */
function hasUnsafeCharacters(value: string, multiline: boolean): boolean {
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (multiline && (ch === "\n" || ch === "\t")) continue;
    if (code < 0x20 || code === 0x7f || (code >= 0x200b && code <= 0x200f) || (code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069)) {
      return true;
    }
  }
  return false;
}

const singleLine = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((v) => !hasUnsafeCharacters(v, false), "Contains control characters.");

/** True for a YYYY-MM-DD string that names a real calendar day. */
export function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function addYears(date: string, years: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y + years, m - 1, d)).toISOString().slice(0, 10);
}

/**
 * The website checks the desired date against today in Helsinki. Studio OS
 * allows a day either way around the UTC date of submittedAt, so time zones
 * never turn a valid date into an error.
 */
export function desiredDateWindow(submittedAt: Date): { min: string; max: string } {
  const day = submittedAt.toISOString().slice(0, 10);
  return { min: addDays(day, -1), max: addDays(addYears(day, 3), 1) };
}

const payloadShape = z.strictObject({
  version: z.literal(1),
  source: z.enum(INQUIRY_SOURCES),
  submissionId: z.uuid(),
  submittedAt: z.iso.datetime({ offset: true }),
  test: z.boolean().optional(),
  locale: z.enum(INQUIRY_LOCALES),
  contact: z.strictObject({
    name: singleLine(INQUIRY_LIMITS.name),
    email: singleLine(INQUIRY_LIMITS.email).regex(EMAIL_PATTERN, "Not an email address."),
    company: singleLine(INQUIRY_LIMITS.company).optional(),
    website: singleLine(INQUIRY_LIMITS.website).refine(isValidWebAddress, "Not a web address.").optional(),
  }),
  service: z.enum(INQUIRY_SERVICES),
  projectType: z.enum(INQUIRY_PROJECT_TYPES).optional(),
  budget: z.enum(INQUIRY_BUDGETS).optional(),
  budgetAmount: z.int().min(BUDGET_AMOUNT.min).max(BUDGET_AMOUNT.max).optional(),
  timeline: z.enum(INQUIRY_TIMELINES).optional(),
  desiredDate: z.string().refine(isCalendarDate, "Not a YYYY-MM-DD date.").optional(),
  message: z
    .string()
    .trim()
    .min(INQUIRY_LIMITS.messageMin)
    .max(INQUIRY_LIMITS.messageMax)
    .refine((v) => !hasUnsafeCharacters(v, true), "Contains control characters."),
  privacyNoticeVersion: singleLine(INQUIRY_LIMITS.privacyNoticeVersion).optional(),
  meta: z.strictObject({ ip: singleLine(INQUIRY_LIMITS.ip).optional() }).optional(),
});

export type InquiryPayload = z.output<typeof payloadShape>;

export type InquiryParseResult = { ok: true; inquiry: InquiryPayload } | { ok: false; fields: string[] };

/**
 * Validates a decoded request body against the contract. `fields` names what
 * was wrong (paths such as "contact.website"), never the submitted values.
 * A project type sent with another service than websites is dropped, as the
 * contract says, rather than refused.
 */
export function parseInquiryPayload(input: unknown, now: Date): InquiryParseResult {
  const parsed = payloadShape.safeParse(input);
  if (!parsed.success) return { ok: false, fields: fieldsOf(parsed.error.issues) };
  const inquiry = parsed.data;
  const fields: string[] = [];

  const submittedAt = new Date(inquiry.submittedAt);
  if (Math.abs(submittedAt.getTime() - now.getTime()) > SUBMITTED_AT_TOLERANCE_MS) fields.push("submittedAt");
  if ((inquiry.budget === "custom") !== (inquiry.budgetAmount !== undefined)) fields.push("budgetAmount");
  if (inquiry.desiredDate !== undefined) {
    const { min, max } = desiredDateWindow(submittedAt);
    if (inquiry.desiredDate < min || inquiry.desiredDate > max) fields.push("desiredDate");
  }
  if (fields.length) return { ok: false, fields };

  if (inquiry.service !== "websites" && inquiry.projectType !== undefined) {
    return { ok: true, inquiry: { ...inquiry, projectType: undefined } };
  }
  return { ok: true, inquiry };
}

function fieldsOf(issues: z.core.$ZodIssue[]): string[] {
  const fields = new Set<string>();
  for (const issue of issues) {
    if (issue.code === "unrecognized_keys") {
      for (const key of issue.keys) fields.add([...issue.path, key].join("."));
    } else {
      fields.add(issue.path.join(".") || "body");
    }
  }
  return [...fields].sort();
}

/**
 * The customer-entered fields of an inquiry as one canonical string: sorted
 * keys, absent values left out. Its SHA-256 is the inquiry's content hash.
 * submittedAt, meta.ip, test and the envelope (version, source, submissionId,
 * privacyNoticeVersion) are deliberately not part of it, so a retry of the
 * same submission always has the same hash.
 */
export function canonicalCustomerFields(inquiry: InquiryPayload): string {
  const customer = {
    contact: {
      name: inquiry.contact.name,
      email: inquiry.contact.email,
      company: inquiry.contact.company,
      website: inquiry.contact.website,
    },
    locale: inquiry.locale,
    service: inquiry.service,
    projectType: inquiry.projectType,
    budget: inquiry.budget,
    budgetAmount: inquiry.budgetAmount,
    timeline: inquiry.timeline,
    desiredDate: inquiry.desiredDate,
    message: inquiry.message,
  };
  return JSON.stringify(sortKeys(customer));
}

function sortKeys(value: unknown): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
      .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]),
  );
}
