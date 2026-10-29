"use client";

import { Check, CircleAlert, Plus, RotateCw, Sparkles, X } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { useAgentStatus } from "@/components/agents/use-agent-status";
import { useStudio, useStudioStore } from "@/components/providers/studio-provider";
import { useStudioAction } from "@/components/providers/use-studio-action";
import { Button } from "@/components/ui/button";
import { RelativeTime } from "@/components/ui/relative-time";
import { Section, Surface } from "@/components/ui/surface";
import { isFinished, type AgentRunRecord } from "@/lib/agents/contract";
import { formatUsd } from "@/lib/agents/pricing";
import { currentValueFor, describeTarget, isContextFieldKey } from "@/lib/domain/intake";
import { getLatestIntakeRun } from "@/lib/domain/insights";
import type { AgentProposal, Client, ProposalDecision, StudioSnapshot } from "@/lib/domain/types";
import { formatContextValue } from "@/lib/format";

/**
 * The intake agent's latest analysis of this client: proposed values with
 * the quotes they came from, what is still unknown or unclear, and questions
 * to ask. Nothing here changes the brief until a person accepts it.
 */
export function IntakeReview({ client, snapshot }: { client: Client; snapshot: StudioSnapshot }) {
  const state = useStudio();
  const supabase = state.status === "ready" && state.info.kind === "supabase";
  const status = useAgentStatus(supabase);
  const run = getLatestIntakeRun(snapshot, client.id);
  const proposals = snapshot.proposals.filter((p) => p.clientId === client.id && p.status === "pending");
  const { run: write, pending, canEdit } = useStudioAction();
  useReloadWhileRunning(run);

  const analyze = (force: boolean) => write((repository) => repository.requestIntakeAnalysis(client.id, { force }), "The analysis did not run.");
  const running = run && !isFinished(run.status);
  const unavailable = status.state === "unavailable" ? status.reason : null;

  const action =
    canEdit && !running ? (
      <Button size="sm" variant={run ? "ghost" : "secondary"} onClick={() => analyze(Boolean(run))} disabled={pending || status.state !== "available"} aria-busy={pending}>
        {run ? <RotateCw aria-hidden /> : <Sparkles aria-hidden />}
        {pending ? "Analyzing…" : run ? "Analyze again" : "Analyze client information"}
      </Button>
    ) : null;

  return (
    <Section id="analysis" title="Intake analysis" action={action}>
      <Surface className="px-5 py-4 text-[13.5px]">
        {pending || running ? (
          <p role="status" className="text-ink-muted">
            Reading the source material. This usually takes under a minute.
          </p>
        ) : !run ? (
          <p className="text-ink-muted">
            The intake agent reads this client’s source material and proposes brief values, each with the sentence it came from. It does not search the web, and nothing is added to the brief until you accept it.
            {unavailable ? <span className="mt-2 block text-[12.5px] text-ink-subtle">{unavailable}</span> : null}
          </p>
        ) : (
          <RunResult client={client} run={run} proposals={proposals} canEdit={canEdit} onRetry={() => analyze(true)} retrying={pending} />
        )}
      </Surface>
    </Section>
  );
}

function RunResult({
  client,
  run,
  proposals,
  canEdit,
  onRetry,
  retrying,
}: {
  client: Client;
  run: AgentRunRecord;
  proposals: AgentProposal[];
  canEdit: boolean;
  onRetry: () => void;
  retrying: boolean;
}) {
  if (run.status === "needs_input") {
    return <Notice tone="caution">{run.blocker ?? "The analysis needs more material."}</Notice>;
  }
  if (run.status === "failed" || run.status === "cancelled") {
    return (
      <div className="flex flex-col gap-3">
        <Notice tone="critical">The analysis did not finish. {run.error?.message ?? ""}</Notice>
        {canEdit && run.error?.retryable !== false ? (
          <Button size="sm" className="self-start" onClick={onRetry} disabled={retrying}>
            <RotateCw aria-hidden />
            Try again
          </Button>
        ) : null}
      </div>
    );
  }
  const result = run.result;
  if (!result) return <p className="text-ink-muted">The analysis finished without a result.</p>;
  const asked = new Set(client.contextItems.map((item) => item.text.trim().toLowerCase()));

  return (
    <div className="flex flex-col gap-6">
      {result.summary ? <p className="leading-relaxed text-ink">{result.summary}</p> : null}

      <Group title={proposals.length ? `Proposed values · ${proposals.length}` : "Proposed values"}>
        {proposals.length === 0 ? (
          <p className="text-ink-subtle">Nothing waiting for review.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {proposals.map((proposal) => (
              <ProposalCard key={proposal.id} client={client} proposal={proposal} canEdit={canEdit} />
            ))}
          </ul>
        )}
      </Group>

      {result.missing.length ? (
        <Group title="Still unknown">
          <ul className="flex list-disc flex-col gap-1 pl-4 text-ink-muted">
            {result.missing.map((item, i) => (
              <li key={i}>{item.target ? <span className="text-ink">{describeTarget(item.target)}: </span> : null}{item.description}</li>
            ))}
          </ul>
        </Group>
      ) : null}

      {result.ambiguities.length ? (
        <Group title="Unclear or contradictory">
          <ul className="flex flex-col gap-2 text-ink-muted">
            {result.ambiguities.map((item, i) => (
              <li key={i}>
                {item.description}
                {item.quote ? <Quote>{item.quote}</Quote> : null}
              </li>
            ))}
          </ul>
        </Group>
      ) : null}

      {result.questions.length ? (
        <Group title="Questions to ask the client">
          <ul className="flex flex-col gap-1.5">
            {result.questions.map((question) => (
              <QuestionRow key={question} client={client} question={question} added={asked.has(question.trim().toLowerCase())} canEdit={canEdit} />
            ))}
          </ul>
        </Group>
      ) : null}

      {result.nextSteps.length ? (
        <Group title="Suggested next steps">
          <ul className="flex list-disc flex-col gap-1 pl-4 text-ink-muted">
            {result.nextSteps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ul>
        </Group>
      ) : null}

      <p className="border-t border-line pt-3 text-[12px] leading-relaxed text-ink-subtle">
        Read {result.analyzedSources.map((s) => s.label).join(", ") || "no sources"} · <RelativeTime iso={run.finishedAt ?? run.createdAt} />. No external research was performed.
        {result.discardedProposals ? ` ${result.discardedProposals} proposed ${result.discardedProposals === 1 ? "value was" : "values were"} left out because the quoted text was not found in the source.` : ""}
        {run.runner === "fixture" ? " Produced by the test provider, not by an AI model." : ""}
        {run.costMicros !== null && run.runner !== "fixture" ? ` Estimated cost ${formatUsd(run.costMicros)}.` : ""}
      </p>
    </div>
  );
}

function ProposalCard({ client, proposal, canEdit }: { client: Client; proposal: AgentProposal; canEdit: boolean }) {
  const { run, pending } = useStudioAction();
  const current = currentValueFor(client, proposal.target);
  const brief = isContextFieldKey(proposal.target);
  const decide = (decision: ProposalDecision) =>
    run((repository) => repository.reviewProposal(proposal.id, decision), "The review was not saved.");

  return (
    <li className="rounded-[var(--radius-control)] border border-line px-4 py-3" data-testid="proposal">
      <p className="text-[12.5px] text-ink-subtle">{describeTarget(proposal.target)}</p>
      <p className="mt-0.5 text-[14px] leading-relaxed text-ink">{formatContextValue(proposal.value)}</p>
      {current ? <p className="mt-1 text-[12.5px] text-ink-subtle">Currently: {formatContextValue(current)}</p> : null}
      {proposal.evidence.map((item, i) => (
        <Quote key={i} source={item.sourceLabel}>
          {item.quote}
        </Quote>
      ))}
      {proposal.note ? <p className="mt-1.5 text-[12.5px] text-ink-muted">{proposal.note}</p> : null}
      {canEdit ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Button size="xs" variant="secondary" onClick={() => decide({ action: "accept", confidence: "observed" })} disabled={pending}>
            <Plus aria-hidden />
            {brief ? "Add to brief" : current ? "Replace" : "Use this value"}
          </Button>
          {brief ? (
            <Button size="xs" variant="secondary" onClick={() => decide({ action: "accept", confidence: "confirmed" })} disabled={pending} title="Add it as confirmed by the client or an authorized team member">
              <Check aria-hidden />
              Add as confirmed
            </Button>
          ) : null}
          <Button size="xs" variant="ghost" onClick={() => decide({ action: "dismiss" })} disabled={pending}>
            <X aria-hidden />
            Dismiss
          </Button>
        </div>
      ) : null}
    </li>
  );
}

function QuestionRow({ client, question, added, canEdit }: { client: Client; question: string; added: boolean; canEdit: boolean }) {
  const { run, pending } = useStudioAction();
  return (
    <li className="flex items-start justify-between gap-3 text-ink">
      <span>{question}</span>
      {added ? (
        <span className="shrink-0 text-[12px] text-ink-subtle">In open questions</span>
      ) : canEdit ? (
        <Button size="xs" variant="ghost" className="shrink-0" disabled={pending} onClick={() => run((repository) => repository.addContextItem(client.id, { kind: "question", text: question }))}>
          <Plus aria-hidden />
          Add to open questions
        </Button>
      ) : null}
    </li>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[12.5px] text-ink-subtle">{title}</p>
      {children}
    </div>
  );
}

function Quote({ children, source }: { children: ReactNode; source?: string }) {
  return (
    <blockquote className="mt-1.5 border-l-2 border-line-strong pl-3 text-[12.5px] leading-relaxed text-ink-muted">
      “{children}”{source ? <span className="text-ink-subtle"> · {source}</span> : null}
    </blockquote>
  );
}

function Notice({ tone, children }: { tone: "caution" | "critical"; children: ReactNode }) {
  return (
    <p role="status" className={`flex items-start gap-2 ${tone === "critical" ? "text-critical" : "text-caution"}`}>
      <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/** A run started elsewhere (another tab or person) is still going: check back until it ends. */
function useReloadWhileRunning(run: AgentRunRecord | undefined) {
  const store = useStudioStore();
  const active = run && !isFinished(run.status);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => void store.reload().catch(() => undefined), 5000);
    return () => clearInterval(timer);
  }, [active, store]);
}
