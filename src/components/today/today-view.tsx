"use client";

import { ArrowRight, Check, CircleSlash, Circle, FileQuestion, Plus, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ActivityTimeline } from "@/components/activity-timeline";
import { NewClientDialog } from "@/components/clients/new-client-dialog";
import { LoadError } from "@/components/load-error";
import { useStudio } from "@/components/providers/studio-provider";
import { Button } from "@/components/ui/button";
import { Section, Skeleton, Surface } from "@/components/ui/surface";
import { cn } from "@/lib/cn";
import {
  getActiveWork,
  getDecisions,
  getNextActions,
  getRecentActivity,
  type DecisionKind,
  type NextActionKind,
} from "@/lib/domain/insights";
import { PROJECT_STAGE_LABELS } from "@/lib/domain/labels";
import type { StudioSnapshot } from "@/lib/domain/types";
import { useNow } from "@/lib/use-now";

export function TodayView() {
  const state = useStudio();
  const [creating, setCreating] = useState(false);

  return (
    <>
      <div className="flex flex-col gap-4 pb-10 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-1 text-[13px] text-ink-subtle">
            <TodayLabel />
          </p>
          <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.025em] text-ink">Today</h1>
        </div>
        <Button variant="primary" onClick={() => setCreating(true)} disabled={state.status !== "ready"}>
          <Plus aria-hidden />
          New client
        </Button>
      </div>

      {state.status === "error" ? (
        <LoadError message={state.message} />
      ) : state.status === "loading" ? (
        <TodaySkeleton />
      ) : (
        <Workspace snapshot={state.snapshot} />
      )}

      <NewClientDialog open={creating} onClose={() => setCreating(false)} />
    </>
  );
}

function Workspace({ snapshot }: { snapshot: StudioSnapshot }) {
  const decisions = getDecisions(snapshot);
  const actions = getNextActions(snapshot);
  const work = getActiveWork(snapshot);

  return (
    <div className="grid gap-x-12 gap-y-12 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-12">
        <Section id="decisions" title="Needs your decision" count={decisions.length}>
          {decisions.length === 0 ? (
            <Quiet>Nothing is waiting for you.</Quiet>
          ) : (
            <Surface>
              <ul className="divide-y divide-line">
                {decisions.map((item) => (
                  <Row key={item.id} href={item.href} icon={<DecisionIcon kind={item.kind} />} title={item.title} detail={item.where} tag={DECISION_LABEL[item.kind]} />
                ))}
              </ul>
            </Surface>
          )}
        </Section>

        <Section id="next" title="Next up">
          {actions.length === 0 ? (
            <Quiet>No open work. Add a client or a task to get started.</Quiet>
          ) : (
            <Surface>
              <ul className="divide-y divide-line">
                {actions.slice(0, 8).map((action) => (
                  <Row
                    key={action.id}
                    href={action.href}
                    icon={<ActionIcon kind={action.kind} />}
                    title={action.title}
                    detail={action.detail}
                    tag={action.kind === "blocked" ? "Blocked" : undefined}
                    critical={action.kind === "blocked"}
                  />
                ))}
              </ul>
              {actions.length > 8 ? (
                <p className="border-t border-line px-5 py-3 text-[12.5px] text-ink-subtle">
                  {actions.length - 8} more in the client workspaces.
                </p>
              ) : null}
            </Surface>
          )}
        </Section>

        <AgentNote />
      </div>

      <div className="flex min-w-0 flex-col gap-12">
        <Section id="in-progress" title="In progress" count={work.length}>
          {work.length === 0 ? (
            <Quiet>No projects are active.</Quiet>
          ) : (
            <ul className="flex flex-col gap-px overflow-hidden rounded-[var(--radius-surface)] border border-line bg-line">
              {work.map(({ project, client, openTasks }) => (
                <li key={project.id} className="bg-surface">
                  <Link href={`/clients/${encodeURIComponent(client.id)}#project-${project.id}`} className="block px-4 py-3 transition-colors hover:bg-surface-muted">
                    <p className="truncate text-[13.5px] font-medium text-ink">{client.name}</p>
                    <p className="mt-0.5 truncate text-[12.5px] text-ink-subtle">
                      {project.name} · {PROJECT_STAGE_LABELS[project.stage]} · {openTasks === 1 ? "1 open task" : `${openTasks} open tasks`}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section id="recent" title="Recent">
          <ActivityTimeline entries={getRecentActivity(snapshot, 5)} />
        </Section>
      </div>
    </div>
  );
}

const DECISION_LABEL: Record<DecisionKind, string> = {
  approval: "Approve",
  review: "Review",
  proposal: "Confirm",
};

function DecisionIcon({ kind }: { kind: DecisionKind }) {
  const Icon = kind === "proposal" ? FileQuestion : Check;
  return <Icon aria-hidden strokeWidth={1.75} className="size-4 text-caution" />;
}

function ActionIcon({ kind }: { kind: NextActionKind }) {
  if (kind === "blocked") return <CircleSlash aria-hidden strokeWidth={1.75} className="size-4 text-critical" />;
  if (kind === "task") return <Circle aria-hidden strokeWidth={1.75} className="size-4 text-ink-subtle" />;
  return <ArrowRight aria-hidden strokeWidth={1.75} className="size-4 text-ink-subtle" />;
}

function Row({
  href,
  icon,
  title,
  detail,
  tag,
  critical,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  detail: string;
  tag?: string;
  critical?: boolean;
}) {
  return (
    <li>
      <Link href={href} className="group flex items-start gap-3.5 px-5 py-3.5 transition-colors hover:bg-surface-muted">
        <span className="mt-0.5 shrink-0">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] leading-snug text-ink">{title}</span>
          <span className="mt-0.5 block truncate text-[12.5px] text-ink-subtle">{detail}</span>
        </span>
        {tag ? (
          <span className={cn("mt-0.5 shrink-0 text-[12px] font-medium", critical ? "text-critical" : "text-ink-muted group-hover:text-ink")}>
            {tag}
          </span>
        ) : null}
      </Link>
    </li>
  );
}

function Quiet({ children }: { children: React.ReactNode }) {
  return <p className="rounded-[var(--radius-surface)] border border-dashed border-line-strong px-5 py-4 text-[13.5px] text-ink-subtle">{children}</p>;
}

/** States plainly that no AI is doing anything yet. */
function AgentNote() {
  return (
    <p className="flex items-start gap-2.5 text-[13px] leading-relaxed text-ink-subtle">
      <Sparkles aria-hidden strokeWidth={1.75} className="mt-0.5 size-4 shrink-0" />
      <span>
        No AI agents are connected yet, so everything here comes from what the team recorded. When agents arrive, their
        proposals will appear under <span className="text-ink-muted">Needs your decision</span> and never become client facts
        on their own.{" "}
        <Link href="/settings#agents" className="text-ink-muted underline decoration-line-strong underline-offset-2 hover:text-ink">
          Planned agents
        </Link>
      </span>
    </p>
  );
}

function TodayLabel() {
  const now = useNow();
  if (!now) return <>&nbsp;</>;
  return <>{new Date(now).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</>;
}

function TodaySkeleton() {
  return (
    <div aria-busy aria-label="Loading" className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex flex-col gap-12">
        <Skeleton className="h-56" />
        <Skeleton className="h-72" />
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}
