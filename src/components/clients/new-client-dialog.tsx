"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { useStudioSnapshot, useStudioStore } from "@/components/providers/studio-provider";
import { Button } from "@/components/ui/button";
import { describedBy, Field, Select, TextArea, TextInput } from "@/components/ui/field";
import { Modal, ModalBody, ModalFooter } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/data/studio-store";
import { PROJECT_TYPE_LABELS, SOURCE_TYPE_LABELS } from "@/lib/domain/labels";
import { PROJECT_TYPES, SOURCE_TYPES, type NewClientInput } from "@/lib/domain/types";
import { findDuplicateClient, hasErrors, validateClientIdentity } from "@/lib/domain/validation";

const EMPTY: Required<NewClientInput> = {
  name: "",
  contactPerson: "",
  email: "",
  website: "",
  projectType: "",
  goal: "",
  budget: "",
  deadline: "",
  targetAudience: "",
  initialNotes: "",
  sourceType: "",
};

export function NewClientDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={busy}
      size="lg"
      title="New client"
      description="Only the name is required. Everything else can be added later."
    >
      {/* Remount the form on each open so cancelled input is discarded. */}
      {open ? <NewClientForm onClose={onClose} onBusyChange={setBusy} /> : null}
    </Modal>
  );
}

function NewClientForm({ onClose, onBusyChange }: { onClose: () => void; onBusyChange: (busy: boolean) => void }) {
  const store = useStudioStore();
  const snapshot = useStudioSnapshot();
  const router = useRouter();
  const toast = useToast();
  const formId = useId();

  const [values, setValues] = useState(EMPTY);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmedDuplicateOf, setConfirmedDuplicateOf] = useState<string | null>(null);

  const errors = submitted ? validateClientIdentity(values) : {};
  const duplicate = snapshot ? findDuplicateClient(snapshot.clients, values.name) : undefined;

  const set = <K extends keyof NewClientInput>(key: K) =>
    (event: { target: { value: string } }) => setValues((current) => ({ ...current, [key]: event.target.value }));

  const id = (name: string) => `${formId}-${name}`;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return; // Guard against double submission.
    setSubmitted(true);
    setSubmitError(null);

    const validation = validateClientIdentity(values);
    if (hasErrors(validation)) {
      const firstInvalid = (["name", "email", "website"] as const).find((key) => validation[key]);
      if (firstInvalid) document.getElementById(id(firstInvalid))?.focus();
      return;
    }
    if (duplicate && confirmedDuplicateOf !== duplicate.id) {
      setConfirmedDuplicateOf(duplicate.id);
      return;
    }

    setSubmitting(true);
    onBusyChange(true);
    try {
      const client = await store.createClient(values);
      onBusyChange(false);
      onClose();
      toast.success(`${client.name} was added. You can complete the brief whenever you're ready.`);
      router.push(`/clients/${client.id}`);
    } catch (error) {
      setSubmitError(errorMessage(error));
      setSubmitting(false);
      onBusyChange(false);
    }
  }

  const awaitingDuplicateConfirmation = duplicate && confirmedDuplicateOf === duplicate.id;

  return (
    <form id={formId} onSubmit={handleSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
      <ModalBody className="flex flex-col gap-7">
      <fieldset className="grid gap-4 sm:grid-cols-2" disabled={submitting}>
        <legend className="mb-3 text-xs font-medium tracking-[0.08em] text-ink-subtle uppercase">Client</legend>
        <Field
          id={id("name")}
          label="Company / client name"
          required
          error={errors.name}
          className="sm:col-span-2"
          hint={duplicate ? undefined : "The name you use for this client internally."}
        >
          <TextInput
            id={id("name")}
            autoFocus
            autoComplete="off"
            value={values.name}
            onChange={set("name")}
            invalid={Boolean(errors.name)}
            aria-required
            aria-describedby={describedBy(id("name"), { error: errors.name, hint: duplicate ? undefined : "hint" })}
            placeholder="e.g. Ateljé Henrik"
          />
          {duplicate && !errors.name ? (
            <p role="status" className="text-[12px] text-caution">
              A client named “{duplicate.name}” already exists.
              {awaitingDuplicateConfirmation ? " Select “Create anyway” to add a second record." : ""}
            </p>
          ) : null}
        </Field>
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
        <Field id={id("website")} label="Website" error={errors.website} className="sm:col-span-2">
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
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2" disabled={submitting}>
        <legend className="mb-1 text-xs font-medium tracking-[0.08em] text-ink-subtle uppercase">Brief</legend>
        <p className="-mt-1 text-[12.5px] text-ink-subtle sm:col-span-2">
          Recorded as observed information until the client confirms it.
        </p>
        <Field id={id("type")} label="Project type">
          <Select id={id("type")} value={values.projectType} onChange={set("projectType")}>
            <option value="">Not decided</option>
            {PROJECT_TYPES.map((type) => (
              <option key={type} value={type}>
                {PROJECT_TYPE_LABELS[type]}
              </option>
            ))}
          </Select>
        </Field>
        <Field id={id("budget")} label="Budget" hint="An amount or a range.">
          <TextInput id={id("budget")} autoComplete="off" value={values.budget} onChange={set("budget")} placeholder="e.g. SEK 150,000" aria-describedby={`${id("budget")}-hint`} />
        </Field>
        <Field id={id("goal")} label="Client goal" className="sm:col-span-2">
          <TextArea id={id("goal")} rows={2} value={values.goal} onChange={set("goal")} placeholder="What does the client want to achieve?" />
        </Field>
        <Field id={id("audience")} label="Target audience">
          <TextInput id={id("audience")} autoComplete="off" value={values.targetAudience} onChange={set("targetAudience")} />
        </Field>
        <Field id={id("deadline")} label="Deadline" hint="A date or a rough timeframe.">
          <TextInput id={id("deadline")} autoComplete="off" value={values.deadline} onChange={set("deadline")} placeholder="e.g. 2027-03-01 or Before summer" aria-describedby={`${id("deadline")}-hint`} />
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2" disabled={submitting}>
        <legend className="mb-3 text-xs font-medium tracking-[0.08em] text-ink-subtle uppercase">Source</legend>
        <Field id={id("source")} label="Source type" hint="Where this information came from.">
          <Select id={id("source")} value={values.sourceType} onChange={set("sourceType")} aria-describedby={`${id("source")}-hint`}>
            <option value="">Entered manually</option>
            {SOURCE_TYPES.filter((type) => type !== "manual").map((type) => (
              <option key={type} value={type}>
                {SOURCE_TYPE_LABELS[type]}
              </option>
            ))}
          </Select>
        </Field>
        <Field id={id("notes")} label="Initial notes" className="sm:col-span-2" hint="Paste the inquiry, call notes or anything worth keeping. Stored as written.">
          <TextArea id={id("notes")} rows={4} value={values.initialNotes} onChange={set("initialNotes")} aria-describedby={`${id("notes")}-hint`} />
        </Field>
      </fieldset>

      {submitError ? (
        <p role="alert" className="rounded-[var(--radius-control)] border border-critical/30 bg-critical/[0.05] px-3 py-2.5 text-[13px] text-critical">
          The client was not created. {submitError}
        </p>
      ) : null}

      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={submitting} aria-busy={submitting}>
          {submitting ? "Creating…" : awaitingDuplicateConfirmation ? "Create anyway" : "Create client"}
        </Button>
      </ModalFooter>
    </form>
  );
}
