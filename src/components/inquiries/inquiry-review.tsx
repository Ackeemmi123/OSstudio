"use client";

import { ArrowLeft, ArrowRight, Ban, Check, Inbox, SearchX, UserPlus, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { ExternalLink } from "@/components/clients/client-aside";
import { LoadError } from "@/components/load-error";
import { useCanEdit, useStudio, useStudioStore } from "@/components/providers/studio-provider";
import { Button, ButtonLink } from "@/components/ui/button";
import { describedBy, Field, Select, TextArea, TextInput } from "@/components/ui/field";
import { Modal, ModalBody, ModalFooter } from "@/components/ui/modal";
import { RelativeTime } from "@/components/ui/relative-time";
import { StatusLabel, Tag, type Tone } from "@/components/ui/status";
import { EmptyState, NotProvided, Section, Skeleton, Surface } from "@/components/ui/surface";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/data/studio-store";
import {
  compareInquiryToClient,
  findInquiryMatches,
  getRelatedInquiries,
  inquiryBudgetLabel,
  inquiryClientName,
  inquiryTimingLabel,
  INQUIRY_LOCALE_LABELS,
  INQUIRY_PROJECT_TYPE_LABELS,
  INQUIRY_SERVICE_LABELS,
  INQUIRY_STATUS_LABELS,
  REJECTION_REASON_MAX_LENGTH,
  type ClientMatch,
  type MatchReason,
} from "@/lib/domain/inquiries";
import { actorLabel } from "@/lib/domain/labels";
import type { Client, Inquiry, InquiryDecision, InquiryStatus, StudioSnapshot } from "@/lib/domain/types";
import { hasErrors, validateClientIdentity } from "@/lib/domain/validation";
import { formatDate, formatDateTime } from "@/lib/format";

/**
 * One website inquiry: what the customer sent, who it may already be, and
 * the decision. Only owners and members decide; viewers read.
 */
export function InquiryReview({ inquiryId }: { inquiryId: string }) {
  const state = useStudio();
  if (state.status === "error") return <LoadError message={state.message} />;
  if (state.status === "loading") return <InquirySkeleton />;

  const inquiry = state.snapshot.inquiries.find((i) => i.id === inquiryId);
  if (!inquiry) {
    return (
      <Surface>
        <EmptyState
          icon={<SearchX />}
          title="Inquiry not found"
          description={
            state.info.kind === "supabase"
              ? "This inquiry does not exist in this studio, or you do not have access to it."
              : "Website inquiries only arrive in a signed-in Studio OS workspace, not in the local demo."
          }
          action={<ButtonLink href="/clients">Back to clients</ButtonLink>}
        />
      </Surface>
    );
  }
  return <Review inquiry={inquiry} snapshot={state.snapshot} />;
}

const STATUS_TONE: Record<InquiryStatus, Tone> = { new: "caution", approved: "positive", rejected: "neutral", spam: "neutral", merged: "neutral" };

function Review({ inquiry, snapshot }: { inquiry: Inquiry; snapshot: StudioSnapshot }) {
  const canEdit = useCanEdit();
  const related = getRelatedInquiries(inquiry, snapshot.inquiries);
  const previouslyRejected = related.some((other) => other.status === "rejected" || other.status === "spam");
  const matches = findInquiryMatches(inquiry, snapshot.clients);

  return (
    <>
      <Link href="/clients" className="mb-6 inline-flex items-center gap-1.5 rounded-sm text-[13px] text-ink-subtle transition-colors hover:text-ink">
        <ArrowLeft aria-hidden className="size-3.5" />
        Clients
      </Link>

      <header className="pb-10">
        <p className="mb-1 text-[13px] text-ink-subtle">Website inquiry</p>
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-[26px] leading-tight font-medium tracking-[-0.032em] text-ink">{inquiry.company ?? inquiry.contactName}</h1>
          {inquiry.isTest ? <Tag tone="info" title="Sent as a test, not by a real customer">Test</Tag> : null}
          {previouslyRejected ? <Tag tone="caution">Previously rejected</Tag> : null}
        </div>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px] text-ink-muted">
          <StatusLabel tone={STATUS_TONE[inquiry.status]}>{INQUIRY_STATUS_LABELS[inquiry.status]}</StatusLabel>
          <span>
            Received <RelativeTime iso={inquiry.receivedAt} className="inline-block first-letter:lowercase" />
          </span>
          <span>Written in {INQUIRY_LOCALE_LABELS[inquiry.locale]}</span>
        </p>
      </header>

      <div className="grid gap-x-12 gap-y-12 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-12">
          <Section id="decision" title={inquiry.status === "new" ? "Decision" : "Outcome"}>
            {inquiry.status !== "new" ? (
              <Outcome inquiry={inquiry} snapshot={snapshot} />
            ) : canEdit ? (
              <Decide inquiry={inquiry} matches={matches} clients={snapshot.clients} />
            ) : (
              <p className="rounded-[var(--radius-surface)] border border-dashed border-line-strong px-5 py-4 text-[13.5px] text-ink-subtle">
                You have read-only access. An owner or member of the studio decides inquiries.
              </p>
            )}
          </Section>
          <Submitted inquiry={inquiry} />
        </div>

        <aside className="flex min-w-0 flex-col gap-10">
          {inquiry.status === "new" ? <Matches matches={matches} /> : null}
          <Related related={related} />
          <p className="text-[12.5px] leading-relaxed text-ink-subtle">
            Inquiries that do not become clients are kept for 12 months after the decision, then anonymised
            automatically. Until real inquiries are switched on, only test inquiries may be sent to Studio OS.
          </p>
        </aside>
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* What the customer sent                                                     */
/* -------------------------------------------------------------------------- */

function Submitted({ inquiry }: { inquiry: Inquiry }) {
  const budget = inquiryBudgetLabel(inquiry);
  const timing = inquiryTimingLabel(inquiry);
  return (
    <Section id="submitted" title="What they sent">
      <Surface>
        <p className="border-b border-line px-5 py-3 text-[12.5px] text-ink-subtle">
          {inquiry.status === "new"
            ? "From website inquiry · not reviewed. This is what the customer wrote; none of it is a confirmed fact."
            : "From website inquiry. Kept exactly as the customer wrote it."}
        </p>
        <dl className="grid gap-x-6 gap-y-4 px-5 py-4 sm:grid-cols-2">
          <Item label="Name">{inquiry.contactName}</Item>
          <Item label="Email">
            <a href={`mailto:${inquiry.email}`} className="underline decoration-line-strong underline-offset-2 hover:decoration-ink">
              {inquiry.email}
            </a>
          </Item>
          <Item label="Company">{inquiry.company ?? <NotProvided />}</Item>
          <Item label="Current website">{inquiry.website ? <ExternalLink href={inquiry.website}>{inquiry.website}</ExternalLink> : <NotProvided />}</Item>
          <Item label="Service">{INQUIRY_SERVICE_LABELS[inquiry.service]}</Item>
          <Item label="What they need">{inquiry.projectType ? INQUIRY_PROJECT_TYPE_LABELS[inquiry.projectType] : <NotProvided />}</Item>
          <Item label="Budget" hint={budget && inquiry.budget !== "not_sure" ? "Indicative. Not a price, and never used to rank or reject." : undefined}>
            {budget ?? <NotProvided />}
          </Item>
          <Item label="Timing">{timing ?? <NotProvided />}</Item>
        </dl>
        <div className="border-t border-line px-5 py-4">
          <p className="mb-1.5 text-[12.5px] text-ink-subtle">Message</p>
          <p className="text-[14px] leading-relaxed whitespace-pre-wrap text-ink">{inquiry.message}</p>
        </div>
      </Surface>
    </Section>
  );
}

function Item({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12.5px] text-ink-subtle">{label}</dt>
      <dd className="mt-0.5 text-[14px] break-words text-ink">{children}</dd>
      {hint ? <dd className="mt-0.5 text-[12px] text-ink-subtle">{hint}</dd> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Deciding                                                                   */
/* -------------------------------------------------------------------------- */

type Dialog = { kind: "link"; client: Client } | { kind: "reject" } | { kind: "spam" } | null;

function Decide({ inquiry, matches, clients }: { inquiry: Inquiry; matches: ClientMatch[]; clients: Client[] }) {
  const store = useStudioStore();
  const toast = useToast();
  const router = useRouter();
  const formId = useId();
  const [name, setName] = useState(() => inquiryClientName(inquiry));
  const [nameError, setNameError] = useState<string | undefined>();
  const [otherClient, setOtherClient] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [pending, setPending] = useState(false);

  async function decide(decision: InquiryDecision): Promise<boolean> {
    setPending(true);
    try {
      const decided = await store.run((repository) => repository.decideInquiry(inquiry.id, decision));
      if (decided.clientId) {
        toast.success(decision.action === "approve" ? `Added ${name.trim()}. Its onboarding is ready to start.` : "Added the inquiry to the client.");
        router.push(`/clients/${encodeURIComponent(decided.clientId)}`);
      } else {
        toast.success(decided.status === "spam" ? "Marked as spam." : "Inquiry rejected.");
      }
      return true;
    } catch (error) {
      toast.error(`The decision was not saved. ${errorMessage(error)}`);
      setPending(false);
      return false;
    }
  }

  function approve(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    const errors = validateClientIdentity({ name });
    setNameError(errors.name);
    if (hasErrors(errors)) return;
    void decide({ action: "approve", name: name.trim() });
  }

  const nameId = `${formId}-name`;
  const otherId = `${formId}-other`;
  const others = clients.filter((client) => client.status !== "archived" && !matches.some((m) => m.client.id === client.id));

  return (
    <Surface>
      <form onSubmit={approve} noValidate className="flex flex-col gap-3 px-5 py-4">
        <div>
          <h3 className="text-[14px] font-medium text-ink">Approve as a new client</h3>
          <p className="mt-0.5 text-[13px] text-ink-subtle">
            Creates the client with these contact details, adds the message as source material, records budget and timing as
            observed values, and starts a staff-led onboarding where they show as “verify”.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <Field id={nameId} label="Client name" error={nameError} className="flex-1">
            <TextInput
              id={nameId}
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={pending}
              invalid={Boolean(nameError)}
              aria-describedby={describedBy(nameId, { error: nameError })}
            />
          </Field>
          <Button type="submit" variant="primary" disabled={pending} className="sm:mt-[26px]">
            <UserPlus aria-hidden />
            Approve as new client
          </Button>
        </div>
      </form>

      <div className="flex flex-col gap-3 border-t border-line px-5 py-4">
        <div>
          <h3 className="text-[14px] font-medium text-ink">Add to an existing client</h3>
          <p className="mt-0.5 text-[13px] text-ink-subtle">Adds the message as source material and fills only what the client has no value for yet.</p>
        </div>
        {matches.length ? (
          <ul className="flex flex-col gap-2">
            {matches.map((match) => (
              <li key={match.client.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-control)] border border-line px-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] text-ink">{match.client.name}</span>
                  <span className="block text-[12px] text-ink-subtle">{matchReasons(match.reasons)}</span>
                </span>
                <Button size="sm" disabled={pending} onClick={() => setDialog({ kind: "link", client: match.client })}>
                  Add to {match.client.name}
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        {others.length ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <Field id={otherId} label={matches.length ? "Or another client" : "Client"} className="flex-1">
              <Select id={otherId} value={otherClient} onChange={(event) => setOtherClient(event.target.value)} disabled={pending}>
                <option value="">Choose a client</option>
                {others.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Button
              disabled={pending || !otherClient}
              onClick={() => {
                const client = clients.find((c) => c.id === otherClient);
                if (client) setDialog({ kind: "link", client });
              }}
            >
              Add to client
            </Button>
          </div>
        ) : matches.length ? null : (
          <p className="text-[13px] text-ink-subtle">There are no clients yet.</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-4">
        <Button disabled={pending} onClick={() => setDialog({ kind: "reject" })}>
          <X aria-hidden />
          Reject
        </Button>
        <Button variant="ghost" disabled={pending} onClick={() => setDialog({ kind: "spam" })}>
          <Ban aria-hidden />
          Mark as spam
        </Button>
        <p className="text-[12.5px] text-ink-subtle">Nothing is sent to the customer either way.</p>
      </div>

      <LinkDialog inquiry={inquiry} client={dialog?.kind === "link" ? dialog.client : null} pending={pending} onClose={() => setDialog(null)} onConfirm={(clientId) => decide({ action: "link", clientId })} />
      <RejectDialog open={dialog?.kind === "reject"} pending={pending} onClose={() => setDialog(null)} onConfirm={async (reason) => (await decide({ action: "reject", reason })) && setDialog(null)} />
      <Modal open={dialog?.kind === "spam"} onClose={() => setDialog(null)} busy={pending} title="Mark as spam?">
        <ModalBody>
          <p className="text-[14px] leading-relaxed text-ink-muted">No client is created. The inquiry stays here, marked as spam, and nothing is sent to the sender.</p>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setDialog(null)} disabled={pending}>
            Cancel
          </Button>
          <Button variant="primary" disabled={pending} onClick={async () => (await decide({ action: "spam" })) && setDialog(null)}>
            Mark as spam
          </Button>
        </ModalFooter>
      </Modal>
    </Surface>
  );
}

const REASON_LABELS: Record<MatchReason, string> = { email: "same email", website: "same website", name: "same name", contact: "same contact person" };

function matchReasons(reasons: MatchReason[]): string {
  const text = reasons.map((reason) => REASON_LABELS[reason]).join(", ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function LinkDialog({
  inquiry,
  client,
  pending,
  onClose,
  onConfirm,
}: {
  inquiry: Inquiry;
  client: Client | null;
  pending: boolean;
  onClose: () => void;
  onConfirm: (clientId: string) => Promise<boolean>;
}) {
  const differences = client ? compareInquiryToClient(inquiry, client) : [];
  return (
    <Modal open={client !== null} onClose={onClose} busy={pending} title={client ? `Add to ${client.name}?` : "Add to client"}>
      {client ? (
        <>
          <ModalBody className="flex flex-col gap-4 text-[14px] leading-relaxed text-ink-muted">
            <p>
              The message is added to {client.name} as source material. Contact details, budget and timing are filled in only
              where {client.name} has none yet. No existing value changes, and no new onboarding starts.
            </p>
            {differences.length ? (
              <div>
                <p className="mb-2 text-[13px] font-medium text-ink">The inquiry says something different here. The client record keeps its value:</p>
                <ul className="flex flex-col gap-1.5 text-[13px]">
                  {differences.map((d) => (
                    <li key={d.label}>
                      <span className="text-ink">{d.label}:</span> inquiry “{d.inquiry}”, client “{d.client}”
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button variant="primary" disabled={pending} onClick={() => void onConfirm(client.id)}>
              Add to {client.name}
            </Button>
          </ModalFooter>
        </>
      ) : null}
    </Modal>
  );
}

function RejectDialog({ open, pending, onClose, onConfirm }: { open: boolean; pending: boolean; onClose: () => void; onConfirm: (reason: string) => void }) {
  const id = useId();
  const [reason, setReason] = useState("");
  const tooLong = reason.trim().length > REJECTION_REASON_MAX_LENGTH;
  const error = tooLong ? `Keep the reason under ${REJECTION_REASON_MAX_LENGTH.toLocaleString("en")} characters.` : undefined;
  const hint = "Internal. Only people in this studio see it; it is never sent to the customer.";
  return (
    <Modal open={open} onClose={onClose} busy={pending} title="Reject this inquiry?">
      <form
        className="flex min-h-0 flex-1 flex-col"
        onSubmit={(event) => {
          event.preventDefault();
          if (!tooLong && !pending) onConfirm(reason);
        }}
      >
        <ModalBody className="flex flex-col gap-4">
          <p className="text-[14px] leading-relaxed text-ink-muted">No client is created. The inquiry stays here, marked as rejected.</p>
          <Field id={id} label="Reason (optional)" hint={hint} error={error}>
            <TextArea id={id} rows={3} value={reason} onChange={(event) => setReason(event.target.value)} disabled={pending} invalid={tooLong} aria-describedby={describedBy(id, { error, hint })} />
          </Field>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={pending || tooLong}>
            Reject
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* After the decision                                                         */
/* -------------------------------------------------------------------------- */

function Outcome({ inquiry, snapshot }: { inquiry: Inquiry; snapshot: StudioSnapshot }) {
  const client = inquiry.clientId ? snapshot.clients.find((c) => c.id === inquiry.clientId) : undefined;
  const who = inquiry.decidedBy ? actorLabel(inquiry.decidedBy) : "Someone";
  const when = inquiry.decidedAt ? formatDateTime(inquiry.decidedAt) : null;
  const text =
    inquiry.status === "approved"
      ? inquiry.createdClient
        ? `${who} approved it as a new client`
        : `${who} added it to an existing client`
      : inquiry.status === "rejected"
        ? `${who} rejected it`
        : inquiry.status === "spam"
          ? `${who} marked it as spam`
          : "It was resolved together with an earlier inquiry";
  return (
    <Surface className="flex flex-col gap-3 px-5 py-4">
      <p className="flex items-start gap-2.5 text-[14px] text-ink">
        {inquiry.status === "approved" ? <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-positive" /> : <Inbox aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-subtle" />}
        <span>
          {text}
          {when ? <span className="text-ink-subtle"> · {when}</span> : null}
        </span>
      </p>
      {inquiry.decisionReason ? (
        <p className="text-[13.5px] text-ink-muted">
          <span className="text-ink-subtle">Internal reason:</span> {inquiry.decisionReason}
        </p>
      ) : null}
      {client ? (
        <ButtonLink href={`/clients/${encodeURIComponent(client.id)}`} size="sm" className="self-start">
          Open {client.name}
          <ArrowRight aria-hidden />
        </ButtonLink>
      ) : null}
    </Surface>
  );
}

/* -------------------------------------------------------------------------- */
/* Context                                                                    */
/* -------------------------------------------------------------------------- */

function Matches({ matches }: { matches: ClientMatch[] }) {
  return (
    <Section id="matches" title="Possible existing clients">
      {matches.length ? (
        <ul className="flex flex-col gap-2">
          {matches.map((match) => (
            <li key={match.client.id}>
              <Link href={`/clients/${encodeURIComponent(match.client.id)}`} className="block rounded-[var(--radius-control)] border border-line bg-surface px-3 py-2 hover:border-line-strong">
                <span className="block truncate text-[13.5px] text-ink">{match.client.name}</span>
                <span className="block text-[12px] text-ink-subtle">{matchReasons(match.reasons)}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-ink-subtle">No client has this email, website, name or contact person.</p>
      )}
    </Section>
  );
}

function Related({ related }: { related: Inquiry[] }) {
  if (!related.length) return null;
  return (
    <Section id="related" title="Other inquiries from this email" count={related.length}>
      <ul className="flex flex-col gap-2">
        {related.map((other) => (
          <li key={other.id}>
            <Link href={`/inquiries/${encodeURIComponent(other.id)}`} className="block rounded-[var(--radius-control)] border border-line bg-surface px-3 py-2 hover:border-line-strong">
              <span className="block text-[13px] text-ink">{formatDate(other.receivedAt)}</span>
              <span className="block text-[12px] text-ink-subtle">{INQUIRY_STATUS_LABELS[other.status]}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function InquirySkeleton() {
  return (
    <div aria-busy aria-label="Loading inquiry">
      <Skeleton className="mb-8 h-3 w-16" />
      <Skeleton className="mb-2 h-7 w-64" />
      <Skeleton className="mb-10 h-3.5 w-80 max-w-full" />
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Skeleton className="h-80" />
        <Skeleton className="h-48" />
      </div>
    </div>
  );
}
