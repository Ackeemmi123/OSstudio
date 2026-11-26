"use client";

import { useSyncExternalStore } from "react";

const KEY = "studio-os:show-test-clients";
// Today remembered the choice under its own name before the client list had the switch too.
const OLD_KEY = "studio-os:today-show-tests";
const listeners = new Set<() => void>();
// When the browser refuses storage, the choice lives here until the page is left.
let memory = false;

function read(): boolean {
  try {
    const stored = window.localStorage.getItem(KEY) ?? window.localStorage.getItem(OLD_KEY);
    return stored === null ? memory : stored === "1";
  } catch {
    return memory;
  }
}

function write(show: boolean) {
  memory = show;
  try {
    window.localStorage.setItem(KEY, show ? "1" : "0");
    window.localStorage.removeItem(OLD_KEY);
  } catch {
    // Only a convenience; the switch still works on this page.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === KEY || event.key === OLD_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * Whether test clients ("(TEST)" in the name) are shown in Today and the client list.
 * They stay hidden unless someone asks; the choice is remembered on this browser and
 * shared by both views. The server always renders them hidden.
 */
export function useShowTestClients(): [boolean, (show: boolean) => void] {
  return [useSyncExternalStore(subscribe, read, () => false), write];
}
