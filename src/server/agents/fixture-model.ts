import type { IntakeInput, IntakeModelOutput } from "@/lib/agents/intake";
import type { PlanInput, PlanModelOutput } from "@/lib/agents/plan";
import { textSources, type SiteDraftInput, type SiteDraftModelOutput } from "@/lib/agents/site-draft";
import { CONTEXT_FIELD_KEYS, type ProposalTarget } from "@/lib/domain/types";
import { ModelError, type AgentModel, type ModelAnswer } from "./model";

/**
 * A deterministic stand-in for a model, for automated tests only. It uses no
 * AI: it reads lines of the form "Label: value" and proposes exactly those,
 * quoting the line. It is enabled only when explicitly configured, and runs
 * it produces are labeled as coming from a test provider.
 *
 * A source containing "FIXTURE_FAIL" makes it fail, and one containing
 * "FIXTURE_MALFORMED" makes it answer in the wrong shape, to test error
 * handling. It reports token usage like a provider would (about four
 * characters a token), priced at nothing.
 *
 * Task suggestions follow fixed rules on the brief (integrations, content,
 * existing brand material), plus one suggestion the checks must drop. The
 * same markers in a brief value make them fail or answer malformed.
 */
export class FixtureModel implements AgentModel {
  readonly runner = "fixture";
  readonly model = "test-fixture";
  readonly test = true;
  readonly maxOutputTokens = { intake: 16000, plan: 4000, draft: 48000 };

  async analyze(input: IntakeInput, signal: AbortSignal): Promise<ModelAnswer> {
    if (signal.aborted) throw new ModelError("The analysis took too long and was stopped.", true, "nothing");
    if (input.sources.some((source) => source.content.includes("FIXTURE_FAIL"))) {
      throw new ModelError("The test provider was asked to fail.", true, "nothing");
    }
    const characters = input.sources.reduce((sum, source) => sum + source.content.length, 0);
    const usage = { inputTokens: Math.ceil(characters / 4) + 1500, outputTokens: 600, cacheReadTokens: 0, cacheWriteTokens: 0 };
    if (input.sources.some((source) => source.content.includes("FIXTURE_MALFORMED"))) {
      return { output: { proposals: "not a list", summary: 42 }, usage, servedBy: this.model };
    }
    return { output: this.answer(input), usage, servedBy: this.model };
  }

  async suggestTasks(input: PlanInput, signal: AbortSignal): Promise<ModelAnswer> {
    if (signal.aborted) throw new ModelError("The request took too long and was stopped.", true, "nothing");
    const brief = input.brief.map((entry) => entry.value).join("\n");
    if (brief.includes("FIXTURE_FAIL")) throw new ModelError("The test provider was asked to fail.", true, "nothing");
    const usage = { inputTokens: Math.ceil(brief.length / 4) + 1200, outputTokens: 300, cacheReadTokens: 0, cacheWriteTokens: 0 };
    if (brief.includes("FIXTURE_MALFORMED")) return { output: { add: "not a list" }, usage, servedBy: this.model };
    return { output: this.plan(input), usage, servedBy: this.model };
  }

  /**
   * A website draft with a home page that quotes the first line of each text
   * source, a contact page, and one invented sentence the checks must drop.
   */
  async draftSite(input: SiteDraftInput, signal: AbortSignal): Promise<ModelAnswer> {
    if (signal.aborted) throw new ModelError("The request took too long and was stopped.", true, "nothing");
    const sources = textSources(input);
    if (sources.some((s) => s.content.includes("FIXTURE_FAIL"))) throw new ModelError("The test provider was asked to fail.", true, "nothing");
    const characters = sources.reduce((sum, s) => sum + s.content.length, 0);
    const usage = { inputTokens: Math.ceil(characters / 4) + 3000, outputTokens: 2000, cacheReadTokens: 0, cacheWriteTokens: 0 };
    if (sources.some((s) => s.content.includes("FIXTURE_MALFORMED"))) return { output: { pages: "not a list" }, usage, servedBy: this.model };
    return { output: this.draft(input), usage, servedBy: this.model };
  }

  private draft(input: SiteDraftInput): SiteDraftModelOutput {
    const empty = { text: "", refs: [], generic: false };
    const label = (text: string) => ({ text, refs: [], generic: true });
    const quoted = (sourceId: string, text: string) => ({ text, refs: [{ sourceId, quote: text, page: null }], generic: false });
    const firstLines = textSources(input)
      .map((s) => ({ id: s.id, line: s.content.split(/\r?\n/).map((l) => l.trim()).find((l) => l.length >= 10) }))
      .filter((s): s is { id: string; line: string } => Boolean(s.line))
      .map((s) => ({ id: s.id, line: s.line.slice(0, 300) }));
    const section = (kind: SiteDraftModelOutput["pages"][number]["sections"][number]["kind"], variant: string, fields: Partial<SiteDraftModelOutput["pages"][number]["sections"][number]>) => ({
      kind, variant, eyebrow: empty, heading: empty, subheading: empty, body: empty, items: [], button: null, ...fields,
    });
    return {
      designSystem: "template",
      language: "en",
      siteName: label(input.client.name.slice(0, 60)),
      siteDescription: empty,
      goal: firstLines[0] ? quoted(firstLines[0].id, firstLines[0].line) : empty,
      tone: "Plain and friendly",
      audiences: [],
      primaryCta: { label: label("Contact"), targetPageId: "contact" },
      colors: { primary: "#7A1F2B", accent: "", basis: "test" },
      contactFormFields: ["name", "email", "message"],
      pages: [
        {
          id: "home",
          title: label("Home"),
          slug: "",
          nav: "main",
          seoDescription: empty,
          sections: [
            section("hero", "centered", { heading: label(input.client.name.slice(0, 60)), subheading: { text: "Founded in 1850 and trusted by thousands.", refs: [], generic: false }, button: { label: label("Contact"), targetPageId: "contact" } }),
            ...firstLines.map((s) => section("text", "single_column", { heading: label("About"), body: quoted(s.id, s.line) })),
          ],
        },
        { id: "contact", title: label("Contact"), slug: "contact", nav: "main", seoDescription: empty, sections: [section("contact", "form_only", { heading: label("Get in touch") })] },
      ],
      summary: `Test draft for ${input.client.name} from ${firstLines.length} source(s).`,
      questions: ["Which photos may the site use?"],
    };
  }

  private plan(input: PlanInput): PlanModelOutput {
    const value = (target: string) => input.brief.find((entry) => entry.target === target)?.value.toLocaleLowerCase();
    const add: PlanModelOutput["add"] = [];
    const remove: PlanModelOutput["remove"] = [];
    if (value("integrations")) {
      add.push({ stage: "development", title: "Connect the integrations the client named", reason: "The brief lists integrations the playbook does not cover.", basedOn: "integrations" });
    }
    if (value("content")) {
      add.push({ stage: "discovery", title: "Content plan and writing schedule", reason: "The brief says content needs to be produced.", basedOn: "content" });
    }
    if (value("existingMaterials")?.includes("brand guidelines") && input.playbook.some((task) => task.title === "Brand guidelines")) {
      remove.push({ title: "Brand guidelines", reason: "The client already has brand guidelines." });
    }
    // Repeats a playbook task, so the checks must drop it.
    add.push({ stage: "intake", title: input.playbook[0]?.title ?? "Kickoff call with the client", reason: "Always useful.", basedOn: input.brief[0]?.target ?? "goal" });
    return { add, remove };
  }

  private answer(input: IntakeInput): IntakeModelOutput {
    const proposals: IntakeModelOutput["proposals"] = [];
    for (const source of input.sources) {
      for (const line of source.content.split(/\r?\n/)) {
        const match = /^\s*([A-Za-z ]+):\s*(.+?)\s*$/.exec(line);
        const target = match ? LABELS[match[1].trim().toLowerCase()] : undefined;
        if (match && target) {
          proposals.push({ target, value: match[2], evidence: [{ sourceId: source.id, quote: line.trim() }], note: null });
        }
      }
    }
    const found = new Set(proposals.map((p) => p.target));
    const missing = CONTEXT_FIELD_KEYS.filter((key) => !found.has(key) && !input.brief.some((b) => b.target === key));
    return {
      proposals,
      missing: missing.map((target) => ({ target, description: `The material does not say anything about ${target}.` })),
      ambiguities: [],
      questions: missing.slice(0, 3).map((target) => ({ question: `What is the ${target} for this project?`, target })),
      summary: `Test analysis of ${input.sources.length} source(s) for ${input.client.name}. ${proposals.length} value(s) found as labeled lines.`,
      nextSteps: ["Review the proposed values."],
    };
  }
}

const LABELS: Record<string, ProposalTarget> = {
  goal: "goal",
  requirements: "requirements",
  audience: "targetAudience",
  "target audience": "targetAudience",
  budget: "budget",
  deadline: "deadline",
  platform: "platform",
  company: "companyName",
  contact: "contactPerson",
  "contact person": "contactPerson",
  email: "email",
  website: "website",
};
