import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { approveInquiry, inquiryClientName } from "@/lib/domain/inquiries";
import { testDeps } from "@/lib/domain/test-helpers";
import type { Inquiry } from "@/lib/domain/types";
import { parseInquiryPayload, type InquiryPayload } from "./contract";

/**
 * The shared fixtures in tests/fixtures/inquiries: the dry run's fictional
 * customer, the smallest payload the website sends, and the empty-string
 * mistake the contract refuses. Each is checked at its own submittedAt.
 */
function fixture(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(__dirname, "../../../tests/fixtures/inquiries", `${name}.json`), "utf8"));
}

function parse(name: string) {
  const payload = fixture(name);
  return parseInquiryPayload(payload, new Date(payload.submittedAt as string));
}

/** The inquiry as Studio OS stores and loads it, before anyone decides. */
function stored(payload: InquiryPayload): Inquiry {
  return {
    id: "inq-dry-run",
    status: "new",
    isTest: payload.test ?? false,
    locale: payload.locale,
    contactName: payload.contact.name,
    email: payload.contact.email,
    company: payload.contact.company ?? null,
    website: payload.contact.website ?? null,
    service: payload.service,
    projectType: payload.projectType ?? null,
    budget: payload.budget ?? null,
    budgetAmount: payload.budgetAmount ?? null,
    timeline: payload.timeline ?? null,
    desiredDate: payload.desiredDate ?? null,
    message: payload.message,
    receivedAt: payload.submittedAt,
    clientId: null,
    createdClient: false,
    decidedBy: null,
    decidedAt: null,
    decisionReason: null,
    repeatOf: null,
  };
}

function accepted(name: string): InquiryPayload {
  const result = parse(name);
  if (!result.ok) throw new Error(`${name} was refused: ${result.fields.join(", ")}`);
  return result.inquiry;
}

describe("inquiry fixtures", () => {
  it("every fixture is marked as a test, with reserved addresses only", () => {
    for (const name of ["dry-run-customer", "dry-run-minimal", "empty-optional-strings"]) {
      const payload = fixture(name) as { test: boolean; contact: { name: string; email: string } };
      expect(payload.test).toBe(true);
      expect(payload.contact.name).toContain("(TEST)");
      expect(payload.contact.email).toMatch(/@example\.com$/);
    }
  });

  it("accepts the dry-run customer with every optional field", () => {
    expect(accepted("dry-run-customer")).toMatchObject({ budget: "3k_5k", projectType: "website", desiredDate: "2027-01-15", contact: { company: "Dry Run Bakery (TEST)" } });
  });

  it("accepts the minimal payload with every optional field left out", () => {
    const inquiry = accepted("dry-run-minimal");
    for (const key of ["projectType", "budget", "budgetAmount", "timeline", "desiredDate", "meta"] as const) expect(inquiry[key]).toBeUndefined();
    expect(inquiry.contact.company).toBeUndefined();
    expect(inquiry.contact.website).toBeUndefined();
  });

  it("refuses optional fields sent as empty strings, naming each field", () => {
    expect(parse("empty-optional-strings")).toEqual({
      ok: false,
      fields: ["budget", "contact.company", "contact.website", "desiredDate", "projectType", "timeline"],
    });
  });
});

describe("approving the dry-run inquiries", () => {
  it("the full inquiry becomes a website client with observed budget and timing and a draft onboarding", () => {
    const inquiry = stored(accepted("dry-run-customer"));
    const approval = approveInquiry(inquiry, inquiryClientName(inquiry), testDeps());
    expect(approval.client).toMatchObject({ name: "Dry Run Bakery (TEST)", contactPerson: "Testi Testinen (TEST)", status: "onboarding", projectType: "website" });
    expect(approval.client.context.budget).toMatchObject({ value: "€3,000–€5,000 (indicative)", confidence: "observed" });
    expect(approval.client.context.deadline).toMatchObject({ confidence: "observed" });
    expect(approval.client.context.deadline.value).toBe("Within 3 months; desired date 2027-01-15");
    expect(approval.items).toEqual([]);
    expect(approval.onboarding.status).toBe("draft");
  });

  it("the minimal inquiry becomes a client named after the person, with nothing guessed", () => {
    const inquiry = stored(accepted("dry-run-minimal"));
    const approval = approveInquiry(inquiry, inquiryClientName(inquiry), testDeps());
    expect(approval.client).toMatchObject({ name: "Minimi Testaaja (TEST)", website: null, status: "onboarding", projectType: null });
    expect(approval.client.context.budget.confidence).toBe("unknown");
    expect(approval.client.context.deadline.confidence).toBe("unknown");
    expect(approval.items).toEqual([]);
    expect(approval.source.content).toMatch(/^Language: Finnish\n\nTEST INQUIRY/);
    expect(approval.onboarding.status).toBe("draft");
  });
});
