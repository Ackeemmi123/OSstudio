"use client";

import { ChevronRight, Plus, Search, Users, X } from "lucide-react";
import Link from "next/link";
import { useDeferredValue, useState } from "react";
import { LoadError } from "@/components/load-error";
import { useStudio } from "@/components/providers/studio-provider";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { RelativeTime } from "@/components/ui/relative-time";
import { EmptyState, NotProvided, PageHeader, Skeleton, Surface } from "@/components/ui/surface";
import { cn } from "@/lib/cn";
import { getClientRows, matchesClientQuery, type ClientRow } from "@/lib/domain/insights";
import { CLIENT_STATUS_LABELS, PROJECT_TYPE_LABELS } from "@/lib/domain/labels";
import { CLIENT_STATUSES, type ClientStatus } from "@/lib/domain/types";
import { NewClientDialog } from "./new-client-dialog";
import { ClientStatusLabel, DemoTag } from "./status";

type StatusFilter = ClientStatus | "all";

export function ClientsView() {
  const state = useStudio();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [creating, setCreating] = useState(false);
  const deferredQuery = useDeferredValue(query);

  const rows = state.status === "ready" ? getClientRows(state.snapshot) : [];
  const counts = new Map<StatusFilter, number>([["all", rows.length]]);
  for (const row of rows) counts.set(row.client.status, (counts.get(row.client.status) ?? 0) + 1);

  const filtered = rows.filter(
    (row) => (status === "all" || row.client.status === status) && matchesClientQuery(row, deferredQuery),
  );
  const isFiltering = query.trim() !== "" || status !== "all";

  return (
    <>
      <PageHeader
        title="Clients"
        description="Everyone the studio works with, from first inquiry to finished projects."
        actions={
          <Button variant="primary" onClick={() => setCreating(true)} disabled={state.status !== "ready"}>
            <Plus aria-hidden />
            New client
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative w-full md:max-w-xs">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-subtle" />
          <input
            type="search"
            aria-label="Search clients"
            placeholder="Search name, contact, email or project"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-9 w-full rounded-[var(--radius-control)] border border-line-strong bg-surface pr-3 pl-9 text-sm text-ink placeholder:text-ink-subtle/80 hover:border-ink-subtle/50 focus:border-accent focus:ring-2 focus:ring-accent/15 focus:outline-none"
          />
        </div>

        <div role="group" aria-label="Filter by status" className="-mx-1 flex gap-1 overflow-x-auto px-1">
          {(["all", ...CLIENT_STATUSES] as StatusFilter[]).map((value) => {
            const selected = status === value;
            const count = counts.get(value) ?? 0;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={selected}
                onClick={() => setStatus(value)}
                className={cn(
                  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors",
                  selected
                    ? "border-ink/80 bg-ink text-canvas"
                    : "border-line-strong bg-surface text-ink-muted hover:border-ink-subtle/60 hover:text-ink",
                )}
              >
                {value === "all" ? "All" : CLIENT_STATUS_LABELS[value]}
                <span className={cn("text-[11px] tabular-nums", selected ? "text-canvas/70" : "text-ink-subtle")}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {state.status === "error" ? (
        <LoadError message={state.message} />
      ) : (
        <Surface className="overflow-hidden">
          {state.status === "loading" ? (
            <TableSkeleton />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={<Users />}
              title="No clients yet"
              description="Add your first client with just a name. The rest of the brief can follow."
              action={
                <Button variant="primary" onClick={() => setCreating(true)}>
                  <Plus aria-hidden />
                  New client
                </Button>
              }
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<Search />}
              title="No clients match"
              description={query.trim() ? `Nothing matches “${query.trim()}” with the current filter.` : "No clients have this status."}
              action={
                <Button
                  size="sm"
                  onClick={() => {
                    setQuery("");
                    setStatus("all");
                  }}
                >
                  <X aria-hidden />
                  Clear filters
                </Button>
              }
            />
          ) : (
            <ClientTable rows={filtered} />
          )}
        </Surface>
      )}

      {state.status === "ready" && rows.length > 0 ? (
        <p className="mt-3 text-[12px] text-ink-subtle" aria-live="polite">
          {isFiltering ? `Showing ${filtered.length} of ${rows.length} clients` : `${rows.length} clients`}
        </p>
      ) : null}

      <NewClientDialog open={creating} onClose={() => setCreating(false)} />
    </>
  );
}

function ClientTable({ rows }: { rows: ClientRow[] }) {
  return (
    <table className="w-full text-left text-[13.5px]">
      <thead className="border-b border-line bg-surface-muted text-[12px] text-ink-subtle">
        <tr>
          <th scope="col" className="py-2.5 pr-4 pl-5 font-medium">Client</th>
          <th scope="col" className="hidden px-4 py-2.5 font-medium md:table-cell">Contact</th>
          <th scope="col" className="hidden px-4 py-2.5 font-medium lg:table-cell">Project</th>
          <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
          <th scope="col" className="hidden px-4 py-2.5 font-medium sm:table-cell">Last activity</th>
          <th scope="col" className="w-10 py-2.5 pr-5"><span className="sr-only">Open</span></th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {rows.map((row) => (
          <ClientTableRow key={row.client.id} row={row} />
        ))}
      </tbody>
    </table>
  );
}

function ClientTableRow({ row }: { row: ClientRow }) {
  const { client, projects } = row;
  const href = `/clients/${client.id}`;
  return (
    // The client name is the real link; the row overlay just enlarges the click target.
    <tr className="group relative transition-colors hover:bg-surface-muted">
      <td className="py-3.5 pr-4 pl-5">
        <div className="flex items-center gap-3">
          <Avatar name={client.name} size="sm" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Link href={href} className="truncate font-medium text-ink after:absolute after:inset-0 focus-visible:outline-none group-focus-within:underline">
                {client.name}
              </Link>
              {client.isDemo ? <DemoTag /> : null}
            </div>
            <p className="mt-0.5 truncate text-[12px] text-ink-subtle">
              {client.website ?? client.email ?? <NotProvided>No website or email</NotProvided>}
            </p>
          </div>
        </div>
      </td>
      <td className="hidden px-4 py-3.5 md:table-cell">
        {client.contactPerson ? <span className="text-ink-muted">{client.contactPerson}</span> : <NotProvided />}
      </td>
      <td className="hidden px-4 py-3.5 lg:table-cell">
        <p className="text-ink-muted">{row.projectType ? PROJECT_TYPE_LABELS[row.projectType] : <NotProvided>Not decided</NotProvided>}</p>
        <p className="mt-0.5 text-[12px] text-ink-subtle">
          {projects.length === 0 ? "No projects yet" : projects.length === 1 ? projects[0].name : `${projects.length} projects`}
        </p>
      </td>
      <td className="px-4 py-3.5">
        <ClientStatusLabel status={client.status} />
        {row.missingEssentials > 0 && client.status !== "archived" ? (
          <p className="mt-0.5 text-[12px] text-caution">
            {row.missingEssentials} {row.missingEssentials === 1 ? "detail" : "details"} missing
          </p>
        ) : null}
      </td>
      <td className="hidden px-4 py-3.5 text-ink-muted sm:table-cell">
        <RelativeTime iso={row.lastActivity} />
      </td>
      <td className="py-3.5 pr-5 text-right">
        <ChevronRight aria-hidden className="ml-auto size-4 text-ink-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-ink-muted" />
      </td>
    </tr>
  );
}

function TableSkeleton() {
  return (
    <div aria-busy aria-label="Loading clients" className="divide-y divide-line">
      <div className="h-10 bg-surface-muted" />
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-5 py-4">
          <Skeleton className="size-7 rounded-full" />
          <Skeleton className="h-3.5 w-44" />
          <Skeleton className="ml-auto h-3 w-20" />
        </div>
      ))}
    </div>
  );
}
