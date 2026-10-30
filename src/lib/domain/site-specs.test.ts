import { describe, expect, it } from "vitest";
import { briefClient, completeSpec, websiteProject } from "@/lib/site-spec/test-helpers";
import { setContextField } from "./clients";
import {
  approveSiteSpec,
  isWebsiteProject,
  requestSiteSpecChanges,
  saveSiteSpecDraft,
  SiteSpecInvalidError,
  startSiteSpec,
  submitSiteSpec,
} from "./site-specs";
import { testDeps } from "./test-helpers";
import type { SiteSpecRecord } from "./types";

const agent = testDeps({ kind: "agent", agentId: "design" });

function approvedV1() {
  const client = briefClient();
  const project = websiteProject(client);
  const started = startSiteSpec(client, project, [], testDeps()).record;
  const saved = saveSiteSpecDraft(started, completeSpec(client), testDeps()).record;
  const submitted = submitSiteSpec(saved, client, testDeps()).record;
  const approved = approveSiteSpec(submitted, client, null, testDeps()).record;
  return { client, project, approved };
}

describe("starting a website spec", () => {
  it("starts version 1 from the brief, as a draft, with an event on the project", () => {
    const client = briefClient();
    const project = websiteProject(client);
    const { record, event } = startSiteSpec(client, project, [], testDeps());
    expect(record).toMatchObject({ version: 1, status: "draft", basedOn: null, clientId: client.id, projectId: project.id, createdBy: { kind: "human", name: "Alex" } });
    expect(record.spec.strategy.goal.source).toMatchObject({ kind: "brief", field: "goal" });
    expect(event).toMatchObject({ entityType: "project", entityId: project.id, eventType: "site_spec.created", description: "Started website spec v1 from the brief" });
  });

  it("returns the open version instead of starting a second one", () => {
    const client = briefClient();
    const project = websiteProject(client);
    const first = startSiteSpec(client, project, [], testDeps()).record;
    expect(startSiteSpec(client, project, [first], testDeps())).toEqual({ record: first, event: null });
  });

  it("starts the next version as a copy of the approved one", () => {
    const { client, project, approved } = approvedV1();
    const { record, event } = startSiteSpec(client, project, [approved], testDeps());
    expect(record).toMatchObject({ version: 2, basedOn: approved.id, status: "draft" });
    expect(record.spec).toEqual(approved.spec);
    expect(record.spec).not.toBe(approved.spec);
    expect(event?.description).toBe("Started website spec v2 from v1");
  });

  it("refuses agents, other clients' projects and projects that are not websites", () => {
    const client = briefClient();
    expect(() => startSiteSpec(client, websiteProject(client), [], agent)).toThrow(/Only a person/);
    expect(() => startSiteSpec({ ...briefClient(), id: "another-client" }, websiteProject(client), [], testDeps())).toThrow(/another client/);
    expect(() => startSiteSpec(client, websiteProject(client, "other"), [], testDeps())).toThrow(/Only website projects/);
    expect(isWebsiteProject({ projectType: "brand_website" })).toBe(true);
  });
});

describe("editing a draft", () => {
  it("saves a valid spec and records an edit, but not when nothing changed", () => {
    const client = briefClient();
    const draft = startSiteSpec(client, websiteProject(client), [], testDeps()).record;
    const spec = completeSpec(client);
    const { record, event } = saveSiteSpecDraft(draft, spec, testDeps());
    expect(record.spec).toEqual(spec);
    expect(event).toMatchObject({ eventType: "site_spec.updated", description: "Edited website spec v1" });
    expect(saveSiteSpecDraft(record, spec, testDeps()).event).toBeNull();
  });

  it("refuses an invalid spec with every problem listed", () => {
    const client = briefClient();
    const draft = startSiteSpec(client, websiteProject(client), [], testDeps()).record;
    const spec = completeSpec(client);
    spec.brand.colors.primary = "red";
    spec.pages[1].seo.title.en = "x".repeat(61);
    try {
      saveSiteSpecDraft(draft, spec, testDeps());
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(SiteSpecInvalidError);
      expect((error as SiteSpecInvalidError).issues.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("refuses edits to versions that are not drafts, and edits by agents", () => {
    const { client, approved } = approvedV1();
    expect(() => saveSiteSpecDraft(approved, completeSpec(client), testDeps())).toThrow(/Approved versions cannot change/);
    const draft = { ...approved, status: "draft" } as SiteSpecRecord;
    expect(() => saveSiteSpecDraft(draft, completeSpec(client), agent)).toThrow(/Only a person/);
  });
});

describe("review and approval", () => {
  it("submits, sends back with a note, and submits again", () => {
    const client = briefClient();
    const draft = saveSiteSpecDraft(startSiteSpec(client, websiteProject(client), [], testDeps()).record, completeSpec(client), testDeps()).record;
    const submitted = submitSiteSpec(draft, client, testDeps());
    expect(submitted.record).toMatchObject({ status: "in_review", submittedBy: { name: "Alex" }, submittedAt: "2026-10-26T12:00:00.000Z" });
    expect(submitted.event.eventType).toBe("site_spec.submitted");
    const back = requestSiteSpecChanges(submitted.record, "  Shorter hero heading  ", testDeps());
    expect(back.record).toMatchObject({ status: "draft", submittedBy: null, submittedAt: null, reviewNote: "Shorter hero heading" });
    expect(back.event.eventType).toBe("site_spec.changes_requested");
    expect(submitSiteSpec(back.record, client, testDeps()).record.reviewNote).toBeNull();
  });

  it("refuses to submit or approve while something blocks approval", () => {
    const client = briefClient();
    const draft = startSiteSpec(client, websiteProject(client), [], testDeps()).record;
    expect(() => submitSiteSpec(draft, client, testDeps())).toThrow(/before it can be submitted/);
    const inReview = { ...saveSiteSpecDraft(draft, completeSpec(client), testDeps()).record, status: "in_review" as const };
    const unconfirmed = setContextField(client, "goal", { value: "Something else", confidence: "observed" }, testDeps()).client;
    expect(() => approveSiteSpec(inReview, unconfirmed, null, testDeps())).toThrow(/before it can be approved: Goal/);
  });

  it("approves in a person's name only, and supersedes the earlier approved version", () => {
    const { client, project, approved } = approvedV1();
    expect(approved).toMatchObject({ status: "approved", approvedBy: { kind: "human", name: "Alex" }, approvedAt: "2026-10-26T12:00:00.000Z" });

    const v2 = submitSiteSpec(startSiteSpec(client, project, [approved], testDeps()).record, client, testDeps()).record;
    expect(() => approveSiteSpec(v2, client, approved, agent)).toThrow(/Only a person/);
    const result = approveSiteSpec(v2, client, approved, testDeps());
    expect(result.record.status).toBe("approved");
    expect(result.superseded).toMatchObject({ id: approved.id, status: "superseded", approvedAt: approved.approvedAt });
    expect(result.event.description).toBe("Approved website spec v2 (replaces v1)");
  });

  it("only approves versions waiting for approval", () => {
    const { client, approved } = approvedV1();
    expect(() => approveSiteSpec(approved, client, null, testDeps())).toThrow(/waiting for approval/);
    expect(() => requestSiteSpecChanges(approved, undefined, testDeps())).toThrow(/waiting for approval/);
    expect(() => requestSiteSpecChanges({ ...approved, status: "in_review" }, "x".repeat(1001), testDeps())).toThrow(/under 1000/);
  });
});
