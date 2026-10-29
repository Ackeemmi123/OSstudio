import { describe, expect, it } from "vitest";
import type { AgentRunRecord, IntakeResult } from "./contract";
import { questionsFor, reportedMissing } from "./suggestions";

function runWith(result: Partial<IntakeResult>): AgentRunRecord {
  return {
    taskType: "research.intake",
    result: { summary: "", missing: [], ambiguities: [], questions: [], nextSteps: [], analyzedSources: [], discardedProposals: 0, externalResearch: false, ...result },
  } as unknown as AgentRunRecord;
}

describe("questions per brief field", () => {
  const run = runWith({
    questions: ["What is your budget?", "Who is the audience?", "Anything else?", "Is the budget fixed?"],
    questionTargets: ["budget", "targetAudience", null, "budget"],
    missing: [{ target: "deadline", description: "No date given." }],
  });

  it("offers each question on the field it would fill, skipping ones already asked", () => {
    expect(questionsFor(run, "budget", [])).toEqual(["What is your budget?", "Is the budget fixed?"]);
    expect(questionsFor(run, "budget", ["  what is your BUDGET? "])).toEqual(["Is the budget fixed?"]);
    expect(questionsFor(run, "goal", [])).toEqual([]);
  });

  it("offers nothing per field from analyses made before questions had fields", () => {
    expect(questionsFor(runWith({ questions: ["What is your budget?"] }), "budget", [])).toEqual([]);
    expect(questionsFor(undefined, "budget", [])).toEqual([]);
  });

  it("says when the material did not mention a field", () => {
    expect(reportedMissing(run, "deadline")).toBe(true);
    expect(reportedMissing(run, "budget")).toBe(false);
  });
});
