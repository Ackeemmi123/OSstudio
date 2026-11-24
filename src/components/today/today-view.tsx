"use client";

import { Archive, ArrowRight, Check, CircleSlash, Circle, Clock, FileQuestion, Inbox, Plus, Sparkles } from "lucide-react";
import { Celebration, CopyReviewLink, DeliveryTrack, useDeliveries } from "@/components/delivery/delivery";
import { useSession } from "@/components/providers/session-provider";
import { daysSince, type Delivery } from "@/lib/domain/delivery";
import { isTestClient } from "@/lib/domain/test-clients";
import { Avatar } from "@/components/ui/avatar";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ActivityTimeline } from "@/components/activity-timeline";
import { NewClientDialog } from "@/components/clients/new-client-dialog";
import { TodayNextSteps } from "@/components/next-steps/next-steps";
import { LoadError } from "@/components/load-error";
import { useCanEdit, useStudio, useStudioStore } from "@/components/providers/studio-provider";
import { useStudioAction } from "@/components/providers/use-studio-action";
import { Button } from "@/components/ui/button";
import { Section, Skeleton, Surface } from "@/components/ui/surface";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { describeWait, FOLLOW_UP_RULES, getFollowUps } from "@/lib/domain/followups";
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
  const canEdit = useCanEdit();
  const [creating, setCreating] = useState(false);

  return (
    <>
      <div className="flex flex-col gap-4 pb-10 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-1 text-[13px] text-ink-subtle">
            <TodayLabel />
          </p>
          <h1 className="text-[28px] leading-tight font-medium tracking-[-0.032em] text-ink">
            <Greeting />
          </h1>
        </div>
        <Button variant="primary" onClick={() => setCreating(true)} disabled={!canEdit} hidden={state.status === "ready" && !canEdit}>
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
  const now = useNow();
  const [showAllFollowUps, setShowAllFollowUps] = useState(false);
  // Before the clock is known (server render) there are no follow-ups, and every item stays in its usual section.
  const followUps = now ? getFollowUps(snapshot, now) : [];
  // A follow-up stands for a decision or next action; show each item once.
  const shown = new Set(followUps.flatMap((item) => item.relatedIds));
  const decisions = getDecisions(snapshot).filter((item) => !shown.has(item.id));
  const actions = getNextActions(snapshot).filter((action) => !shown.has(action.id));
  const deliveries = useDeliveries();
  // Websites have their own list with where each one stands; other active projects stay here.
  const work = getActiveWork(snapshot).filter(({ project }) => !deliveries?.has(project.id));
  const names = useMemo(() => new Map(snapshot.clients.map((c) => [c.id, c.name])), [snapshot.clients]);

  return (
    <div className="grid gap-x-12 gap-y-12 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Celebration deliveries={deliveries} names={names} />
      <div className="flex min-w-0 flex-col gap-12">
        <TodayNextSteps />
        {followUps.length > 0 ? (
          <Section id="follow-up" title="Follow up" count={followUps.length}>
            <Surface>
              <ul className="divide-y divide-line">
                {(showAllFollowUps ? followUps : followUps.slice(0, 8)).map((item) => (
                  <Row
                    key={item.id}
                    href={item.href}
                    icon={<Clock aria-hidden strokeWidth={1.75} className={cn("size-4", item.kind === "blocked" ? "text-critical" : "text-caution")} />}
                    title={item.title}
                    detail={`${describeWait(item)} · ${item.detail}`}
                    tag={FOLLOW_UP_RULES[item.kind].action}
                    critical={item.kind === "blocked"}
                    action={item.kind === "approval" ? <ApproveTask taskId={item.id.slice("follow-task-".length)} /> : null}
                  />
                ))}
              </ul>
              {followUps.length > 8 && !showAllFollowUps ? (
                <button
                  type="button"
                  onClick={() => setShowAllFollowUps(true)}
                  className="block w-full border-t border-line px-5 py-3 text-left text-[12.5px] text-ink-muted hover:text-ink"
                >
                  Show {followUps.length - 8} more
                </button>
              ) : null}
            </Surface>
          </Section>
        ) : null}

        <Section id="decisions" title="Needs your decision" count={decisions.length}>
          {decisions.length === 0 ? (
            <Quiet>Nothing is waiting for you.</Quiet>
          ) : (
            <Surface>
              <ul className="divide-y divide-line">
                {decisions.map((item) => (
                  <Row key={item.id} href={item.href} icon={<DecisionIcon kind={item.kind} />} title={item.title} detail={item.where} tag={DECISION_LABEL[item.kind]} action={item.kind === "approval" ? <ApproveTask taskId={item.id.slice("task-".length)} /> : null} />
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

      </div>

      <div className="flex min-w-0 flex-col gap-12">
        <Websites snapshot={snapshot} deliveries={deliveries} now={now} />
        {work.length === 0 && deliveries?.size ? null : (
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
        )}

        <Section id="recent" title="Recent">
          <ActivityTimeline entries={getRecentActivity(snapshot, 5)} />
        </Section>
      </div>
    </div>
  );
}

const DECISION_LABEL: Record<DecisionKind, string> = {
  inquiry: "Review",
  retention: "Decide",
  approval: "Approve",
  review: "Review",
  analysis: "Review",
  proposal: "Confirm",
};

function DecisionIcon({ kind }: { kind: DecisionKind }) {
  const Icon = kind === "inquiry" ? Inbox : kind === "retention" ? Archive : kind === "proposal" ? FileQuestion : kind === "analysis" ? Sparkles : Check;
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
  action,
}: {
  action?: React.ReactNode;
  href: string;
  icon: React.ReactNode;
  title: string;
  detail: string;
  tag?: string;
  critical?: boolean;
}) {
  return (
    <li className="flex items-center">
      <Link href={href} className="group flex min-w-0 flex-1 items-start gap-3.5 px-5 py-3.5 transition-colors hover:bg-surface-muted">
        <span className="mt-0.5 shrink-0">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] leading-snug text-ink">{title}</span>
          <span className="mt-0.5 block truncate text-[12.5px] text-ink-subtle">{detail}</span>
        </span>
        {tag && !action ? (
          <span className={cn("mt-0.5 shrink-0 text-[12px] font-medium", critical ? "text-critical" : "text-ink-muted group-hover:text-ink")}>
            {tag}
          </span>
        ) : null}
      </Link>
      {action}
    </li>
  );
}

/** Approves from the list, with a short chance to take it back. Viewers see nothing here. */
function ApproveTask({ taskId }: { taskId: string }) {
  const { run, pending, canEdit } = useStudioAction();
  const store = useStudioStore();
  const toast = useToast();
  if (!canEdit) return null;

  async function undo() {
    const state = store.getSnapshot();
    const task = state.status === "ready" ? state.snapshot.tasks.find((t) => t.id === taskId) : undefined;
    // Someone may have moved it on since; leave their change alone.
    if (task?.status !== "done") {
      toast.error("This task has changed since you approved it, so it was left as it is.");
      return;
    }
    await run((r) => r.setTaskStatus(taskId, "awaiting_approval"), "The approval was not undone.");
  }

  async function approve() {
    const saved = await run((r) => r.setTaskStatus(taskId, "done"), "The task was not approved.");
    if (saved) toast.success(`Approved ${saved.title}`, { label: "Undo", onClick: () => void undo() });
  }

  return (
    <span className="shrink-0 pr-5 pl-2">
      <Button size="xs" variant="primary" onClick={approve} disabled={pending}>
        <Check aria-hidden />
        Approve
      </Button>
    </span>
  );
}

function Quiet({ children }: { children: React.ReactNode }) {
  return <p className="rounded-[var(--radius-surface)] border border-dashed border-line-strong px-5 py-4 text-[13.5px] text-ink-subtle">{children}</p>;
}

/** "Good morning, Alexander", by the hour in the browser; "Today" before the clock is known. */
function Greeting() {
  const now = useNow();
  const session = useSession();
  const first = session.mode === "supabase" ? session.studio.displayName.trim().split(/\s+/)[0] : "";
  if (!now) return <>Today</>;
  const hour = new Date(now).getHours();
  const part = hour < 5 ? "Good evening" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return <>{first ? `${part}, ${first}` : part}</>;
}

/** What the studio can move comes first, then what waits on a client, then live sites. */
const ORDER: Record<Delivery["stage"], number> = { clientApproved: 0, approved: 1, review: 2, spec: 3, built: 4, live: 5 };

/** Every website and the one thing it needs next. Test clients come last. */
function Websites({ snapshot, deliveries, now }: { snapshot: StudioSnapshot; deliveries: Map<string, Delivery> | null; now: number | null }) {
  if (!deliveries) return null;
  const clients = new Map(snapshot.clients.map((c) => [c.id, c]));
  const projects = new Map(snapshot.projects.map((p) => [p.id, p]));
  const rows = [...deliveries.values()]
    .flatMap((delivery) => {
      const client = clients.get(delivery.clientId);
      const project = projects.get(delivery.projectId);
      return client && project && client.status !== "archived" ? [{ delivery, client, project }] : [];
    })
    .sort(
      (a, b) =>
        Number(isTestClient(a.client)) - Number(isTestClient(b.client)) ||
        ORDER[a.delivery.stage] - ORDER[b.delivery.stage] ||
        Number(a.delivery.waitingOnClient) - Number(b.delivery.waitingOnClient),
    );
  if (!rows.length) return null;
  const waiting = rows.filter((r) => r.delivery.waitingOnClient).length;
  return (
    <Section id="websites" title="Websites" count={rows.length} action={waiting ? <span className="text-[12.5px] text-ink-subtle">{waiting} waiting on clients</span> : undefined}>
      <ul className="flex flex-col gap-px overflow-hidden rounded-[var(--radius-surface)] border border-line bg-line">
        {rows.map(({ delivery, client, project }) => {
          const days = delivery.waitingOnClient && now ? daysSince(delivery.since, now) : null;
          const href = `/clients/${encodeURIComponent(client.id)}/projects/${encodeURIComponent(project.id)}/site${delivery.stage === "spec" || delivery.stage === "review" ? "" : "#delivery"}`;
          return (
            <li key={project.id} className="flex flex-col gap-2.5 bg-surface px-4 py-3.5">
              <Link href={href} className="-m-1 rounded-[var(--radius-control)] p-1 transition-colors hover:bg-surface-muted">
                <span className="flex items-center gap-2">
                  <Avatar name={client.name} seed={client.id} size="xs" />
                  <span className="truncate text-[13.5px] font-medium text-ink">{client.name}</span>
                  {isTestClient(client) ? <span className="shrink-0 rounded-full border border-line-strong px-1.5 text-[10.5px] text-ink-subtle">Test</span> : null}
                </span>
                <span className={cn("mt-0.5 block text-[12.5px]", delivery.stage === "live" ? "text-positive" : delivery.waitingOnClient ? "text-ink-subtle" : "text-ink")}>
                  {delivery.next}
                  {days ? <span className="text-ink-subtle"> · {days === 1 ? "1 day" : `${days} days`}</span> : null}
                </span>
              </Link>
              <DeliveryTrack delivery={delivery} labels="current" />
              {delivery.reviewLink && delivery.waitingOnClient ? (
                <div>
                  <CopyReviewLink link={delivery.reviewLink} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Section>
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
