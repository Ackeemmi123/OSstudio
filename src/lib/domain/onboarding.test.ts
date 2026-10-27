import { describe, expect, it } from "vitest";
import { buildNewClient } from "./clients";
import { buildOnboarding, completeOnboarding, saveOnboardingStep, validateOnboardingStep } from "./onboarding";
import { testDeps } from "./test-helpers";
import type { Client, Onboarding } from "./types";

function start(input: Parameters<typeof buildNewClient>[0] = { name: "Solberg Coffee", projectType: "ecommerce" }) {
  const deps = testDeps();
  const { client } = buildNewClient(input, deps);
  const { onboarding, event } = buildOnboarding(client, deps);
  return { client, onboarding, event, deps };
}

function withProposal(client: Client): Client {
  return {
    ...client,
    context: {
      ...client.context,
      targetAudience: {
        value: "Specialty cafés",
        confidence: "proposed",
        recordedBy: { kind: "agent", agentId: "research" },
        updatedAt: "2026-10-25T00:00:00.000Z",
      },
    },
  };
}

describe("starting", () => {
  it("starts as a draft on the first step, with an activity event", () => {
    const { onboarding, event } = start();
    expect(onboarding).toMatchObject({ status: "draft", currentStep: "business", skipped: [], projectId: null, completedAt: null });
    expect(event).toMatchObject({ eventType: "onboarding.started", entityType: "client" });
  });

  it("refuses agents: they propose values for review instead", () => {
    const { client } = start();
    expect(() => buildOnboarding(client, testDeps({ kind: "agent", agentId: "research" }))).toThrow(/Only a person/);
  });
});

describe("saving a step", () => {
  it("writes answers to the brief as observed values from onboarding, and moves on", () => {
    const { client, onboarding, deps } = start();
    const save = saveOnboardingStep(
      client,
      onboarding,
      { nextStep: "setup", answers: { industry: "Coffee roastery", offering: "Beans and subscriptions" }, details: { contactPerson: "Jonas" } },
      deps,
    );
    expect(save.client.contactPerson).toBe("Jonas");
    expect(save.client.context.industry).toMatchObject({ value: "Coffee roastery", confidence: "observed", source: { label: "Onboarding" } });
    expect(save.onboarding).toMatchObject({ status: "in_progress", currentStep: "setup" });
    expect(save.changedFields).toEqual(["industry", "offering"]);
    expect(save.detailsChanged).toBe(true);
    expect(save.events.map((e) => e.description)).toEqual(["Updated contact person", "Onboarding: added industry and products or services"]);
  });

  it("stores several sales channels, normalized, and rejects “not selling” combined with a channel", () => {
    const { client, onboarding, deps } = start();
    const save = saveOnboardingStep(client, onboarding, { nextStep: "goals", answers: { salesChannels: "Etsy, Shopify" } }, deps);
    expect(save.client.context.salesChannels.value).toBe("Shopify, Etsy");
    expect(() =>
      saveOnboardingStep(client, onboarding, { nextStep: "goals", answers: { salesChannels: "Shopify, Not selling online yet" } }, deps),
    ).toThrow(/can’t be combined/);
    expect(validateOnboardingStep(client, { nextStep: "goals", answers: { salesChannels: "Shopify, Myspace" } }).salesChannels).toMatch(/Unknown/);
  });

  it("leaves untouched values alone, so an agent proposal is never silently confirmed", () => {
    const { onboarding, deps } = start();
    const client = withProposal(start().client);
    const save = saveOnboardingStep(
      client,
      onboarding,
      { nextStep: "scope", answers: { targetAudience: "Specialty cafés", goal: "Grow subscriptions" }, answerConfidence: "confirmed" },
      deps,
    );
    // Same text as the proposal: not rewritten, still proposed, still attributed to the agent.
    expect(save.client.context.targetAudience).toMatchObject({ confidence: "proposed", recordedBy: { kind: "agent" } });
    expect(save.client.context.goal).toMatchObject({ confidence: "confirmed", confirmedBy: { kind: "human" } });
    expect(save.changedFields).toEqual(["goal"]);
  });

  it("confirms an observed value only when a person explicitly confirms it", () => {
    const { client, onboarding, deps } = start({ name: "Lumen", budget: "SEK 80,000" });
    const untouched = saveOnboardingStep(client, onboarding, { nextStep: "review" }, deps);
    expect(untouched.client.context.budget.confidence).toBe("observed");
    const confirmed = saveOnboardingStep(client, onboarding, { nextStep: "review", confirm: ["budget", "deadline"] }, deps);
    expect(confirmed.client.context.budget).toMatchObject({ value: "SEK 80,000", confidence: "confirmed" });
    expect(confirmed.client.context.deadline.confidence).toBe("unknown"); // nothing to confirm
    expect(confirmed.events[0].description).toBe("Onboarding: confirmed budget");
  });

  it("keeps the earlier value in history when an answer is corrected", () => {
    const { client, onboarding, deps } = start({ name: "Lumen", budget: "SEK 80,000" });
    const save = saveOnboardingStep(client, onboarding, { nextStep: "review", answers: { budget: "SEK 120,000" } }, deps);
    expect(save.client.context.budget.value).toBe("SEK 120,000");
    expect(save.client.context.budget.history?.[0]).toMatchObject({ value: "SEK 80,000", confidence: "observed" });
  });

  it("remembers skipped questions, and forgets the skip once answered", () => {
    const { client, onboarding, deps } = start();
    const skipped = saveOnboardingStep(client, onboarding, { nextStep: "review", skip: ["budget", "deadline"] }, deps);
    expect(skipped.onboarding.skipped).toEqual(["budget", "deadline"]);
    expect(skipped.client.context.budget.value).toBeNull(); // nothing invented
    expect(skipped.events).toHaveLength(0);
    const answered = saveOnboardingStep(skipped.client, skipped.onboarding, { nextStep: "review", answers: { budget: "SEK 50,000" } }, deps);
    expect(answered.onboarding.skipped).toEqual(["deadline"]);
  });

  it("adds open questions once", () => {
    const { client, onboarding, deps } = start();
    const first = saveOnboardingStep(client, onboarding, { nextStep: "review", questions: ["Who takes product photos?", " "] }, deps);
    const again = saveOnboardingStep(first.client, first.onboarding, { nextStep: "review", questions: ["who takes product photos?"] }, deps);
    expect(first.addedItems).toHaveLength(1);
    expect(again.addedItems).toHaveLength(0);
    expect(again.client.contextItems.filter((i) => i.kind === "question")).toHaveLength(1);
  });

  it("reports no change when moving back and forth without edits", () => {
    const { client, onboarding, deps } = start();
    const moved = saveOnboardingStep(client, onboarding, { nextStep: "setup" }, deps);
    const same = saveOnboardingStep(moved.client, moved.onboarding, { nextStep: "setup", answers: { industry: "" } }, deps);
    expect(moved.onboardingChanged).toBe(true);
    expect(same.onboardingChanged).toBe(false);
    expect(same.events).toHaveLength(0);
    expect(same.onboarding).toBe(moved.onboarding);
  });

  it("rejects invalid input without changing anything", () => {
    const { client, onboarding, deps } = start();
    expect(() => saveOnboardingStep(client, onboarding, { nextStep: "goals", details: { email: "nope" } }, deps)).toThrow(/email/);
    expect(() => saveOnboardingStep(client, onboarding, { nextStep: "goals", answers: { storeUrl: "not a url" } }, deps)).toThrow(/web address/);
    expect(() => saveOnboardingStep(client, onboarding, { nextStep: "goals", answers: { goal: "x".repeat(5001) } }, deps)).toThrow(/5,000/);
    const other: Onboarding = { ...onboarding, clientId: "someone-else" };
    expect(() => saveOnboardingStep(client, other, { nextStep: "goals" }, deps)).toThrow(/another client/);
  });

  it("refuses agents", () => {
    const { client, onboarding } = start();
    expect(() =>
      saveOnboardingStep(client, onboarding, { nextStep: "goals", answers: { goal: "x" } }, testDeps({ kind: "agent", agentId: "research" })),
    ).toThrow(/Only a person/);
  });
});

describe("finishing", () => {
  it("marks a partial brief ready for review without filling gaps", () => {
    const { client, onboarding, deps } = start();
    const { onboarding: done, events } = completeOnboarding(client, onboarding, deps);
    expect(done).toMatchObject({ status: "ready_for_review", currentStep: "review" });
    expect(done.completedAt).not.toBeNull();
    expect(events[0].description).toMatch(/still unknown/);
    expect(completeOnboarding(client, done, deps).events).toHaveLength(0); // no duplicate completion
  });

  it("keeps the status when answers are edited afterwards", () => {
    const { client, onboarding, deps } = start();
    const done = completeOnboarding(client, onboarding, deps).onboarding;
    const edited = saveOnboardingStep(client, done, { nextStep: "goals", answers: { goal: "Grow" } }, deps);
    expect(edited.onboarding.status).toBe("ready_for_review");
  });
});
