"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useStudio, useStudioStore } from "@/components/providers/studio-provider";
import { useStudioAction } from "@/components/providers/use-studio-action";
import { Check, CircleAlert, Eye, LoaderCircle } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, TextArea } from "@/components/ui/field";
import { Modal, ModalBody, ModalFooter } from "@/components/ui/modal";
import { RelativeTime } from "@/components/ui/relative-time";
import { Section } from "@/components/ui/surface";
import { StatusLabel, Tag, type Tone } from "@/components/ui/status";
import { cn } from "@/lib/cn";
import { RepositoryError, SiteSpecBlockedError } from "@/lib/data/repository";
import { SITE_SPEC_STATUS_LABELS } from "@/lib/domain/labels";
import { imagesInUse, REVIEW_NOTE_MAX_LENGTH } from "@/lib/domain/site-specs";
import { CONTEXT_FIELD_LABELS } from "@/lib/domain/labels";
import type { Actor, Client, ContextFieldKey, Project, SiteAssetRecord, SiteSpecRecord, SiteSpecStatus } from "@/lib/domain/types";
import { errorMessage, type StudioStore } from "@/lib/data/studio-store";
import type { RenderImageFile } from "@/lib/site-render/model";
import { Autosaver, type SaveStatus } from "@/lib/site-spec/autosave";
import type { SiteLocale } from "@/lib/site-spec/catalog";
import { refreshFromBrief } from "@/lib/site-spec/edit";
import { localeOfPath, pageIndexOfPath, pathCandidates } from "@/lib/site-spec/paths";
import type { SiteSpec, SiteSpecSource } from "@/lib/site-spec/schema";
import { qualityWarnings } from "@/lib/site-spec/checks";
import { groupProblems } from "@/lib/site-spec/todo";
import { approvalBlockers, parseSiteSpec, type SpecIssue } from "@/lib/site-spec/validate";
import { BrandEditor } from "./brand-editor";
import type { ImageLibrary } from "./images-editor";
import { LivePreview } from "./live-preview";
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
/** One "Edited" entry in the activity per stretch of editing, not one per pause in typing. */
const LOG_EDIT_EVERY_MS = 10 * 60 * 1000;

export const STATUS_TONES: Record<SiteSpecStatus, Tone> = { draft: "neutral", in_review: "caution", approved: "positive", superseded: "neutral" };

/** Saves a draft as it is edited. Each save and step names the newest stored version, which is what it replaces. */
function draftSaver(record: SiteSpecRecord, store: StudioStore, onStatus: (status: SaveStatus) => void) {
  let latest = record;
  let lastLogged = 0;
  let notify: (record: SiteSpecRecord) => void = () => undefined;
  const saver = new Autosaver<SiteSpec>({
    save: async (value) => {
      const quiet = Date.now() - lastLogged < LOG_EDIT_EVERY_MS;
      // An entry for the activity also refreshes the studio, which shows it.
      latest = quiet ? await store.read((r) => r.saveSiteSpecDraft!(latest, value, { quiet })) : await store.run((r) => r.saveSiteSpecDraft!(latest, value));
      if (!quiet) lastLogged = Date.now();
      notify(latest);
    },
    isFinal: (error) => error instanceof RepositoryError && ["conflict", "not_found", "permission", "session", "validation"].includes(error.code),
    messageOf: errorMessage,
    onStatus,
  });
  return { saver, latest: () => latest, onSaved: (listener: (record: SiteSpecRecord) => void) => void (notify = listener) };
}

function actorName(actor: Actor | null): string {
  if (!actor) return "someone";
  return actor.kind === "human" ? actor.name : actor.kind === "agent" ? "an agent" : "the system";
}

/**
 * One version of a project's website spec, beside a live preview of it. A
 * draft can be edited by owners and members and saves itself after a pause;
 * every other version is read-only. Saving, submitting, approving and sending
 * back each go through the repository, which records them in the project's
 * activity.
 */
export function SiteSpecEditor({
  record,
  versions,
  client,
  project,
  onChanged,
  onSaved,
  onSelect,
}: {
  record: SiteSpecRecord;
  versions: SiteSpecRecord[];
  client: Client;
  project: Project;
  /** Called with the version as stored after a change, so the page can reload the versions. */
  onChanged: (record: SiteSpecRecord) => void;
  /** Called with the version as stored after an autosave. The editor stays as it is. */
  onSaved: (record: SiteSpecRecord) => void;
  onSelect: (id: string) => void;
}) {
  const state = useStudio();
  const store = useStudioStore();
  const { run, pending, canEdit } = useStudioAction();
  const [library, setLibrary] = useState<{ assets: SiteAssetRecord[]; links: Record<string, string> }>({ assets: [], links: {} });
  const [libraryRound, setLibraryRound] = useState(0);

  // The client's stored images and signed links to them. Links last 15 minutes, so they are renewed every 10.
  useEffect(() => {
    let active = true;
    store
      .read(async (r) => {
        const assets = r.listSiteAssets ? await r.listSiteAssets(client.id) : [];
        const links = r.imageLinks ? await r.imageLinks(assets) : {};
        return { assets, links };
      })
      .then(
        (next) => active && setLibrary(next),
        () => undefined,
      );
    return () => {
      active = false;
    };
  }, [store, client.id, libraryRound]);
  useEffect(() => {
    const timer = setInterval(() => setLibraryRound((n) => n + 1), 10 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);
  const inUse = useMemo(() => imagesInUse(versions), [versions]);
  const imageLibrary: ImageLibrary = { ...library, inUse, reload: () => setLibraryRound((n) => n + 1) };
  const [draft, setDraft] = useState<SiteSpec>(record.spec);
  const [sendingBack, setSendingBack] = useState(false);
  const [note, setNote] = useState("");
  const [refusal, setRefusal] = useState<{ blockers: string[] } | { conflict: string } | null>(null);

  const editable = canEdit && record.status === "draft";
  const parsed = useMemo(() => parseSiteSpec(draft), [draft]);
  const blockers = useMemo(() => (parsed.ok ? approvalBlockers(parsed.spec, client, library.assets) : []), [parsed, client, library.assets]);
  const warnings = useMemo(() => (parsed.ok ? qualityWarnings(parsed.spec, library.assets) : []), [parsed, library.assets]);
  const router = useRouter();
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ kind: "saved" });
  const dirty = saveStatus.kind !== "saved";
  const [openPage, setOpenPage] = useState<string | null>(record.spec.pages[0]?.id ?? null);
  const [previewPage, setPreviewPage] = useState<string | undefined>(record.spec.pages[0]?.id);
  const [previewLocale, setPreviewLocale] = useState<SiteLocale | undefined>();
  const [view, setView] = useState<"edit" | "preview">("edit");
  const target = useRef<string | null>(null);
  const [targetRound, setTargetRound] = useState(0);
  const editorRoot = useRef<HTMLDivElement>(null);

  const [drafts] = useState(() => draftSaver(record, store, setSaveStatus));
  const saver = drafts.saver;
  useEffect(() => {
    drafts.onSaved(onSaved);
  });
  useEffect(() => {
    saver.open();
    return () => saver.close();
  }, [saver]);

  // Every edit goes to the saver: the newest valid text, or a stop until it is fixed.
  const seenDraft = useRef(draft);
  useEffect(() => {
    if (draft === seenDraft.current) return;
    seenDraft.current = draft;
    if (parsed.ok) saver.edit(parsed.spec);
    else saver.hold(parsed.issues[0].message);
  }, [draft, parsed, saver]);

  function openPageInEditor(pageId: string | null) {
    setOpenPage(pageId);
    if (pageId) setPreviewPage(pageId);
  }

  /** Goes to the field a problem is about, opening its page and showing it in the preview. */
  function goToProblem(path: string) {
    setView("edit");
    const page = pageIndexOfPath(path);
    if (page !== null && draft.pages[page]) openPageInEditor(draft.pages[page].id);
    const language = localeOfPath(path);
    if (language) setPreviewLocale(language);
    target.current = path;
    setTargetRound((n) => n + 1);
  }

  useEffect(() => {
    if (!target.current) return;
    const path = target.current;
    target.current = null;
    for (const candidate of pathCandidates(path)) {
      const element = editorRoot.current?.querySelector<HTMLElement>(`[data-spec-path="${candidate}"]`);
      if (!element) continue;
      element.scrollIntoView({ block: "center" });
      const field = element.matches("input, textarea, select") ? element : element.querySelector<HTMLElement>("input:not([disabled]), textarea:not([disabled]), select:not([disabled])");
      field?.focus({ preventScroll: true });
      return;
    }
  }, [targetRound]);

  // The preview follows the language being written.
  function followField(event: React.FocusEvent<HTMLDivElement>) {
    const language = localeOfPath((event.target as HTMLElement).dataset.specPath ?? "");
    if (language) setPreviewLocale(language);
  }

  const imageFiles = useMemo<Record<string, RenderImageFile>>(
    () => Object.fromEntries(library.assets.flatMap((a) => (library.links[a.id] ? [[a.id, { url: library.links[a.id], width: a.width, height: a.height }]] : []))),
    [library],
  );
  const refreshable = useMemo(() => (editable ? refreshFromBrief(draft, client).refreshed : []), [editable, draft, client]);

  // Unsaved changes: ask before the page is closed or reloaded. A link saves first, and only asks if that fails.
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    const onClick = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      const href = link?.getAttribute("href");
      if (!href || href.startsWith("#") || link?.getAttribute("target") === "_blank") return;
      event.preventDefault();
      event.stopPropagation();
      void saver.flush().then((stored) => {
        if (stored || window.confirm(LEAVE_WARNING)) router.push(href);
      });
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty, saver, router]);
  const newest = versions[0];
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

  async function submit() {
    // Submit what is on the screen. If it cannot be stored, the save status says why.
    if (!(await saver.flush())) return;
    await act(() => run((r) => r.submitSiteSpec!(drafts.latest()), "The website spec was not submitted."));
  }
  const approve = () => {
    setRefusal(null);
    return act(() =>
      run((r) => r.approveSiteSpec!(drafts.latest()), "The website spec was not approved.", (error) => {
        if (error instanceof SiteSpecBlockedError) {
          setRefusal({ blockers: error.blockers });
          // The brief or the images changed since this page loaded.
          void store.reload().catch(() => undefined);
          setLibraryRound((n) => n + 1);
        } else if (error instanceof RepositoryError && error.code === "conflict") setRefusal({ conflict: error.message });
        else return false;
        return true;
      }),
    );
  };
  const startNext = () => act(() => run((r) => r.startSiteSpec!(project.id), "A new version could not be started."));
  async function sendBack() {
    const next = await run((r) => r.requestSiteSpecChanges!(drafts.latest(), note), "The website spec was not sent back.");
    if (next) {
      setSendingBack(false);
      setNote("");
      onChanged(next);
    }
  }

  return (
    <div className="flex flex-col gap-6 xl:relative xl:left-1/2 xl:w-[min(calc(100vw-4rem),1560px)] xl:-translate-x-1/2">
      <div className="z-20 flex flex-col gap-3 bg-canvas py-2 sm:flex-row sm:items-end sm:justify-between xl:sticky xl:top-14">
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
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {editable ? <SaveStatusLabel status={saveStatus} /> : null}
          <VersionMenu versions={versions} selected={record.id} onSelect={(id) => (id === record.id || !dirty || window.confirm(LEAVE_WARNING)) && onSelect(id)} />
          <ButtonLink href={`/clients/${encodeURIComponent(client.id)}/projects/${encodeURIComponent(project.id)}/site/preview?v=${record.version}`}>
            <Eye aria-hidden />
            Preview
          </ButtonLink>
          {canEdit ? (
            <>
              {record.status === "draft" ? (
                <>
                  <Button variant="primary" onClick={submit} disabled={pending || !parsed.ok || blockers.length > 0} title={blockers.length || !parsed.ok ? "Fix what blocks approval first" : undefined}>
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
              {record.status === "approved" && !open && newest?.id === record.id ? (
                <Button onClick={startNext} disabled={pending}>
                  Start version {record.version + 1}
                </Button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      {refusal && record.status === "in_review" ? (
        "blockers" in refusal ? (
          <div data-testid="approval-refusal" role="alert" className="rounded-[var(--radius-surface)] border border-critical/25 bg-critical/[0.06] px-4 py-3 text-[13.5px] text-ink">
            <p className="font-medium text-critical">
              Not approved: {refusal.blockers.length === 1 ? "1 thing needs" : `${refusal.blockers.length} things need`} fixing
            </p>
            <ul className="mt-1.5 flex flex-col gap-1 text-ink-muted">
              {refusal.blockers.slice(0, 30).map((blocker, i) => (
                <li key={i}>{blocker}</li>
              ))}
              {refusal.blockers.length > 30 ? <li className="text-ink-subtle">and {refusal.blockers.length - 30} more</li> : null}
            </ul>
          </div>
        ) : (
          <p data-testid="approval-refusal" role="alert" className="rounded-[var(--radius-surface)] border border-caution/25 bg-caution/[0.06] px-4 py-3 text-[13.5px] text-ink">
            {refusal.conflict}
          </p>
        )
      ) : null}

      {record.reviewNote && record.status === "draft" ? (
        <p className="rounded-[var(--radius-surface)] border border-caution/25 bg-caution/[0.06] px-4 py-3 text-[13.5px] text-ink">
          <span className="font-medium">Changes asked for:</span> {record.reviewNote}
        </p>
      ) : null}

      <div role="group" aria-label="Edit or preview" className="flex gap-1 xl:hidden">
        {(["edit", "preview"] as const).map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={view === key}
            onClick={() => setView(key)}
            className={cn("rounded-full border px-3 py-1.5 text-[13px]", view === key ? "border-ink bg-sunken text-ink" : "border-line-strong text-ink-muted hover:text-ink")}
          >
            {key === "edit" ? "Edit" : "See preview"}
          </button>
        ))}
      </div>

      <div className="grid items-start gap-8 xl:grid-cols-[132px_minmax(0,1fr)_minmax(0,1.1fr)]">
        <SectionMenu spec={draft} openPage={openPage} onPage={openPageInEditor} />
        <div ref={editorRoot} onFocusCapture={followField} className={cn("flex min-w-0 flex-col gap-10", view === "preview" && "hidden xl:flex")}>
          <IssuesPanel
            spec={draft}
            issues={parsed.ok ? [] : parsed.issues}
            blockers={blockers}
            warnings={warnings}
            reviewing={canEdit && record.status === "in_review"}
            status={record.status}
            refreshable={refreshable}
            onRefresh={() => editing.change((s) => void Object.assign(s, refreshFromBrief(s, client).spec))}
            onProblem={goToProblem}
          />
          <Section id="strategy" title="Strategy" className="scroll-mt-32">
            <div data-spec-path="strategy">
              <StrategyEditor spec={draft} client={client} editing={editing} />
            </div>
          </Section>
          <Section id="brand" title="Brand" className="scroll-mt-32">
            <div data-spec-path="brand">
              <BrandEditor spec={draft} editing={editing} />
            </div>
          </Section>
          <Section id="pages" title="Pages" count={draft.pages.length} className="scroll-mt-32">
            <div data-spec-path="pages">
              <PagesEditor spec={draft} editing={editing} open={openPage} setOpen={openPageInEditor} />
            </div>
          </Section>
          <Section id="settings" title="Site settings" className="scroll-mt-32">
            <SettingsEditor spec={draft} clientId={client.id} editing={editing} library={imageLibrary} />
          </Section>
        </div>
        <div className={cn("min-w-0 xl:sticky xl:top-32", view === "edit" && "hidden xl:block")}>
          <LivePreview
            spec={parsed.ok ? parsed.spec : null}
            pageId={previewPage}
            locale={previewLocale}
            imageFiles={imageFiles}
            showMissingByDefault={record.status === "draft" || record.status === "in_review"}
            onPage={(pageId) => openPageInEditor(pageId)}
            onLocale={setPreviewLocale}
          />
        </div>
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
  spec,
  blockers,
  warnings,
  reviewing,
  status,
  refreshable,
  onRefresh,
  onProblem,
}: {
  spec: SiteSpec;
  issues: SpecIssue[];
  blockers: SpecIssue[];
  /** Worth a second look; they stop nothing. */
  warnings: SpecIssue[];
  reviewing: boolean;
  status: SiteSpecStatus;
  /** Brief values used here that were confirmed again since, which can be brought in with one click. */
  refreshable: ContextFieldKey[];
  onRefresh: () => void;
  onProblem: (path: string) => void;
}) {
  if (status === "approved" || status === "superseded") return null;
  return (
    <Section id="checks" title="Before approval" count={issues.length + groupProblems(spec, blockers).reduce((sum, group) => sum + group.items.length, 0)}>
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
              <li key={i}>
                <ProblemLink issue={issue} onProblem={onProblem} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {blockers.length ? (
        <div className="mb-4">
          <p className="mb-2 text-[13px] font-medium text-critical">Fix before approval</p>
          <ProblemGroups spec={spec} blockers={blockers} onProblem={onProblem} />
        </div>
      ) : !issues.length ? (
        <div className="mb-4">
          <StatusLabel tone="positive">Nothing blocks approval</StatusLabel>
        </div>
      ) : null}
      {warnings.length ? (
        <div className="mb-4">
          <p className="mb-2 text-[13px] font-medium text-caution">
            Worth checking <span className="font-normal text-ink-subtle">These don&apos;t stop approval.</span>
          </p>
          <ul className="flex flex-col gap-1.5" data-testid="spec-warnings">
            {warnings.slice(0, 20).map((w, i) => (
              <li key={i}>
                <ProblemLink issue={w} onProblem={onProblem} />
              </li>
            ))}
            {warnings.length > 20 ? <li className="text-[13px] text-ink-subtle">and {warnings.length - 20} more</li> : null}
          </ul>
        </div>
      ) : null}
      {reviewing ? (
        <div data-testid="review-reminder" className="text-[13px]">
          <p className="mb-1 font-medium text-ink">The checks can&apos;t judge these, so look yourself</p>
          <p className="text-ink-muted">Does the copy sound right for this client? Do the images suit their pages? Are the contact details correct? Have the privacy notice and consent wording had client-specific and legal review? Does it look right at phone width?</p>
        </div>
      ) : null}
    </Section>
  );
}

/** Short lists stay open. A long one opens where to start, with the rest a click away. */
const OPEN_EVERYTHING_UP_TO = 8;

function ProblemGroups({ spec, blockers, onProblem }: { spec: SiteSpec; blockers: SpecIssue[]; onProblem: (path: string) => void }) {
  const groups = groupProblems(spec, blockers);
  const total = groups.reduce((sum, group) => sum + group.items.length, 0);
  // Null until the person opens or closes one; then their choice stands.
  const [opened, setOpened] = useState<Set<string> | null>(null);
  const isOpen = (key: string, index: number) => (opened ? opened.has(key) : total <= OPEN_EVERYTHING_UP_TO || index === 0);
  return (
    <div className="flex flex-col gap-1" data-testid="spec-blockers">
      {groups.map((group, g) => (
        <details
          key={group.key}
          open={isOpen(group.key, g)}
          data-testid="problem-group"
          className="rounded-[var(--radius-control)] border border-line px-3 py-2"
        >
          <summary
            onClick={(event) => {
              event.preventDefault();
              const next = new Set(groups.filter((other, i) => isOpen(other.key, i)).map((other) => other.key));
              if (next.has(group.key)) next.delete(group.key);
              else next.add(group.key);
              setOpened(next);
            }}
            className="flex cursor-pointer list-none items-baseline justify-between gap-3 text-[13px] font-medium text-ink"
          >
            {group.label}
            <span className="font-normal tabular-nums text-ink-subtle">{group.items.length}</span>
          </summary>
          {group.note ? <p className="mt-1.5 text-[12.5px] text-caution">{group.note}</p> : null}
          <ul className="mt-1.5 flex flex-col gap-1.5">
            {group.items.map((item) => (
              <li key={`${item.path}|${item.message}`}>
                <ProblemLink issue={item} onProblem={onProblem} />
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}

function ProblemLink({ issue, onProblem }: { issue: SpecIssue; onProblem: (path: string) => void }) {
  return (
    <button type="button" onClick={() => onProblem(issue.path)} className="rounded-sm text-left text-[13px] text-ink-muted underline decoration-line-strong underline-offset-2 hover:text-ink">
      {issue.message}
    </button>
  );
}

function SaveStatusLabel({ status }: { status: SaveStatus }) {
  const reload = status.kind === "stopped";
  return (
    <p data-testid="save-status" role="status" className={cn("flex items-center gap-1.5 text-[12.5px]", status.kind === "saved" || status.kind === "saving" || status.kind === "waiting" ? "text-ink-subtle" : status.kind === "stopped" ? "text-critical" : "text-caution")}>
      {status.kind === "saved" ? <Check aria-hidden className="size-3.5" /> : status.kind === "saving" || status.kind === "waiting" ? <LoaderCircle aria-hidden className="size-3.5 animate-spin" /> : <CircleAlert aria-hidden className="size-3.5" />}
      {status.kind === "saved"
        ? "Saved"
        : status.kind === "saving" || status.kind === "waiting"
          ? "Saving…"
          : status.kind === "invalid"
            ? `Not saved: ${status.message}`
            : status.kind === "failed"
              ? `Not saved yet, trying again: ${status.message}`
              : `Not saved: ${status.message} Your edits are still here.`}
      {reload ? (
        <button type="button" onClick={() => window.location.reload()} className="rounded-sm font-medium underline underline-offset-2">
          Reload
        </button>
      ) : null}
    </p>
  );
}

function SectionMenu({ spec, openPage, onPage }: { spec: SiteSpec; openPage: string | null; onPage: (pageId: string) => void }) {
  const link = "block rounded-sm py-1 text-[13px] text-ink-muted hover:text-ink";
  return (
    <nav aria-label="Website spec sections" className="hidden xl:sticky xl:top-32 xl:block">
      <a href="#strategy" className={link}>
        Strategy
      </a>
      <a href="#brand" className={link}>
        Brand
      </a>
      <a href="#pages" className={link}>
        Pages
      </a>
      <ul className="mb-1 border-l border-line pl-2.5">
        {spec.pages.map((page, i) => (
          <li key={page.id}>
            <a href="#pages" onClick={() => onPage(page.id)} className={cn(link, "truncate py-0.5 text-[12.5px]", openPage === page.id && "font-medium text-ink")}>
              {page.title[spec.locales.default] || (i === 0 ? "Home" : page.id)}
            </a>
          </li>
        ))}
      </ul>
      <a href="#settings" className={link}>
        Site settings
      </a>
    </nav>
  );
}

function VersionMenu({ versions, selected, onSelect }: { versions: SiteSpecRecord[]; selected: string; onSelect: (id: string) => void }) {
  const current = versions.find((v) => v.id === selected);
  return (
    <details className="relative" data-testid="spec-version-menu">
      <summary className="inline-flex h-8 cursor-pointer list-none items-center rounded-full border border-line-strong px-3 text-[13px] text-ink-muted hover:text-ink">
        {versions.length === 1 ? "1 version" : `${versions.length} versions`}
        {current ? <span className="sr-only">, showing v{current.version}</span> : null}
      </summary>
      <ol className="absolute right-0 z-30 mt-1 flex w-72 flex-col gap-1 rounded-[var(--radius-surface)] border border-line bg-surface p-1.5 shadow-sm" data-testid="spec-versions">
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
    </details>
  );
}
