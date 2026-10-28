import { describe, expect, it } from "vitest";
import {
  canonicalCustomerFields,
  desiredDateWindow,
  INQUIRY_BUDGETS,
  INQUIRY_PROJECT_TYPES,
  INQUIRY_TIMELINES,
  parseInquiryPayload,
} from "./contract";
import { examplePayload, INQUIRY_TEST_NOW } from "./test-helpers";

const now = INQUIRY_TEST_NOW;

const fieldsFor = (overrides: Record<string, unknown>) => {
  const result = parseInquiryPayload(examplePayload(overrides), now);
  return result.ok ? [] : result.fields;
};

describe("parseInquiryPayload", () => {
  it("accepts the handoff example", () => {
    expect(parseInquiryPayload(examplePayload(), now)).toMatchObject({ ok: true, inquiry: { budgetAmount: 4500, locale: "sv" } });
  });

  it("accepts the minimal payload the website sends", () => {
    const minimal = {
      version: 1, source: "axivo_website", submissionId: "6f1d2c1e-4b7a-4e0c-9a51-2f8d3c7b9e10", submittedAt: now.toISOString(),
      test: false, locale: "en", contact: { name: "Ann", email: "ann@example.com" }, service: "other",
      message: "Hello, we would like to talk about a project.", privacyNoticeVersion: "unpublished",
    };
    expect(parseInquiryPayload(minimal, now).ok).toBe(true);
  });

  it.each(INQUIRY_PROJECT_TYPES)("accepts project type %s", (projectType) => expect(fieldsFor({ projectType })).toEqual([]));
  it.each(INQUIRY_TIMELINES)("accepts timeline %s", (timeline) => expect(fieldsFor({ timeline })).toEqual([]));
  it.each(INQUIRY_BUDGETS.filter((b) => b !== "custom"))("accepts budget %s without an amount", (budget) =>
    expect(fieldsFor({ budget, budgetAmount: undefined })).toEqual([]),
  );

  it("refuses ids outside the contract", () => {
    expect(fieldsFor({ budget: "5k_15k", budgetAmount: undefined })).toEqual(["budget"]);
    expect(fieldsFor({ timeline: "soon" })).toEqual(["timeline"]);
    expect(fieldsFor({ service: "seo" })).toEqual(["service"]);
    expect(fieldsFor({ locale: "de" })).toEqual(["locale"]);
    expect(fieldsFor({ source: "elsewhere" })).toEqual(["source"]);
    expect(fieldsFor({ version: 2 })).toEqual(["version"]);
  });

  it("refuses unknown keys, at the top and inside contact and meta", () => {
    expect(fieldsFor({ phone: "123" })).toEqual(["phone"]);
    expect(fieldsFor({ contact: { name: "A", email: "a@example.com", role: "CEO" } })).toEqual(["contact.role"]);
    expect(fieldsFor({ meta: { ip: "203.0.113.7", userAgent: "x" } })).toEqual(["meta.userAgent"]);
  });

  it("requires an amount with custom, and only with custom", () => {
    expect(fieldsFor({ budget: "custom", budgetAmount: undefined })).toEqual(["budgetAmount"]);
    expect(fieldsFor({ budget: "3k_5k", budgetAmount: 4000 })).toEqual(["budgetAmount"]);
    expect(fieldsFor({ budget: undefined, budgetAmount: 4000 })).toEqual(["budgetAmount"]);
  });

  it("accepts whole euros from 100 to 10,000,000 only", () => {
    expect(fieldsFor({ budgetAmount: 100 })).toEqual([]);
    expect(fieldsFor({ budgetAmount: 10_000_000 })).toEqual([]);
    for (const budgetAmount of [99, 10_000_001, 12.5, "4500", -100]) expect(fieldsFor({ budgetAmount })).toEqual(["budgetAmount"]);
  });

  it("accepts a desired date within a day of the window around submittedAt", () => {
    expect(desiredDateWindow(now)).toEqual({ min: "2026-10-27", max: "2029-10-29" });
    expect(fieldsFor({ desiredDate: "2026-10-27" })).toEqual([]);
    expect(fieldsFor({ desiredDate: "2029-10-29" })).toEqual([]);
    expect(fieldsFor({ desiredDate: "2026-10-26" })).toEqual(["desiredDate"]);
    expect(fieldsFor({ desiredDate: "2029-10-30" })).toEqual(["desiredDate"]);
    expect(fieldsFor({ desiredDate: "2027-02-30" })).toEqual(["desiredDate"]);
    expect(fieldsFor({ desiredDate: "15-01-2027" })).toEqual(["desiredDate"]);
  });

  it("refuses a submittedAt more than a day from the server clock", () => {
    expect(fieldsFor({ submittedAt: "2026-10-26T09:00:00.000Z" })).toEqual(["submittedAt"]);
    expect(fieldsFor({ submittedAt: "yesterday" })).toEqual(["submittedAt"]);
  });

  it("checks contact details and the message", () => {
    expect(fieldsFor({ contact: { name: "Maja", email: "not-an-email" } })).toEqual(["contact.email"]);
    expect(fieldsFor({ contact: { name: "Maja", email: "maja@example.com", website: "not a site" } })).toEqual(["contact.website"]);
    expect(fieldsFor({ contact: { name: "  ", email: "maja@example.com" } })).toEqual(["contact.name"]);
    expect(fieldsFor({ contact: { name: "Maja‮", email: "maja@example.com" } })).toEqual(["contact.name"]);
    expect(fieldsFor({ message: "Too short" })).toEqual(["message"]);
    expect(fieldsFor({ message: "x".repeat(4001) })).toEqual(["message"]);
    expect(fieldsFor({ message: "Line one of the message\nand line two." })).toEqual([]);
  });

  it("drops a project type sent with a service other than websites", () => {
    const result = parseInquiryPayload(examplePayload({ service: "marketing" }), now);
    expect(result).toMatchObject({ ok: true });
    if (result.ok) expect(result.inquiry.projectType).toBeUndefined();
  });

  it("never echoes submitted values in its errors", () => {
    const result = parseInquiryPayload(examplePayload({ contact: { name: "Maja", email: "secret-address" } }), now);
    expect(JSON.stringify(result)).not.toContain("secret-address");
  });
});

describe("canonicalCustomerFields", () => {
  const canonical = (overrides: Record<string, unknown> = {}) => {
    const result = parseInquiryPayload(examplePayload(overrides), now);
    if (!result.ok) throw new Error(result.fields.join());
    return canonicalCustomerFields(result.inquiry);
  };

  it("ignores submittedAt, meta.ip, test and the envelope", () => {
    const base = canonical();
    expect(canonical({ submittedAt: "2026-10-28T09:31:00.000Z" })).toBe(base);
    expect(canonical({ meta: { ip: "198.51.100.1" } })).toBe(base);
    expect(canonical({ meta: undefined })).toBe(base);
    expect(canonical({ test: false })).toBe(base);
    expect(canonical({ privacyNoticeVersion: "2026-11-01" })).toBe(base);
    expect(canonical({ submissionId: "7f1d2c1e-4b7a-4e0c-9a51-2f8d3c7b9e10" })).toBe(base);
  });

  it("changes when any customer answer changes", () => {
    const base = canonical();
    const changes: Record<string, unknown>[] = [
      { message: "Vi vill ha en ny webbplats med bokning av kurser." },
      { contact: { name: "Maja Lind", email: "maja@example.com", company: "Lumen Yoga (test)" } },
      { contact: { name: "Maja Lind", email: "other@example.com", company: "Lumen Yoga (test)", website: "lumenyoga.example" } },
      { locale: "fi" },
      { projectType: "ecommerce" },
      { budgetAmount: 4600 },
      { budget: "3k_5k", budgetAmount: undefined },
      { timeline: "asap" },
      { desiredDate: "2027-01-16" },
      { desiredDate: undefined },
    ];
    for (const change of changes) expect(canonical(change)).not.toBe(base);
  });

  it("does not depend on key order", () => {
    const reordered = Object.fromEntries(Object.entries(examplePayload()).reverse());
    const a = parseInquiryPayload(examplePayload(), now);
    const b = parseInquiryPayload(reordered, now);
    if (!a.ok || !b.ok) throw new Error("invalid");
    expect(canonicalCustomerFields(b.inquiry)).toBe(canonicalCustomerFields(a.inquiry));
  });

  it("uses the values after trimming", () => {
    expect(canonical({ message: "  Vi vill ha en ny webbplats med bokning av klasser.  " })).toBe(canonical());
  });
});
