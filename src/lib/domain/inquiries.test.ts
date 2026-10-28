import { describe, expect, it } from "vitest";
import { createSeedSnapshot } from "@/lib/data/seed";
import { buildNewClient, DomainConflictError, DomainError, setContextField } from "./clients";
import {
  approveInquiry,
  compareInquiryToClient,
  DISCUSS_BUDGET_QUESTION,
  findInquiryMatches,
  getOpenInquiries,
  inquiryBriefValues,
  inquiryProjectType,
  inquirySourceLabel,
  linkInquiry,
  websiteDomain,
} from "./inquiries";
import { getDecisions } from "./insights";
import { testDeps } from "./test-helpers";
import type { Inquiry } from "./types";

function inquiry(overrides: Partial<Inquiry> = {}): Inquiry {
  return {
    id: "inq-1",
    status: "new",
    isTest: true,
    locale: "sv",
    contactName: "Maja Lind",
    email: "Maja@Example.com",
    company: "Lumen Yoga (test)",
    website: "lumenyoga.example",
    service: "websites",
    projectType: "website",
    budget: "3k_5k",
    budgetAmount: null,
    timeline: "within_3_months",
    desiredDate: "2027-03-15",
    message: "Vi vill ha en ny webbplats med bokning av klasser.",
    receivedAt: "2026-10-28T09:30:12.000Z",
    clientId: null,
    createdClient: false,
    decidedBy: null,
    decidedAt: null,
    decisionReason: null,
    ...overrides,
  };
}

describe("inquiry values", () => {
  it("records ranges as indicative, custom amounts in euros, and leaves not sure unknown", () => {
    expect(inquiryBriefValues(inquiry()).budget).toEqual({ value: "€3,000–€5,000 (indicative)", note: "Indicative range chosen on the website form" });
    expect(inquiryBriefValues(inquiry({ budget: "custom", budgetAmount: 12500 })).budget?.value).toBe("€12,500");
    expect(inquiryBriefValues(inquiry({ budget: "not_sure" })).budget).toBeUndefined();
    expect(inquiryBriefValues(inquiry({ budget: null })).budget).toBeUndefined();
  });

  it("combines timing and a desired date, or uses either alone", () => {
    expect(inquiryBriefValues(inquiry()).deadline?.value).toBe("Within 3 months; desired date 2027-03-15");
    expect(inquiryBriefValues(inquiry({ timeline: null })).deadline?.value).toBe("Desired date 2027-03-15");
    expect(inquiryBriefValues(inquiry({ desiredDate: null, timeline: "asap" })).deadline?.value).toBe("As soon as possible");
    expect(inquiryBriefValues(inquiry({ desiredDate: null, timeline: null })).deadline).toBeUndefined();
  });

  it("maps the project type, falling back to the service", () => {
    expect(inquiryProjectType(inquiry({ projectType: "ecommerce" }))).toBe("ecommerce");
    expect(inquiryProjectType(inquiry({ projectType: "not_sure" }))).toBeNull();
    expect(inquiryProjectType(inquiry({ service: "marketing", projectType: null }))).toBe("other");
    expect(inquiryProjectType(inquiry({ service: "other", projectType: null }))).toBeNull();
  });

  it("labels the source with the day it arrived in Helsinki", () => {
    expect(inquirySourceLabel(inquiry({ receivedAt: "2026-10-28T22:30:00.000Z" }))).toBe("Website inquiry · 29 Oct 2026");
  });
});

describe("approveInquiry", () => {
  it("creates an onboarding client with observed values that point back to the inquiry", () => {
    const deps = testDeps({ kind: "human", name: "Alex", userId: "user-1" });
    const result = approveInquiry(inquiry(), "Lumen Yoga", deps);
    const { client } = result;

    expect(client).toMatchObject({
      name: "Lumen Yoga",
      contactPerson: "Maja Lind",
      email: "Maja@Example.com",
      website: "lumenyoga.example",
      status: "onboarding",
      projectType: "website",
      source: { type: "contact_form", initialNotes: inquiry().message, receivedAt: inquiry().receivedAt },
    });
    const source = { type: "contact_form", label: "Website inquiry · 28 Oct 2026", inquiryId: "inq-1" };
    expect(client.context.budget).toMatchObject({ value: "€3,000–€5,000 (indicative)", confidence: "observed", source, recordedBy: deps.actor });
    expect(client.context.deadline).toMatchObject({ value: "Within 3 months; desired date 2027-03-15", confidence: "observed", source });
    // The message is source material, never a goal or any other brief value.
    expect(client.context.goal.value).toBeNull();
    expect(Object.values(client.context).filter((f) => f.value !== null)).toHaveLength(2);
    expect(result.source).toMatchObject({ clientId: client.id, type: "contact_form", label: source.label, content: `Language: Swedish\n\n${inquiry().message}` });
    expect(result.onboarding).toMatchObject({ clientId: client.id, status: "draft", currentStep: "business" });
    expect(result.items).toEqual([]);
    expect(result.events.map((e) => e.eventType)).toEqual(["client.created", "client.context_updated", "source.received", "onboarding.started"]);
    expect(result.events.every((e) => e.actor === deps.actor && e.entityId === client.id)).toBe(true);
  });

  it("asks to discuss the budget when the customer was not sure, instead of guessing one", () => {
    const result = approveInquiry(inquiry({ budget: "not_sure" }), "Lumen Yoga", testDeps());
    expect(result.client.context.budget.value).toBeNull();
    expect(result.items.map((i) => i.text)).toEqual([DISCUSS_BUDGET_QUESTION]);
  });

  it("refuses a decided inquiry, an agent, and an empty name", () => {
    expect(() => approveInquiry(inquiry({ status: "rejected" }), "Lumen", testDeps())).toThrow(DomainConflictError);
    expect(() => approveInquiry(inquiry(), "Lumen", testDeps({ kind: "agent", agentId: "research" }))).toThrow(DomainError);
    expect(() => approveInquiry(inquiry(), "  ", testDeps())).toThrow("Enter the company or client name.");
  });
});

describe("linkInquiry", () => {
  const deps = testDeps();

  it("fills only empty details and unknown values, and never overwrites", () => {
    let existing = buildNewClient({ name: "Lumen Yoga", email: "info@lumenyoga.example" }, deps).client;
    existing = setContextField(existing, "budget", { value: "SEK 50,000", confidence: "confirmed" }, deps).client;

    const result = linkInquiry(inquiry(), existing, deps);
    expect(result.client.email).toBe("info@lumenyoga.example");
    expect(result.client.contactPerson).toBe("Maja Lind");
    expect(result.client.website).toBe("lumenyoga.example");
    expect(result.detailsChanged).toBe(true);
    expect(result.client.context.budget).toMatchObject({ value: "SEK 50,000", confidence: "confirmed" });
    expect(result.changedFields).toEqual(["deadline"]);
    expect(result.client.context.deadline.source).toMatchObject({ inquiryId: "inq-1" });
    expect(result.client.status).toBe(existing.status);
    expect(result.source.clientId).toBe(existing.id);

    expect(compareInquiryToClient(inquiry(), existing)).toEqual([
      { label: "Email", inquiry: "Maja@Example.com", client: "info@lumenyoga.example" },
      { label: "Budget", inquiry: "€3,000–€5,000 (indicative)", client: "SEK 50,000" },
    ]);
  });

  it("changes no details when the client already has them", () => {
    const existing = buildNewClient({ name: "Lumen", contactPerson: "Someone", email: "a@b.example", website: "other.example" }, deps).client;
    const result = linkInquiry(inquiry({ timeline: null, desiredDate: null, budget: null }), existing, deps);
    expect(result.detailsChanged).toBe(false);
    expect(result.changedFields).toEqual([]);
    expect(result.events.map((e) => e.eventType)).toEqual(["source.received"]);
  });
});

describe("findInquiryMatches", () => {
  const deps = testDeps();
  const byEmail = buildNewClient({ name: "Studio Lind", email: "maja@example.com" }, deps).client;
  const byWebsite = buildNewClient({ name: "LY", website: "https://www.lumenyoga.example/about" }, deps).client;
  const byName = buildNewClient({ name: "lumen  yoga (test)" }, deps).client;
  const byContact = buildNewClient({ name: "Other business", contactPerson: "maja lind" }, deps).client;
  const unrelated = buildNewClient({ name: "Nordvik", email: "x@nordvik.example" }, deps).client;

  it("finds the same email, website domain or name, strongest first", () => {
    const matches = findInquiryMatches(inquiry(), [unrelated, byContact, byName, byWebsite, byEmail]);
    expect(matches.map((m) => [m.client.name, m.reasons])).toEqual([
      ["Studio Lind", ["email"]],
      ["LY", ["website"]],
      ["lumen  yoga (test)", ["name"]],
      ["Other business", ["contact"]],
    ]);
    expect(websiteDomain("HTTPS://www.Example.com:8080/x")).toBe("example.com");
  });
});

describe("open inquiries", () => {
  it("are decisions on Today, whatever the budget, and decided ones are not", () => {
    const snapshot = {
      ...createSeedSnapshot(),
      inquiries: [
        inquiry({ id: "small", budget: "under_1k", company: null, contactName: "Small Shop" }),
        inquiry({ id: "done", status: "approved", clientId: "c" }),
        inquiry({ id: "later", receivedAt: "2026-10-29T09:00:00.000Z", isTest: false, company: "Fjord" }),
      ],
    };
    expect(getOpenInquiries(snapshot).map((i) => i.id)).toEqual(["later", "small"]);
    const decisions = getDecisions(snapshot).filter((d) => d.kind === "inquiry");
    expect(decisions.map((d) => [d.title, d.where, d.href])).toEqual([
      ["New inquiry from Fjord", "Website inquiry · Website · Within 3 months", "/inquiries/later"],
      ["New inquiry from Small Shop", "Test inquiry · Website · Within 3 months", "/inquiries/small"],
    ]);
    expect(getDecisions(snapshot)[0].kind).toBe("inquiry");
  });
});
