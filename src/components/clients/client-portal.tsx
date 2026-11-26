"use client";

import { Check, Copy, Link2, Mail } from "lucide-react";
import { useEffect, useState } from "react";
import { useSession } from "@/components/providers/session-provider";
import { useStudio, useStudioStore } from "@/components/providers/studio-provider";
import { useStudioAction } from "@/components/providers/use-studio-action";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/ui/surface";
import { useToast } from "@/components/ui/toast";
import type { Client } from "@/lib/domain/types";

const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

type MailLanguage = "fi" | "sv" | "en";

const MAIL: Record<MailLanguage, { label: string; hello: string; subject: string; body: string; private: string; regards: string }> = {
  fi: { label: "Suomi", hello: "Hei", subject: "Verkkosivustonne oma sivu", body: "Tässä on verkkosivustonne oma sivu. Siellä näette, miten työ etenee, vastaatte kysymyksiimme ja lähetätte kuvia ja tiedostoja:", private: "Linkki on yksityinen, joten jakakaa se vain organisaationne sisällä.", regards: "Terveisin" },
  sv: { label: "Svenska", hello: "Hej", subject: "Er sida för webbplatsen", body: "Här är er egen sida för webbplatsen. Där ser ni hur arbetet går, svarar på våra frågor och skickar bilder och filer:", private: "Länken är privat, så dela den bara inom er organisation.", regards: "Hälsningar" },
  en: { label: "English", hello: "Hi", subject: "Your page for the website", body: "Here is your own page for the website. There you can see how the work is going, answer our questions and send photos and files:", private: "The link is private, so please share it only within your organisation.", regards: "Best regards" },
};

/** A first e-mail with the link, in the client's language, for the person to send from their own mail and change as they like. */
export function portalMailto(client: Pick<Client, "contactPerson" | "email">, link: string, sender: string, studio: string, language: MailLanguage): string {
  const t = MAIL[language];
  const first = client.contactPerson?.trim().split(/\s+/)[0];
  const body = [`${t.hello}${first ? ` ${first}` : ""}!`, "", t.body, link, "", t.private, "", `${t.regards}\n${sender}\n${studio}`].join("\n");
  return `mailto:${encodeURIComponent(client.email ?? "")}?subject=${encodeURIComponent(t.subject)}&body=${encodeURIComponent(body)}`;
}

/**
 * The client's portal: one private link for the whole project, where they
 * see where their website stands, answer the open questions and send files
 * with their answers about rights. The link is shown once, when it is made.
 */
export function ClientPortal({ client }: { client: Client }) {
  const store = useStudioStore();
  const state = useStudio();
  const session = useSession();
  const toast = useToast();
  const { run, pending, canEdit } = useStudioAction();
  const server = state.status === "ready" && state.info.kind === "supabase";
  const [portal, setPortal] = useState<{ createdAt: string; expiresAt: string } | null | undefined>(undefined);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [mailLanguage, setMailLanguage] = useState<MailLanguage>("fi");

  useEffect(() => {
    if (!server) return;
    let active = true;
    store.read((r) => (r.clientPortal ? r.clientPortal(client.id) : Promise.resolve(null))).then(
      (found) => active && setPortal(found),
      () => active && setPortal(null),
    );
    return () => {
      active = false;
    };
  }, [store, server, client.id]);

  if (!server || portal === undefined) return null;
  const info = state.status === "ready" ? state.info : null;
  const sender = info?.kind === "supabase" ? (info.members.find((m) => m.userId === info.user.id)?.displayName ?? "") : "";
  const studio = session.mode === "supabase" ? session.studio.name : "";

  async function make() {
    if (portal && !window.confirm("Make a new link? The one the client has stops working.")) return;
    const token = await run((r) => r.createClientPortal!(client.id), "The portal link was not made.");
    if (!token) return;
    setLink(`${window.location.origin}/p/${token}`);
    setCopied(false);
    setPortal(await store.read((r) => r.clientPortal!(client.id)).catch(() => null));
  }
  async function turnOff() {
    if (!window.confirm("Turn the portal link off? The client can no longer open it.")) return;
    const done = await run(async (r) => {
      await r.revokeClientPortal!(client.id);
      return true;
    }, "The portal link was not turned off.");
    if (done) {
      setPortal(null);
      setLink(null);
    }
  }
  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success("Portal link copied.");
    } catch {
      toast.error(`Copying did not work here. The link is ${link}`);
    }
  }

  return (
    <Section id="portal" title="Client portal">
      <div className="flex flex-col gap-3 rounded-[var(--radius-surface)] border border-line bg-surface px-4 py-3.5 text-[13.5px]" data-testid="client-portal">
        <p className="text-ink-muted">One private link for the whole project: the client sees where the website stands, answers the open questions and sends photos and files with their answers about rights. What they send comes under Sources.</p>
        {link ? (
          <div className="flex flex-col gap-2 rounded-[var(--radius-control)] border border-accent/40 bg-accent-soft/50 px-3 py-2.5">
            <p className="text-[12.5px] text-ink">Here is the link. It is shown only now; copy it or e-mail it to the client.</p>
            <code className="text-[12px] break-all text-ink">{link}</code>
            <div className="flex flex-wrap gap-2">
              <Button size="xs" variant="primary" onClick={copy}>
                {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
                Copy the link
              </Button>
              <a className="inline-flex h-7 items-center gap-1 rounded-full border border-line-strong px-2 text-[12.5px] font-medium text-ink hover:bg-sunken" href={portalMailto(client, link, sender, studio, mailLanguage)}>
                <Mail aria-hidden className="size-3.5" />
                E-mail it to the client
              </a>
              <select
                aria-label="Language of the e-mail"
                value={mailLanguage}
                onChange={(event) => setMailLanguage(event.target.value as MailLanguage)}
                className="h-7 rounded-full border border-line-strong bg-surface px-2 text-[12.5px] text-ink"
              >
                {(Object.keys(MAIL) as MailLanguage[]).map((key) => (
                  <option key={key} value={key}>
                    {MAIL[key].label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          {portal ? (
            <span className="text-ink">
              Open since {DAY.format(new Date(portal.createdAt))}, until {DAY.format(new Date(portal.expiresAt))}
            </span>
          ) : (
            <span className="text-ink-subtle">No portal link yet.</span>
          )}
          {canEdit ? (
            <>
              <Button size="xs" variant={portal ? "ghost" : "primary"} onClick={make} disabled={pending}>
                <Link2 aria-hidden />
                {portal ? "Make a new link" : "Make the portal link"}
              </Button>
              {portal ? (
                <Button size="xs" variant="ghost" onClick={turnOff} disabled={pending}>
                  Turn off
                </Button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </Section>
  );
}
