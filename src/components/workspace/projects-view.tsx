"use client";

import { FolderKanban } from "lucide-react";
import Link from "next/link";
import { LoadError } from "@/components/load-error";
import { useStudio } from "@/components/providers/studio-provider";
import { ProjectStatusLabel } from "@/components/clients/status";
import { ProgressBar, StageTrack } from "@/components/ui/stage-track";
import { EmptyState, PageHeader, Skeleton, Surface } from "@/components/ui/surface";
import { getProjectProgress } from "@/lib/domain/insights";
import { PROJECT_STAGE_LABELS, PROJECT_TYPE_LABELS } from "@/lib/domain/labels";
import { PROJECT_STATUSES } from "@/lib/domain/types";
import { PhaseNote } from "./phase-note";

export function ProjectsView() {
  const state = useStudio();
  return (
    <>
      <PageHeader title="Projects" description="Every engagement, its stage and how far the work has come." />
      <PhaseNote>This list is read-only for now. Creating and editing projects arrives in the next phase.</PhaseNote>
      {state.status === "error" ? (
        <LoadError message={state.message} />
      ) : state.status === "loading" ? (
        <Skeleton className="h-72" />
      ) : state.snapshot.projects.length === 0 ? (
        <Surface>
          <EmptyState icon={<FolderKanban />} title="No projects yet" />
        </Surface>
      ) : (
        <Surface className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[13.5px]">
            <thead className="border-b border-line bg-surface-muted text-[12px] text-ink-subtle">
              <tr>
                <th scope="col" className="py-2.5 pr-4 pl-5 font-medium">Project</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Stage</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                <th scope="col" className="py-2.5 pr-5 pl-4 font-medium">Tasks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {[...state.snapshot.projects]
                .sort((a, b) => PROJECT_STATUSES.indexOf(a.status) - PROJECT_STATUSES.indexOf(b.status) || b.updatedAt.localeCompare(a.updatedAt))
                .map((project) => {
                  const client = state.snapshot.clients.find((c) => c.id === project.clientId);
                  const progress = getProjectProgress(project, state.snapshot.tasks);
                  return (
                    <tr key={project.id}>
                      <td className="py-3.5 pr-4 pl-5">
                        <Link href={`/clients/${project.clientId}?tab=workflow`} className="font-medium text-ink hover:underline">
                          {project.name}
                        </Link>
                        <p className="mt-0.5 text-[12px] text-ink-subtle">
                          {client?.name ?? "Unknown client"} · {PROJECT_TYPE_LABELS[project.projectType]}
                        </p>
                      </td>
                      <td className="px-4 py-3.5">
                        <p className="mb-1.5 text-[12.5px] text-ink-muted">{PROJECT_STAGE_LABELS[project.stage]}</p>
                        <StageTrack stage={project.stage} />
                      </td>
                      <td className="px-4 py-3.5"><ProjectStatusLabel status={project.status} /></td>
                      <td className="py-3.5 pr-5 pl-4">
                        {progress.total > 0 ? <ProgressBar {...progress} /> : <span className="text-[12px] text-ink-subtle">No tasks</span>}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </Surface>
      )}
    </>
  );
}
