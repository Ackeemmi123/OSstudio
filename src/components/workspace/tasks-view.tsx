"use client";

import { ListChecks } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { LoadError } from "@/components/load-error";
import { useStudio } from "@/components/providers/studio-provider";
import { TaskStatusLabel } from "@/components/clients/status";
import { RelativeTime } from "@/components/ui/relative-time";
import { EmptyState, NotProvided, PageHeader, Skeleton, Surface } from "@/components/ui/surface";
import { taskUrgency } from "@/lib/domain/insights";
import type { StudioSnapshot, Task, TaskStatus } from "@/lib/domain/types";
import { PhaseNote } from "./phase-note";

export function TasksView({
  title = "Tasks",
  description = "Open work across all projects, most urgent first.",
  statuses,
  note = "Tasks are read-only for now. Creating, assigning and updating tasks arrives in the next phase.",
  emptyTitle = "No open tasks",
  allowShowDone = true,
}: {
  title?: string;
  description?: string;
  /** Limit the list to these statuses. */
  statuses?: TaskStatus[];
  note?: string;
  emptyTitle?: string;
  allowShowDone?: boolean;
}) {
  const state = useStudio();
  const [showDone, setShowDone] = useState(false);

  return (
    <>
      <PageHeader
        title={title}
        description={description}
        actions={
          allowShowDone ? (
            <label className="inline-flex items-center gap-2 text-[13px] text-ink-muted">
              <input
                type="checkbox"
                checked={showDone}
                onChange={(event) => setShowDone(event.target.checked)}
                className="size-4 accent-[var(--color-accent)]"
              />
              Show completed
            </label>
          ) : null
        }
      />
      <PhaseNote>{note}</PhaseNote>
      {state.status === "error" ? (
        <LoadError message={state.message} />
      ) : state.status === "loading" ? (
        <Skeleton className="h-72" />
      ) : (
        <TaskList
          snapshot={state.snapshot}
          tasks={state.snapshot.tasks.filter((task) => (statuses ? statuses.includes(task.status) : showDone || task.status !== "done"))}
          emptyTitle={emptyTitle}
        />
      )}
    </>
  );
}

function TaskList({ snapshot, tasks, emptyTitle }: { snapshot: StudioSnapshot; tasks: Task[]; emptyTitle: string }) {
  if (tasks.length === 0) {
    return (
      <Surface>
        <EmptyState icon={<ListChecks />} title={emptyTitle} />
      </Surface>
    );
  }
  const sorted = [...tasks].sort(
    (a, b) => taskUrgency(a) - taskUrgency(b) || b.updatedAt.localeCompare(a.updatedAt),
  );
  return (
    <Surface className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-[13.5px]">
        <thead className="border-b border-line bg-surface-muted text-[12px] text-ink-subtle">
          <tr>
            <th scope="col" className="py-2.5 pr-4 pl-5 font-medium">Task</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Assigned to</th>
            <th scope="col" className="py-2.5 pr-5 pl-4 font-medium">Updated</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {sorted.map((task) => {
            const project = snapshot.projects.find((p) => p.id === task.projectId);
            const client = project ? snapshot.clients.find((c) => c.id === project.clientId) : undefined;
            return (
              <tr key={task.id}>
                <td className="py-3 pr-4 pl-5">
                  <p className={task.status === "done" ? "text-ink-subtle" : "text-ink"}>{task.title}</p>
                  {project && client ? (
                    <Link href={`/clients/${client.id}?tab=workflow`} className="mt-0.5 block text-[12px] text-ink-subtle hover:text-ink hover:underline">
                      {client.name} · {project.name}
                    </Link>
                  ) : null}
                  {task.status === "blocked" && task.blockedReason ? (
                    <p className="mt-0.5 text-[12px] text-critical">{task.blockedReason}</p>
                  ) : null}
                </td>
                <td className="px-4 py-3"><TaskStatusLabel status={task.status} /></td>
                <td className="px-4 py-3 text-ink-muted">{task.assignedTo ?? <NotProvided>Unassigned</NotProvided>}</td>
                <td className="py-3 pr-5 pl-4 text-ink-subtle"><RelativeTime iso={task.updatedAt} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Surface>
  );
}
