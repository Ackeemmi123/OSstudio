"use client";

import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { useStudio, useStudioStore } from "@/components/providers/studio-provider";
import { Button } from "@/components/ui/button";
import { Modal, ModalBody, ModalFooter } from "@/components/ui/modal";
import { PageHeader, Skeleton, Surface, SurfaceHeader } from "@/components/ui/surface";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/data/studio-store";

export function SettingsView() {
  const state = useStudio();
  const store = useStudioStore();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [resetting, setResetting] = useState(false);

  async function reset() {
    setResetting(true);
    try {
      await store.resetDemoData();
      toast.success("The demo workspace was reset.");
      setConfirming(false);
    } catch (error) {
      toast.error(`The workspace was not reset. ${errorMessage(error)}`);
    } finally {
      setResetting(false);
    }
  }

  return (
    <>
      <PageHeader title="Settings" description="Workspace data and integrations." />

      <div className="flex flex-col gap-6">
        <Surface aria-labelledby="data-heading">
          <SurfaceHeader id="data-heading" title="Workspace data" />
          <div className="px-5 py-4 text-[13.5px] leading-relaxed text-ink-muted">
            {state.status === "ready" ? (
              state.info.persistence === "browser" ? (
                <p>
                  This is a demo workspace stored in this browser&apos;s local storage. Data is not synced to a server
                  and will not appear on other devices or browsers.
                </p>
              ) : (
                <p>
                  Browser storage is unavailable, so this workspace is held in memory only. Changes are lost when the
                  page reloads.
                </p>
              )
            ) : (
              <Skeleton className="h-4 w-96 max-w-full" />
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line px-5 py-4">
            <div>
              <p className="text-[13.5px] font-medium text-ink">Reset demo data</p>
              <p className="mt-0.5 text-[12.5px] text-ink-subtle">
                Removes clients you created and restores the example records.
              </p>
            </div>
            <Button onClick={() => setConfirming(true)} disabled={state.status !== "ready"}>
              <RotateCcw aria-hidden />
              Reset
            </Button>
          </div>
        </Surface>

        <Surface aria-labelledby="integrations-heading">
          <SurfaceHeader id="integrations-heading" title="Integrations" />
          <ul className="divide-y divide-line">
            {[
              ["Database", "Not connected. A Supabase schema is prepared in the repository but not applied."],
              ["Email", "Not connected."],
              ["AI providers", "Not configured. Client creation never depends on AI."],
            ].map(([name, text]) => (
              <li key={name} className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-3.5">
                <p className="text-[13.5px] text-ink">{name}</p>
                <p className="text-[12.5px] text-ink-subtle">{text}</p>
              </li>
            ))}
          </ul>
        </Surface>
      </div>

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        busy={resetting}
        title="Reset demo data?"
        description="This cannot be undone."
      >
        <ModalBody>
          <p className="text-[14px] leading-relaxed text-ink-muted">
            Every client you created and every edit you made in this browser will be removed. The example clients,
            projects and tasks will be restored.
          </p>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setConfirming(false)} disabled={resetting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={reset} disabled={resetting} aria-busy={resetting}>
            {resetting ? "Resetting…" : "Reset workspace"}
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}
