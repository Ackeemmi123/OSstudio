"use client";

import { ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { useStudio, useStudioStore } from "@/components/providers/studio-provider";
import { Button } from "@/components/ui/button";
import { describedBy, Field, Select, TextArea, TextInput } from "@/components/ui/field";
import { Modal, ModalBody, ModalFooter } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/data/studio-store";
import { SOURCE_TYPE_LABELS } from "@/lib/domain/labels";
import { SOURCE_TYPES, type NewClientInput } from "@/lib/domain/types";
import { findDuplicateClient, hasErrors, validateClientIdentity } from "@/lib/domain/validation";

const EMPTY = { name: "", contactPerson: "", email: "", website: "", sourceType: "", initialNotes: "" } satisfies NewClientInput;

/** A name is enough. Everything else is optional and can be completed in the client workspace. */
export function NewClientDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={open} onClose={onClose} busy={busy} title="New client" description="A name is all you need. Add the rest whenever you have it.">
      {/* Remount the form on each open so cancelled input is discarded. */}
      {open ? <NewClientForm onClose={onClose} onBusyChange={setBusy} /> : null}
    </Modal>
  );
}

function NewClientForm({ onClose, onBusyChange }: { onClose: () => void; onBusyChange: (busy: boolean) => void }) {
  const store = useStudioStore();
  const state = useStudio();
  const router = useRouter();
  const toast = useToast();
  const formId = useId();
  const id = (name: string) => `${formId}-${name}`;

  const [values, setValues] = useState<typeof EMPTY>(EMPTY);
  const [showMore, setShowMore] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmedDuplicateOf, setConfirmedDuplicateOf] = useState<string | null>(null);

  const errors = submitted ? validateClientIdentity(values) : {};
  const duplicate = state.status === "ready" ? findDuplicateClient(state.snapshot.clients, values.name) : undefined;
  const awaitingDuplicateConfirmation = duplicate && confirmedDuplicateOf === duplicate.id;

  const set = (key: keyof typeof EMPTY) => (event: { target: { value: string } }) =>
    setValues((current) => ({ ...current, [key]: event.target.value }));

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return; // Guard against double submission.
    setSubmitted(true);
    setSubmitError(null);

    const validation = validateClientIdentity(values);
    if (hasErrors(validation)) {
      const firstInvalid = (["name", "email", "website"] as const).find((key) => validation[key]);
      if (firstInvalid && firstInvalid !== "name") setShowMore(true);
      if (firstInvalid) requestAnimationFrame(() => document.getElementById(id(firstInvalid))?.focus());
      return;
    }
    if (duplicate && confirmedDuplicateOf !== duplicate.id) {
      setConfirmedDuplicateOf(duplicate.id);
      return;
    }

    setSubmitting(true);
    onBusyChange(true);
    try {
      const client = await store.run((repository) =>
        repository.createClient({ ...values, sourceType: values.sourceType as NewClientInput["sourceType"] }),
      );
      onBusyChange(false);
      onClose();
      toast.success(`${client.name} was added.`);
      router.push(`/clients/${encodeURIComponent(client.id)}`);
    } catch (error) {
      setSubmitError(errorMessage(error));
      setSubmitting(false);
      onBusyChange(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
      <ModalBody className="flex flex-col gap-5">
        <fieldset disabled={submitting} className="flex flex-col gap-5">
          <Field id={id("name")} label="Company or client name" required error={errors.name}>
            <TextInput
              id={id("name")}
              autoFocus
              autoComplete="off"
              value={values.name}
              onChange={set("name")}
              invalid={Boolean(errors.name)}
              aria-required
              aria-describedby={describedBy(id("name"), { error: errors.name })}
              placeholder="e.g. Ateljé Henrik"
            />
            {duplicate && !errors.name ? (
              <p role="status" className="text-[12px] text-caution">
                A client named “{duplicate.name}” already exists.
                {awaitingDuplicateConfirmation ? " Select “Add anyway” to create a second record." : ""}
              </p>
            ) : null}
          </Field>

          {showMore ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id={id("contact")} label="Contact person">
                <TextInput id={id("contact")} autoComplete="off" value={values.contactPerson} onChange={set("contactPerson")} />
              </Field>
              <Field id={id("email")} label="Email" error={errors.email}>
                <TextInput
                  id={id("email")}
                  type="email"
                  autoComplete="off"
                  value={values.email}
                  onChange={set("email")}
                  invalid={Boolean(errors.email)}
                  aria-describedby={describedBy(id("email"), { error: errors.email })}
                />
              </Field>
              <Field id={id("website")} label="Website" error={errors.website}>
                <TextInput
                  id={id("website")}
                  inputMode="url"
                  autoComplete="off"
                  placeholder="company.com"
                  value={values.website}
                  onChange={set("website")}
                  invalid={Boolean(errors.website)}
                  aria-describedby={describedBy(id("website"), { error: errors.website })}
                />
              </Field>
              <Field id={id("source")} label="How they reached us">
                <Select id={id("source")} value={values.sourceType} onChange={set("sourceType")}>
                  <option value="">Not specified</option>
                  {SOURCE_TYPES.filter((type) => type !== "manual").map((type) => (
                    <option key={type} value={type}>
                      {SOURCE_TYPE_LABELS[type]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                id={id("notes")}
                label="Inquiry or notes"
                className="sm:col-span-2"
                hint="Paste the email, form message or call notes. Kept as source material, exactly as written."
              >
                <TextArea id={id("notes")} rows={4} value={values.initialNotes} onChange={set("initialNotes")} aria-describedby={`${id("notes")}-hint`} />
              </Field>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowMore(true)}
              className="inline-flex w-fit items-center gap-1.5 rounded-sm text-[13px] text-ink-muted hover:text-ink"
            >
              <ChevronDown aria-hidden className="size-3.5" />
              Add contact details or the inquiry
            </button>
          )}
        </fieldset>

        {submitError ? (
          <p role="alert" className="rounded-[var(--radius-control)] border border-critical/30 bg-critical/[0.05] px-3 py-2.5 text-[13px] text-critical">
            The client was not added. {submitError}
          </p>
        ) : null}
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={submitting} aria-busy={submitting}>
          {submitting ? "Adding…" : awaitingDuplicateConfirmation ? "Add anyway" : "Add client"}
        </Button>
      </ModalFooter>
    </form>
  );
}
