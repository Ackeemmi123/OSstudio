"use client";

import { useState } from "react";
import { errorMessage } from "@/lib/data/studio-store";
import type { StudioRepository } from "@/lib/data/repository";
import { useToast } from "@/components/ui/toast";
import { useStudioStore } from "./studio-provider";

/**
 * Runs one repository write with a pending flag and a visible error.
 * Resolves to undefined when the write failed.
 */
export function useStudioAction() {
  const store = useStudioStore();
  const toast = useToast();
  const [pending, setPending] = useState(false);

  async function run<T>(write: (repository: StudioRepository) => Promise<T>, failure = "The change was not saved."): Promise<T | undefined> {
    setPending(true);
    try {
      return await store.run(write);
    } catch (error) {
      toast.error(`${failure} ${errorMessage(error)}`);
      return undefined;
    } finally {
      setPending(false);
    }
  }

  return { run, pending };
}
