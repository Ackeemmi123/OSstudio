"use client";

import { useEffect, useMemo, useState } from "react";
import { useStudio } from "@/components/providers/studio-provider";
import { useStudioAction } from "@/components/providers/use-studio-action";
import { Button } from "@/components/ui/button";
import { Field, TextArea } from "@/components/ui/field";
import { Modal, ModalBody, ModalFooter } from "@/components/ui/modal";
import { RelativeTime } from "@/components/ui/relative-time";
import { Section } from "@/components/ui/surface";
import { StatusLabel, Tag, type Tone } from "@/components/ui/status";
import { cn } from "@/lib/cn";
import { SITE_SPEC_STATUS_LABELS } from "@/lib/domain/labels";
import { REVIEW_NOTE_MAX_LENGTH } from "@/lib/domain/site-specs";
import { CONTEXT_FIELD_LABELS } from "@/lib/domain/labels";
import type { Actor, Client, ContextFieldKey, Project, SiteSpecRecord, SiteSpecStatus } from "@/lib/domain/types";
import { refreshFromBrief } from "@/lib/site-spec/edit";
import type { SiteSpec, SiteSpecSource } from "@/lib/site-spec/schema";
import { approvalBlockers, parseSiteSpec, type SpecIssue } from "@/lib/site-spec/validate";
import { BrandEditor } from "./brand-editor";
import { PagesEditor } from "./pages-editor";
import { SettingsEditor } from "./settings-editor";
import { StrategyEditor } from "./strategy-editor";

/** What every part of the editor gets: whether it may edit, how to change the draft, and who is editing. */
export interface SpecEditing {
  editable: boolean;
  /** Applies an edit to a copy of the draft. */
  change: (edit: (draft: SiteSpec) => void) => void;
  /** The source to record on content a person writes now. */
  personSource: () => SiteSpecSource;
}

const LEAVE_WARNING = "This website spec has changes that are not saved. Leave without saving?";

export const STATUS_TONES: Record<SiteSpecStatus, Tone> = { draft: "neutral", in_review: "caution", approved: "positive", superseded: "neutral" };

function actorName(actor: Actor | null): string {
  if (!actor) return "someone";
  return actor.kind === "human" ? actor.name : actor.kind === "agent" ? "an agent" : "the system";
}

/**
 * One version of a project's website spec. A draft can be edited by owners
 * and members; every other version is read-only. Saving, submitting,
 * approving and sending back each go through the repository, which records
 * them in the project's activity.
 */
export function SiteSpecEditor({
  record,
  versions,
  client,
  project,
  onChanged,
  onSelect,
}: {
  record: SiteSpecRecord;
  versions: SiteSpecRecord[];
  client: Client;
  project: Project;
  /** Called with the version as stored after a change, so the page can reload the versions. */
  onChanged: (record: SiteSpecRecord) => void;
  onSelect: (id: string) => void;
}) {
  const state = useStudio();
  const { run, pending, canEdit } = useStudioAction();
  const [draft, setDraft] = useState<SiteSpec>(record.spec);
  const [sendingBack, setSendingBack] = useState(false);
  const [note, setNote] = useState("");

  const editable = canEdit && record.status === "draft";
  const parsed = useMemo(() => parseSiteSpec(draft), [draft]);
  const blockers = useMemo(() => (parsed.ok ? approvalBlockers(parsed.spec, client) : []), [parsed, client]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(record.spec);
  const refreshable = useMemo(() => (editable ? refreshFromBrief(draft, client).refreshed : []), [editable, draft, client]);

  // Unsaved changes: ask before the page is closed or reloaded, or a link leads elsewhere.
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    const onClick = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!link || link.getAttribute("href")?.startsWith("#") || link.getAttribute("target") === "_blank") return;
      if (!window.confirm(LEAVE_WARNING)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);
  const latest = versions[0];
  const open = versions.find((v) => v.status === "draft" || v.status === "in_review");

  const info = state.status === "ready" ? state.info : null;
  const myName = info?.kind === "supabase" ? (info.members.find((m) => m.userId === info.user.id)?.displayName ?? info.user.email ?? "Studio member") : "Studio member";
  const editing: SpecEditing = {
    editable,
    change: (edit) =>
      setDraft((current) => {
        const next = structuredClone(current);
        edit(next);
        return next;
      }),
    personSource: () => ({ kind: "person", by: myName.slice(0, 120), at: new Date().toISOString() }),
  };

  async function act(write: () => Promise<SiteSpecRecord | undefined>) {
    const next = await write();
    if (next) onChanged(next);
  }

  const save = () => act(() => run((r) => r.saveSiteSpecDraft!(record, draft), "The website spec was not saved."));
  const submit = () => act(() => run((r) => r.submitSiteSpec!(record), "The website spec was not submitted."));
  const approve = () => act(() => run((r) => r.approveSiteSpec!(record), "The website spec was not approved."));
  const startNext = () => act(() => run((r) => r.startSiteSpec!(project.id), "A new version could not be started."));
  async function sendBack() {
    const next = await run((r) => r.requestSiteSpecChanges!(record, note), "The website spec was not sent back.");
    if (next) {
      setSendingBack(false);
      setNote("");
      onChanged(next);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-[13px] text-ink-subtle">
            <a className="hover:text-ink" href={`/clients/${encodeURIComponent(client.id)}`}>
              {client.name}
            </a>{" "}
            · {project.name}
          </p>
          <h1 className="mt-1 text-[28px] leading-tight font-medium tracking-[-0.032em] text-ink">Website spec v{record.version}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <StatusLabel tone={STATUS_TONES[record.status]}>{SITE_SPEC_STATUS_LABELS[record.status]}</StatusLabel>
            {record.status === "approved" || record.status === "superseded" ? (
              <span className="text-[13px] text-ink-subtle">
                Approved by {actorName(record.approvedBy)} {record.approvedAt ? <RelativeTime iso={record.approvedAt} /> : null}
              </span>
            ) : null}
            {record.status === "in_review" ? (
              <span className="text-[13px] text-ink-subtle">
                Submitted by {actorName(record.submittedBy)} {record.submittedAt ? <RelativeTime iso={record.submittedAt} /> : null}
              </span>
            ) : null}
            {!canEdit ? <Tag>Read only</Tag> : null}
          </div>
        </div>
        {canEdit ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {record.status === "draft" ? (
              <>
                <Button onClick={save} disabled={pending || !dirty || !parsed.ok}>
                  {pending ? "Saving…" : dirty ? "Save" : "Saved"}
                </Button>
                <Button variant="primary" onClick={submit} disabled={pending || dirty || blockers.length > 0} title={dirty ? "Save first" : blockers.length ? "Fix what blocks approval first" : undefined}>
                  Submit for approval
                </Button>
              </>
            ) : null}
            {record.status === "in_review" ? (
              <>
                <Button onClick={() => setSendingBack(true)} disabled={pending}>
                  Ask for changes
                </Button>
                <Button variant="primary" onClick={approve} disabled={pending || blockers.length > 0}>
                  Approve
                </Button>
              </>
            ) : null}
            {record.status === "approved" && !open && latest?.id === record.id ? (
              <Button onClick={startNext} disabled={pending}>
                Start version {record.version + 1}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {record.reviewNote && record.status === "draft" ? (
        <p className="rounded-[var(--radius-surface)] border border-caution/25 bg-caution/[0.06] px-4 py-3 text-[13.5px] text-ink">
          <span className="font-medium">Changes asked for:</span> {record.reviewNote}
        </p>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-10">
          <Section id="strategy" title="Strategy">
            <StrategyEditor spec={draft} client={client} editing={editing} />
          </Section>
          <Section id="brand" title="Brand">
            <BrandEditor spec={draft} editing={editing} />
          </Section>
          <Section id="pages" title="Pages" count={draft.pages.length}>
            <PagesEditor spec={draft} editing={editing} />
          </Section>
          <Section id="settings" title="Site settings">
            <SettingsEditor spec={draft} editing={editing} />
          </Section>
        </div>
        <aside className="flex flex-col gap-8 lg:sticky lg:top-20 lg:self-start">
          <IssuesPanel
            issues={parsed.ok ? [] : parsed.issues}
            blockers={blockers}
            status={record.status}
            refreshable={refreshable}
            onRefresh={() => editing.change((s) => void Object.assign(s, refreshFromBrief(s, client).spec))}
          />
          <VersionHistory versions={versions} selected={record.id} onSelect={(id) => (id === record.id || !dirty || window.confirm(LEAVE_WARNING)) && onSelect(id)} />
        </aside>
      </div>

      <Modal open={sendingBack} onClose={() => setSendingBack(false)} title={`Ask for changes to v${record.version}`} description="The version goes back to draft so it can be edited." busy={pending}>
        <ModalBody>
          <Field id="review-note" label="What should change" hint="Optional. Shown on the draft.">
            <TextArea id="review-note" rows={3} value={note} maxLength={REVIEW_NOTE_MAX_LENGTH} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setSendingBack(false)} disabled={pending}>
            Cancel
          </Button>
          <Button variant="primary" onClick={sendBack} disabled={pending}>
            Send back to draft
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

function IssuesPanel({
  issues,
  blockers,
  status,
  refreshable,
  onRefresh,
}: {
  issues: SpecIssue[];
  blockers: SpecIssue[];
  status: SiteSpecStatus;
  /** Brief values used here that were confirmed again since, which can be brought in with one click. */
  refreshable: ContextFieldKey[];
  onRefresh: () => void;
}) {
  if (status === "approved" || status === "superseded") return null;
  return (
    <Section id="checks" title="Before approval" count={issues.length + blockers.length}>
      {refreshable.length ? (
        <div className="mb-4 flex flex-col items-start gap-2 rounded-[var(--radius-surface)] border border-caution/25 bg-caution/[0.06] px-3 py-2.5">
          <p className="text-[13px] text-ink">
            The brief changed since this spec used{" "}
            {refreshable.map((field) => CONTEXT_FIELD_LABELS[field]).join(", ")}.
          </p>
          <Button size="xs" onClick={onRefresh}>
            Use the current values from the brief
          </Button>
        </div>
      ) : null}
      {issues.length ? (
        <div className="mb-4">
          <p className="mb-2 text-[13px] font-medium text-critical">Cannot be saved yet</p>
          <ul className="flex flex-col gap-1.5" data-testid="spec-issues">
            {issues.slice(0, 20).map((issue, i) => (
              <li key={i} className="text-[13px] text-ink-muted">
                {issue.message} {issue.path ? <span className="text-ink-subtle">({issue.path})</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {blockers.length ? (
        <ul className="flex flex-col gap-1.5" data-testid="spec-blockers">
          {blockers.slice(0, 30).map((b, i) => (
            <li key={i} className="text-[13px] text-ink-muted">
              {b.message}
            </li>
          ))}
          {blockers.length > 30 ? <li className="text-[13px] text-ink-subtle">and {blockers.length - 30} more</li> : null}
        </ul>
      ) : !issues.length ? (
        <StatusLabel tone="positive">Nothing blocks approval</StatusLabel>
      ) : null}
    </Section>
  );
}

function VersionHistory({ versions, selected, onSelect }: { versions: SiteSpecRecord[]; selected: string; onSelect: (id: string) => void }) {
  return (
    <Section id="versions" title="Versions" count={versions.length}>
      <ol className="flex flex-col gap-1" data-testid="spec-versions">
        {versions.map((v) => (
          <li key={v.id}>
            <button
              type="button"
              aria-current={v.id === selected || undefined}
              onClick={() => onSelect(v.id)}
              className={cn("flex w-full items-baseline justify-between gap-3 rounded-[var(--radius-control)] px-2.5 py-2 text-left hover:bg-sunken", v.id === selected && "bg-sunken")}
            >
              <span className="text-[13.5px] font-medium text-ink">v{v.version}</span>
              <span className="flex flex-col items-end gap-0.5">
                <StatusLabel tone={STATUS_TONES[v.status]}>{SITE_SPEC_STATUS_LABELS[v.status]}</StatusLabel>
                <span className="text-[12px] text-ink-subtle">
                  {actorName(v.createdBy)} · <RelativeTime iso={v.createdAt} />
                </span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </Section>
  );
}
