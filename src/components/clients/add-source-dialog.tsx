"use client";

import { useId, useState, type FormEvent } from "react";
import { useStudioStore } from "@/components/providers/studio-provider";
import { Button } from "@/components/ui/button";
import { describedBy, Field, Select, TextArea, TextInput } from "@/components/ui/field";
import { Modal, ModalBody, ModalFooter } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/data/studio-store";
import { SOURCE_TYPE_LABELS } from "@/lib/domain/labels";
import { SOURCE_CONTENT_MAX_LENGTH, SOURCE_TYPES, type ReadMaterial, type SourceType } from "@/lib/domain/types";

type Mode = "paste" | "files" | "web";

/** Add what the client sent: pasted text, files (PDF, Word, images) or a web page. Text is kept exactly as written. */
export function AddSourceDialog({ clientId, open, onClose, onFilesAdded }: { clientId: string; open: boolean; onClose: () => void; onFilesAdded?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<Mode>("paste");
  return (
    <Modal open={open} onClose={onClose} busy={busy} size="lg" title="Add source material" description="Paste text, add the files the client sent, or read their current web page. Word documents and web pages become text sources; PDFs and images are kept as files.">
      {open ? (
        <>
          <div role="tablist" aria-label="How to add material" className="flex gap-1 border-b border-line px-6 pt-1">
            {(
              [
                ["paste", "Paste text"],
                ["files", "Files"],
                ["web", "Web page"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={mode === value}
                disabled={busy}
                onClick={() => setMode(value)}
                className={`-mb-px border-b-2 px-3 py-2 text-[13px] ${mode === value ? "border-primary text-ink" : "border-transparent text-ink-subtle hover:text-ink"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {mode === "paste" ? <AddSourceForm clientId={clientId} onClose={onClose} onBusyChange={setBusy} /> : null}
          {mode === "files" ? <AddFilesForm clientId={clientId} onClose={onClose} onBusyChange={setBusy} onFilesAdded={onFilesAdded} /> : null}
          {mode === "web" ? <AddWebPageForm clientId={clientId} onClose={onClose} onBusyChange={setBusy} /> : null}
        </>
      ) : null}
    </Modal>
  );
}

/** Keeps read text as one source per part, named after the file or page. */
async function keepAsSources(add: (input: { type: SourceType; label: string; content: string }) => Promise<unknown>, read: ReadMaterial, type: SourceType, prefix = "") {
  const total = read.parts.length;
  for (const [i, part] of read.parts.entries()) {
    const name = `${prefix}${read.title}`.slice(0, 100);
    const content = read.url && i === 0 ? `${read.url}\n\n${part}` : part;
    await add({ type, label: total > 1 ? `${name} (del ${i + 1}/${total})` : name, content: content.slice(0, SOURCE_CONTENT_MAX_LENGTH) });
  }
}

function AddFilesForm({ clientId, onClose, onBusyChange, onFilesAdded }: { clientId: string; onClose: () => void; onBusyChange: (busy: boolean) => void; onFilesAdded?: () => void }) {
  const store = useStudioStore();
  const toast = useToast();
  const formId = useId();
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting || !files.length) return;
    setSubmitting(true);
    onBusyChange(true);
    const lines: string[] = [];
    let failed = 0;
    for (const file of files) {
      const title = file.name.replace(/\.(pdf|docx|png|jpe?g|webp)$/i, "");
      try {
        const result = await store.run((r) => r.addClientMaterial!(clientId, file, title));
        if (result.kind === "text") {
          await keepAsSources((input) => store.run((r) => r.addSource(clientId, input)), result.read, "document");
          lines.push(`${file.name}: read into ${result.read.parts.length} text source${result.read.parts.length === 1 ? "" : "s"}`);
        } else {
          lines.push(`${file.name}: kept as a file`);
        }
      } catch (caught) {
        failed++;
        lines.push(`${file.name}: not added. ${errorMessage(caught)}`);
      }
      setProgress([...lines]);
    }
    onFilesAdded?.();
    onBusyChange(false);
    setSubmitting(false);
    if (!failed) {
      onClose();
      toast.success(files.length === 1 ? "The file was added." : `${files.length} files were added.`);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
      <ModalBody className="flex flex-col gap-4">
        <Field id={`${formId}-files`} label="Files" hint="PDF, Word (.docx), JPEG, PNG or WebP, at most 4 MB each.">
          <input
            id={`${formId}-files`}
            type="file"
            multiple
            accept=".pdf,.docx,.png,.jpg,.jpeg,.webp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/png,image/jpeg,image/webp"
            disabled={submitting}
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            className="text-[13px]"
          />
        </Field>
        {progress.length ? (
          <ul aria-live="polite" className="flex flex-col gap-1 text-[13px] text-ink-muted">
            {progress.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : null}
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" onClick={onClose} disabled={submitting}>
          {progress.length ? "Close" : "Cancel"}
        </Button>
        <Button type="submit" variant="primary" disabled={submitting || !files.length} aria-busy={submitting}>
          {submitting ? "Adding…" : files.length > 1 ? `Add ${files.length} files` : "Add file"}
        </Button>
      </ModalFooter>
    </form>
  );
}

function AddWebPageForm({ clientId, onClose, onBusyChange }: { clientId: string; onClose: () => void; onBusyChange: (busy: boolean) => void }) {
  const store = useStudioStore();
  const toast = useToast();
  const formId = useId();
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting || !url.trim()) return;
    setSubmitting(true);
    setError(null);
    onBusyChange(true);
    try {
      const read = await store.run((r) => r.readClientWebPage!(clientId, url.trim()));
      await keepAsSources((input) => store.run((r) => r.addSource(clientId, input)), read, "other", "Webbsida: ");
      onBusyChange(false);
      onClose();
      toast.success("The web page was read into a source.");
    } catch (caught) {
      setError(errorMessage(caught));
      setSubmitting(false);
      onBusyChange(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
      <ModalBody className="flex flex-col gap-4">
        <Field id={`${formId}-url`} label="Web address" hint="The client's current public site, for example nomadinterior.fi. One page is read.">
          <TextInput id={`${formId}-url`} type="url" inputMode="url" autoComplete="off" autoFocus value={url} disabled={submitting} onChange={(e) => setUrl(e.target.value)} />
        </Field>
        {error ? (
          <p role="alert" className="rounded-[var(--radius-control)] border border-critical/30 bg-critical/[0.05] px-3 py-2.5 text-[13px] text-critical">
            The page was not read. {error}
          </p>
        ) : null}
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={submitting || !url.trim()} aria-busy={submitting}>
          {submitting ? "Reading…" : "Read the page"}
        </Button>
      </ModalFooter>
    </form>
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
