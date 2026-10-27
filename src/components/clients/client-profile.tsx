"use client";

import { ArrowLeft, Pencil, SearchX } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, type KeyboardEvent } from "react";
import { LoadError } from "@/components/load-error";
import { useStudio } from "@/components/providers/studio-provider";
import { Avatar } from "@/components/ui/avatar";
import { Button, ButtonLink } from "@/components/ui/button";
import { RelativeTime } from "@/components/ui/relative-time";
import { EmptyState, Skeleton, Surface } from "@/components/ui/surface";
import { cn } from "@/lib/cn";
import { getClientRows } from "@/lib/domain/insights";
import { PROJECT_TYPE_LABELS } from "@/lib/domain/labels";
import type { Client, StudioSnapshot } from "@/lib/domain/types";
import { EditClientDialog } from "./edit-client-dialog";
import { ActivityTab, ContextTab, FilesTab, OverviewTab, WorkflowTab } from "./profile-tabs";
import { ClientStatusLabel, DemoTag } from "./status";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "context", label: "Context" },
  { id: "workflow", label: "Workflow" },
  { id: "files", label: "Files & Deliverables" },
  { id: "activity", label: "Activity" },
] as const;

export type TabId = (typeof TABS)[number]["id"];

function isTabId(value: string | null): value is TabId {
  return TABS.some((tab) => tab.id === value);
}

export function ClientProfile({ clientId }: { clientId: string }) {
  const state = useStudio();
  if (state.status === "error") return <LoadError message={state.message} />;
  if (state.status === "loading") return <ProfileSkeleton />;

  const client = state.snapshot.clients.find((c) => c.id === clientId);
  if (!client) {
    return (
      <Surface>
        <EmptyState
          icon={<SearchX />}
          title="Client not found"
          description="This client may have been created in another browser. The demo workspace is stored only in the browser where it was created."
          action={<ButtonLink href="/clients">Back to clients</ButtonLink>}
        />
      </Surface>
    );
  }

  return <Profile client={client} snapshot={state.snapshot} />;
}

function Profile({ client, snapshot }: { client: Client; snapshot: StudioSnapshot }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requested = searchParams.get("tab");
  const activeTab: TabId = isTabId(requested) ? requested : "overview";
  const [editing, setEditing] = useState(false);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const row = getClientRows(snapshot).find((r) => r.client.id === client.id);
  const projectType = row?.projectType ?? null;

  const selectTab = (tab: TabId, focus = false) => {
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "overview") params.delete("tab");
    else params.set("tab", tab);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    if (focus) tabRefs.current[tab]?.focus();
  };

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = TABS.findIndex((tab) => tab.id === activeTab);
    const move = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (move) {
      event.preventDefault();
      selectTab(TABS[(index + move + TABS.length) % TABS.length].id, true);
    } else if (event.key === "Home") {
      event.preventDefault();
      selectTab(TABS[0].id, true);
    } else if (event.key === "End") {
      event.preventDefault();
      selectTab(TABS[TABS.length - 1].id, true);
    }
  };

  const openEdit = () => setEditing(true);

  return (
    <>
      <Link href="/clients" className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-ink-subtle transition-colors hover:text-ink">
        <ArrowLeft aria-hidden className="size-3.5" />
        Clients
      </Link>

      <header className="flex flex-col gap-5 pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <Avatar name={client.name} size="lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-serif text-[32px] leading-tight tracking-[-0.01em] text-ink">{client.name}</h1>
              {client.isDemo ? <DemoTag /> : null}
            </div>
            <dl className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-muted">
              <div className="flex gap-1.5">
                <dt className="sr-only">Project type</dt>
                <dd>{projectType ? PROJECT_TYPE_LABELS[projectType] : <span className="text-ink-subtle italic">Project type not decided</span>}</dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="sr-only">Status</dt>
                <dd><ClientStatusLabel status={client.status} /></dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="text-ink-subtle">Last activity</dt>
                <dd><RelativeTime iso={row?.lastActivity ?? client.updatedAt} /></dd>
              </div>
            </dl>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button onClick={openEdit}>
            <Pencil aria-hidden />
            Edit
          </Button>
        </div>
      </header>

      <div role="tablist" aria-label="Client sections" className="mb-8 flex gap-6 overflow-x-auto border-b border-line">
        {TABS.map((tab) => {
          const selected = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                tabRefs.current[tab.id] = el;
              }}
              id={`tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => selectTab(tab.id)}
              onKeyDown={onTabKeyDown}
              className={cn(
                "-mb-px shrink-0 border-b-[1.5px] pt-1 pb-3 text-[13.5px] whitespace-nowrap transition-colors",
                selected ? "border-ink font-medium text-ink" : "border-transparent text-ink-subtle hover:text-ink",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={`panel-${activeTab}`} aria-labelledby={`tab-${activeTab}`}>
        {activeTab === "overview" ? <OverviewTab client={client} snapshot={snapshot} onEdit={openEdit} /> : null}
        {activeTab === "context" ? <ContextTab client={client} onEdit={openEdit} /> : null}
        {activeTab === "workflow" ? <WorkflowTab client={client} snapshot={snapshot} /> : null}
        {activeTab === "files" ? <FilesTab client={client} /> : null}
        {activeTab === "activity" ? <ActivityTab client={client} snapshot={snapshot} /> : null}
      </div>

      <EditClientDialog client={client} open={editing} onClose={() => setEditing(false)} />
    </>
  );
}

export function ProfileSkeleton() {
  return (
    <div aria-busy aria-label="Loading client">
      <Skeleton className="mb-8 h-3 w-16" />
      <div className="mb-8 flex items-center gap-4">
        <Skeleton className="size-14 rounded-full" />
        <div className="flex-1">
          <Skeleton className="mb-2 h-8 w-64" />
          <Skeleton className="h-3.5 w-80 max-w-full" />
        </div>
      </div>
      <Skeleton className="mb-8 h-8 w-full" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    </div>
  );
}
