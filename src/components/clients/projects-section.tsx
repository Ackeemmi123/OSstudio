"use client";

import { Check, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useState, type FormEvent } from "react";
import { useCanEdit, useStudio } from "@/components/providers/studio-provider";
import { useStudioAction } from "@/components/providers/use-studio-action";
import { Button } from "@/components/ui/button";
import { Section, Surface } from "@/components/ui/surface";
import { planResultOf, type AgentRunRecord } from "@/lib/agents/contract";
import { cn } from "@/lib/cn";
import { helsinkiDate } from "@/lib/domain/followups";
import { openQuestionsTaskTitle, PLAYBOOKS } from "@/lib/domain/playbooks";
import { getClientProjects, getProjectTasks } from "@/lib/domain/insights";
import { PROJECT_STAGE_LABELS, PROJECT_STATUS_LABELS, PROJECT_TYPE_LABELS, TASK_STATUS_LABELS } from "@/lib/domain/labels";
import { toClientDetailsInput } from "@/lib/domain/clients";
import { BLOCKED_REASON_MAX_LENGTH, OWNER_NAME_MAX_LENGTH, suggestProjectName } from "@/lib/domain/projects";
import { isWebsiteProject } from "@/lib/domain/site-specs";
import {
  PROJECT_STAGES,
  PROJECT_STATUSES,
  PROJECT_TYPES,
  TASK_STATUSES,
  type Client,
  type Project,
  type ProjectType,
  type StudioSnapshot,
  type Task,
  type TaskStatus,
} from "@/lib/domain/types";
import { useNow } from "@/lib/use-now";
import { AssigneeLabel } from "./status";
import { removalFor, TaskSuggestions } from "./task-suggestions";

/** People a task can go to: studio members, plus names already used on tasks. */
function useOwnerOptions(snapshot: StudioSnapshot): { name: string; userId?: string }[] {
  const state = useStudio();
  const members = state.status === "ready" && state.info.kind === "supabase" ? state.info.members : [];
  const options = new Map<string, { name: string; userId?: string }>();
  for (const member of members) options.set(member.displayName, { name: member.displayName, userId: member.userId });
  for (const task of snapshot.tasks) {
    if (task.assignee?.kind === "human" && !options.has(task.assignee.name)) options.set(task.assignee.name, { name: task.assignee.name });
  }
  return [...options.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function ProjectsSection({ client, snapshot }: { client: Client; snapshot: StudioSnapshot }) {
  const projects = getClientProjects(client.id, snapshot.projects);
  const owners = useOwnerOptions(snapshot);
  // A link to #new-project (from onboarding or a follow-up) opens the form, as does #projects for a client with no project yet.
  // The workspace renders only in the browser, once data has loaded, so reading the hash here is safe.
  const opensForm = (hash: string) => hash === "#new-project" || (hash === "#projects" && projects.length === 0);
  const [creating, setCreating] = useState(() => typeof window !== "undefined" && opensForm(window.location.hash));
  useEffect(() => {
    // Links on the same page (What's next) change only the hash.
    const onHashChange = () => {
      if (opensForm(window.location.hash)) setCreating(true);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  });
  const canEdit = useCanEdit();

  return (
    <Section
      id="projects"
      title="Projects"
      count={projects.length || undefined}
      action={
        projects.length > 0 && !creating && canEdit ? (
          <Button size="sm" variant="ghost" onClick={() => setCreating(true)}>
            <Plus aria-hidden />
            New project
          </Button>
        ) : null
      }
    >
      <div className="flex flex-col gap-4">
        {creating || projects.length === 0 ? (
          <Surface id={creating ? "new-project" : undefined} className={cn("scroll-mt-24", projects.length === 0 && !creating ? "border-dashed" : undefined)}>
            {creating ? (
              <NewProjectForm client={client} firstProject={projects.length === 0} onDone={() => setCreating(false)} />
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <p className="text-[13.5px] text-ink-muted">No projects yet. Start one when the work is agreed, or earlier to plan it.</p>
                {canEdit ? (
                  <Button size="sm" onClick={() => setCreating(true)}>
                    <Plus aria-hidden />
                    New project
                  </Button>
                ) : null}
              </div>
            )}
          </Surface>
        ) : null}
        {projects.map((project) => (
          <ProjectCard key={project.id} project={project} tasks={getProjectTasks(project.id, snapshot.tasks)} owners={owners} />
        ))}
      </div>
    </Section>
  );
}

type OwnerOption = { name: string; userId?: string };

function ProjectCard({ project, tasks, owners }: { project: Project; tasks: Task[]; owners: OwnerOption[] }) {
  const { run, pending, canEdit } = useStudioAction();
  const [showDone, setShowDone] = useState(false);
  const open = tasks.filter((task) => task.status !== "done");
  const done = tasks.filter((task) => task.status === "done");
  const selectId = useId();
  const state = useStudio();
  // Website specs are kept on the server only.
  const server = state.status === "ready" && state.info.kind === "supabase";

  return (
    <Surface id={`project-${project.id}`} aria-labelledby={`${selectId}-name`} className="scroll-mt-24">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line px-5 py-3.5">
        <div className="min-w-0">
          <h3 id={`${selectId}-name`} className="text-[14.5px] font-medium text-ink">
            {project.name}
          </h3>
          {project.name !== PROJECT_TYPE_LABELS[project.projectType] ? (
            <p className="text-[12.5px] text-ink-subtle">{PROJECT_TYPE_LABELS[project.projectType]}</p>
          ) : null}
          {server && isWebsiteProject(project) ? (
            <Link href={`/clients/${encodeURIComponent(project.clientId)}/projects/${encodeURIComponent(project.id)}/site`} className="text-[12.5px] text-ink-muted underline-offset-2 hover:text-ink hover:underline">
              Website spec
            </Link>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <CompactSelect
            label="Stage"
            value={project.stage}
            disabled={pending || !canEdit}
            onChange={(stage) => run((r) => r.updateProject(project.id, { stage: stage as Project["stage"] }))}
            options={PROJECT_STAGES.map((stage) => [stage, PROJECT_STAGE_LABELS[stage]])}
          />
          <CompactSelect
            label="Project status"
            value={project.status}
            disabled={pending || !canEdit}
            onChange={(status) => run((r) => r.updateProject(project.id, { status: status as Project["status"] }))}
            options={PROJECT_STATUSES.map((status) => [status, PROJECT_STATUS_LABELS[status]])}
          />
        </div>
      </header>

      {open.length === 0 && done.length === 0 ? <p className="px-5 pt-3.5 text-[13px] text-ink-subtle">No tasks yet.</p> : null}
      <ul className="divide-y divide-line">
        {open.map((task) => (
          <TaskRow key={task.id} task={task} owners={owners} />
        ))}
        {showDone ? done.map((task) => <TaskRow key={task.id} task={task} owners={owners} />) : null}
      </ul>
      <div className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-2.5">
        {canEdit ? <NewTaskInput projectId={project.id} /> : null}
        {done.length > 0 ? (
          <button type="button" onClick={() => setShowDone((v) => !v)} aria-expanded={showDone} className="ml-auto rounded-sm text-[12.5px] text-ink-subtle hover:text-ink">
            {showDone ? "Hide completed" : `${done.length} completed`}
          </button>
        ) : null}
      </div>
    </Surface>
  );
}

const STATUS_DOT: Record<TaskStatus, string> = {
  todo: "border-line-strong",
  in_progress: "border-info bg-info/15",
  blocked: "border-critical bg-critical/15",
  in_review: "border-caution bg-caution/15",
  awaiting_approval: "border-caution bg-caution/15",
  done: "border-positive bg-positive",
};

function formatDue(date: string): string {
  return new Date(`${date.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function TaskRow({ task, owners }: { task: Task; owners: OwnerOption[] }) {
  const { run, pending, canEdit } = useStudioAction();
  const [editing, setEditing] = useState<"details" | "block" | null>(null);
  const now = useNow();
  const setStatus = (status: TaskStatus) => run((r) => r.setTaskStatus(task.id, status));
  const done = task.status === "done";
  const overdue = !done && Boolean(task.dueDate) && now !== null && task.dueDate!.slice(0, 10) < helsinkiDate(now);

  return (
    <li id={`task-${task.id}`} className="flex scroll-mt-24 flex-wrap items-start gap-x-3 gap-y-2 px-5 py-3 target:bg-accent-soft">
      <span aria-hidden className={cn("mt-1 size-3 shrink-0 rounded-full border-[1.5px]", STATUS_DOT[task.status])} />
      <div className="min-w-0 flex-1">
        <p className={cn("text-[14px] leading-snug", done ? "text-ink-subtle line-through decoration-ink-subtle/40" : "text-ink")}>{task.title}</p>
        <p className="mt-0.5 text-[12.5px]" data-testid="task-details">
          <AssigneeLabel assignee={task.assignee} />
          {task.dueDate ? (
            <span className={overdue ? "text-critical" : "text-ink-subtle"}>
              {" · "}
              {overdue ? "Overdue, was due " : "Due "}
              {formatDue(task.dueDate)}
            </span>
          ) : null}
          {task.status === "blocked" && task.blockedReason ? <span className="text-critical"> · {task.blockedReason}</span> : null}
        </p>
      </div>
      <div className="flex w-full shrink-0 items-center gap-1.5 pl-6 sm:w-auto sm:pl-0">
        {task.status === "awaiting_approval" && canEdit ? (
          <Button size="xs" variant="primary" onClick={() => setStatus("done")} disabled={pending}>
            <Check aria-hidden />
            Approve
          </Button>
        ) : null}
        {canEdit && !done ? (
          <Button size="xs" variant="ghost" onClick={() => setEditing(editing === "details" ? null : "details")} aria-expanded={editing === "details"} aria-label={`Assign or schedule ${task.title}`}>
            <Pencil aria-hidden />
          </Button>
        ) : null}
        <CompactSelect
          label={`Status of ${task.title}`}
          value={task.status}
          disabled={pending || !canEdit}
          onChange={(status) => (status === "blocked" ? setEditing("block") : setStatus(status as TaskStatus))}
          options={TASK_STATUSES.map((status) => [status, TASK_STATUS_LABELS[status]])}
        />
      </div>
      {editing === "details" ? <TaskDetailsForm task={task} owners={owners} onDone={() => setEditing(null)} /> : null}
      {editing === "block" ? <BlockForm task={task} onDone={() => setEditing(null)} /> : null}
    </li>
  );
}

// Matches the field style in components/ui/field.tsx, at the compact height used in task rows.
const INLINE_INPUT =
  "h-8 min-w-0 rounded-[var(--radius-control)] border border-control bg-surface px-2.5 text-[13px] text-ink placeholder:text-ink-subtle/80 " +
  "transition-colors hover:border-accent focus:border-focus focus:outline-none focus:ring-2 focus:ring-focus/15";

function TaskDetailsForm({ task, owners, onDone }: { task: Task; owners: OwnerOption[]; onDone: () => void }) {
  const { run, pending } = useStudioAction();
  const [owner, setOwner] = useState(task.assignee?.kind === "human" ? task.assignee.name : "");
  const [due, setDue] = useState(task.dueDate?.slice(0, 10) ?? "");
  const id = useId();

  async function save(event: FormEvent) {
    event.preventDefault();
    const match = owners.find((option) => option.name === owner.trim());
    const saved = await run((r) => r.updateTask(task.id, { ownerName: owner, ownerUserId: match?.userId, dueDate: due }), "The task was not updated.");
    if (saved) onDone();
  }

  return (
    <form onSubmit={save} className="flex w-full flex-wrap items-end gap-2 pl-6">
      <label className="flex min-w-0 flex-col gap-1 text-[12px] text-ink-muted">
        Owner
        <input
          id={`${id}-owner`}
          list={`${id}-owners`}
          value={owner}
          maxLength={OWNER_NAME_MAX_LENGTH}
          placeholder="Unassigned"
          onChange={(event) => setOwner(event.target.value)}
          className={cn(INLINE_INPUT, "w-44")}
        />
        <datalist id={`${id}-owners`}>
          {owners.map((option) => (
            <option key={option.name} value={option.name} />
          ))}
        </datalist>
      </label>
      <label className="flex flex-col gap-1 text-[12px] text-ink-muted">
        Due date
        <input id={`${id}-due`} type="date" value={due} onChange={(event) => setDue(event.target.value)} className={INLINE_INPUT} />
      </label>
      <Button type="submit" size="xs" variant="primary" disabled={pending}>
        Save
      </Button>
      <Button type="button" size="xs" variant="ghost" onClick={onDone} disabled={pending}>
        Cancel
      </Button>
    </form>
  );
}

/** Blocking a task asks why, so the reason shows wherever the task is listed. */
function BlockForm({ task, onDone }: { task: Task; onDone: () => void }) {
  const { run, pending } = useStudioAction();
  const [reason, setReason] = useState(task.blockedReason ?? "");
  const id = useId();

  async function block(event: FormEvent) {
    event.preventDefault();
    if (!reason.trim()) return;
    const saved = await run((r) => r.setTaskStatus(task.id, "blocked", { blockedReason: reason }), "The task was not updated.");
    if (saved) onDone();
  }

  return (
    <form onSubmit={block} className="flex w-full flex-wrap items-end gap-2 pl-6">
      <label htmlFor={`${id}-reason`} className="flex min-w-0 flex-1 flex-col gap-1 text-[12px] text-ink-muted">
        What is it waiting for?
        <input
          id={`${id}-reason`}
          value={reason}
          required
          autoFocus
          maxLength={BLOCKED_REASON_MAX_LENGTH}
          placeholder="For example: product photos from the client"
          onChange={(event) => setReason(event.target.value)}
          className={cn(INLINE_INPUT, "w-full")}
        />
      </label>
      <Button type="submit" size="xs" variant="primary" disabled={pending || !reason.trim()}>
        Mark blocked
      </Button>
      <Button type="button" size="xs" variant="ghost" onClick={onDone} disabled={pending}>
        Cancel
      </Button>
    </form>
  );
}

function NewTaskInput({ projectId }: { projectId: string }) {
  const [title, setTitle] = useState("");
  const { run, pending } = useStudioAction();

  async function add(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || pending) return;
    const task = await run((r) => r.createTask(projectId, { title }), "The task was not added.");
    if (task) setTitle("");
  }

  return (
    <form onSubmit={add} className="flex min-w-0 flex-1 items-center gap-2">
      <Plus aria-hidden className="size-3.5 shrink-0 text-ink-subtle" />
      <input
        aria-label="New task"
        placeholder="Add a task"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        disabled={pending}
        className="h-8 min-w-0 flex-1 bg-transparent text-[13.5px] text-ink placeholder:text-ink-subtle focus:outline-none"
      />
      {title.trim() ? (
        <Button type="submit" size="xs" disabled={pending}>
          Add
        </Button>
      ) : null}
    </form>
  );
}

function NewProjectForm({ client, firstProject, onDone }: { client: Client; firstProject: boolean; onDone: () => void }) {
  const formId = useId();
  const [name, setName] = useState(suggestProjectName(client));
  const [projectType, setProjectType] = useState<ProjectType>(client.projectType ?? "website");
  const playbook = PLAYBOOKS[projectType];
  // Titles the person unticked; everything else in the playbook is created.
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const openQuestions = client.contextItems.filter((item) => item.kind === "question" && item.confidence !== "superseded").length;
  const [askQuestions, setAskQuestions] = useState(openQuestions > 0);
  // Starting the first project is when a lead usually becomes an active client; the person decides.
  const canActivate = firstProject && (client.status === "lead" || client.status === "onboarding");
  const [activate, setActivate] = useState(canActivate);
  // AI suggestions for this project type, and the suggested tasks the person ticked.
  const [plan, setPlan] = useState<AgentRunRecord | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const suggestions = planResultOf(plan ?? undefined);
  const chosen = [
    ...playbook.filter((task) => !skipped.has(task.title)).map((task) => task.title),
    ...(suggestions?.add.filter((task) => picked.has(task.title)).map((task) => task.title) ?? []),
    ...(askQuestions && openQuestions > 0 ? [openQuestionsTaskTitle(openQuestions)] : []),
  ];
  const { run, pending, canEdit } = useStudioAction();
  const suggest = useStudioAction();

  async function askForSuggestions() {
    const requested = await suggest.run((r) => r.suggestTasks(client.id, projectType), "Suggestions could not be requested.");
    if (requested) {
      setPlan(requested);
      setPicked(new Set());
    }
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    const project = await run((r) => r.createProject(client.id, { name, projectType, tasks: chosen }), "The project was not created.");
    if (!project) return;
    if (canActivate && activate) {
      await run((r) => r.updateClient(client.id, { ...toClientDetailsInput(client), status: "active" }), "The project was created, but the client was not marked active.");
    }
    onDone();
  }

  function toggle(title: string) {
    setSkipped((current) => toggled(current, title));
  }

  return (
    <form onSubmit={create} className="flex flex-col gap-3 px-5 py-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${formId}-name`} className="text-[13px] font-medium text-ink">
            Project name
          </label>
          <input
            id={`${formId}-name`}
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Website & E-commerce"
            className="h-9 rounded-[var(--radius-control)] border border-control bg-surface px-3 text-sm text-ink placeholder:text-ink-subtle focus:border-focus focus:ring-2 focus:ring-focus/15 focus:outline-none"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${formId}-type`} className="text-[13px] font-medium text-ink">
            Type
          </label>
          <select
            id={`${formId}-type`}
            value={projectType}
            onChange={(event) => {
              setProjectType(event.target.value as ProjectType);
              setSkipped(new Set());
              // Suggestions were for the other type's playbook.
              setPlan(null);
              setPicked(new Set());
            }}
            className="h-9 rounded-[var(--radius-control)] border border-control bg-surface px-2.5 text-sm text-ink focus:border-focus focus:ring-2 focus:ring-focus/15 focus:outline-none"
          >
            {PROJECT_TYPES.map((type) => (
              <option key={type} value={type}>
                {PROJECT_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-[13px] font-medium text-ink">Tasks to start with</legend>
        <p className="text-[12px] text-ink-subtle">The usual tasks for this type of project. Untick what does not apply; you can add more later.</p>
        {PROJECT_STAGES.filter((stage) => playbook.some((task) => task.stage === stage)).map((stage) => (
          <div key={stage} className="flex flex-col gap-1">
            <p className="text-[11.5px] font-medium tracking-[0.04em] text-ink-subtle uppercase">{PROJECT_STAGE_LABELS[stage]}</p>
            {playbook
              .filter((task) => task.stage === stage)
              .map((task) => {
                const leaveOut = removalFor(suggestions, task.title);
                return (
                  <label key={task.title} className="flex items-start gap-2 text-[13.5px] text-ink">
                    <input type="checkbox" checked={!skipped.has(task.title)} onChange={() => toggle(task.title)} className="mt-0.5 size-4 accent-[var(--color-primary)]" />
                    <span>
                      {task.title}
                      {leaveOut ? <span className="block text-[12px] text-ink-subtle">Suggested to leave out: {leaveOut}</span> : null}
                    </span>
                  </label>
                );
              })}
          </div>
        ))}
        <TaskSuggestions
          run={plan}
          pending={suggest.pending}
          canAsk={canEdit}
          picked={picked}
          onAsk={askForSuggestions}
          onToggle={(title) => setPicked((current) => toggled(current, title))}
        />
      </fieldset>
      {openQuestions > 0 || canActivate ? (
        <div className="flex flex-col gap-1.5">
          {openQuestions > 0 ? (
            <label className="flex items-center gap-2 text-[13.5px] text-ink">
              <input type="checkbox" checked={askQuestions} onChange={(event) => setAskQuestions(event.target.checked)} className="size-4 accent-[var(--color-primary)]" />
              Add a task to ask the client the {openQuestions === 1 ? "open question" : `${openQuestions} open questions`}
            </label>
          ) : null}
          {canActivate ? (
            <label className="flex items-center gap-2 text-[13.5px] text-ink">
              <input type="checkbox" checked={activate} onChange={(event) => setActivate(event.target.checked)} className="size-4 accent-[var(--color-primary)]" />
              Mark {client.name} as an active client
            </label>
          ) : null}
        </div>
      ) : null}
      <p className="text-[12px] text-ink-subtle">Starts as planned, at intake. Move it forward when work begins.</p>
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="primary" disabled={pending || !name.trim()}>
          {pending ? "Creating…" : chosen.length ? `Create project with ${chosen.length === 1 ? "1 task" : `${chosen.length} tasks`}` : "Create project"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function toggled(set: ReadonlySet<string>, item: string): Set<string> {
  const next = new Set(set);
  if (next.has(item)) next.delete(item);
  else next.add(item);
  return next;
}

/** A small native select: accessible, keyboard-friendly, and quiet until used. */
function CompactSelect({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  options: [string, string][];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className="h-7 max-w-[150px] cursor-pointer rounded-[var(--radius-control)] border border-line bg-surface px-2 text-[12.5px] text-ink-muted hover:border-line-strong hover:text-ink focus:border-focus focus:outline-none disabled:opacity-60"
    >
      {options.map(([optionValue, optionLabel]) => (
        <option key={optionValue} value={optionValue}>
          {optionLabel}
        </option>
      ))}
    </select>
  );
}
