import { describe, expect, it } from "vitest";
import { buildNewClient } from "@/lib/domain/clients";
import { PLAYBOOKS } from "@/lib/domain/playbooks";
import { testDeps } from "@/lib/domain/test-helpers";
import type { Client, ContextFieldKey } from "@/lib/domain/types";
import { buildPlanInput, checkPlanInput, normalizePlanOutput, PLAN_LIMITS, planFingerprint, type PlanInput } from "./plan";
import { buildPlanMessage } from "./plan-prompt";

function clientWith(values: Partial<Record<ContextFieldKey, string>>): Client {
  const client = buildNewClient({ name: "Lumen Yoga", contactPerson: "Mia Berg", email: "mia@lumen.example", website: "lumen.example", sourceType: "email" }, testDeps()).client;
  for (const [key, value] of Object.entries(values)) client.context[key as ContextFieldKey] = { value, confidence: "observed", updatedAt: "2026-10-26T10:00:00.000Z" };
  return client;
}

const input: PlanInput = {
  projectType: "brand_website",
  brief: [
    { target: "integrations", value: "Booking through Bokamera", confidence: "observed" },
    { target: "existingMaterials", value: "Logo and brand guidelines from 2024", confidence: "confirmed" },
  ],
  playbook: PLAYBOOKS.brand_website,
};

const add = (title: string, basedOn: ContextFieldKey = "integrations") => ({ stage: "development" as const, title, reason: "The brief asks for it.", basedOn });

describe("task suggestion input", () => {
  it("sends brief values only: no names, email, web addresses or source material", () => {
    const client = clientWith({ goal: "More bookings", storeUrl: "shop.lumen.example", budget: "40 000 SEK" });
    client.source.initialNotes = "Call Mia on 070-123 45 67";
    const built = buildPlanInput(client, "website");
    expect(built.brief.map((entry) => entry.target).sort()).toEqual(["budget", "goal"]);
    const message = buildPlanMessage(built);
    for (const secret of ["Lumen", "Mia", "mia@", "lumen.example", "070-123"]) expect(message).not.toContain(secret);
    expect(message).toContain("More bookings");
    expect(message).toContain("Kickoff call with the client");
  });

  it("refuses an empty brief", () => {
    expect(checkPlanInput(buildPlanInput(clientWith({}), "website"))).toMatchObject({ ok: false });
    expect(checkPlanInput(input)).toEqual({ ok: true });
  });

  it("fingerprints the brief and the project type", async () => {
    expect(await planFingerprint(input)).toBe(await planFingerprint({ ...input, brief: [...input.brief].reverse() }));
    expect(await planFingerprint(input)).not.toBe(await planFingerprint({ ...input, projectType: "website", playbook: PLAYBOOKS.website }));
    expect(await planFingerprint(input)).not.toBe(await planFingerprint({ ...input, brief: input.brief.slice(1) }));
  });
});

describe("checking task suggestions", () => {
  it("keeps suggestions based on a brief value, and removals of playbook tasks", () => {
    const result = normalizePlanOutput(
      { add: [add("Connect the booking system")], remove: [{ title: "brand guidelines ", reason: "They already have guidelines." }] },
      input,
      ["Lumen Yoga", "Mia Berg"],
    );
    expect(result).toEqual({
      kind: "plan",
      projectType: "brand_website",
      add: [{ stage: "development", title: "Connect the booking system", reason: "The brief asks for it.", basedOn: "integrations" }],
      remove: [{ title: "Brand guidelines", reason: "They already have guidelines." }],
      discarded: 0,
      externalResearch: false,
    });
  });

  it("drops what a person could not act on safely", () => {
    const result = normalizePlanOutput(
      {
        add: [
          add("Set a budget", "budget"), // not in the brief it was given
          add("KICKOFF CALL WITH THE CLIENT"), // already in the playbook
          add("Booking page for Lumen Yoga"), // names the client
          add("Call mia berg about booking"), // names the contact
          add("ok"), // too short
          add("x".repeat(PLAN_LIMITS.maxTitleLength + 1)),
          { ...add("No reason"), reason: "  " },
          add("Connect the booking system"),
          add("connect the booking system"), // repeats a suggestion
        ],
        remove: [
          { title: "Write the client's newsletter", reason: "Not in the playbook." },
          { title: "Brand guidelines", reason: "" },
        ],
      },
      input,
      ["Lumen Yoga", "Mia Berg"],
    );
    expect(result.add.map((task) => task.title)).toEqual(["Connect the booking system"]);
    expect(result.remove).toEqual([]);
    expect(result.discarded).toBe(10);
  });

  it("caps the number of suggestions and orders them by stage", () => {
    const many = Array.from({ length: PLAN_LIMITS.maxAdd + 3 }, (_, i) => ({ ...add(`Task number ${i}`), stage: i % 2 ? ("intake" as const) : ("launch" as const) }));
    const result = normalizePlanOutput({ add: many, remove: [] }, input, []);
    expect(result.add).toHaveLength(PLAN_LIMITS.maxAdd);
    expect(result.discarded).toBe(3);
    expect(result.add.map((task) => task.stage)).toEqual([...result.add.map((task) => task.stage)].sort((a, b) => (a === b ? 0 : a === "intake" ? -1 : 1)));
  });

  it("rejects an answer in the wrong shape", () => {
    expect(() => normalizePlanOutput({ add: "not a list" }, input, [])).toThrow();
    expect(() => normalizePlanOutput({ add: [{ ...add("Task"), basedOn: "email" }], remove: [] }, input, [])).toThrow();
  });
});
