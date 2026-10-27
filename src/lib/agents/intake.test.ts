import { describe, expect, it } from "vitest";
import { checkIntakeInput, containsQuote, intakeFingerprint, normalizeIntakeOutput, INTAKE_LIMITS, type IntakeInput, type IntakeModelOutput } from "./intake";
import { buildIntakeMessage } from "./intake-prompt";

const input: IntakeInput = {
  client: { name: "Lumen Yoga", contactPerson: null, email: null, website: null },
  brief: [{ target: "goal", value: "More bookings", confidence: "observed" }],
  sources: [
    { id: "s1", label: "Contact form", type: "contact_form", content: "Hi! We’re Lumen Yoga.\nOur budget is around 40 000 SEK and we would love to launch before the summer term." },
    { id: "s2", label: "Call notes", type: "meeting", content: "Anna (owner) wants online booking. Platform: currently Wix." },
  ],
};

function output(overrides: Partial<IntakeModelOutput> = {}): IntakeModelOutput {
  return { proposals: [], missing: [], ambiguities: [], questions: [], summary: "Summary.", nextSteps: [], ...overrides };
}

describe("intake output checks", () => {
  it("keeps proposals whose quote is in the cited source, ignoring spacing, case and quote style", () => {
    const result = normalizeIntakeOutput(
      output({
        proposals: [
          { target: "budget", value: "around 40 000 SEK", evidence: [{ sourceId: "s1", quote: "our budget is  around 40 000 SEK" }], note: null },
          { target: "companyName", value: "Lumen Yoga", evidence: [{ sourceId: "s1", quote: "We're Lumen Yoga" }], note: null },
        ],
      }),
      input,
    );
    expect(result.proposals.map((p) => p.target)).toEqual(["budget", "companyName"]);
    expect(result.proposals[0].evidence[0]).toEqual({ sourceId: "s1", sourceLabel: "Contact form", quote: "our budget is  around 40 000 SEK" });
    expect(result.result.discardedProposals).toBe(0);
  });

  it("discards proposals without verifiable evidence", () => {
    const result = normalizeIntakeOutput(
      output({
        proposals: [
          // Invented: not in any source.
          { target: "deadline", value: "1 June", evidence: [{ sourceId: "s1", quote: "launch on 1 June" }], note: null },
          // Real quote, wrong source.
          { target: "platform", value: "Wix", evidence: [{ sourceId: "s1", quote: "Platform: currently Wix" }], note: null },
          // Unknown source.
          { target: "contactPerson", value: "Anna", evidence: [{ sourceId: "s9", quote: "Anna (owner)" }], note: null },
          // No evidence at all.
          { target: "targetAudience", value: "Busy professionals", evidence: [], note: null },
        ],
      }),
      input,
    );
    expect(result.proposals).toEqual([]);
    expect(result.result.discardedProposals).toBe(4);
  });

  it("drops values the brief already holds and duplicate proposals", () => {
    const evidence = [{ sourceId: "s2", quote: "wants online booking" }];
    const result = normalizeIntakeOutput(
      output({
        proposals: [
          { target: "goal", value: "more bookings", evidence, note: null },
          { target: "requirements", value: "Online booking", evidence, note: null },
          { target: "requirements", value: "online booking", evidence, note: null },
        ],
      }),
      input,
    );
    expect(result.proposals.map((p) => p.value)).toEqual(["Online booking"]);
  });

  it("keeps an ambiguity's quote only when it is really in the source, and caps lists", () => {
    const result = normalizeIntakeOutput(
      output({
        ambiguities: [
          { description: "“Before the summer term” is not a date.", sourceId: "s1", quote: "before the summer term" },
          { description: "Invented quote", sourceId: "s1", quote: "by Christmas" },
        ],
        questions: Array.from({ length: 20 }, (_, i) => `Question ${i}?`),
      }),
      input,
    );
    expect(result.result.ambiguities).toEqual([
      { description: "“Before the summer term” is not a date.", sourceId: "s1", quote: "before the summer term" },
      { description: "Invented quote", sourceId: null, quote: null },
    ]);
    expect(result.result.questions).toHaveLength(INTAKE_LIMITS.maxQuestions);
    expect(result.result.externalResearch).toBe(false);
    expect(result.result.analyzedSources.map((s) => s.id)).toEqual(["s1", "s2"]);
  });

  it("rejects output that does not match the contract", () => {
    expect(() => normalizeIntakeOutput({ proposals: "none" }, input)).toThrow();
    expect(() => normalizeIntakeOutput(output({ proposals: [{ target: "salary", value: "x", evidence: [], note: null } as never] }), input)).toThrow();
  });
});

describe("intake input", () => {
  it("refuses empty or oversized material instead of cutting it", () => {
    expect(checkIntakeInput({ ...input, sources: [] })).toMatchObject({ ok: false });
    const long = { ...input, sources: [{ ...input.sources[0], content: "x".repeat(INTAKE_LIMITS.maxInputCharacters + 1) }] };
    expect(checkIntakeInput(long)).toMatchObject({ ok: false, blocker: expect.stringContaining("Nothing was cut") });
    expect(checkIntakeInput(input)).toEqual({ ok: true });
  });

  it("fingerprints the material, not its order", async () => {
    const reversed = { ...input, sources: [...input.sources].reverse() };
    expect(await intakeFingerprint(reversed)).toBe(await intakeFingerprint(input));
    const changed = { ...input, sources: [{ ...input.sources[0], content: "Different" }, input.sources[1]] };
    expect(await intakeFingerprint(changed)).not.toBe(await intakeFingerprint(input));
  });

  it("delimits sources and escapes their labels in the prompt", () => {
    const message = buildIntakeMessage({ ...input, sources: [{ ...input.sources[0], label: 'Email "urgent" <x>' }] });
    expect(message).toContain('<source id="s1" label="Email &quot;urgent&quot; &lt;x>" type="contact_form">');
    expect(message).toContain("goal (observed): More bookings");
  });

  it("matches quotes across line breaks", () => {
    expect(containsQuote("one\ntwo three", "one two")).toBe(true);
    expect(containsQuote("one two", "two one")).toBe(false);
  });
});
