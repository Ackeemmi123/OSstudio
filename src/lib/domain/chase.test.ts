import { describe, expect, it } from "vitest";
import { buildNewClient } from "./clients";
import { chaseDraft, mailtoLink } from "./chase";
import { getFollowUps } from "./followups";
import { buildOnboarding } from "./onboarding";
import { buildProject, buildTask } from "./projects";
import { testDeps } from "./test-helpers";
import type { Client, StudioSnapshot } from "./types";

const NOW = Date.parse("2026-10-28T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();
const SENDER = { name: "Sam Member", studio: "Axivo" };

function snapshotWith(overrides: Partial<StudioSnapshot>): StudioSnapshot {
  return { clients: [], projects: [], tasks: [], activity: [], sources: [], agentRuns: [], proposals: [], onboardings: [], inquiries: [], ...overrides };
}

function client(overrides: Partial<Client> = {}): Client {
  return { ...buildNewClient({ name: "Lumen Yoga", contactPerson: "Mia Berg", email: "mia@lumen.example" }, testDeps()).client, id: "client-1", status: "active", updatedAt: ago(8), ...overrides };
}

function only(snapshot: StudioSnapshot) {
  const items = getFollowUps(snapshot, NOW);
  expect(items).toHaveLength(1);
  return items[0];
}

describe("chase drafts", () => {
  it("asks an unfinished brief's open questions and missing essentials", () => {
    const c = client();
    c.contextItems.push(
      { id: "q1", kind: "question", text: "Which booking system do you use today?", confidence: "observed", createdAt: ago(3) },
      { id: "q2", kind: "question", text: "Old question", confidence: "superseded", createdAt: ago(3) },
    );
    c.context.goal = { value: "More bookings", confidence: "observed", updatedAt: ago(3) };
    const onboarding = { ...buildOnboarding(c, testDeps()).onboarding, id: "onb-1", updatedAt: ago(7) };
    const followUp = only(snapshotWith({ clients: [c], onboardings: [onboarding] }));

    const draft = chaseDraft(followUp, snapshotWith({ clients: [c], onboardings: [onboarding] }), SENDER)!;
    expect(draft.to).toBe("mia@lumen.example");
    expect(draft.subject).toBe("A few questions before we start");
    expect(draft.body).toBe(
      [
        "Hi Mia,",
        "To plan your project we need a few more details:\n\n- Which booking system do you use today?\n- Do you have a budget range in mind?\n- Is there a date it needs to be ready by?",
        "A short answer to each is plenty. If anything is still undecided, just say so.",
        "Best regards,\nSam Member\nAxivo",
      ].join("\n\n"),
    );
  });

  it("checks in on a quiet project by name", () => {
    const c = client();
    const project = { ...buildProject(c, { name: "Website relaunch" }, testDeps()).project, id: "project-1", status: "active" as const, updatedAt: ago(12) };
    const snapshot = snapshotWith({ clients: [c], projects: [project] });
    const draft = chaseDraft(only(snapshot), snapshot, { name: null, studio: null })!;
    expect(draft.subject).toBe("Checking in on Website relaunch");
    expect(draft.body).toContain("I wanted to check in on Website relaunch.");
    expect(draft.body.endsWith("Best regards,")).toBe(true);
  });

  it("drafts nothing for the studio's own work", () => {
    const c = client();
    const project = { ...buildProject(c, { name: "Website" }, testDeps()).project, id: "project-1", status: "active" as const };
    for (const status of ["awaiting_approval", "in_review", "blocked"] as const) {
      const task = { ...buildTask(project, { title: "Homepage" }, testDeps()).task, id: "task-1", status, updatedAt: ago(5), blockedReason: "Waiting" };
      const snapshot = snapshotWith({ clients: [c], projects: [project], tasks: [task] });
      expect(chaseDraft(only(snapshot), snapshot, SENDER)).toBeNull();
    }
  });

  it("greets without a name and opens no email without an address", () => {
    const c = client({ contactPerson: null, email: null });
    const onboarding = { ...buildOnboarding(c, testDeps()).onboarding, id: "onb-1", updatedAt: ago(7) };
    const snapshot = snapshotWith({ clients: [c], onboardings: [onboarding] });
    const draft = chaseDraft(only(snapshot), snapshot, SENDER)!;
    expect(draft.body.startsWith("Hi there,")).toBe(true);
    expect(draft.to).toBeNull();
    expect(mailtoLink(draft)).toBeNull();
  });

  it("encodes the email link so the text cannot add recipients or headers", () => {
    const link = mailtoLink({ to: "mia@lumen.example", subject: "Hi & bye?cc=x@evil.example", body: "Line 1\nLine 2&bcc=y@evil.example" })!;
    expect(link).toBe("mailto:mia%40lumen.example?subject=Hi%20%26%20bye%3Fcc%3Dx%40evil.example&body=Line%201%0ALine%202%26bcc%3Dy%40evil.example");
  });
});
