"use client";

import { Inbox, Plus, Search, Users, X } from "lucide-react";
import Link from "next/link";
import { useDeferredValue, useState } from "react";
import { LoadError } from "@/components/load-error";
import { useCanEdit, useStudio } from "@/components/providers/studio-provider";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { RelativeTime } from "@/components/ui/relative-time";
import { Tag } from "@/components/ui/status";
import { EmptyState, PageHeader, Section, Skeleton, Surface } from "@/components/ui/surface";
import { describeInquiry, getOpenInquiries } from "@/lib/domain/inquiries";
import { getClientRows, matchesClientQuery, type ClientRow } from "@/lib/domain/insights";
import type { Inquiry } from "@/lib/domain/types";
import { NewClientDialog } from "./new-client-dialog";
import { DemoTag } from "./status";

export function ClientsView() {
  const state = useStudio();
  const canEdit = useCanEdit();
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const deferredQuery = useDeferredValue(query);

  const rows = state.status === "ready" ? getClientRows(state.snapshot) : [];
  const inquiries = state.status === "ready" ? getOpenInquiries(state.snapshot) : [];
  const matches = rows.filter((row) => matchesClientQuery(row, deferredQuery));
  const searching = deferredQuery.trim() !== "";
  // Archived clients stay out of the way unless asked for, or found by a search.
  const archived = matches.filter((row) => row.client.status === "archived");
  const visible = searching || showArchived ? matches : matches.filter((row) => row.client.status !== "archived");

  return (
    <>
      <PageHeader
        title="Clients"
        actions={
          <Button variant="primary" onClick={() => setCreating(true)} disabled={!canEdit} hidden={state.status === "ready" && !canEdit}>
            <Plus aria-hidden />
            New client
          </Button>
        }
      />

      {inquiries.length ? <NewInquiries inquiries={inquiries} /> : null}

      <div className="relative mb-4 w-full sm:max-w-sm">
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-subtle" />
        <input
          type="search"
          aria-label="Search clients"
          placeholder="Search by name, contact, email or project"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-10 w-full rounded-[var(--radius-control)] border border-control bg-surface pr-3 pl-9 text-sm text-ink placeholder:text-ink-subtle hover:border-accent focus:border-focus focus:ring-2 focus:ring-focus/15 focus:outline-none"
        />
      </div>

      {state.status === "error" ? (
        <LoadError message={state.message} />
      ) : (
        <Surface className="overflow-hidden">
          {state.status === "loading" ? (
            <ListSkeleton />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={<Users />}
              title="No clients yet"
              description="Add your first client with just a name."
              action={
                canEdit ? (
                  <Button variant="primary" onClick={() => setCreating(true)}>
                    <Plus aria-hidden />
                    New client
                  </Button>
                ) : undefined
              }
            />
          ) : visible.length === 0 ? (
            <EmptyState
              icon={<Search />}
              title="No clients match"
              description={`Nothing matches “${query.trim()}”.`}
              action={
                <Button size="sm" onClick={() => setQuery("")}>
                  <X aria-hidden />
                  Clear search
                </Button>
              }
            />
          ) : (
            <ul className="divide-y divide-line">
              {visible.map((row) => (
                <ClientListRow key={row.client.id} row={row} />
              ))}
            </ul>
          )}
        </Surface>
      )}

      {state.status === "ready" && !searching && archived.length > 0 ? (
        <button
          type="button"
          onClick={() => setShowArchived((value) => !value)}
          className="mt-3 rounded-sm text-[13px] text-ink-subtle hover:text-ink"
          aria-expanded={showArchived}
        >
          {showArchived ? "Hide archived clients" : `Show ${archived.length} archived ${archived.length === 1 ? "client" : "clients"}`}
        </button>
      ) : null}

      {state.status === "ready" && state.info.kind === "local-demo" ? (
        <p className="mt-6 text-[12.5px] text-ink-subtle">Website inquiries only arrive in a signed-in Studio OS workspace, not in the local demo.</p>
      ) : null}

      <NewClientDialog open={creating} onClose={() => setCreating(false)} />
    </>
  );
}

/** Website inquiries waiting for a decision. They become clients only when a person approves them. */
function NewInquiries({ inquiries }: { inquiries: Inquiry[] }) {
  return (
    <Section id="inquiries" title="New inquiries" count={inquiries.length} className="mb-10">
      <Surface className="overflow-hidden">
        <ul className="divide-y divide-line">
          {inquiries.map((inquiry) => (
            <li key={inquiry.id}>
              <Link
                href={`/inquiries/${encodeURIComponent(inquiry.id)}`}
                className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 px-5 py-3.5 transition-colors hover:bg-surface-muted"
              >
                <span className="flex size-7 items-center justify-center rounded-full bg-sunken text-ink-subtle">
                  <Inbox aria-hidden className="size-3.5" />
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[14px] font-medium text-ink">{inquiry.company ?? inquiry.contactName}</span>
                    {inquiry.isTest ? <Tag tone="info">Test</Tag> : null}
                  </span>
                  <span className="mt-0.5 block truncate text-[12.5px] text-ink-subtle">
                    {inquiry.company ? `${inquiry.contactName} · ` : ""}
                    {describeInquiry(inquiry)}
                  </span>
                </span>
                <RelativeTime iso={inquiry.receivedAt} className="text-right text-[12.5px] text-ink-subtle" />
              </Link>
            </li>
          ))}
        </ul>
      </Surface>
    </Section>
  );
}

function ClientListRow({ row }: { row: ClientRow }) {
  const { client } = row;
  return (
    <li>
      <Link
        href={`/clients/${encodeURIComponent(client.id)}`}
        className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 px-5 py-3.5 transition-colors hover:bg-surface-muted sm:grid-cols-[auto_minmax(0,1fr)_200px_110px]"
      >
        <Avatar name={client.name} size="sm" />
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <span className="truncate text-[14px] font-medium text-ink">{client.name}</span>
            {client.isDemo ? <DemoTag /> : null}
          </span>
          <span className="mt-0.5 block truncate text-[12.5px] text-ink-subtle">{row.situation}</span>
        </span>
        <span className="hidden truncate text-[13px] text-ink-muted sm:block">{client.contactPerson ?? <span className="text-ink-subtle">No contact yet</span>}</span>
        <RelativeTime iso={row.lastActivity} className="text-right text-[12.5px] text-ink-subtle" />
      </Link>
    </li>
  );
}

function ListSkeleton() {
  return (
    <div aria-busy aria-label="Loading clients" className="divide-y divide-line">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-4">
          <Skeleton className="size-7 rounded-full" />
          <Skeleton className="h-3.5 w-44" />
          <Skeleton className="ml-auto h-3 w-16" />
        </div>
      ))}
    </div>
  );
}
