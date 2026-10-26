"use client";

import { Bell, ChevronRight, Menu, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, Suspense, useEffect, useState } from "react";
import { useStudio } from "@/components/providers/studio-provider";
import { IconButton } from "@/components/ui/button";
import { getAttentionItems, type AttentionKind } from "@/lib/domain/insights";
import { sectionFor } from "./navigation";
import { SearchDialog } from "./search-dialog";

export function Topbar({ onOpenNavigation }: { onOpenNavigation: () => void }) {
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-canvas/95 px-5 backdrop-blur-[2px] sm:px-8 lg:px-12">
      <IconButton label="Open navigation" className="-ml-2 lg:hidden" onClick={onOpenNavigation}>
        <Menu />
      </IconButton>

      <Suspense fallback={<div className="flex-1" />}>
        <Breadcrumbs />
      </Suspense>

      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        className="group hidden h-8 w-64 items-center gap-2 rounded-[var(--radius-control)] border border-line bg-surface px-2.5 text-[13px] text-ink-subtle transition-colors hover:border-line-strong hover:text-ink-muted md:flex"
      >
        <Search aria-hidden className="size-3.5" />
        <span className="flex-1 text-left">Search clients and projects</span>
        <kbd className="rounded border border-line px-1 font-sans text-[10.5px] text-ink-subtle">⌘K</kbd>
      </button>
      <IconButton label="Search" className="md:hidden" onClick={() => setSearchOpen(true)}>
        <Search />
      </IconButton>

      <Notifications />

      <div
        className="ml-1 flex size-8 items-center justify-center rounded-full border border-line-strong bg-surface text-[11px] font-medium text-ink-muted"
        role="img"
        aria-label="Profile placeholder. User accounts are not set up yet."
        title="Profile — user accounts are not set up yet"
      >
        You
      </div>

      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </header>
  );
}

function Breadcrumbs() {
  const pathname = usePathname();
  const state = useStudio();
  const section = sectionFor(pathname);

  const crumbs: { label: string; href?: string }[] = [];
  if (section) crumbs.push({ label: section.label, href: section.href });

  const clientMatch = pathname.match(/^\/clients\/([^/]+)/);
  if (clientMatch) {
    const id = decodeURIComponent(clientMatch[1]);
    const client = state.status === "ready" ? state.snapshot.clients.find((c) => c.id === id) : undefined;
    crumbs.push({ label: client?.name ?? (state.status === "loading" ? "…" : "Client") });
  }

  return (
    <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
      <ol className="flex items-center gap-1.5 text-[13px]">
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          return (
            <Fragment key={`${crumb.label}-${index}`}>
              {index > 0 ? <ChevronRight aria-hidden className="size-3.5 shrink-0 text-ink-subtle/70" /> : null}
              <li className="min-w-0 truncate">
                {last || !crumb.href ? (
                  <span aria-current={last ? "page" : undefined} className="font-medium text-ink">
                    {crumb.label}
                  </span>
                ) : (
                  <Link href={crumb.href} className="text-ink-subtle transition-colors hover:text-ink">
                    {crumb.label}
                  </Link>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}

const KIND_LABEL: Record<AttentionKind, string> = {
  blocked: "Blocked",
  approval: "Awaiting approval",
  review: "In review",
  missing_info: "Missing information",
};

/**
 * Lists attention items derived from workspace data. There is no delivery
 * system yet (no email or push), and the panel says so.
 */
function Notifications() {
  const state = useStudio();
  const items = state.status === "ready" ? getAttentionItems(state.snapshot) : [];

  return (
    <>
      <button
        type="button"
        popoverTarget="notifications-panel"
        aria-label={items.length ? `Notifications, ${items.length} items need attention` : "Notifications"}
        title="Notifications"
        className="relative inline-flex size-8 items-center justify-center rounded-[var(--radius-control)] text-ink-muted transition-colors hover:bg-sunken/70 hover:text-ink"
      >
        <Bell aria-hidden className="size-[17px]" />
        {items.length ? (
          <span aria-hidden className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-caution ring-2 ring-canvas" />
        ) : null}
      </button>
      <div
        id="notifications-panel"
        popover="auto"
        className="fixed inset-auto top-14 right-4 m-0 w-[min(380px,calc(100vw-2rem))] rounded-[10px] border border-line bg-surface p-0 text-ink shadow-[var(--shadow-overlay)] sm:right-8"
      >
        <div className="border-b border-line px-4 py-3">
          <p className="text-sm font-semibold">Needs attention</p>
          <p className="mt-0.5 text-[12px] text-ink-subtle">
            Derived from current workspace data. Notification delivery is not set up yet.
          </p>
        </div>
        {items.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-ink-subtle">Nothing needs your attention right now.</p>
        ) : (
          <ul className="max-h-[60vh] divide-y divide-line overflow-y-auto">
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  onClick={() => document.getElementById("notifications-panel")?.hidePopover()}
                  className="block px-4 py-3 transition-colors hover:bg-surface-muted"
                >
                  <p className="text-[11px] font-medium tracking-wide text-ink-subtle uppercase">{KIND_LABEL[item.kind]}</p>
                  <p className="mt-0.5 text-[13px] font-medium text-ink">{item.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-[12px] text-ink-subtle">{item.detail}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
