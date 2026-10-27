"use client";

import { FolderKanban, Search, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useStudio } from "@/components/providers/studio-provider";
import { cn } from "@/lib/cn";
import { getClientRows, matchesClientQuery } from "@/lib/domain/insights";
import { CLIENT_STATUS_LABELS, PROJECT_STAGE_LABELS } from "@/lib/domain/labels";

interface Result {
  id: string;
  kind: "client" | "project";
  title: string;
  subtitle: string;
  href: string;
}

export function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
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
      className="mx-auto mt-[12vh] w-[calc(100vw-2rem)] max-w-lg overflow-hidden rounded-[12px] border border-line bg-surface p-0 text-ink shadow-[var(--shadow-overlay)]"
    >
      {open ? <SearchPanel onClose={onClose} /> : null}
    </dialog>
  );
}

function SearchPanel({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const state = useStudio();
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
      subtitle: [CLIENT_STATUS_LABELS[row.client.status], row.client.contactPerson].filter(Boolean).join(" · "),
      href: `/clients/${row.client.id}`,
    }));
    const clientNames = new Map(state.snapshot.clients.map((c) => [c.id, c.name]));
    const projects: Result[] = q
      ? state.snapshot.projects
          .filter((project) => `${project.name} ${clientNames.get(project.clientId) ?? ""}`.toLocaleLowerCase().includes(q))
          .slice(0, 4)
          .map((project) => ({
            id: project.id,
            kind: "project",
            title: project.name,
            subtitle: `${clientNames.get(project.clientId) ?? "Unknown client"} · ${PROJECT_STAGE_LABELS[project.stage]}`,
            href: `/clients/${project.clientId}?tab=workflow`,
          }))
      : [];
    return [...clients, ...projects];
  }, [state, query]);

  const go = (result: Result | undefined) => {
    if (!result) return;
    onClose();
    router.push(result.href);
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
          aria-label="Search clients and projects"
          placeholder="Search clients and projects"
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
          <li className="px-3 py-6 text-center text-[13px] text-ink-subtle">No clients or projects match “{query}”.</li>
        ) : (
          results.map((result, index) => {
            const Icon = result.kind === "client" ? User : FolderKanban;
            return (
              <li
                key={`${result.kind}-${result.id}`}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === safeIndex}
                onMouseMove={() => setActiveIndex(index)}
                onClick={() => go(result)}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-[6px] px-3 py-2",
                  index === safeIndex ? "bg-sunken/70" : "",
                )}
              >
                <Icon aria-hidden strokeWidth={1.75} className="size-4 shrink-0 text-ink-subtle" />
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-medium text-ink">{result.title}</p>
                  <p className="truncate text-[12px] text-ink-subtle">{result.subtitle}</p>
                </div>
                <span className="ml-auto text-[11px] text-ink-subtle capitalize">{result.kind}</span>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
