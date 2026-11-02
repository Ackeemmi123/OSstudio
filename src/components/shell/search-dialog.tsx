"use client";

import { CheckSquare, FileText, FolderKanban, Plus, Search, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useCanEdit, useStudio } from "@/components/providers/studio-provider";
import { cn } from "@/lib/cn";
import { getClientRows, matchesClientQuery } from "@/lib/domain/insights";
import { actorLabel, PROJECT_STAGE_LABELS, TASK_STATUS_LABELS } from "@/lib/domain/labels";
import { isWebsiteProject } from "@/lib/domain/site-specs";

interface Result {
  id: string;
  kind: "client" | "project" | "spec" | "task" | "action";
  title: string;
  subtitle: string;
  /** Where the result leads. An action without one runs instead. */
  href?: string;
  run?: () => void;
}

const KIND_ICON = { client: User, project: FolderKanban, spec: FileText, task: CheckSquare, action: Plus };
const KIND_LABEL = { client: "Client", project: "Project", spec: "Website spec", task: "Task", action: "Action" };

export function SearchDialog({ open, onClose, onNewClient }: { open: boolean; onClose: () => void; onNewClient: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label="Search"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="mx-auto mt-[12vh] w-[calc(100vw-2rem)] max-w-lg overflow-hidden rounded-[var(--radius-surface)] border border-line bg-surface p-0 text-ink shadow-[var(--shadow-overlay)]"
    >
      {open ? <SearchPanel onClose={onClose} onNewClient={onNewClient} /> : null}
    </dialog>
  );
}

function SearchPanel({ onClose, onNewClient }: { onClose: () => void; onNewClient: () => void }) {
  const router = useRouter();
  const state = useStudio();
  const canEdit = useCanEdit();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const listId = useId();

  const results = useMemo<Result[]>(() => {
    if (state.status !== "ready") return [];
    const q = query.trim().toLocaleLowerCase();
    const rows = getClientRows(state.snapshot).filter((row) => matchesClientQuery(row, q));
    const clients: Result[] = rows.slice(0, 6).map((row) => ({
      id: row.client.id,
      kind: "client",
      title: row.client.name,
      subtitle: row.situation,
      href: `/clients/${encodeURIComponent(row.client.id)}`,
    }));
    const clientNames = new Map(state.snapshot.clients.map((c) => [c.id, c.name]));
    const matches = (text: string) => text.toLocaleLowerCase().includes(q);
    const matchedProjects = q ? state.snapshot.projects.filter((project) => matches(`${project.name} ${clientNames.get(project.clientId) ?? ""}`)) : [];
    const projects: Result[] = matchedProjects.slice(0, 4).map((project) => ({
      id: project.id,
      kind: "project",
      title: project.name,
      subtitle: `${clientNames.get(project.clientId) ?? "Unknown client"} · ${PROJECT_STAGE_LABELS[project.stage]}`,
      href: `/clients/${encodeURIComponent(project.clientId)}#project-${project.id}`,
    }));
    const specs: Result[] = matchedProjects
      .filter(isWebsiteProject)
      .slice(0, 2)
      .map((project) => ({
        id: project.id,
        kind: "spec",
        title: `Open website spec: ${project.name}`,
        subtitle: clientNames.get(project.clientId) ?? "Unknown client",
        href: `/clients/${encodeURIComponent(project.clientId)}/projects/${encodeURIComponent(project.id)}/site`,
      }));
    const projectById = new Map(state.snapshot.projects.map((project) => [project.id, project]));
    const tasks: Result[] = q
      ? state.snapshot.tasks.flatMap((task) => {
          const project = projectById.get(task.projectId);
          if (!project || !matches(task.title)) return [];
          const subtitle = [clientNames.get(project.clientId) ?? "Unknown client", TASK_STATUS_LABELS[task.status], task.assignee ? actorLabel(task.assignee) : null];
          return [{ id: task.id, kind: "task" as const, title: task.title, subtitle: subtitle.filter(Boolean).join(" · "), href: `/clients/${encodeURIComponent(project.clientId)}#task-${task.id}` }];
        }).slice(0, 6)
      : [];
    const actions: Result[] = canEdit && (!q || matches("new client")) ? [{ id: "new-client", kind: "action", title: "New client", subtitle: "Add a client and start their brief", run: onNewClient }] : [];
    return [...clients, ...projects, ...specs, ...tasks, ...actions];
  }, [state, query, canEdit, onNewClient]);

  const go = (result: Result | undefined) => {
    if (!result) return;
    onClose();
    if (result.run) result.run();
    else if (result.href) {
      // On the same page only the hash changes, and the client page follows it.
      const target = new URL(result.href, window.location.href);
      if (target.pathname === window.location.pathname && target.hash) window.location.hash = target.hash;
      else router.push(result.href);
    }
  };

  const safeIndex = Math.min(activeIndex, Math.max(results.length - 1, 0));

  return (
    <div>
      <div className="flex items-center gap-2.5 border-b border-line px-4">
        <Search aria-hidden className="size-4 text-ink-subtle" />
        <input
          autoFocus
          role="combobox"
          aria-expanded
          aria-controls={listId}
          aria-activedescendant={results[safeIndex] ? `${listId}-${safeIndex}` : undefined}
          aria-label="Search clients, projects and tasks"
          placeholder="Find a client, project or task"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActiveIndex((i) => Math.min(i + 1, results.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((i) => Math.max(i - 1, 0));
            } else if (event.key === "Enter") {
              event.preventDefault();
              go(results[safeIndex]);
            }
          }}
          className="h-12 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-subtle"
        />
        <kbd className="rounded border border-line px-1.5 text-[10.5px] text-ink-subtle">Esc</kbd>
      </div>

      <ul id={listId} role="listbox" aria-label="Results" className="max-h-80 overflow-y-auto p-1.5">
        {state.status !== "ready" ? (
          <li className="px-3 py-6 text-center text-[13px] text-ink-subtle">Loading workspace…</li>
        ) : results.length === 0 ? (
          <li className="px-3 py-6 text-center text-[13px] text-ink-subtle">Nothing matches “{query}”.</li>
        ) : (
          results.map((result, index) => {
            const Icon = KIND_ICON[result.kind];
            return (
              <li
                key={`${result.kind}-${result.id}`}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === safeIndex}
                onMouseMove={() => setActiveIndex(index)}
                onClick={() => go(result)}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-[var(--radius-control)] px-3 py-2",
                  index === safeIndex ? "bg-sunken" : "",
                )}
              >
                <Icon aria-hidden strokeWidth={1.75} className="size-4 shrink-0 text-ink-subtle" />
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-medium text-ink">{result.title}</p>
                  <p className="truncate text-[12px] text-ink-subtle">{result.subtitle}</p>
                </div>
                <span className="ml-auto shrink-0 pl-2 text-[11px] text-ink-subtle">{KIND_LABEL[result.kind]}</span>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
