"use client";

import { useEffect, useState } from "react";
import { useStudio, useStudioStore } from "@/components/providers/studio-provider";
import { useStudioAction } from "@/components/providers/use-studio-action";
import { Section } from "@/components/ui/surface";
import { useToast } from "@/components/ui/toast";
import type { EmailSettings } from "@/lib/data/repository";

/**
 * The signed-in person's own choice of Studio OS e-mails: the morning list of
 * what is due, and a note at once when a client comments, approves or answers
 * on a review link. Both start on.
 */
export function EmailSettingsSection() {
  const store = useStudioStore();
  const state = useStudio();
  const { run, pending } = useStudioAction();
  const toast = useToast();
  const server = state.status === "ready" && state.info.kind === "supabase";
  const [settings, setSettings] = useState<EmailSettings | null>(null);

  useEffect(() => {
    if (!server) return;
    let active = true;
    store.read((r) => (r.emailSettings ? r.emailSettings() : Promise.resolve({ dailyDigest: true, clientEvents: true }))).then(
      (value) => active && setSettings(value),
      () => active && setSettings(null),
    );
    return () => {
      active = false;
    };
  }, [store, server]);

  if (!server || !settings) return null;

  async function change(next: EmailSettings) {
    const before = settings;
    setSettings(next);
    const ok = await run(async (r) => {
      await r.saveEmailSettings!(next);
      return true;
    }, "The e-mail setting was not saved.");
    if (ok) toast.success("Saved.");
    else setSettings(before);
  }

  const row = "flex items-start gap-3 rounded-[var(--radius-control)] px-1 py-1.5 text-[13.5px] text-ink";
  return (
    <Section id="email" title="E-mail">
      <div className="flex flex-col gap-1" data-testid="email-settings">
        <label className={row}>
          <input type="checkbox" className="mt-1" checked={settings.dailyDigest} disabled={pending} onChange={(e) => change({ ...settings, dailyDigest: e.target.checked })} />
          <span>
            Every morning at 7, what is due today and tomorrow
            <span className="block text-[12.5px] text-ink-subtle">Next steps and dated tasks, and anything overdue. Nothing is sent on a day with nothing due.</span>
          </span>
        </label>
        <label className={row}>
          <input type="checkbox" className="mt-1" checked={settings.clientEvents} disabled={pending} onChange={(e) => change({ ...settings, clientEvents: e.target.checked })} />
          <span>
            At once, when a client comments, approves or answers on a review link
            <span className="block text-[12.5px] text-ink-subtle">With a link to answer them or to publish.</span>
          </span>
        </label>
        <p className="mt-1 text-[12.5px] text-ink-subtle">Sent to the address you sign in with, through Resend in Ireland. Only for you; others choose their own.</p>
      </div>
    </Section>
  );
}
