"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { getBrowserStorage, LocalDemoRepository } from "@/lib/data/local-repository";
import { StudioStore, type StudioState } from "@/lib/data/studio-store";
import type { StudioSnapshot } from "@/lib/domain/types";

const StudioContext = createContext<StudioStore | null>(null);

export function StudioProvider({ children }: { children: ReactNode }) {
  const [store] = useState(
    () => new StudioStore(() => new LocalDemoRepository({ storage: getBrowserStorage() })),
  );

  useEffect(() => {
    void store.load();
  }, [store]);

  return <StudioContext.Provider value={store}>{children}</StudioContext.Provider>;
}

export function useStudioStore(): StudioStore {
  const store = useContext(StudioContext);
  if (!store) throw new Error("useStudioStore must be used inside <StudioProvider>.");
  return store;
}

export function useStudio(): StudioState {
  const store = useStudioStore();
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
}

/** Convenience for components that only render once data is ready. */
export function useStudioSnapshot(): StudioSnapshot | null {
  const state = useStudio();
  return state.status === "ready" ? state.snapshot : null;
}
