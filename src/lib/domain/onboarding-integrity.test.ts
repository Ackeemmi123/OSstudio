/**
 * Regression tests for onboarding data integrity: values someone else saved
 * are never overwritten or confirmed unseen, history says who vouched for
 * what, and agent proposals enter the brief under the same rules as answers.
 */
import { describe, expect, it } from "vitest";
import { LocalDemoRepository } from "@/lib/data/local-repository";
import { RepositoryError } from "@/lib/data/repository";
import { buildNewClient, DomainConflictError, setContextField } from "./clients";
import { reviewProposal } from "./intake";
import { buildOnboarding, saveOnboardingStep } from "./onboarding";
import { testDeps } from "./test-helpers";
import type { AgentProposal, Client, StudioSnapshot } from "./types";

function start(input: Parameters<typeof buildNewClient>[0] = { name: "Solberg Coffee", projectType: "ecommerce" }) {
  const deps = testDeps();
  const { client } = buildNewClient(input, deps);
  const { onboarding } = buildOnboarding(client, deps);
  return { client, onboarding, deps };
}

describe("values changed by someone else", () => {
  it("refuses an answer when the value it would replace changed since the person saw it", () => {
    const { client, onboarding, deps } = start();
    // The person opened the step while the budget was unknown; a colleague then confirmed one.
    const colleague = setContextField(client, "budget", { value: "SEK 80,000", confidence: "confirmed" }, testDeps({ kind: "human", name: "Kim" })).client;
    expect(() =>
      saveOnboardingStep(colleague, onboarding, { nextStep: "review", answers: { budget: "SEK 50,000" }, seen: { budget: null } }, deps),
    ).toThrow(DomainConflictError);
  });

  it("refuses to confirm a value the person never saw", () => {
    const { client, onboarding, deps } = start({ name: "Lumen", budget: "SEK 80,000" });
    const changed = setContextField(client, "budget", { value: "SEK 200,000", confidence: "observed" }, deps).client;
    expect(() =>
      saveOnboardingStep(changed, onboarding, { nextStep: "review", confirm: ["budget"], seen: { budget: "SEK 80,000" } }, deps),
    ).toThrow(/changed by someone else/);
  });

  it("saves normally when the brief is as the person saw it", () => {
    const { client, onboarding, deps } = start({ name: "Lumen", budget: "SEK 80,000" });
    const save = saveOnboardingStep(
      client,
      onboarding,
      { nextStep: "review", answers: { goal: "Grow" }, confirm: ["budget"], seen: { goal: null, budget: "SEK 80,000" } },
      deps,
    );
    expect(save.client.context.budget.confidence).toBe("confirmed");
    expect(save.client.context.goal.value).toBe("Grow");
  });

  it("reports the refusal as a conflict, and keeps the stored values and progress", async () => {
    let snapshot: StudioSnapshot | null = null;
    const storage = new Map<string, string>();
    const repo = new LocalDemoRepository({
      storage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => void storage.set(k, v), removeItem: (k) => void storage.delete(k) },
      seed: () => ({ clients: [], projects: [], tasks: [], activity: [], sources: [], agentRuns: [], proposals: [], onboardings: [] }),
    });
    const client = await repo.createClient({ name: "Lumen" });
    const onboarding = await repo.startOnboarding(client.id);
    await repo.setContextField(client.id, "budget", { value: "SEK 80,000", confidence: "confirmed" });
    snapshot = await repo.load();
    const error = await repo
      .saveOnboardingStep(onboarding.id, { nextStep: "goals", answers: { budget: "SEK 1" }, seen: { budget: null } })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RepositoryError);
    expect((error as RepositoryError).code).toBe("conflict");
    const after = await repo.load();
    expect(after.clients[0].context.budget).toMatchObject({ value: "SEK 80,000", confidence: "confirmed" });
    expect(after.onboardings[0]).toEqual(snapshot.onboardings[0]);
  });
});

describe("activity history", () => {
  it("says when typed answers were saved as confirmed by the client", () => {
    const { client, onboarding, deps } = start();
    const save = saveOnboardingStep(client, onboarding, { nextStep: "setup", answers: { industry: "Coffee" }, answerConfidence: "confirmed" }, deps);
    expect(save.events.at(-1)?.description).toBe("Onboarding: added industry as confirmed");
  });
});

describe("accepting agent proposals for structured questions", () => {
  function proposal(client: Client, target: AgentProposal["target"], value: string): AgentProposal {
    return {
      id: "p-1",
      runId: "r-1",
      clientId: client.id,
      target,
      value,
      evidence: [],
      note: null,
      status: "pending",
      reviewConfidence: null,
      reviewedBy: null,
      reviewedAt: null,
      createdAt: "2026-10-26T12:00:00.000Z",
    };
  }

  it("stores sales channels in the same normalized form as an answer", () => {
    const { client, deps } = start();
    const review = reviewProposal(client, proposal(client, "salesChannels", "etsy, shopify"), { action: "accept", confidence: "observed" }, [], deps);
    expect(review.client.context.salesChannels).toMatchObject({ value: "Shopify, Etsy", confidence: "observed" });
  });

  it("refuses channels or web addresses the brief cannot store, and changes nothing", () => {
    const { client, deps } = start();
    expect(() =>
      reviewProposal(client, proposal(client, "salesChannels", "Shopify, Myspace"), { action: "accept", confidence: "observed" }, [], deps),
    ).toThrow(/Unknown sales channel/);
    expect(() =>
      reviewProposal(client, proposal(client, "storeUrl", "not a url"), { action: "accept", confidence: "observed" }, [], deps),
    ).toThrow(/not a valid web address/);
    expect(client.context.salesChannels.value).toBeNull();
  });

  it("can always be dismissed, whatever the value", () => {
    const { client, deps } = start();
    const review = reviewProposal(client, proposal(client, "storeUrl", "not a url"), { action: "dismiss" }, [], deps);
    expect(review.proposal.status).toBe("dismissed");
    expect(review.changed).toBeNull();
  });
});
