"use client";

import { ArrowUpRight, CircleSlash, FileQuestion, Inbox, MessageSquareMore, Stamp } from "lucide-react";
import Link from "next/link";
import { ActivityTimeline } from "@/components/activity-timeline";
import { useStudio } from "@/components/providers/studio-provider";
import { ProjectStatusLabel } from "@/components/clients/status";
import { ButtonLink } from "@/components/ui/button";
import { ProgressBar, StageTrack } from "@/components/ui/stage-track";
import { EmptyState, PageHeader, Skeleton, Surface, SurfaceHeader } from "@/components/ui/surface";
import { Tag } from "@/components/ui/status";
import { cn } from "@/lib/cn";
import {
  getDashboardSummary,
  getProjectProgress,
  getRecentActivity,
  type AttentionItem,
  type AttentionKind,
} from "@/lib/domain/insights";
import { PROJECT_STAGE_LABELS, PROJECT_TYPE_LABELS } from "@/lib/domain/labels";
import type { StudioSnapshot } from "@/lib/domain/types";
import { useNow } from "@/lib/use-now";
import { LoadError } from "@/components/load-error";

export function OverviewDashboard() {
  const state = useStudio();
  if (state.status === "error") return <LoadError message={state.message} />;
  if (state.status === "loading") return <OverviewSkeleton />;
  return <Dashboard snapshot={state.snapshot} />;
}

function Dashboard({ snapshot }: { snapshot: StudioSnapshot }) {
  const summary = getDashboardSummary(snapshot);
  const clientById = new Map(snapshot.clients.map((client) => [client.id, client]));
  const activeClientCount = new Set(summary.activeProjects.map((p) => p.clientId)).size;
  const hasDemo = snapshot.clients.some((client) => client.isDemo);

  const workload = [
    `${plural(summary.activeProjects.length, "active project")} across ${plural(activeClientCount, "client")}`,
    `${plural(summary.openTasks, "open task")}`,
  ].join(", ");
  const attentionText =
    summary.attention.length === 0
      ? "Nothing is waiting on you."
      : `${plural(summary.attention.length, "item")} ${summary.attention.length === 1 ? "needs" : "need"} your attention.`;

  return (
    <>
      <PageHeader
        eyebrow={<TodayLabel />}
        title={<Greeting />}
        description={`The studio has ${workload}. ${attentionText}`}
        actions={
          hasDemo ? (
            <Tag tone="neutral" title="Example records for demonstration. Reset them in Settings.">
              Showing demo data
            </Tag>
          ) : null
        }
      />

      <Surface aria-label="Summary" className="mb-8 grid grid-cols-2 gap-px overflow-hidden bg-line lg:grid-cols-4">
        <Metric label="Active projects" value={summary.activeProjects.length} href="/projects" />
        <Metric label="Open tasks" value={summary.openTasks} href="/tasks" />
        <Metric label="Needs attention" value={summary.attention.length} href="#attention" />
        <Metric label="Pending approvals" value={summary.pendingApprovals} href="/approvals" />
      </Surface>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-8">
          <Surface aria-labelledby="active-projects">
            <SurfaceHeader
              id="active-projects"
              title="Active projects"
              description="Current stage and task progress"
              action={
                <ButtonLink href="/projects" variant="ghost" size="sm">
                  All projects
                </ButtonLink>
              }
            />
            {summary.activeProjects.length === 0 ? (
              <EmptyState icon={<Inbox />} title="No active projects" description="Projects appear here once work has started." />
            ) : (
              <ul className="divide-y divide-line">
                {summary.activeProjects.map((project) => {
                  const client = clientById.get(project.clientId);
                  const progress = getProjectProgress(project, snapshot.tasks);
                  return (
                    <li key={project.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-2 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_150px_80px]">
                      <div className="min-w-0">
                        <Link
                          href={`/clients/${project.clientId}?tab=workflow`}
                          className="text-[14px] font-medium text-ink hover:underline"
                        >
                          {project.name}
                        </Link>
                        <p className="mt-0.5 truncate text-[12.5px] text-ink-subtle">
                          {client?.name ?? "Unknown client"} · {PROJECT_TYPE_LABELS[project.projectType]}
                        </p>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <span className="text-[12.5px] text-ink-muted">{PROJECT_STAGE_LABELS[project.stage]}</span>
                        <StageTrack stage={project.stage} />
                      </div>
                      <div className="hidden sm:block">
                        {progress.total > 0 ? <ProgressBar {...progress} /> : <span className="text-[12px] text-ink-subtle">No tasks</span>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {snapshot.projects.some((p) => p.status === "on_hold") ? (
              <p className="border-t border-line px-5 py-3 text-[12.5px] text-ink-subtle">
                {snapshot.projects
                  .filter((p) => p.status === "on_hold")
                  .map((p) => (
                    <span key={p.id} className="mr-3 inline-flex items-center gap-2">
                      <ProjectStatusLabel status="on_hold" />
                      {p.name} · {clientById.get(p.clientId)?.name}
                    </span>
                  ))}
              </p>
            ) : null}
          </Surface>

          <Surface aria-labelledby="recent-activity">
            <SurfaceHeader id="recent-activity" title="Recent activity" />
            <div className="px-5 py-5">
              <ActivityTimeline entries={getRecentActivity(snapshot, 8)} />
            </div>
          </Surface>
        </div>

        <Surface aria-labelledby="attention-heading" className="order-first h-fit scroll-mt-20 lg:order-none" id="attention">
          <SurfaceHeader id="attention-heading" title="Needs your attention" description="Blocked work, reviews, approvals and missing details" />
          {summary.attention.length === 0 ? (
            <EmptyState title="All clear" description="Nothing is blocked or waiting on you." />
          ) : (
            <ul className="divide-y divide-line">
              {summary.attention.map((item) => (
                <AttentionRow key={item.id} item={item} />
              ))}
            </ul>
          )}
        </Surface>
      </div>
    </>
  );
}

const ATTENTION_META: Record<AttentionKind, { label: string; icon: typeof Stamp; className: string }> = {
  blocked: { label: "Blocked", icon: CircleSlash, className: "text-critical" },
  approval: { label: "Awaiting approval", icon: Stamp, className: "text-caution" },
  review: { label: "Pending review", icon: MessageSquareMore, className: "text-info" },
  missing_info: { label: "Missing information", icon: FileQuestion, className: "text-ink-subtle" },
};

function AttentionRow({ item }: { item: AttentionItem }) {
  const meta = ATTENTION_META[item.kind];
  const Icon = meta.icon;
  return (
    <li>
      <Link href={item.href} className="group flex gap-3 px-5 py-3.5 transition-colors hover:bg-surface-muted">
        <Icon aria-hidden strokeWidth={1.75} className={cn("mt-0.5 size-4 shrink-0", meta.className)} />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium tracking-wide text-ink-subtle uppercase">{meta.label}</p>
          <p className="mt-0.5 text-[13.5px] font-medium text-ink">{item.title}</p>
          <p className="mt-0.5 text-[12.5px] leading-snug text-ink-subtle">{item.detail}</p>
        </div>
        <ArrowUpRight aria-hidden className="mt-0.5 size-3.5 shrink-0 text-ink-subtle opacity-0 transition-opacity group-hover:opacity-100" />
      </Link>
    </li>
  );
}

function Metric({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link
      href={href}
      className="bg-surface px-5 py-4 transition-colors hover:bg-surface-muted"
    >
      <p className="text-[12.5px] text-ink-subtle">{label}</p>
      <p className="mt-1 font-serif text-[30px] leading-none tabular-nums text-ink">{value}</p>
    </Link>
  );
}

function Greeting() {
  const now = useNow();
  if (!now) return <>Welcome back</>;
  const hour = new Date(now).getHours();
  return <>{hour < 5 ? "Good evening" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"}</>;
}

function TodayLabel() {
  const now = useNow();
  if (!now) return <>&nbsp;</>;
  return <>{new Date(now).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</>;
}

function plural(n: number, noun: string) {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

function OverviewSkeleton() {
  return (
    <div aria-busy aria-label="Loading overview">
      <Skeleton className="mb-3 h-3 w-40" />
      <Skeleton className="mb-3 h-9 w-72" />
      <Skeleton className="mb-10 h-4 w-[28rem] max-w-full" />
      <Skeleton className="mb-8 h-[84px] w-full" />
      <div className="grid gap-8 lg:grid-cols-[1.65fr_1fr]">
        <Skeleton className="h-80" />
        <Skeleton className="h-80" />
      </div>
    </div>
  );
}
