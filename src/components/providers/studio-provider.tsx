"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { createRepository } from "@/lib/data";
import { StudioStore, type StudioState } from "@/lib/data/studio-store";

const StudioContext = createContext<StudioStore | null>(null);

export function StudioProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => new StudioStore(createRepository));

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
