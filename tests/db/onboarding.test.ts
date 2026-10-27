/**
 * Guided onboarding against a real Supabase stack: persistence, resuming,
 * duplicate protection and access control.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { RepositoryError } from "@/lib/data/repository";
import { addMember, createStudio, createUser, repositoryFor, type TestUser } from "./helpers";

let owner: TestUser;
let viewer: TestUser;
let outsider: TestUser;
let studio: string;

beforeAll(async () => {
  [owner, viewer, outsider] = await Promise.all([createUser("onb-owner"), createUser("onb-viewer"), createUser("onb-outsider")]);
  studio = await createStudio(owner, "Onboarding test");
  await createStudio(outsider, "Elsewhere");
  await addMember(owner, studio, viewer, "viewer", "Vera Viewer");
});

async function newClient(name: string) {
  const repository = repositoryFor(owner, studio);
  await repository.load();
  const client = await repository.createClient({ name, projectType: "ecommerce" });
  return { repository, client };
}

describe("onboarding persistence", () => {
  it("saves steps and resumes them from a fresh session", async () => {
    const { repository, client } = await newClient("Resume Roasters");
    const onboarding = await repository.startOnboarding(client.id);
    await repository.saveOnboardingStep(onboarding.id, {
      nextStep: "setup",
      details: { contactPerson: "Jonas", email: "jonas@resume.test" },
      answers: { industry: "Coffee roastery", offering: "Beans" },
    });
    await repository.saveOnboardingStep(onboarding.id, {
      nextStep: "goals",
      answers: { salesChannels: "Etsy, Shopify", storeUrl: "resume.myshopify.com" },
      skip: ["integrations"],
      questions: ["Who owns the Shopify account?"],
    });

    const fresh = await repositoryFor(owner, studio).load();
    const saved = fresh.clients.find((c) => c.id === client.id)!;
    expect(fresh.onboardings.find((o) => o.id === onboarding.id)).toMatchObject({
      status: "in_progress",
      currentStep: "goals",
      skipped: ["integrations"],
    });
    expect(saved).toMatchObject({ contactPerson: "Jonas", email: "jonas@resume.test" });
    expect(saved.context.salesChannels).toMatchObject({ value: "Shopify, Etsy", confidence: "observed", source: { label: "Onboarding" } });
    expect(saved.context.storeUrl.value).toBe("resume.myshopify.com");
    expect(saved.contextItems.map((i) => i.text)).toContain("Who owns the Shopify account?");
    const events = fresh.activity.filter((e) => e.entityId === client.id).map((e) => e.eventType);
    expect(events).toEqual(expect.arrayContaining(["onboarding.started", "client.context_updated", "client.updated"]));
  });

  it("moves between steps without changing the brief, then finishes once", async () => {
    const { repository, client } = await newClient("Step Studio");
    const onboarding = await repository.startOnboarding(client.id);
    await repository.saveOnboardingStep(onboarding.id, { nextStep: "scope" });
    await repository.load();
    await repository.saveOnboardingStep(onboarding.id, { nextStep: "goals", answers: { goal: "Sell online", budget: "SEK 90,000" }, answerConfidence: "confirmed" });
    await repository.load();
    await repository.completeOnboarding(onboarding.id);
    await repository.load();
    await repository.completeOnboarding(onboarding.id);

    const fresh = await repositoryFor(owner, studio).load();
    const saved = fresh.clients.find((c) => c.id === client.id)!;
    expect(saved.context.budget).toMatchObject({ confidence: "confirmed", confirmedBy: { kind: "human", userId: owner.id } });
    expect(fresh.onboardings.find((o) => o.id === onboarding.id)).toMatchObject({ status: "ready_for_review", currentStep: "review" });
    expect(fresh.activity.filter((e) => e.entityId === client.id && e.eventType === "onboarding.ready_for_review")).toHaveLength(1);
  });

  it("starts only one onboarding per client, even from two sessions at once", async () => {
    const { client } = await newClient("Twice Ltd");
    const a = repositoryFor(owner, studio);
    const b = repositoryFor(owner, studio);
    await Promise.all([a.load(), b.load()]);
    const [first, second] = await Promise.all([a.startOnboarding(client.id), b.startOnboarding(client.id)]);
    expect(second.id).toBe(first.id);
    const fresh = await repositoryFor(owner, studio).load();
    expect(fresh.onboardings.filter((o) => o.clientId === client.id)).toHaveLength(1);
  });

  it("refuses a save based on progress someone else already changed", async () => {
    const { repository, client } = await newClient("Stale Studio");
    const onboarding = await repository.startOnboarding(client.id);
    const other = repositoryFor(owner, studio);
    await Promise.all([repository.load(), other.load()]);
    await other.saveOnboardingStep(onboarding.id, { nextStep: "goals" });
    const error = await repository.saveOnboardingStep(onboarding.id, { nextStep: "scope" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RepositoryError);
    expect((error as RepositoryError).code).toBe("conflict");
  });
});

describe("onboarding data integrity", () => {
  it("never overwrites a value a colleague confirmed while the step was open", async () => {
    const { repository, client } = await newClient("Confirmed Coffee");
    const onboarding = await repository.startOnboarding(client.id);
    const colleague = repositoryFor(owner, studio);
    await colleague.load();
    await colleague.setContextField(client.id, "budget", { value: "SEK 80,000", confidence: "confirmed" });

    // The person's form opened while the budget was unknown; their repository has the latest data.
    await repository.load();
    const error = await repository
      .saveOnboardingStep(onboarding.id, { nextStep: "review", answers: { budget: "SEK 10,000" }, seen: { budget: null } })
      .catch((e: unknown) => e);
    expect((error as RepositoryError).code).toBe("conflict");

    const fresh = await repositoryFor(owner, studio).load();
    expect(fresh.clients.find((c) => c.id === client.id)!.context.budget).toMatchObject({ value: "SEK 80,000", confidence: "confirmed" });
    expect(fresh.onboardings.find((o) => o.id === onboarding.id)).toMatchObject({ currentStep: "business", status: "draft" });
  });

  it("writes nothing from a step whose progress update is refused", async () => {
    const { repository, client } = await newClient("Atomic Agency");
    const onboarding = await repository.startOnboarding(client.id);
    const other = repositoryFor(owner, studio);
    await Promise.all([repository.load(), other.load()]);
    await other.saveOnboardingStep(onboarding.id, { nextStep: "goals" });
    const error = await repository
      .saveOnboardingStep(onboarding.id, { nextStep: "setup", answers: { industry: "Design" }, questions: ["Who signs off?"] })
      .catch((e: unknown) => e);
    expect((error as RepositoryError).code).toBe("conflict");

    const fresh = await repositoryFor(owner, studio).load();
    const saved = fresh.clients.find((c) => c.id === client.id)!;
    expect(saved.context.industry.value).toBeNull();
    expect(saved.contextItems).toHaveLength(0);
    expect(fresh.activity.filter((e) => e.entityId === client.id && e.description.startsWith("Onboarding:"))).toHaveLength(0);
  });
});

describe("onboarding access control", () => {
  it("lets viewers read progress but not change it", async () => {
    const { repository, client } = await newClient("Viewer Check");
    const onboarding = await repository.startOnboarding(client.id);
    const asViewer = repositoryFor(viewer, studio);
    const snapshot = await asViewer.load();
    expect(snapshot.onboardings.some((o) => o.id === onboarding.id)).toBe(true);
    await expect(asViewer.saveOnboardingStep(onboarding.id, { nextStep: "goals" })).rejects.toMatchObject({ code: "permission" });

    const direct = await viewer.client.from("client_onboardings").update({ current_step: "review" }).eq("id", onboarding.id).select();
    expect(direct.data ?? []).toHaveLength(0);
  });

  it("hides onboarding from other studios and blocks direct writes", async () => {
    const { repository, client } = await newClient("Private Onboarding");
    const onboarding = await repository.startOnboarding(client.id);
    const read = await outsider.client.from("client_onboardings").select("*").eq("id", onboarding.id);
    expect(read.data ?? []).toHaveLength(0);
    const rpc = await outsider.client.rpc("apply_onboarding_changes", {
      p_studio: studio,
      p_changes: { events: [] },
      p_onboarding: { op: "update", row: { id: onboarding.id, status: "ready_for_review", current_step: "review", skipped: [] }, expected: onboarding.updatedAt },
    });
    expect(rpc.error?.code).toBe("42501");
  });
});
