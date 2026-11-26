"use client";

import { Copy, Mail, PenLine } from "lucide-react";
import { useId, useState } from "react";
import { useStudio } from "@/components/providers/studio-provider";
import { Button, buttonClasses } from "@/components/ui/button";
import { Field, Select, TextArea, TextInput } from "@/components/ui/field";
import { Modal, ModalBody, ModalFooter } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { CHASE_KINDS, chaseDraft, clientLanguage, mailtoLink, type ChaseDraft, type ChaseLanguage } from "@/lib/domain/chase";
import type { FollowUp } from "@/lib/domain/followups";
import type { StudioSnapshot } from "@/lib/domain/types";

/**
 * "Draft message" for a follow-up that waits on the client. Opens an
 * editable draft; Studio OS never sends it. Renders nothing for other kinds.
 */
export function ChaseDraftButton({ followUp, snapshot }: { followUp: FollowUp; snapshot: StudioSnapshot }) {
  const state = useStudio();
  const [draft, setDraft] = useState<{ draft: ChaseDraft; language: ChaseLanguage } | null>(null);
  if (!CHASE_KINDS.has(followUp.kind) || state.status !== "ready" || !state.info.canWrite) return null;
  const info = state.info;

  /** The draft in a language: the client's by default, from their website inquiry, else Finnish. */
  function open(language: ChaseLanguage = followUp.clientId ? clientLanguage(followUp.clientId, snapshot) : "fi") {
    const me = info.kind === "supabase" ? info.members.find((member) => member.userId === info.user.id)?.displayName : null;
    const made = chaseDraft(followUp, snapshot, { name: me ?? null, studio: info.kind === "supabase" ? info.studio.name : null }, language);
    setDraft(made ? { draft: made, language } : null);
  }

  return (
    <>
      <Button size="xs" variant="ghost" onClick={() => open()} className="mt-1">
        <PenLine aria-hidden />
        Draft message
      </Button>
      {draft ? <DraftDialog key={draft.language} initial={draft.draft} language={draft.language} onLanguage={open} onClose={() => setDraft(null)} /> : null}
    </>
  );
}

const LANGUAGES: { value: ChaseLanguage; label: string }[] = [
  { value: "fi", label: "Finnish" },
  { value: "sv", label: "Swedish" },
  { value: "en", label: "English" },
];

function DraftDialog({ initial, language, onLanguage, onClose }: { initial: ChaseDraft; language: ChaseLanguage; onLanguage: (language: ChaseLanguage) => void; onClose: () => void }) {
  const id = useId();
  const toast = useToast();
  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState(initial.body);
  const draft = { ...initial, subject, body };
  const mailto = mailtoLink(draft);

  async function copy() {
    try {
      await navigator.clipboard.writeText(`${subject}\n\n${body}`);
      toast.success("Copied. Paste it into your email and send it yourself.");
    } catch {
      toast.error("The text could not be copied. Select it and copy it instead.");
    }
  }

  return (
    <Modal open onClose={onClose} title="Draft message" description="Nothing is sent from Studio OS. Check the text, then copy it or open it in your email app and send it yourself." size="lg">
      <ModalBody className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] text-ink-muted">To: {initial.to ?? <span className="text-ink-subtle">no email address recorded</span>}</p>
          <Select aria-label="Language of the message" value={language} onChange={(event) => onLanguage(event.target.value as ChaseLanguage)} className="w-auto">
            {LANGUAGES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
        <Field id={`${id}-subject`} label="Subject">
          <TextInput id={`${id}-subject`} value={subject} onChange={(event) => setSubject(event.target.value)} />
        </Field>
        <Field id={`${id}-body`} label="Message">
          <TextArea id={`${id}-body`} rows={12} value={body} onChange={(event) => setBody(event.target.value)} />
        </Field>
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
        <Button onClick={copy}>
          <Copy aria-hidden />
          Copy
        </Button>
        {mailto ? (
          <a className={buttonClasses("primary")} href={mailto}>
            <Mail aria-hidden />
            Open in email
          </a>
        ) : null}
      </ModalFooter>
    </Modal>
  );
}
