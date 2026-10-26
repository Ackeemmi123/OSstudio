"use client";

import { useId, useState, type FormEvent } from "react";
import { useStudioSnapshot, useStudioStore } from "@/components/providers/studio-provider";
import { Button } from "@/components/ui/button";
import { describedBy, Field, Select, TextArea, TextInput } from "@/components/ui/field";
import { Modal, ModalBody, ModalFooter } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/data/studio-store";
import { toClientUpdateInput } from "@/lib/domain/clients";
import {
  CLIENT_STATUS_LABELS,
  CONFIDENCE_DESCRIPTIONS,
  CONFIDENCE_LABELS,
  CONTEXT_FIELD_LABELS,
  PROJECT_TYPE_LABELS,
} from "@/lib/domain/labels";
import {
  CLIENT_STATUSES,
  CONTEXT_FIELD_KEYS,
  PROJECT_TYPES,
  type Client,
  type ContextFieldInput,
  type ContextFieldKey,
} from "@/lib/domain/types";
import { findDuplicateClient, hasErrors, validateClientIdentity } from "@/lib/domain/validation";

const EDITABLE_CONFIDENCES: ContextFieldInput["confidence"][] = ["confirmed", "observed", "proposed"];
const MULTILINE: ReadonlySet<ContextFieldKey> = new Set(["goal", "requirements", "platform"]);

export function EditClientDialog({ client, open, onClose }: { client: Client; open: boolean; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={busy}
      size="lg"
      title={`Edit ${client.name}`}
      description="Leave anything you don't know blank. Replaced values are kept as superseded history."
    >
      {open ? <EditClientForm client={client} onClose={onClose} onBusyChange={setBusy} /> : null}
    </Modal>
  );
}

function EditClientForm({
  client,
  onClose,
  onBusyChange,
}: {
  client: Client;
  onClose: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const store = useStudioStore();
  const snapshot = useStudioSnapshot();
  const toast = useToast();
  const formId = useId();
  const id = (name: string) => `${formId}-${name}`;

  const [values, setValues] = useState(() => toClientUpdateInput(client));
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const errors = submitted ? validateClientIdentity(values) : {};
  const duplicate = snapshot ? findDuplicateClient(snapshot.clients, values.name, client.id) : undefined;

  const setCore = (key: "name" | "contactPerson" | "email" | "website" | "status" | "projectType") =>
    (event: { target: { value: string } }) => setValues((v) => ({ ...v, [key]: event.target.value }));

  const setContext = (key: ContextFieldKey, patch: Partial<ContextFieldInput>) =>
    setValues((v) => ({ ...v, context: { ...v.context, [key]: { ...v.context[key], ...patch } } }));

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
      const updated = await store.updateClient(client.id, values);
      onBusyChange(false);
      onClose();
      toast.success(updated === client ? "No changes to save." : `Changes to ${updated.name} were saved.`);
    } catch (error) {
      setSaveError(errorMessage(error));
      setSaving(false);
      onBusyChange(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
      <ModalBody className="flex flex-col gap-7">
        <fieldset className="grid gap-4 sm:grid-cols-2" disabled={saving}>
          <legend className="mb-3 text-xs font-medium tracking-[0.08em] text-ink-subtle uppercase">Client</legend>
          <Field id={id("name")} label="Company / client name" required error={errors.name} className="sm:col-span-2">
            <TextInput
              id={id("name")}
              value={values.name}
              onChange={setCore("name")}
              invalid={Boolean(errors.name)}
              aria-required
              aria-describedby={describedBy(id("name"), { error: errors.name })}
            />
            {duplicate && !errors.name ? (
              <p className="text-[12px] text-caution">Another client is already named “{duplicate.name}”.</p>
            ) : null}
          </Field>
          <Field id={id("contact")} label="Contact person">
            <TextInput id={id("contact")} value={values.contactPerson} onChange={setCore("contactPerson")} />
          </Field>
          <Field id={id("email")} label="Email" error={errors.email}>
            <TextInput
              id={id("email")}
              type="email"
              value={values.email}
              onChange={setCore("email")}
              invalid={Boolean(errors.email)}
              aria-describedby={describedBy(id("email"), { error: errors.email })}
            />
          </Field>
          <Field id={id("website")} label="Website" error={errors.website}>
            <TextInput
              id={id("website")}
              inputMode="url"
              value={values.website}
              onChange={setCore("website")}
              invalid={Boolean(errors.website)}
              aria-describedby={describedBy(id("website"), { error: errors.website })}
            />
          </Field>
          <Field id={id("type")} label="Project type">
            <Select id={id("type")} value={values.projectType} onChange={setCore("projectType")}>
              <option value="">Not decided</option>
              {PROJECT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {PROJECT_TYPE_LABELS[type]}
                </option>
              ))}
            </Select>
          </Field>
          <Field id={id("status")} label="Status">
            <Select id={id("status")} value={values.status} onChange={setCore("status")}>
              {CLIENT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {CLIENT_STATUS_LABELS[status]}
                </option>
              ))}
            </Select>
          </Field>
        </fieldset>

        <fieldset className="flex flex-col gap-5" disabled={saving}>
          <legend className="mb-1 text-xs font-medium tracking-[0.08em] text-ink-subtle uppercase">Context</legend>
          <p className="-mt-1 text-[12.5px] leading-relaxed text-ink-subtle">
            Choose how certain each value is. Only mark a value as confirmed when the client or an authorized team member
            has explicitly confirmed it.
          </p>
          {CONTEXT_FIELD_KEYS.map((key) => {
            const field = values.context[key];
            const hasValue = field.value.trim() !== "";
            return (
              <div key={key} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px] sm:items-start">
                <Field id={id(key)} label={CONTEXT_FIELD_LABELS[key]}>
                  {MULTILINE.has(key) ? (
                    <TextArea
                      id={id(key)}
                      rows={2}
                      value={field.value}
                      onChange={(event) => setContext(key, { value: event.target.value })}
                      placeholder="Not established"
                    />
                  ) : (
                    <TextInput
                      id={id(key)}
                      value={field.value}
                      onChange={(event) => setContext(key, { value: event.target.value })}
                      placeholder="Not established"
                    />
                  )}
                </Field>
                <Field id={id(`${key}-confidence`)} label="Confidence">
                  <Select
                    id={id(`${key}-confidence`)}
                    value={hasValue ? field.confidence : ""}
                    disabled={!hasValue}
                    onChange={(event) =>
                      setContext(key, { confidence: event.target.value as ContextFieldInput["confidence"] })
                    }
                  >
                    {hasValue ? null : <option value="">Unknown</option>}
                    {EDITABLE_CONFIDENCES.map((confidence) => (
                      <option key={confidence} value={confidence} title={CONFIDENCE_DESCRIPTIONS[confidence]}>
                        {CONFIDENCE_LABELS[confidence]}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            );
          })}
        </fieldset>

        {saveError ? (
          <p role="alert" className="rounded-[var(--radius-control)] border border-critical/30 bg-critical/[0.05] px-3 py-2.5 text-[13px] text-critical">
            Changes were not saved. {saveError}
          </p>
        ) : null}
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={saving} aria-busy={saving}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </ModalFooter>
    </form>
  );
}
