"use client";

import { useId, useState, type FormEvent } from "react";
import { useStudio, useStudioStore } from "@/components/providers/studio-provider";
import { Button } from "@/components/ui/button";
import { describedBy, Field, Select, TextInput } from "@/components/ui/field";
import { Modal, ModalBody, ModalFooter } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/data/studio-store";
import { toClientDetailsInput } from "@/lib/domain/clients";
import { CLIENT_STATUS_LABELS, PROJECT_TYPE_LABELS } from "@/lib/domain/labels";
import { CLIENT_STATUSES, PROJECT_TYPES, type Client, type ClientDetailsInput } from "@/lib/domain/types";
import { findDuplicateClient, hasErrors, validateClientIdentity } from "@/lib/domain/validation";

/** Identity and relationship details. The brief is edited value by value in the workspace. */
export function EditDetailsDialog({ client, open, onClose }: { client: Client; open: boolean; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={open} onClose={onClose} busy={busy} title="Client details">
      {open ? <EditDetailsForm client={client} onClose={onClose} onBusyChange={setBusy} /> : null}
    </Modal>
  );
}

function EditDetailsForm({ client, onClose, onBusyChange }: { client: Client; onClose: () => void; onBusyChange: (busy: boolean) => void }) {
  const store = useStudioStore();
  const state = useStudio();
  const toast = useToast();
  const formId = useId();
  const id = (name: string) => `${formId}-${name}`;

  const [values, setValues] = useState<ClientDetailsInput>(() => toClientDetailsInput(client));
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const errors = submitted ? validateClientIdentity(values) : {};
  const duplicate = state.status === "ready" ? findDuplicateClient(state.snapshot.clients, values.name, client.id) : undefined;
  const set = (key: keyof ClientDetailsInput) => (event: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [key]: event.target.value }));

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSubmitted(true);
    setSaveError(null);
    const validation = validateClientIdentity(values);
    if (hasErrors(validation)) {
      const firstInvalid = (["name", "email", "website"] as const).find((key) => validation[key]);
      if (firstInvalid) document.getElementById(id(firstInvalid))?.focus();
      return;
    }
    setSaving(true);
    onBusyChange(true);
    try {
      const updated = await store.run((repository) => repository.updateClient(client.id, values));
      onBusyChange(false);
      onClose();
      if (updated !== client) toast.success("Details saved.");
    } catch (error) {
      setSaveError(errorMessage(error));
      setSaving(false);
      onBusyChange(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
      <ModalBody>
        <fieldset className="grid gap-4 sm:grid-cols-2" disabled={saving}>
          <Field id={id("name")} label="Company or client name" required error={errors.name} className="sm:col-span-2">
            <TextInput id={id("name")} value={values.name} onChange={set("name")} invalid={Boolean(errors.name)} aria-required aria-describedby={describedBy(id("name"), { error: errors.name })} />
            {duplicate && !errors.name ? <p className="text-[12px] text-caution">Another client is already named “{duplicate.name}”.</p> : null}
          </Field>
          <Field id={id("contact")} label="Contact person">
            <TextInput id={id("contact")} value={values.contactPerson} onChange={set("contactPerson")} />
          </Field>
          <Field id={id("email")} label="Email" error={errors.email}>
            <TextInput id={id("email")} type="email" value={values.email} onChange={set("email")} invalid={Boolean(errors.email)} aria-describedby={describedBy(id("email"), { error: errors.email })} />
          </Field>
          <Field id={id("website")} label="Website" error={errors.website}>
            <TextInput id={id("website")} inputMode="url" value={values.website} onChange={set("website")} invalid={Boolean(errors.website)} aria-describedby={describedBy(id("website"), { error: errors.website })} />
          </Field>
          <Field id={id("status")} label="Relationship">
            <Select id={id("status")} value={values.status} onChange={set("status")}>
              {CLIENT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {CLIENT_STATUS_LABELS[status]}
                </option>
              ))}
            </Select>
          </Field>
          <Field id={id("type")} label="What they asked for" className="sm:col-span-2" hint="Used as the default for their first project.">
            <Select id={id("type")} value={values.projectType} onChange={set("projectType")} aria-describedby={`${id("type")}-hint`}>
              <option value="">Not decided</option>
              {PROJECT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {PROJECT_TYPE_LABELS[type]}
                </option>
              ))}
            </Select>
          </Field>
        </fieldset>
        {saveError ? (
          <p role="alert" className="mt-5 rounded-[var(--radius-control)] border border-critical/30 bg-critical/[0.05] px-3 py-2.5 text-[13px] text-critical">
            Changes were not saved. {saveError}
          </p>
        ) : null}
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={saving} aria-busy={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </ModalFooter>
    </form>
  );
}
