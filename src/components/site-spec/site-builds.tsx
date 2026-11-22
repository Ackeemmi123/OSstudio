"use client";

import { ExternalLink, Hammer } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useStudio, useStudioStore } from "@/components/providers/studio-provider";
import { useStudioAction } from "@/components/providers/use-studio-action";
import { Button } from "@/components/ui/button";
import { TextArea } from "@/components/ui/field";
import { siteDraftResultOf } from "@/lib/agents/contract";
import type { SiteBuildRecord, SiteReviewComment, SiteSpecRecord } from "@/lib/domain/types";

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function state(build: SiteBuildRecord, now: number): "live" | "expired" | "off" {
  if (build.revokedAt) return "off";
  return new Date(build.expiresAt).getTime() <= now ? "expired" : "live";
}

/**
 * Builds this version with its spec's design system and lists its builds,
 * each with a private link to send to the client. Shown only when the spec
 * names a design system that builds; the template only previews.
 */
export function SiteBuilds({ record }: { record: SiteSpecRecord }) {
  const store = useStudioStore();
  const { run, pending, canEdit } = useStudioAction();
  const [builds, setBuilds] = useState<SiteBuildRecord[] | null>(null);
  const [now] = useState(() => Date.now());
  const designSystem = record.spec.brand?.designSystem;

  const load = useCallback(() => store.read((r) => (r.listSiteBuilds ? r.listSiteBuilds(record.id) : Promise.resolve([]))), [store, record.id]);
  useEffect(() => {
    if (!designSystem || designSystem === "template") return;
    let active = true;
    load().then(
      (list) => active && setBuilds(list),
      () => active && setBuilds([]),
    );
    return () => {
      active = false;
    };
  }, [load, designSystem]);

  if (!designSystem || designSystem === "template") return null;

  async function build() {
    const made = await run((r) => r.buildSite!(record), "The site was not built.");
    if (made) setBuilds((list) => [made, ...(list ?? [])]);
  }

  async function setReviews(target: SiteBuildRecord, enabled: boolean) {
    const done = await run(async (r) => {
      await r.setBuildReviews!(target, enabled);
      return true;
    }, "The review setting was not changed.");
    if (done) setBuilds((list) => (list ?? []).map((b) => (b.id === target.id ? { ...b, reviewsEnabled: enabled } : b)));
  }

  async function answer(target: SiteBuildRecord, comment: SiteReviewComment, reply: string | null, resolve: boolean) {
    const done = await run(async (r) => {
      await r.answerReviewComment!(comment.id, reply, resolve);
      return true;
    }, "The comment was not updated.");
    if (done)
      setBuilds((list) =>
        (list ?? []).map((b) =>
          b.id === target.id
            ? { ...b, comments: b.comments.map((c) => (c.id === comment.id ? { ...c, reply: reply === null ? c.reply : reply.trim() || null, status: resolve ? "resolved" : "open" } : c)) }
            : b,
        ),
      );
  }

  async function saveQuestions(target: SiteBuildRecord, questions: string[]) {
    const done = await run(async (r) => {
      await r.setBuildQuestions!(target, questions);
      return true;
    }, "The questions were not saved.");
    if (done) setBuilds((list) => (list ?? []).map((b) => (b.id === target.id ? { ...b, clientQuestions: questions } : b)));
    return Boolean(done);
  }

  async function turnOff(target: SiteBuildRecord) {
    const done = await run(async (r) => {
      await r.revokeSiteBuild!(target);
      return true;
    }, "The link was not turned off.");
    if (done) setBuilds((list) => (list ?? []).map((b) => (b.id === target.id ? { ...b, revokedAt: new Date().toISOString() } : b)));
  }

  return (
    <section aria-labelledby="site-builds" className="flex flex-col gap-3 rounded-[var(--radius-surface)] border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="site-builds" className="text-[15px] font-medium text-ink">
            Build the site
          </h2>
          <p className="text-[13px] text-ink-subtle">Builds v{record.version} with {designSystem} and gives a private link for 30 days, hidden from search engines.</p>
        </div>
        {canEdit ? (
          <Button variant="primary" size="sm" onClick={build} disabled={pending}>
            <Hammer aria-hidden />
            {pending ? "Building…" : "Build site"}
          </Button>
        ) : null}
      </div>
      {builds?.length ? (
        <ul className="flex flex-col divide-y divide-line">
          {builds.map((b) => {
            const status = state(b, now);
            const warnings = b.checks.filter((c) => c.level === "warning");
            return (
              <li key={b.id} className="flex flex-col gap-1 py-2 text-[13px]">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-ink">{DATE.format(new Date(b.createdAt))}</span>
                  <span className="text-ink-subtle">by {b.createdBy}</span>
                  {status === "live" ? (
                    <a href={b.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary underline underline-offset-2">
                      Open the link <ExternalLink aria-hidden className="size-3.5" />
                    </a>
                  ) : (
                    <span className="text-ink-subtle">{status === "off" ? "Link turned off" : "Link expired"}</span>
                  )}
                  {status === "live" ? <span className="text-ink-subtle">until {DATE.format(new Date(b.expiresAt))}</span> : null}
                  {status === "live" && canEdit ? (
                    <Button variant="ghost" size="xs" onClick={() => turnOff(b)} disabled={pending}>
                      Turn off link
                    </Button>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
                  {b.approval ? (
                    <span className="font-medium text-positive">
                      Approved by {b.approval.name}
                      {b.approval.role ? `, ${b.approval.role}` : ""} · {DATE.format(new Date(b.approval.at))}
                    </span>
                  ) : (
                    <span className="text-ink-subtle">{b.reviewsEnabled && status === "live" ? "Not approved by the client yet" : "Client review is off"}</span>
                  )}
                  {status === "live" && canEdit && !b.approval ? (
                    <Button variant="ghost" size="xs" onClick={() => setReviews(b, !b.reviewsEnabled)} disabled={pending}>
                      {b.reviewsEnabled ? "Turn off client review" : "Turn on client review"}
                    </Button>
                  ) : null}
                </div>
                {status === "live" && b.reviewsEnabled ? <ClientQuestions build={b} record={record} canEdit={canEdit} pending={pending} onSave={saveQuestions} /> : null}
                {b.comments.length ? <ReviewComments build={b} canEdit={canEdit} pending={pending} onAnswer={answer} /> : null}
                {warnings.length ? (
                  <ul className="list-disc pl-5 text-caution">
                    {warnings.map((w) => (
                      <li key={w.message}>{w.message}</li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : builds ? (
        <p className="text-[13px] text-ink-subtle">No builds of this version yet.</p>
      ) : null}
    </section>
  );
}

/** The client's comments on a build, with the studio's answers. */
function ReviewComments({
  build,
  canEdit,
  pending,
  onAnswer,
}: {
  build: SiteBuildRecord;
  canEdit: boolean;
  pending: boolean;
  onAnswer: (build: SiteBuildRecord, comment: SiteReviewComment, reply: string | null, resolve: boolean) => void;
}) {
  const open = build.comments.filter((c) => c.status === "open").length;
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  return (
    <details className="text-[13px]" open={open > 0}>
      <summary className="cursor-pointer text-ink">
        Client comments: {build.comments.length}
        {open ? `, ${open} open` : ", all resolved"}
      </summary>
      <ul className="mt-2 flex flex-col gap-3">
        {build.comments.map((c) => (
          <li key={c.id} className={`rounded-[var(--radius-control)] border px-3 py-2 ${c.status === "open" ? "border-line-strong" : "border-line opacity-70"}`}>
            <p className="text-[12px] text-ink-subtle">
              {c.page}
              {c.target ? ` · ${c.target}` : ""} · {c.author} · {DATE.format(new Date(c.createdAt))}
              {c.status === "resolved" ? " · Resolved" : ""}
            </p>
            <p className="mt-1 whitespace-pre-wrap text-ink">{c.body}</p>
            {c.reply ? <p className="mt-1 text-ink-muted">Answer: {c.reply}</p> : null}
            {canEdit ? (
              <div className="mt-2 flex flex-col gap-2">
                {c.status === "open" ? (
                  <TextArea
                    aria-label={`Answer to ${c.author}`}
                    rows={2}
                    maxLength={2000}
                    placeholder="Answer the client (shown on the link)"
                    value={drafts[c.id] ?? ""}
                    onChange={(e) => setDrafts((d) => ({ ...d, [c.id]: e.target.value }))}
                  />
                ) : null}
                <div className="flex flex-wrap gap-2">
                  {c.status === "open" ? (
                    <>
                      <Button size="xs" onClick={() => onAnswer(build, c, drafts[c.id] ?? null, false)} disabled={pending || !(drafts[c.id] ?? "").trim()}>
                        Answer
                      </Button>
                      <Button size="xs" variant="ghost" onClick={() => onAnswer(build, c, drafts[c.id]?.trim() ? drafts[c.id] : null, true)} disabled={pending}>
                        {(drafts[c.id] ?? "").trim() ? "Answer and resolve" : "Resolve"}
                      </Button>
                    </>
                  ) : (
                    <Button size="xs" variant="ghost" onClick={() => onAnswer(build, c, null, false)} disabled={pending}>
                      Reopen
                    </Button>
                  )}
                </div>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </details>
  );
}

/**
 * Questions for the client on one link, one per line, at most eight. The AI
 * draft's questions can be taken as a start. The client answers once on the
 * link, and the answers are added to the client's source material.
 */
function ClientQuestions({ build, record, canEdit, pending, onSave }: { build: SiteBuildRecord; record: SiteSpecRecord; canEdit: boolean; pending: boolean; onSave: (build: SiteBuildRecord, questions: string[]) => Promise<boolean> }) {
  const state = useStudio();
  const [text, setText] = useState(build.clientQuestions.join("\n"));
  const [open, setOpen] = useState(false);
  const runs = state.status === "ready" ? state.snapshot.agentRuns.filter((r) => r.taskType === "design.site_draft" && r.inputs.some((i) => i.type === "project" && i.id === record.projectId)) : [];
  const latest = [...runs].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const drafted = siteDraftResultOf(latest)?.questions ?? [];
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const tooMany = lines.length > 8;
  const tooLong = lines.some((line) => line.length > 300);

  if (build.questionsAnsweredAt) {
    return <p className="text-[12.5px] font-medium text-positive">The client answered the questions on {DATE.format(new Date(build.questionsAnsweredAt))}. The answers are under the client&apos;s source material.</p>;
  }
  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
        <span className="text-ink-subtle">{build.clientQuestions.length ? `${build.clientQuestions.length} questions for the client on the link` : "No questions for the client on the link"}</span>
        {canEdit ? (
          <Button variant="ghost" size="xs" onClick={() => setOpen(true)} disabled={pending}>
            {build.clientQuestions.length ? "Change the questions" : "Ask the client questions"}
          </Button>
        ) : null}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-control)] border border-line p-3">
      <label htmlFor={`questions-${build.id}`} className="text-[13px] font-medium text-ink">
        Questions for the client, one per line (at most 8)
      </label>
      <p className="text-[12.5px] text-ink-subtle">The client sees them on the link as &ldquo;A few questions from us&rdquo; and answers in their own words. Ask for what makes the site personal: how it started, who works there, work they are proud of, and whether names, photos and quotes may be shown.</p>
      <TextArea id={`questions-${build.id}`} rows={6} value={text} onChange={(e) => setText(e.target.value)} disabled={!canEdit} />
      {tooMany ? <p className="text-[12.5px] text-caution">Keep it to eight questions.</p> : null}
      {tooLong ? <p className="text-[12.5px] text-caution">Each question can be at most 300 characters.</p> : null}
      <div className="flex flex-wrap gap-2">
        {drafted.length ? (
          <Button variant="ghost" size="xs" onClick={() => setText(drafted.slice(0, 8).join("\n"))} disabled={pending}>
            Use the AI draft&apos;s questions
          </Button>
        ) : null}
        <Button
          variant="primary"
          size="xs"
          disabled={pending || tooMany || tooLong}
          onClick={async () => {
            if (await onSave(build, lines)) setOpen(false);
          }}
        >
          {lines.length ? "Save the questions" : "Take the questions off"}
        </Button>
        <Button variant="ghost" size="xs" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

