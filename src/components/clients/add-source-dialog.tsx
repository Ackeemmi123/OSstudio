"use client";

import { useId, useState, type FormEvent } from "react";
import { useStudioStore } from "@/components/providers/studio-provider";
import { Button } from "@/components/ui/button";
import { describedBy, Field, Select, TextArea, TextInput } from "@/components/ui/field";
import { Modal, ModalBody, ModalFooter } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/data/studio-store";
import { SOURCE_TYPE_LABELS } from "@/lib/domain/labels";
import { SOURCE_CONTENT_MAX_LENGTH, SOURCE_TYPES, type SourceType } from "@/lib/domain/types";

/** Paste an email, form message, call notes or brief. It is kept exactly as written. */
export function AddSourceDialog({ clientId, open, onClose }: { clientId: string; open: boolean; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={open} onClose={onClose} busy={busy} size="lg" title="Add source material" description="Paste what the client sent or what was said. It is stored exactly as written and can be analyzed.">
      {open ? <AddSourceForm clientId={clientId} onClose={onClose} onBusyChange={setBusy} /> : null}
    </Modal>
  );
}

function AddSourceForm({ clientId, onClose, onBusyChange }: { clientId: string; onClose: () => void; onBusyChange: (busy: boolean) => void }) {
  const store = useStudioStore();
  const toast = useToast();
  const formId = useId();
  const [type, setType] = useState<SourceType>("email");
  const [label, setLabel] = useState("");
  const [content, setContent] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const contentError = submitted
    ? !content.trim()
      ? "Paste the material to keep."
      : content.length > SOURCE_CONTENT_MAX_LENGTH
        ? `This is ${content.length.toLocaleString("en")} characters; the limit is ${SOURCE_CONTENT_MAX_LENGTH.toLocaleString("en")}. Split it into parts.`
        : undefined
    : undefined;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setSubmitted(true);
    setError(null);
    if (!content.trim() || content.length > SOURCE_CONTENT_MAX_LENGTH) return;
    setSubmitting(true);
    onBusyChange(true);
    try {
      await store.run((repository) => repository.addSource(clientId, { type, label: label.trim() || SOURCE_TYPE_LABELS[type], content }));
      onBusyChange(false);
      onClose();
      toast.success("Source material added.");
    } catch (caught) {
      setError(errorMessage(caught));
      setSubmitting(false);
      onBusyChange(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
      <ModalBody className="flex flex-col gap-5">
        <fieldset disabled={submitting} className="grid gap-4 sm:grid-cols-2">
          <Field id={`${formId}-type`} label="Kind">
            <Select id={`${formId}-type`} value={type} onChange={(e) => setType(e.target.value as SourceType)}>
              {SOURCE_TYPES.filter((t) => t !== "manual").map((t) => (
                <option key={t} value={t}>
                  {SOURCE_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field id={`${formId}-label`} label="Name" hint="For example “Email from Anna, 12 Oct”.">
            <TextInput id={`${formId}-label`} autoComplete="off" value={label} maxLength={120} onChange={(e) => setLabel(e.target.value)} aria-describedby={`${formId}-label-hint`} />
          </Field>
          <Field id={`${formId}-content`} label="Content" required error={contentError} className="sm:col-span-2">
            <TextArea
              id={`${formId}-content`}
              rows={10}
              autoFocus
              value={content}
              onChange={(e) => setContent(e.target.value)}
              invalid={Boolean(contentError)}
              aria-required
              aria-describedby={describedBy(`${formId}-content`, { error: contentError })}
            />
          </Field>
        </fieldset>
        {error ? (
          <p role="alert" className="rounded-[var(--radius-control)] border border-critical/30 bg-critical/[0.05] px-3 py-2.5 text-[13px] text-critical">
            The material was not added. {error}
          </p>
        ) : null}
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={submitting} aria-busy={submitting}>
          {submitting ? "Adding…" : "Add material"}
        </Button>
      </ModalFooter>
    </form>
  );
}
