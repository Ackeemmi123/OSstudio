"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import type { StudioRepository } from "@/lib/data/repository";
import { StudioStore, type StudioState } from "@/lib/data/studio-store";

const StudioContext = createContext<StudioStore | null>(null);

/**
 * Exposes one repository to the UI. Mount it with a `key` that changes with
 * the signed-in user and studio, so nothing carries over between them.
 */
export function StudioProvider({
  createRepository,
  onSessionExpired,
  children,
}: {
  createRepository: () => StudioRepository;
  onSessionExpired?: () => void;
  children: ReactNode;
}) {
  const [store] = useState(() => new StudioStore(createRepository, onSessionExpired));

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

/** Whether the current person may change data. False while loading and for viewers. */
export function useCanEdit(): boolean {
  const state = useStudio();
  return state.status === "ready" && state.info.canWrite;
}

/** Whether the current person owns the studio. Only owners place retention holds. */
export function useIsOwner(): boolean {
  const state = useStudio();
  return state.status === "ready" && state.info.kind === "supabase" && state.info.role === "owner";
}
