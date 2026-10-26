import type { Metadata } from "next";
import { PageHeader, Surface } from "@/components/ui/surface";
import { PhaseNote } from "@/components/workspace/phase-note";

export const metadata: Metadata = { title: "AI Agents" };

const PLANNED_AGENTS = [
  { name: "Intake", text: "Turns emails, forms, meeting notes and documents into structured client and project records, marked as observed until confirmed." },
  { name: "Research", text: "Gathers market, competitor and reference material for discovery, citing every source." },
  { name: "Design", text: "Proposes structure, content and visual directions from the confirmed brief." },
  { name: "Development", text: "Prepares implementation plans and builds against agreed requirements." },
  { name: "Review", text: "Checks deliverables against requirements, accessibility and quality standards before client review." },
];

export default function AgentsPage() {
  return (
    <>
      <PageHeader
        title="AI Agents"
        description="Specialized agents that will work from the same client context as the team."
      />
      <PhaseNote>No agents are running. This page describes what is planned; nothing here is active yet.</PhaseNote>
      <Surface>
        <ul className="divide-y divide-line">
          {PLANNED_AGENTS.map((agent) => (
            <li key={agent.name} className="grid gap-1 px-5 py-4 sm:grid-cols-[160px_minmax(0,1fr)_auto] sm:gap-6">
              <p className="text-[14px] font-medium text-ink">{agent.name}</p>
              <p className="text-[13.5px] leading-relaxed text-ink-muted">{agent.text}</p>
              <p className="text-[12px] text-ink-subtle">Planned</p>
            </li>
          ))}
        </ul>
        <p className="border-t border-line px-5 py-3.5 text-[12.5px] text-ink-subtle">
          Agent suggestions will always be recorded as proposed, never as confirmed client facts.
        </p>
      </Surface>
    </>
  );
}
