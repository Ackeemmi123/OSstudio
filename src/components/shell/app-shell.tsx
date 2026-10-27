"use client";

import { X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { IconButton } from "@/components/ui/button";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      <a
        href="#main"
        className="sr-only z-50 rounded bg-surface px-3 py-2 text-sm focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>

      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-line lg:block">
        <Sidebar />
      </aside>

      {/* Mobile navigation drawer */}
      <div
        className={cn("fixed inset-0 z-40 lg:hidden", mobileNavOpen ? "visible" : "invisible")}
        aria-hidden={!mobileNavOpen}
      >
        <div
          className={cn("absolute inset-0 bg-ink/25 transition-opacity", mobileNavOpen ? "opacity-100" : "opacity-0")}
          onClick={() => setMobileNavOpen(false)}
        />
        <aside
          className={cn(
            "absolute inset-y-0 left-0 w-64 border-r border-line bg-canvas transition-transform duration-200",
            mobileNavOpen ? "translate-x-0" : "-translate-x-full",
          )}
          inert={!mobileNavOpen}
        >
          <IconButton label="Close navigation" className="absolute top-4 right-3" onClick={() => setMobileNavOpen(false)}>
            <X />
          </IconButton>
          <Sidebar onNavigate={() => setMobileNavOpen(false)} />
        </aside>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenNavigation={() => setMobileNavOpen(true)} />
        <main id="main" className="flex-1 px-5 pt-8 pb-16 sm:px-8 lg:px-12 lg:pt-10">
          <div className="mx-auto w-full max-w-[1160px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
