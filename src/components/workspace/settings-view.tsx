"use client";

import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { useStudio, useStudioStore } from "@/components/providers/studio-provider";
import { Button } from "@/components/ui/button";
import { Modal, ModalBody, ModalFooter } from "@/components/ui/modal";
import { PageHeader, Section, Skeleton, Surface } from "@/components/ui/surface";
import { useToast } from "@/components/ui/toast";
import { AGENTS } from "@/lib/agents/registry";
import { BRAND } from "@/lib/brand";
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
      await store.run((repository) => repository.resetDemoData());
      toast.success("The demo workspace was reset.");
      setConfirming(false);
    } catch (error) {
      toast.error(`The workspace was not reset. ${errorMessage(error)}`);
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <PageHeader title="Settings" description="Where data lives, what is connected, and what is still planned." />

      <div className="flex flex-col gap-12">
        <Section id="data" title="Workspace data">
          <Surface>
            <div className="px-5 py-4 text-[13.5px] leading-relaxed text-ink-muted">
              {state.status === "ready" ? (
                state.info.persistence === "browser" ? (
                  <p>
                    This is a demo workspace saved in this browser&apos;s local storage. It is not synced to a server and will
                    not appear on other devices, browsers or for other people.
                  </p>
                ) : (
                  <p>Browser storage is unavailable, so this workspace is held in memory only. Changes are lost on reload.</p>
                )
              ) : (
                <Skeleton className="h-4 w-96 max-w-full" />
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line px-5 py-4">
              <div>
                <p className="text-[13.5px] font-medium text-ink">Reset demo data</p>
                <p className="mt-0.5 text-[12.5px] text-ink-subtle">Removes everything you added and restores the example clients.</p>
              </div>
              <Button onClick={() => setConfirming(true)} disabled={state.status !== "ready"}>
                <RotateCcw aria-hidden />
                Reset
              </Button>
            </div>
          </Surface>
        </Section>

        <Section id="connections" title="Connections">
          <Surface>
            <ul className="divide-y divide-line">
              {[
                ["Database", "Not connected. A Supabase schema is drafted in the repository but has not been applied."],
                ["Sign-in", "Not set up. Required before real client data is stored on a server."],
                ["Email and file intake", "Not connected."],
              ].map(([name, text]) => (
                <li key={name} className="grid gap-1 px-5 py-3.5 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-6">
                  <p className="text-[13.5px] text-ink">{name}</p>
                  <p className="text-[13px] text-ink-subtle">{text}</p>
                </li>
              ))}
            </ul>
          </Surface>
        </Section>

        <Section id="agents" title="AI agents">
          <p className="mb-3 text-[13.5px] leading-relaxed text-ink-muted">
            None are connected. These are planned, and will all work from the same client records you see here. Agents can
            propose and draft; sending proposals, purchases, production changes, scope changes and launches always need a
            person&apos;s approval.
          </p>
          <Surface>
            <ul className="divide-y divide-line">
              {Object.values(AGENTS).map((agent) => (
                <li key={agent.id} className="grid gap-1 px-5 py-3.5 sm:grid-cols-[180px_minmax(0,1fr)_auto] sm:gap-6">
                  <p className="text-[13.5px] text-ink">{agent.label.replace(" agent", "")}</p>
                  <p className="text-[13px] leading-relaxed text-ink-muted">{agent.purpose}</p>
                  <p className="text-[12px] text-ink-subtle">{agent.status === "planned" ? "Planned" : "Connected"}</p>
                </li>
              ))}
            </ul>
          </Surface>
        </Section>

        <Section id="brand" title="Brand">
          <p className="text-[13.5px] leading-relaxed text-ink-muted">
            {BRAND.verified
              ? `Colors and type follow ${BRAND.company}'s brand guidelines.`
              : `The current colors and typeface are a neutral placeholder, not ${BRAND.company}'s official identity. ${BRAND.company}'s logo, palette and typeface still need to be supplied; they are set in one place (src/app/theme.css) when available.`}
          </p>
        </Section>
      </div>

      <Modal open={confirming} onClose={() => setConfirming(false)} busy={resetting} title="Reset demo data?" description="This cannot be undone.">
        <ModalBody>
          <p className="text-[14px] leading-relaxed text-ink-muted">
            Every client, project and task you added in this browser, and every edit you made, will be removed. The example
            records will be restored.
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
    </div>
  );
}
