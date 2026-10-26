"use client";

import {
  ArrowUpRight,
  CircleHelp,
  CircleSlash,
  FileText,
  History,
  Link2,
  NotebookPen,
  Package,
  Plus,
} from "lucide-react";
import type { ReactNode } from "react";
import { ActivityTimeline } from "@/components/activity-timeline";
import { Button } from "@/components/ui/button";
import { RelativeTime } from "@/components/ui/relative-time";
import { ProgressBar, StageTrack } from "@/components/ui/stage-track";
import { EmptyState, NotProvided, Surface, SurfaceHeader } from "@/components/ui/surface";
import { Tag } from "@/components/ui/status";
import { getMissingInformation, TRACKED_FIELD_COUNT, websiteHref } from "@/lib/domain/clients";
import {
  getClientActivity,
  getClientNextSteps,
  getClientProjects,
  getClientTasks,
  getProjectProgress,
} from "@/lib/domain/insights";
import {
  CONFIDENCE_DESCRIPTIONS,
  CONFIDENCE_LABELS,
  CONTEXT_FIELD_LABELS,
  PROJECT_STAGE_LABELS,
  PROJECT_TYPE_LABELS,
  SOURCE_TYPE_LABELS,
} from "@/lib/domain/labels";
import {
  CONTEXT_FIELD_KEYS,
  FIELD_CONFIDENCES,
  type Client,
  type ContextField,
  type ContextFieldKey,
  type StudioSnapshot,
  type Task,
} from "@/lib/domain/types";
import { formatContextValue, formatDate } from "@/lib/format";
import { ConfidenceTag, ProjectStatusLabel, TaskStatusLabel } from "./status";

/* -------------------------------------------------------------------------- */
/* Shared bits                                                                */
/* -------------------------------------------------------------------------- */

function DefinitionList({ children }: { children: ReactNode }) {
  return <dl className="divide-y divide-line">{children}</dl>;
}

function DefinitionRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[130px_minmax(0,1fr)] gap-4 px-5 py-3 text-[13.5px]">
      <dt className="text-ink-subtle">{label}</dt>
      <dd className="min-w-0 break-words text-ink">{children}</dd>
    </div>
  );
}

function PlannedNote({ children }: { children: ReactNode }) {
  return (
    <p className="border-t border-dashed border-line-strong px-5 py-3 text-[12.5px] text-ink-subtle">{children}</p>
  );
}

/* -------------------------------------------------------------------------- */
/* Overview                                                                   */
/* -------------------------------------------------------------------------- */

export function OverviewTab({ client, snapshot, onEdit }: { client: Client; snapshot: StudioSnapshot; onEdit: () => void }) {
  const projects = getClientProjects(client.id, snapshot.projects);
  const missing = getMissingInformation(client);
  const nextSteps = getClientNextSteps(client, snapshot);
  const goal = client.context.goal;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-6">
        <Surface aria-labelledby="company-heading">
          <SurfaceHeader id="company-heading" title="Company information" />
          <DefinitionList>
            <DefinitionRow label="Name">{client.name}</DefinitionRow>
            <DefinitionRow label="Website">
              {client.website ? (
                <a
                  href={websiteHref(client.website)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink"
                >
                  {client.website}
                  <ArrowUpRight aria-hidden className="size-3.5 text-ink-subtle" />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              ) : (
                <NotProvided />
              )}
            </DefinitionRow>
            <DefinitionRow label="Source">
              {SOURCE_TYPE_LABELS[client.source.type]}
              <span className="text-ink-subtle"> · received {formatDate(client.source.receivedAt)}</span>
            </DefinitionRow>
            <DefinitionRow label="Client since">{formatDate(client.createdAt)}</DefinitionRow>
          </DefinitionList>
        </Surface>

        <Surface aria-labelledby="contact-heading">
          <SurfaceHeader id="contact-heading" title="Contact details" />
          <DefinitionList>
            <DefinitionRow label="Contact person">{client.contactPerson ?? <NotProvided />}</DefinitionRow>
            <DefinitionRow label="Email">
              {client.email ? (
                <a href={`mailto:${client.email}`} className="underline decoration-line-strong underline-offset-2 hover:decoration-ink">
                  {client.email}
                </a>
              ) : (
                <NotProvided />
              )}
            </DefinitionRow>
          </DefinitionList>
        </Surface>

        <Surface aria-labelledby="goal-heading">
          <SurfaceHeader
            id="goal-heading"
            title="Client goal"
            action={goal.value ? <ConfidenceTag confidence={goal.confidence} /> : null}
          />
          <div className="px-5 py-4 text-[14px] leading-relaxed text-ink">
            {goal.value ?? <NotProvided>Not established yet</NotProvided>}
          </div>
        </Surface>

        <Surface aria-labelledby="projects-heading">
          <SurfaceHeader id="projects-heading" title="Associated projects" />
          {projects.length === 0 ? (
            <EmptyState
              title="No projects yet"
              description="Projects can be created once the brief is clear. Project creation arrives in the next phase."
            />
          ) : (
            <ul className="divide-y divide-line">
              {projects.map((project) => {
                const progress = getProjectProgress(project, snapshot.tasks);
                return (
                  <li key={project.id} className="flex flex-wrap items-center justify-between gap-4 px-5 py-3.5">
                    <div className="min-w-0">
                      <p className="text-[14px] font-medium text-ink">{project.name}</p>
                      <p className="mt-0.5 text-[12.5px] text-ink-subtle">
                        {PROJECT_TYPE_LABELS[project.projectType]} · {PROJECT_STAGE_LABELS[project.stage]}
                      </p>
                    </div>
                    <div className="flex items-center gap-5">
                      <ProjectStatusLabel status={project.status} />
                      {progress.total > 0 ? <ProgressBar {...progress} /> : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Surface>
      </div>

      <div className="flex min-w-0 flex-col gap-6">
        <Surface aria-labelledby="next-heading">
          <SurfaceHeader id="next-heading" title="Next steps" description="Derived from missing details, open questions and tasks" />
          {nextSteps.length === 0 ? (
            <EmptyState title="Nothing outstanding" description="The brief is complete and no tasks are open." />
          ) : (
            <ol className="divide-y divide-line">
              {nextSteps.map((step, index) => (
                <li key={step.id} className="flex gap-3 px-5 py-3">
                  <span className="mt-px w-4 shrink-0 text-[12px] tabular-nums text-ink-subtle">{index + 1}</span>
                  <div className="min-w-0">
                    <p className="text-[13.5px] text-ink">{step.text}</p>
                    {step.detail ? <p className="mt-0.5 text-[12px] text-ink-subtle">{step.detail}</p> : null}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Surface>

        <Surface aria-labelledby="missing-heading">
          <SurfaceHeader
            id="missing-heading"
            title="Missing information"
            description={missing.length === 0 ? undefined : `${missing.length} of ${TRACKED_FIELD_COUNT} details not recorded`}
            action={
              missing.length > 0 ? (
                <Button size="sm" onClick={onEdit}>
                  <Plus aria-hidden />
                  Add details
                </Button>
              ) : null
            }
          />
          {missing.length === 0 ? (
            <EmptyState title="Nothing missing" description="All key details have been recorded." />
          ) : (
            <ul className="divide-y divide-line">
              {missing.map((item) => (
                <li key={item.key} className="flex items-center justify-between gap-3 px-5 py-2.5 text-[13.5px]">
                  <span className="text-ink-muted">{item.label}</span>
                  {item.essential ? <Tag tone="caution">Essential</Tag> : null}
                </li>
              ))}
            </ul>
          )}
        </Surface>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Context                                                                    */
/* -------------------------------------------------------------------------- */

const CONTEXT_ORDER: ContextFieldKey[] = ["goal", "targetAudience", "requirements", "budget", "deadline", "platform"];

export function ContextTab({ client, onEdit }: { client: Client; onEdit: () => void }) {
  const assumptions = client.contextItems.filter((item) => item.kind === "assumption");
  const questions = client.contextItems.filter((item) => item.kind === "question");

  return (
    <div className="flex flex-col gap-6">
      <Surface aria-labelledby="context-heading" className="overflow-hidden">
        <SurfaceHeader
          id="context-heading"
          title="Project context"
          description="Each value shows how certain it is and where it came from."
          action={
            <Button size="sm" onClick={onEdit}>
              Edit context
            </Button>
          }
        />
        <ul className="divide-y divide-line">
          {CONTEXT_ORDER.map((key) => (
            <ContextRow key={key} label={CONTEXT_FIELD_LABELS[key]} field={client.context[key]} />
          ))}
        </ul>
        <ConfidenceLegend />
      </Surface>

      <div className="grid gap-6 lg:grid-cols-2">
        <Surface aria-labelledby="assumptions-heading">
          <SurfaceHeader id="assumptions-heading" title="Assumptions" description="What the team is working from until confirmed" />
          <ContextItemList items={assumptions} emptyText="No assumptions recorded." />
        </Surface>
        <Surface aria-labelledby="questions-heading">
          <SurfaceHeader id="questions-heading" title="Open questions" description="To resolve with the client" />
          <ContextItemList items={questions} emptyText="No open questions recorded." />
        </Surface>
      </div>
      <p className="text-[12.5px] text-ink-subtle">
        Adding assumptions and questions, and attaching source documents to each value, will come with AI-assisted intake.
      </p>
    </div>
  );
}

function ContextRow({ label, field }: { label: string; field: ContextField }) {
  return (
    <li className="grid gap-x-6 gap-y-1.5 px-5 py-4 md:grid-cols-[180px_minmax(0,1fr)_auto]">
      <p className="text-[13px] text-ink-subtle">{label}</p>
      <div className="min-w-0">
        {field.value ? (
          <p className="text-[14px] leading-relaxed text-ink">{formatContextValue(field.value)}</p>
        ) : (
          <p className="text-[14px]"><NotProvided>Not established</NotProvided></p>
        )}
        {field.note ? <p className="mt-1 text-[12.5px] text-ink-muted">{field.note}</p> : null}
        {field.value ? (
          <p className="mt-1 text-[12px] text-ink-subtle">
            {field.source ? `${field.source.label ?? SOURCE_TYPE_LABELS[field.source.type]} · ` : "No source recorded · "}
            Updated <RelativeTime iso={field.updatedAt} />
          </p>
        ) : null}
        {field.history?.length ? (
          <details className="group mt-2">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-[12px] text-ink-subtle hover:text-ink-muted">
              <History aria-hidden className="size-3.5" />
              {field.history.length === 1 ? "1 earlier value" : `${field.history.length} earlier values`}
            </summary>
            <ul className="mt-2 flex flex-col gap-1.5 border-l border-line pl-3">
              {field.history.map((entry, index) => (
                <li key={index} className="text-[12.5px] text-ink-subtle">
                  <span className="line-through decoration-ink-subtle/50">{formatContextValue(entry.value)}</span>
                  <span> · was {CONFIDENCE_LABELS[entry.confidence].toLowerCase()}, superseded {formatDate(entry.supersededAt)}</span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
      <div className="md:text-right">
        <ConfidenceTag confidence={field.value ? field.confidence : "unknown"} />
      </div>
    </li>
  );
}

function ContextItemList({ items, emptyText }: { items: Client["contextItems"]; emptyText: string }) {
  if (items.length === 0) return <p className="px-5 py-6 text-[13px] text-ink-subtle">{emptyText}</p>;
  return (
    <ul className="divide-y divide-line">
      {items.map((item) => (
        <li key={item.id} className="flex items-start justify-between gap-3 px-5 py-3">
          <p className="text-[13.5px] leading-snug text-ink">{item.text}</p>
          <ConfidenceTag confidence={item.confidence} />
        </li>
      ))}
    </ul>
  );
}

function ConfidenceLegend() {
  return (
    <div className="border-t border-line bg-surface-muted px-5 py-3.5">
      <p className="mb-2 text-[11px] font-medium tracking-[0.08em] text-ink-subtle uppercase">Confidence</p>
      <dl className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {FIELD_CONFIDENCES.map((confidence) => (
          <div key={confidence} className="flex items-start gap-2 text-[12px]">
            <dt className="shrink-0"><ConfidenceTag confidence={confidence} /></dt>
            <dd className="pt-0.5 text-ink-subtle">{CONFIDENCE_DESCRIPTIONS[confidence]}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Workflow                                                                   */
/* -------------------------------------------------------------------------- */

export function WorkflowTab({ client, snapshot }: { client: Client; snapshot: StudioSnapshot }) {
  const projects = getClientProjects(client.id, snapshot.projects);
  const tasks = getClientTasks(client.id, snapshot);
  const blockers = tasks.filter((task) => task.status === "blocked");
  const reviews = tasks.filter((task) => task.status === "in_review" || task.status === "awaiting_approval");

  if (projects.length === 0) {
    return (
      <Surface>
        <EmptyState
          title="No project workflow yet"
          description="Stages, tasks, blockers and approvals appear here once a project exists for this client. Project creation arrives in the next phase."
        />
      </Surface>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {projects.map((project) => {
        const projectTasks = tasks.filter((task) => task.projectId === project.id);
        return (
          <Surface key={project.id} aria-labelledby={`project-${project.id}`}>
            <SurfaceHeader
              id={`project-${project.id}`}
              title={project.name}
              description={`${PROJECT_TYPE_LABELS[project.projectType]} · Started ${formatDate(project.createdAt)}`}
              action={<ProjectStatusLabel status={project.status} />}
            />
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line px-5 py-3.5">
              <span className="text-[12.5px] text-ink-subtle">Stage</span>
              <span className="text-[13.5px] font-medium text-ink">{PROJECT_STAGE_LABELS[project.stage]}</span>
              <StageTrack stage={project.stage} />
            </div>
            <TaskTable tasks={projectTasks} />
          </Surface>
        );
      })}

      <div className="grid gap-6 lg:grid-cols-2">
        <Surface aria-labelledby="blockers-heading">
          <SurfaceHeader id="blockers-heading" title="Blockers" />
          {blockers.length === 0 ? (
            <p className="px-5 py-6 text-[13px] text-ink-subtle">Nothing is blocked.</p>
          ) : (
            <ul className="divide-y divide-line">
              {blockers.map((task) => (
                <li key={task.id} className="flex gap-3 px-5 py-3">
                  <CircleSlash aria-hidden className="mt-0.5 size-4 shrink-0 text-critical" strokeWidth={1.75} />
                  <div>
                    <p className="text-[13.5px] font-medium text-ink">{task.title}</p>
                    <p className="mt-0.5 text-[12.5px] text-ink-subtle">{task.blockedReason ?? "No reason recorded."}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Surface>
        <Surface aria-labelledby="reviews-heading">
          <SurfaceHeader id="reviews-heading" title="Reviews & approvals" />
          {reviews.length === 0 ? (
            <p className="px-5 py-6 text-[13px] text-ink-subtle">Nothing is waiting for review or approval.</p>
          ) : (
            <ul className="divide-y divide-line">
              {reviews.map((task) => (
                <li key={task.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <p className="text-[13.5px] text-ink">{task.title}</p>
                  <TaskStatusLabel status={task.status} />
                </li>
              ))}
            </ul>
          )}
          <PlannedNote>Approving or requesting changes from here arrives with the approvals workflow.</PlannedNote>
        </Surface>
      </div>
    </div>
  );
}

function TaskTable({ tasks }: { tasks: Task[] }) {
  if (tasks.length === 0) return <p className="px-5 py-6 text-[13px] text-ink-subtle">No tasks recorded for this project.</p>;
  return (
    <table className="w-full text-left text-[13.5px]">
      <caption className="sr-only">Tasks</caption>
      <thead className="text-[12px] text-ink-subtle">
        <tr className="border-b border-line">
          <th scope="col" className="py-2 pr-4 pl-5 font-medium">Task</th>
          <th scope="col" className="px-4 py-2 font-medium">Status</th>
          <th scope="col" className="hidden px-4 py-2 font-medium sm:table-cell">Assigned to</th>
          <th scope="col" className="hidden py-2 pr-5 pl-4 font-medium md:table-cell">Updated</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {tasks.map((task) => (
          <tr key={task.id}>
            <td className={task.status === "done" ? "py-2.5 pr-4 pl-5 text-ink-subtle" : "py-2.5 pr-4 pl-5 text-ink"}>{task.title}</td>
            <td className="px-4 py-2.5"><TaskStatusLabel status={task.status} /></td>
            <td className="hidden px-4 py-2.5 text-ink-muted sm:table-cell">{task.assignedTo ?? <NotProvided>Unassigned</NotProvided>}</td>
            <td className="hidden py-2.5 pr-5 pl-4 text-ink-subtle md:table-cell"><RelativeTime iso={task.updatedAt} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* -------------------------------------------------------------------------- */
/* Files & deliverables                                                       */
/* -------------------------------------------------------------------------- */

export function FilesTab({ client }: { client: Client }) {
  const referencedSources = Array.from(
    new Map(
      CONTEXT_FIELD_KEYS.flatMap((key) => {
        const source = client.context[key].source;
        return source?.label && source.type !== "manual" ? [[source.label, source] as const] : [];
      }),
    ).values(),
  );

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Surface aria-labelledby="sources-heading">
        <SurfaceHeader id="sources-heading" title="Source documents" description="Material the client record was built from" />
        <div className="px-5 py-4">
          <div className="flex items-start gap-3">
            <FileText aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-subtle" strokeWidth={1.75} />
            <div className="min-w-0">
              <p className="text-[13.5px] font-medium text-ink">Initial intake · {SOURCE_TYPE_LABELS[client.source.type]}</p>
              <p className="mt-0.5 text-[12px] text-ink-subtle">Recorded {formatDate(client.source.receivedAt)}</p>
              <p className="mt-2 text-[13px] leading-relaxed whitespace-pre-wrap text-ink-muted">
                {client.source.initialNotes ?? <NotProvided>No initial notes were recorded.</NotProvided>}
              </p>
            </div>
          </div>
        </div>
        {referencedSources.length > 0 ? (
          <div className="border-t border-line px-5 py-3.5">
            <p className="mb-2 text-[12px] text-ink-subtle">Referenced in context</p>
            <ul className="flex flex-col gap-1.5">
              {referencedSources.map((source) => (
                <li key={source.label} className="text-[13px] text-ink-muted">
                  {source.label} <span className="text-ink-subtle">· {SOURCE_TYPE_LABELS[source.type]}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <PlannedNote>Uploading and storing documents arrives with document ingestion.</PlannedNote>
      </Surface>

      <Surface aria-labelledby="links-heading">
        <SurfaceHeader id="links-heading" title="Links" />
        {client.website ? (
          <ul className="px-5 py-4">
            <li className="flex items-center gap-3">
              <Link2 aria-hidden className="size-4 shrink-0 text-ink-subtle" strokeWidth={1.75} />
              <a href={websiteHref(client.website)} target="_blank" rel="noreferrer" className="text-[13.5px] text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink">
                Current website · {client.website}
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </li>
          </ul>
        ) : (
          <p className="px-5 py-6 text-[13px] text-ink-subtle">No links recorded.</p>
        )}
      </Surface>

      <PlaceholderSurface
        icon={<NotebookPen />}
        title="Meeting notes"
        text="Meeting notes will be captured here and linked to the context values they inform."
      />
      <PlaceholderSurface
        icon={<Package />}
        title="Deliverables"
        text="Designs, builds and handover files will be tracked here once deliverable tracking is in place."
      />
    </div>
  );
}

function PlaceholderSurface({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <Surface aria-label={title} className="border-dashed bg-transparent">
      <EmptyState icon={icon} title={title} description={<>{text}<br />Not available yet.</>} />
    </Surface>
  );
}

/* -------------------------------------------------------------------------- */
/* Activity                                                                   */
/* -------------------------------------------------------------------------- */

export function ActivityTab({ client, snapshot }: { client: Client; snapshot: StudioSnapshot }) {
  const events = getClientActivity(client.id, snapshot);
  return (
    <Surface aria-labelledby="activity-heading">
      <SurfaceHeader id="activity-heading" title="Activity" description="Changes and events for this client and its projects, newest first" />
      {events.length === 0 ? (
        <EmptyState icon={<CircleHelp />} title="No activity yet" />
      ) : (
        <div className="px-5 py-5">
          <ActivityTimeline entries={events.map((event) => ({ event, clientId: client.id, clientName: client.name }))} showClient={false} />
        </div>
      )}
    </Surface>
  );
}
