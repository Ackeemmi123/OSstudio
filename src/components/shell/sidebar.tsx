"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { useStudio } from "@/components/providers/studio-provider";
import { cn } from "@/lib/cn";
import { getDashboardSummary } from "@/lib/domain/insights";
import { PRIMARY_NAV, SECONDARY_NAV, isActive, type NavItem } from "./navigation";

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pt-6 pb-7">
        <Link href="/" onClick={onNavigate} className="group inline-flex flex-col rounded-sm">
          <span className="font-serif text-[21px] leading-none tracking-[-0.01em] text-ink">Studio OS</span>
          <span className="mt-1.5 text-[11px] font-medium tracking-[0.12em] text-ink-subtle uppercase">
            Studio workspace
          </span>
        </Link>
      </div>

      <nav aria-label="Primary" className="flex-1 px-3">
        <Suspense fallback={<NavList items={PRIMARY_NAV} pathname={null} />}>
          <ActiveNavList items={PRIMARY_NAV} onNavigate={onNavigate} showCounts />
        </Suspense>
      </nav>

      <div className="px-3 pb-3">
        <nav aria-label="Secondary" className="border-t border-line pt-3">
          <Suspense fallback={<NavList items={SECONDARY_NAV} pathname={null} />}>
            <ActiveNavList items={SECONDARY_NAV} onNavigate={onNavigate} />
          </Suspense>
        </nav>
        <WorkspaceNote />
      </div>
    </div>
  );
}

function ActiveNavList(props: { items: NavItem[]; onNavigate?: () => void; showCounts?: boolean }) {
  const pathname = usePathname();
  return <NavList {...props} pathname={pathname} />;
}

function NavList({
  items,
  pathname,
  onNavigate,
  showCounts,
}: {
  items: NavItem[];
  pathname: string | null;
  onNavigate?: () => void;
  showCounts?: boolean;
}) {
  const counts = useNavCounts(showCounts);
  return (
    <ul className="flex flex-col gap-0.5">
      {items.map((item) => {
        const active = pathname ? isActive(pathname, item.href) : false;
        const Icon = item.icon;
        const count = counts[item.href];
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group flex h-8 items-center gap-2.5 rounded-[var(--radius-control)] px-2.5 text-[13.5px] transition-colors",
                active
                  ? "bg-surface font-medium text-ink shadow-[0_0_0_1px_var(--color-line)]"
                  : "text-ink-muted hover:bg-sunken/60 hover:text-ink",
              )}
            >
              <Icon
                aria-hidden
                strokeWidth={1.75}
                className={cn("size-4 shrink-0", active ? "text-accent-strong" : "text-ink-subtle group-hover:text-ink-muted")}
              />
              <span className="flex-1 truncate">{item.label}</span>
              {count ? (
                <span className="text-[11px] tabular-nums text-ink-subtle" aria-label={`${count} pending`}>
                  {count}
                </span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function useNavCounts(enabled?: boolean): Record<string, number | undefined> {
  const state = useStudio();
  if (!enabled || state.status !== "ready") return {};
  const summary = getDashboardSummary(state.snapshot);
  return { "/approvals": summary.pendingApprovals || undefined };
}

function WorkspaceNote() {
  const state = useStudio();
  if (state.status !== "ready") return null;
  return (
    <Link
      href="/settings"
      className="mt-3 block rounded-[var(--radius-control)] border border-dashed border-line-strong px-3 py-2.5 text-[12px] leading-snug text-ink-subtle transition-colors hover:border-ink-subtle/50 hover:text-ink-muted"
    >
      <span className="font-medium text-ink-muted">Demo workspace</span>
      <br />
      {state.info.persistence === "browser" ? "Saved in this browser only." : "Not saved. Changes reset on reload."}
    </Link>
  );
}
