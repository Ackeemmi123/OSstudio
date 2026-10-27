"use client";

import { ArrowLeft, CircleSlash, Pencil, SearchX } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { LoadError } from "@/components/load-error";
import { useCanEdit, useStudio } from "@/components/providers/studio-provider";
import { Avatar } from "@/components/ui/avatar";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState, Section, Skeleton, Surface } from "@/components/ui/surface";
import { cn } from "@/lib/cn";
import { getDecisions, getNextActions } from "@/lib/domain/insights";
import type { Client, StudioSnapshot } from "@/lib/domain/types";
import { BriefSection } from "./brief-section";
import { ClientAside, ExternalLink } from "./client-aside";
import { EditDetailsDialog } from "./edit-details-dialog";
import { IntakeReview } from "./intake-review";
import { ProjectsSection } from "./projects-section";
import { ClientStatusLabel, DemoTag } from "./status";

export function ClientWorkspace({ clientId }: { clientId: string }) {
  const state = useStudio();
  const shared = state.status === "ready" && state.info.kind === "supabase";
  if (state.status === "error") return <LoadError message={state.message} />;
  if (state.status === "loading") return <WorkspaceSkeleton />;

  const client = state.snapshot.clients.find((c) => c.id === clientId);
  if (!client) {
    return (
      <Surface>
        <EmptyState
          icon={<SearchX />}
          title="Client not found"
          description={
            shared
              ? "This client does not exist in this studio, or you do not have access to it."
              : "This client may have been added in another browser. Demo data is stored only in the browser where it was entered."
          }
          action={<ButtonLink href="/clients">Back to clients</ButtonLink>}
        />
      </Surface>
    );
  }
  return <Workspace client={client} snapshot={state.snapshot} />;
}

function Workspace({ client, snapshot }: { client: Client; snapshot: StudioSnapshot }) {
  const [editing, setEditing] = useState(false);
  const canEdit = useCanEdit();
  useScrollToHash();

  return (
    <>
      <Link href="/clients" className="mb-6 inline-flex items-center gap-1.5 rounded-sm text-[13px] text-ink-subtle transition-colors hover:text-ink">
        <ArrowLeft aria-hidden className="size-3.5" />
        Clients
      </Link>

      <header className="flex flex-col gap-4 pb-10 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <Avatar name={client.name} size="lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-[26px] leading-tight font-medium tracking-[-0.032em] text-ink">{client.name}</h1>
              {client.isDemo ? <DemoTag /> : null}
            </div>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px] text-ink-muted">
              <ClientStatusLabel status={client.status} />
              <Detail value={client.contactPerson} missing="No contact person" />
              {client.email ? (
                <a href={`mailto:${client.email}`} className="underline decoration-line-strong underline-offset-2 hover:text-ink hover:decoration-ink">
                  {client.email}
                </a>
              ) : (
                <Detail value={null} missing="No email" />
              )}
              {client.website ? <ExternalLink href={client.website}>{client.website}</ExternalLink> : null}
            </p>
          </div>
        </div>
        {canEdit ? (
          <Button onClick={() => setEditing(true)} className="self-start">
            <Pencil aria-hidden />
            Edit details
          </Button>
        ) : null}
      </header>

      <div className="grid gap-x-12 gap-y-12 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-12">
          <NextUp client={client} snapshot={snapshot} />
          <ProjectsSection client={client} snapshot={snapshot} />
          <BriefSection client={client} />
          <IntakeReview client={client} snapshot={snapshot} />
        </div>
        <ClientAside client={client} snapshot={snapshot} />
      </div>

      <EditDetailsDialog client={client} open={editing} onClose={() => setEditing(false)} />
    </>
  );
}

function Detail({ value, missing }: { value: string | null; missing: string }) {
  return value ? <span>{value}</span> : <span className="text-ink-subtle">{missing}</span>;
}

/** The one or two things to do for this client right now. */
function NextUp({ client, snapshot }: { client: Client; snapshot: StudioSnapshot }) {
  const decisions = getDecisions(snapshot).filter((item) => item.clientId === client.id);
  // Routine tasks are listed under Projects; only surface what is stuck or missing.
  const actions = getNextActions(snapshot, client.id).filter((action) => action.kind !== "task");
  if (decisions.length === 0 && actions.length === 0) return null;

  const items = [
    ...decisions.map((d) => ({ id: d.id, href: d.href, title: d.title, tag: d.kind === "approval" ? "Approve" : d.kind === "proposal" ? "Confirm" : "Review", critical: false })),
    ...actions.map((a) => ({ id: a.id, href: a.href, title: a.title, tag: a.kind === "blocked" ? "Blocked" : null, critical: a.kind === "blocked", detail: a.kind === "blocked" || a.kind === "collect" ? a.detail : undefined })),
  ];

  return (
    <Section id="next" title="What's next">
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.id}>
            <a href={item.href.slice(item.href.indexOf("#"))} className="group flex items-start gap-3 rounded-[var(--radius-control)] border border-line bg-surface px-4 py-3 transition-colors hover:border-line-strong">
              {item.critical ? (
                <CircleSlash aria-hidden strokeWidth={1.75} className="mt-0.5 size-4 shrink-0 text-critical" />
              ) : (
                <span aria-hidden className="mt-[7px] size-1.5 shrink-0 rounded-full bg-accent" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] leading-snug text-ink">{item.title}</span>
                {"detail" in item && item.detail ? <span className="mt-0.5 block text-[12.5px] text-ink-subtle">{item.detail}</span> : null}
              </span>
              {item.tag ? <span className={cn("shrink-0 text-[12px] font-medium", item.critical ? "text-critical" : "text-ink-muted group-hover:text-ink")}>{item.tag}</span> : null}
            </a>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/** Data loads in the browser, so scroll to a linked task or brief value once it exists. */
function useScrollToHash() {
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id) document.getElementById(id)?.scrollIntoView({ block: "center" });
  }, []);
}

export function WorkspaceSkeleton() {
  return (
    <div aria-busy aria-label="Loading client">
      <Skeleton className="mb-8 h-3 w-16" />
      <div className="mb-10 flex items-center gap-4">
        <Skeleton className="size-12 rounded-full" />
        <div className="flex-1">
          <Skeleton className="mb-2 h-7 w-64" />
          <Skeleton className="h-3.5 w-80 max-w-full" />
        </div>
      </div>
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Skeleton className="h-80" />
        <Skeleton className="h-64" />
      </div>
    </div>
  );
}
