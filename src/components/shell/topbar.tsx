"use client";

import { Search, Settings2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useStudio } from "@/components/providers/studio-provider";
import { cn } from "@/lib/cn";
import { BrandMark } from "./brand-mark";
import { isActive, PRIMARY_NAV } from "./navigation";
import { SearchDialog } from "./search-dialog";

export function Topbar() {
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
    <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur-sm">
      <div className="mx-auto flex h-14 w-full max-w-[1144px] items-center gap-4 px-4 sm:gap-8 sm:px-8">
        <Link href="/" className="rounded-sm" aria-label="Studio OS, Today">
          <BrandMark />
        </Link>

        <nav aria-label="Primary" className="flex h-full items-stretch gap-5">
          <Suspense fallback={<NavLinks pathname={null} />}>
            <ActiveNavLinks />
          </Suspense>
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <DemoBadge />
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="group hidden h-8 w-56 items-center gap-2 rounded-[var(--radius-control)] border border-line bg-canvas px-2.5 text-[13px] text-ink-subtle transition-colors hover:border-line-strong hover:text-ink-muted md:flex"
          >
            <Search aria-hidden className="size-3.5" />
            <span className="flex-1 text-left">Find a client or project</span>
            <kbd className="font-sans text-[11px] text-ink-subtle">⌘K</kbd>
          </button>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label="Search"
            className="inline-flex size-8 items-center justify-center rounded-[var(--radius-control)] text-ink-muted hover:bg-sunken hover:text-ink md:hidden"
          >
            <Search aria-hidden className="size-[17px]" />
          </button>
          <Link
            href="/settings"
            aria-label="Settings"
            title="Settings"
            className="inline-flex size-8 items-center justify-center rounded-[var(--radius-control)] text-ink-muted transition-colors hover:bg-sunken hover:text-ink"
          >
            <Settings2 aria-hidden strokeWidth={1.75} className="size-[17px]" />
          </Link>
        </div>
      </div>
      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </header>
  );
}

function ActiveNavLinks() {
  return <NavLinks pathname={usePathname()} />;
}

function NavLinks({ pathname }: { pathname: string | null }) {
  return PRIMARY_NAV.map((item) => {
    const active = pathname ? isActive(pathname, item.href) : false;
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "-mb-px flex items-center border-b-2 text-[14px] transition-colors",
          active ? "border-accent font-medium text-ink" : "border-transparent text-ink-subtle hover:text-ink",
        )}
      >
        {item.label}
      </Link>
    );
  });
}

/**
 * Always visible while data lives only in this browser, so nobody mistakes it
 * for a shared system. On the server it only appears for read-only access.
 */
function DemoBadge() {
  const state = useStudio();
  if (state.status !== "ready") return null;
  const badge =
    state.info.kind === "supabase"
      ? state.info.canWrite
        ? null
        : { label: "Read only", title: "You can view this studio but not change it." }
      : state.info.persistence === "browser"
        ? { label: "Local demo", title: "Data is saved in this browser only." }
        : { label: "Not saved", title: "Data is not saved. Changes reset on reload." };
  if (!badge) return null;
  return (
    <Link
      href="/settings"
      title={badge.title}
      className="mr-1 hidden h-6 items-center rounded-full border border-dashed border-line-strong px-2.5 text-[11.5px] text-ink-subtle transition-colors hover:text-ink-muted sm:inline-flex"
    >
      {badge.label}
    </Link>
  );
}
