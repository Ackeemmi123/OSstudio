"use client";

import { LogOut, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { useAgentStatus } from "@/components/agents/use-agent-status";
import { useSession } from "@/components/providers/session-provider";
import { useStudio, useStudioStore } from "@/components/providers/studio-provider";
import { Button } from "@/components/ui/button";
import { Modal, ModalBody, ModalFooter } from "@/components/ui/modal";
import { PageHeader, Section, Skeleton, Surface } from "@/components/ui/surface";
import { useToast } from "@/components/ui/toast";
import { formatUsd } from "@/lib/agents/pricing";
import { AGENTS } from "@/lib/agents/registry";
import type { AiSpend } from "@/lib/data/repository";
import { BRAND } from "@/lib/brand";
import { errorMessage } from "@/lib/data/studio-store";
import { ImportSection } from "./import-section";
import { PeopleSection } from "./people-section";

const ROLE_LABELS = { owner: "Owner", member: "Member", viewer: "Viewer (read only)" } as const;

export function SettingsView() {
  const state = useStudio();
  const session = useSession();
  const supabase = state.status === "ready" && state.info.kind === "supabase" ? state.info : null;

  return (
    <div className="max-w-3xl">
      <PageHeader title="Settings" description="Where data lives, who has access, and what is connected." />

      <div className="flex flex-col gap-12">
        <Section id="data" title="Workspace data">
          {state.status !== "ready" ? (
            <Surface className="px-5 py-4">
              <Skeleton className="h-4 w-96 max-w-full" />
            </Surface>
          ) : supabase && session.mode === "supabase" ? (
            <Surface>
              <div className="px-5 py-4 text-[13.5px] leading-relaxed text-ink-muted">
                <p>
                  Stored on the server for <span className="text-ink">{supabase.studio.name}</span>, shared with everyone in the studio.
                  You are signed in as <span className="text-ink">{supabase.user.email}</span> ({ROLE_LABELS[supabase.role].toLowerCase()}).
                </p>
              </div>
              {session.memberships.length > 1 ? (
                <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3.5">
                  <span className="mr-1 text-[12.5px] text-ink-subtle">Switch studio</span>
                  {session.memberships.map((m) => (
                    <Button key={m.studioId} size="xs" variant={m.studioId === session.studio.studioId ? "primary" : "secondary"} onClick={() => session.switchStudio(m.studioId)}>
                      {m.name}
                    </Button>
                  ))}
                </div>
              ) : null}
              <div className="flex items-center justify-end border-t border-line px-5 py-3.5">
                <Button size="sm" onClick={() => void session.signOut()}>
                  <LogOut aria-hidden />
                  Sign out
                </Button>
              </div>
            </Surface>
          ) : (
            <LocalDataSection />
          )}
        </Section>

        {supabase && session.mode === "supabase" ? <ImportSection supabase={session.supabase} studioId={supabase.studio.id} canWrite={supabase.canWrite} /> : null}
        {supabase && session.mode === "supabase" ? <PeopleSection supabase={session.supabase} info={supabase} /> : null}

        <Section id="connections" title="Connections">
          <Surface>
            <ul className="divide-y divide-line">
              {(supabase
                ? [
                    ["Database", `Connected (Supabase). Access is limited to members of ${supabase.studio.name}.`],
                    ["Sign-in", "Email and password, managed by the studio's administrator."],
                    ["Email and file intake", "Not connected. Paste source material in a client's workspace."],
                  ]
                : [
                    ["Database", "Not used in the local demo. Configure Supabase to store data on a server (see docs/persistence.md)."],
                    ["Sign-in", "Not used in the local demo."],
                    ["Email and file intake", "Not connected."],
                  ]
              ).map(([name, text]) => (
                <li key={name} className="grid gap-1 px-5 py-3.5 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-6">
                  <p className="text-[13.5px] text-ink">{name}</p>
                  <p className="text-[13px] text-ink-subtle">{text}</p>
                </li>
              ))}
            </ul>
          </Surface>
        </Section>

        <AgentsSection serverAvailable={Boolean(supabase)} owner={supabase?.role === "owner"} />

        <Section id="brand" title="Brand">
          <p className="text-[13.5px] leading-relaxed text-ink-muted">
            {BRAND.verified
              ? `Logo, colors and type follow ${BRAND.company}'s brand, as used on the ${BRAND.company} website. They are set in one place (src/app/theme.css).`
              : `The current colors and typeface are a neutral placeholder, not ${BRAND.company}'s official identity. ${BRAND.company}'s logo, palette and typeface still need to be supplied; they are set in one place (src/app/theme.css) when available.`}
          </p>
        </Section>
      </div>
    </div>
  );
}

function LocalDataSection() {
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
    <>
      <Surface>
        <div className="px-5 py-4 text-[13.5px] leading-relaxed text-ink-muted">
          {state.status === "ready" && state.info.persistence === "browser" ? (
            <p>
              This is a demo workspace saved in this browser&apos;s local storage. It is not synced to a server and will not appear on other
              devices, browsers or for other people.
            </p>
          ) : (
            <p>Browser storage is unavailable, so this workspace is held in memory only. Changes are lost on reload.</p>
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

      <Modal open={confirming} onClose={() => setConfirming(false)} busy={resetting} title="Reset demo data?" description="This cannot be undone.">
        <ModalBody>
          <p className="text-[14px] leading-relaxed text-ink-muted">
            Every client, project and task you added in this browser, and every edit you made, will be removed. The example records will be
            restored.
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

function AgentsSection({ serverAvailable, owner }: { serverAvailable: boolean; owner: boolean }) {
  const status = useAgentStatus(serverAvailable);
  const spend = useAiSpend(serverAvailable && owner);
  const intake =
    status.state === "loading"
      ? "Checking…"
      : status.state === "available"
        ? status.test
          ? "Connected to a test provider (no AI)"
          : `Connected${status.model ? ` · ${status.model}` : ""}`
        : "Not configured";

  return (
    <Section id="agents" title="AI agents">
      <p className="mb-3 text-[13.5px] leading-relaxed text-ink-muted">
        Agents work from the same client records you see here. They read, propose and draft; a person decides. No agent can send
        anything to a client, spend money, change a live site or approve work, and none starts on its own.
      </p>
      {status.state === "unavailable" ? <p className="mb-3 text-[12.5px] text-ink-subtle">{status.reason}</p> : null}
      {spend ? <AiSpendLine spend={spend} /> : null}
      <Surface>
        <ul className="divide-y divide-line">
          {Object.values(AGENTS).map((agent) => (
            <li key={agent.id} className="grid gap-1 px-5 py-3.5 sm:grid-cols-[180px_minmax(0,1fr)_auto] sm:gap-6">
              <p className="text-[13.5px] text-ink">{agent.label.replace(" agent", "")}</p>
              <p className="text-[13px] leading-relaxed text-ink-muted">{agent.purpose}</p>
              <p className="text-[12px] text-ink-subtle">{agent.status === "planned" ? "Planned" : intake}</p>
            </li>
          ))}
        </ul>
      </Surface>
    </Section>
  );
}

function useAiSpend(enabled: boolean): AiSpend | "error" | null {
  const store = useStudioStore();
  const [spend, setSpend] = useState<AiSpend | "error" | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    store
      .read((repository) => (repository.aiSpend ? repository.aiSpend() : Promise.reject(new Error("No AI spend here."))))
      .then((next) => active && setSpend(next))
      .catch(() => active && setSpend("error"));
    return () => {
      active = false;
    };
  }, [enabled, store]);
  return enabled ? spend : null;
}

function AiSpendLine({ spend }: { spend: AiSpend | "error" }) {
  if (spend === "error") return <p className="mb-3 text-[12.5px] text-ink-subtle">This month&apos;s AI spend could not be loaded.</p>;
  const month = new Date(`${spend.month}T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" });
  const used = spend.spentMicros + spend.reservedMicros;
  return (
    <p className="mb-3 text-[13px] text-ink-muted" data-testid="ai-spend">
      AI spend in {month}: <span className="text-ink tabular-nums">{formatUsd(spend.spentMicros)}</span> of {formatUsd(spend.capMicros)}
      {spend.reservedMicros > 0 ? ` (${formatUsd(spend.reservedMicros)} held for requests in progress)` : ""}.
      {used >= spend.capMicros ? " The limit is reached; agents will not run until next month." : " Estimated from list prices; agents stop when the limit is reached."}
    </p>
  );
}
