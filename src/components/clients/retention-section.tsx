"use client";

import { useId, useState, type FormEvent } from "react";
import { useIsOwner, useStudioStore } from "@/components/providers/studio-provider";
import { useStudioAction } from "@/components/providers/use-studio-action";
import { Button } from "@/components/ui/button";
import { describedBy, Field, TextArea } from "@/components/ui/field";
import { Modal, ModalBody, ModalFooter } from "@/components/ui/modal";
import { Section } from "@/components/ui/surface";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/data/studio-store";
import { actorLabel } from "@/lib/domain/labels";
import { cleanHoldReason, daysUntilAnonymised, describeDaysLeft, HOLD_REASON_MAX_LENGTH, RETENTION_WARNING_DAYS } from "@/lib/domain/retention";
import type { Client, ClientRetention } from "@/lib/domain/types";
import { formatDate } from "@/lib/format";
import { useNow } from "@/lib/use-now";

/**
 * When this client's data will be anonymised, and the owner's hold. Only in a
 * signed-in workspace: the database works out the date and does the work.
 */
export function RetentionSection({ client }: { client: Client }) {
  const retention = client.retention;
  const isOwner = useIsOwner();
  const now = useNow();
  const [holding, setHolding] = useState(false);
  const { run, pending } = useStudioAction();
  const toast = useToast();
  if (!retention) return null;

  // Null until the browser has a clock: the date shows, the countdown waits.
  const days = now === null ? null : daysUntilAnonymised(client, now);
  const soon = days !== null && days <= RETENTION_WARNING_DAYS;

  async function release() {
    const released = await run((repository) => repository.setRetentionHold(client.id, null), "The hold was not released.");
    if (released) toast.success("Hold released. The retention date applies again, with at least 30 days' notice.");
  }

  return (
    <Section
      id="retention"
      title="Data retention"
      action={
        isOwner ? (
          retention.hold ? (
            <Button size="xs" variant="ghost" onClick={release} disabled={pending} aria-busy={pending}>
              Release hold
            </Button>
          ) : (
            <Button size="xs" variant="ghost" onClick={() => setHolding(true)}>
              Place hold
            </Button>
          )
        ) : null
      }
    >
      <div className="flex flex-col gap-3 text-[13.5px]" data-testid="retention">
        {retention.hold ? (
          <p className="text-ink">
            On hold: {retention.hold.reason}
            <span className="text-ink-subtle">
              {" "}
              · {actorLabel(retention.hold.by)} · {formatDate(retention.hold.at)}
            </span>
          </p>
        ) : retention.endsAt ? (
          <p className={soon ? "text-caution" : "text-ink"}>
            {soon && days !== null ? `${describeDaysLeft(days)} (${formatDate(retention.endsAt)})` : `Anonymised on ${formatDate(retention.endsAt)}`}
          </p>
        ) : null}
        <p className="text-ink-muted">{explain(retention)}</p>
        {retention.log.length > 0 ? (
          <ul className="flex flex-col gap-1 text-[12.5px] text-ink-subtle" aria-label="Hold history">
            {retention.log.map((entry) => (
              <li key={`${entry.at}-${entry.action}`}>
                {entry.action === "hold" ? `Held: ${entry.reason}` : "Released"} · {actorLabel(entry.actor)} · {formatDate(entry.at)}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <HoldDialog clientId={client.id} open={holding} onClose={() => setHolding(false)} />
    </Section>
  );
}

function explain(retention: ClientRetention): string {
  const last = `Last activity ${formatDate(retention.lastActivityAt)}.`;
  const rule = retention.customer
    ? "A former customer is kept for 3 years after it is archived, or after 12 months without activity, whichever comes first."
    : "A client that never became a customer is kept for 12 months after the last activity.";
  const then = retention.hold
    ? "Nothing is anonymised while the hold is in place."
    : "Then its details, brief, source material and history are anonymised. Changes by people count as activity; agents and automated jobs do not.";
  return `${last} ${rule} ${then}`;
}

function HoldDialog({ clientId, open, onClose }: { clientId: string; open: boolean; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={busy}
      title="Place a retention hold"
      description="Pauses anonymisation for this client, for example during an open dispute or a legal requirement. The reason is logged with your name."
    >
      {open ? <HoldForm clientId={clientId} onClose={onClose} onBusyChange={setBusy} /> : null}
    </Modal>
  );
}

function HoldForm({ clientId, onClose, onBusyChange }: { clientId: string; onClose: () => void; onBusyChange: (busy: boolean) => void }) {
  const store = useStudioStore();
  const toast = useToast();
  const formId = useId();
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  let reasonError: string | undefined;
  if (submitted) {
    try {
      cleanHoldReason(reason);
    } catch (caught) {
      reasonError = errorMessage(caught);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setSubmitted(true);
    setError(null);
    try {
      cleanHoldReason(reason);
    } catch {
      return;
    }
    setSubmitting(true);
    onBusyChange(true);
    try {
      await store.run((repository) => repository.setRetentionHold(clientId, reason));
      onBusyChange(false);
      onClose();
      toast.success("Hold placed. This client will not be anonymised until it is released.");
    } catch (caught) {
      setError(errorMessage(caught));
      setSubmitting(false);
      onBusyChange(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
      <ModalBody className="flex flex-col gap-5">
        <fieldset disabled={submitting}>
          <Field id={`${formId}-reason`} label="Reason" required error={reasonError}>
            <TextArea
              id={`${formId}-reason`}
              rows={3}
              autoFocus
              maxLength={HOLD_REASON_MAX_LENGTH}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              invalid={Boolean(reasonError)}
              aria-required
              aria-describedby={describedBy(`${formId}-reason`, { error: reasonError })}
            />
          </Field>
        </fieldset>
        {error ? (
          <p role="alert" className="rounded-[var(--radius-control)] border border-critical/30 bg-critical/[0.05] px-3 py-2.5 text-[13px] text-critical">
            The hold was not placed. {error}
          </p>
        ) : null}
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={submitting} aria-busy={submitting}>
          {submitting ? "Placing…" : "Place hold"}
        </Button>
      </ModalFooter>
    </form>
  );
}
