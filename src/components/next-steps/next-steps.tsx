"use client";

import { CalendarPlus, Check, Copy, RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useStudio, useStudioStore } from "@/components/providers/studio-provider";
import { useStudioAction } from "@/components/providers/use-studio-action";
import { Button } from "@/components/ui/button";
import { Field, Select, TextInput } from "@/components/ui/field";
import { Surface } from "@/components/ui/surface";
import { cn } from "@/lib/cn";
import { helsinkiDate } from "@/lib/domain/followups";
import { calendar, describeDue, groupNextSteps, nextStepEvent } from "@/lib/domain/next-steps";
import type { NextStep } from "@/lib/domain/types";
import { useNow } from "@/lib/use-now";

/** The studio's next steps, read from the server; null until loaded. */
function useNextSteps(clientId?: string) {
  const store = useStudioStore();
  const state = useStudio();
  const server = state.status === "ready" && state.info.kind === "supabase";
  const [steps, setSteps] = useState<NextStep[] | null>(null);
  const load = useCallback(() => store.read((r) => (r.listNextSteps ? r.listNextSteps(clientId) : Promise.resolve([]))), [store, clientId]);
  useEffect(() => {
    if (!server) return;
    let active = true;
    load().then(
      (list) => active && setSteps(list),
      () => active && setSteps([]),
    );
    return () => {
      active = false;
    };
  }, [load, server]);
  return { steps, setSteps, server };
}

/** Saves one next step as a calendar file the person opens in their calendar app. */
function downloadEvent(step: NextStep, clientName: string) {
  const text = calendar("Studio OS", [nextStepEvent(step, clientName, window.location.origin)]);
  const url = URL.createObjectURL(new Blob([text], { type: "text/calendar;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `next-step-${step.dueOn}.ics`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function StepRow({ step, clientName, clientHref, now, onDone, onUndo, onDelete, canEdit, pending }: { step: NextStep; clientName: string; clientHref?: string; now: number; onDone: () => void; onUndo: () => void; onDelete: () => void; canEdit: boolean; pending: boolean }) {
  const overdue = step.status === "open" && step.dueOn < helsinkiDate(now);
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className={cn("text-[13.5px]", step.status === "done" ? "text-ink-subtle line-through" : "text-ink")}>{step.title}</span>
        <span className={cn("text-[12.5px]", overdue ? "text-critical" : "text-ink-subtle")}>
          {describeDue(step, now)}
          {clientHref ? (
            <>
              {" · "}
              <Link href={clientHref} className="underline underline-offset-2">
                {clientName}
              </Link>
            </>
          ) : null}
          {step.assignee ? ` · ${step.assignee.name}` : ""}
        </span>
        {step.note ? <span className="text-[12.5px] text-ink-muted">{step.note}</span> : null}
      </div>
      <div className="flex items-center gap-1">
        {step.status === "open" ? (
          <>
            <Button size="xs" variant="ghost" onClick={() => downloadEvent(step, clientName)} aria-label={`Add "${step.title}" to your calendar`}>
              <CalendarPlus aria-hidden />
            </Button>
            {canEdit ? (
              <Button size="xs" variant="secondary" onClick={onDone} disabled={pending}>
                <Check aria-hidden />
                Done
              </Button>
            ) : null}
          </>
        ) : canEdit ? (
          <Button size="xs" variant="ghost" onClick={onUndo} disabled={pending} aria-label={`Open "${step.title}" again`}>
            <RotateCcw aria-hidden />
          </Button>
        ) : null}
        {canEdit ? (
          <Button size="xs" variant="ghost" onClick={onDelete} disabled={pending} aria-label={`Delete "${step.title}"`}>
            <Trash2 aria-hidden />
          </Button>
        ) : null}
      </div>
    </li>
  );
}

/** The next steps for one client, with a quick way to add one. */
export function ClientNextSteps({ clientId, clientName }: { clientId: string; clientName: string }) {
  const { steps, setSteps, server } = useNextSteps(clientId);
  const { run, pending, canEdit } = useStudioAction();
  const state = useStudio();
  const now = useNow() ?? 0;
  const members = state.status === "ready" && state.info.kind === "supabase" ? state.info.members : [];
  const me = state.status === "ready" && state.info.kind === "supabase" ? state.info.user.id : null;
  const [title, setTitle] = useState("");
  const [dueOn, setDueOn] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [who, setWho] = useState<string>("");
  const [showDone, setShowDone] = useState(false);

  if (!server) return null;
  const open = (steps ?? []).filter((s) => s.status === "open");
  const done = (steps ?? []).filter((s) => s.status === "done").sort((a, b) => (b.doneAt ?? "").localeCompare(a.doneAt ?? ""));
  const assigneeId = who || me || "";
  const assignee = members.find((m) => m.userId === assigneeId);

  async function add() {
    const made = await run(
      (r) => r.addNextStep!({ clientId, title, dueOn, dueTime: dueTime || null, assignee: assignee ? { kind: "human", name: assignee.displayName, userId: assignee.userId } : null }),
      "The next step was not saved.",
    );
    if (made) {
      setSteps((list) => [...(list ?? []), made]);
      setTitle("");
      setDueTime("");
    }
  }
  async function change(step: NextStep, status: NextStep["status"]) {
    const saved = await run((r) => r.updateNextStep!(step, { status }), "The next step was not updated.");
    if (saved) setSteps((list) => (list ?? []).map((s) => (s.id === saved.id ? saved : s)));
  }
  async function remove(step: NextStep) {
    const ok = await run(async (r) => {
      await r.deleteNextStep!(step);
      return true;
    }, "The next step was not deleted.");
    if (ok) setSteps((list) => (list ?? []).filter((s) => s.id !== step.id));
  }

  return (
    <section aria-labelledby={`next-steps-${clientId}`} className="flex flex-col gap-3">
      <h2 id={`next-steps-${clientId}`} className="text-[15px] font-medium text-ink">
        Next steps
      </h2>
      <Surface>
        {steps === null ? (
          <p className="px-5 py-3 text-[13px] text-ink-subtle">Loading…</p>
        ) : open.length ? (
          <ul className="divide-y divide-line">
            {[...open].sort((a, b) => a.dueOn.localeCompare(b.dueOn) || (a.dueTime ?? "").localeCompare(b.dueTime ?? "")).map((step) => (
              <StepRow key={step.id} step={step} clientName={clientName} now={now} canEdit={canEdit} pending={pending} onDone={() => change(step, "done")} onUndo={() => change(step, "open")} onDelete={() => remove(step)} />
            ))}
          </ul>
        ) : (
          <p className="px-5 py-3 text-[13px] text-ink-subtle">No next step planned. What happens next, and when?</p>
        )}
        {canEdit ? (
          <form
            className="flex flex-wrap items-end gap-3 border-t border-line px-5 py-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (title.trim() && dueOn) void add();
            }}
          >
            <Field id={`ns-title-${clientId}`} label="Next step" className="min-w-[14rem] flex-1">
              <TextInput id={`ns-title-${clientId}`} value={title} maxLength={160} placeholder="For example: call back about the offer" onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field id={`ns-date-${clientId}`} label="Day" className="w-40">
              <TextInput id={`ns-date-${clientId}`} type="date" value={dueOn} min={now ? helsinkiDate(now) : undefined} onChange={(e) => setDueOn(e.target.value)} />
            </Field>
            <Field id={`ns-time-${clientId}`} label="Time (optional)" className="w-32">
              <TextInput id={`ns-time-${clientId}`} type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
            </Field>
            {members.length > 1 ? (
              <Field id={`ns-who-${clientId}`} label="Who" className="w-44">
                <Select id={`ns-who-${clientId}`} value={assigneeId} onChange={(e) => setWho(e.target.value)}>
                  {members.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.displayName}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
            <Button type="submit" variant="primary" size="sm" disabled={pending || !title.trim() || !dueOn}>
              Add
            </Button>
          </form>
        ) : null}
        {done.length ? (
          <div className="border-t border-line">
            <button type="button" className="w-full px-5 py-2.5 text-left text-[12.5px] text-ink-muted hover:text-ink" onClick={() => setShowDone((v) => !v)} aria-expanded={showDone}>
              {showDone ? "Hide" : "Show"} {done.length} done
            </button>
            {showDone ? (
              <ul className="divide-y divide-line border-t border-line">
                {done.slice(0, 10).map((step) => (
                  <StepRow key={step.id} step={step} clientName={clientName} now={now} canEdit={canEdit} pending={pending} onDone={() => change(step, "done")} onUndo={() => change(step, "open")} onDelete={() => remove(step)} />
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </Surface>
    </section>
  );
}

/** Today's view of everyone's next steps: overdue, today and the coming week. */
export function TodayNextSteps() {
  const { steps, setSteps, server } = useNextSteps();
  const { run, pending, canEdit } = useStudioAction();
  const state = useStudio();
  const now = useNow();
  if (!server || !now || !steps) return null;
  const clients = state.status === "ready" ? state.snapshot.clients : [];
  const nameOf = (id: string) => clients.find((c) => c.id === id)?.name ?? "Client";
  const weekAhead = helsinkiDate(now + 7 * 24 * 60 * 60 * 1000);
  const groups = groupNextSteps(steps, now);
  const shown = [...groups.overdue, ...groups.today, ...groups.upcoming.filter((s) => s.dueOn <= weekAhead)];
  if (!shown.length) return null;

  async function done(step: NextStep) {
    const saved = await run((r) => r.updateNextStep!(step, { status: "done" }), "The next step was not updated.");
    if (saved) setSteps((list) => (list ?? []).map((s) => (s.id === saved.id ? saved : s)));
  }
  async function remove(step: NextStep) {
    const ok = await run(async (r) => {
      await r.deleteNextStep!(step);
      return true;
    }, "The next step was not deleted.");
    if (ok) setSteps((list) => (list ?? []).filter((s) => s.id !== step.id));
  }

  return (
    <section aria-labelledby="today-next-steps" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="today-next-steps" className="text-[15px] font-medium text-ink">
          Next steps <span className="text-ink-subtle">{shown.length}</span>
        </h2>
        <span className="text-[12.5px] text-ink-subtle">{groups.overdue.length ? `${groups.overdue.length} overdue · ` : ""}the coming week</span>
      </div>
      <Surface>
        <ul className="divide-y divide-line">
          {shown.map((step) => (
            <StepRow
              key={step.id}
              step={step}
              clientName={nameOf(step.clientId)}
              clientHref={`/clients/${encodeURIComponent(step.clientId)}`}
              now={now}
              canEdit={canEdit}
              pending={pending}
              onDone={() => done(step)}
              onUndo={() => undefined}
              onDelete={() => remove(step)}
            />
          ))}
        </ul>
      </Surface>
    </section>
  );
}

/** A person's own calendar feed: one private link their calendar app subscribes to. */
export function CalendarFeedSettings() {
  const store = useStudioStore();
  const state = useStudio();
  const { run, pending } = useStudioAction();
  const server = state.status === "ready" && state.info.kind === "supabase";
  const [on, setOn] = useState<boolean | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!server) return;
    let active = true;
    store.read((r) => (r.hasCalendarFeed ? r.hasCalendarFeed() : Promise.resolve(false))).then(
      (value) => active && setOn(value),
      () => active && setOn(false),
    );
    return () => {
      active = false;
    };
  }, [store, server]);

  if (!server) return null;

  async function make() {
    if (on && !window.confirm("Make a new link? The old one stops working, so you need to add the new one to your calendar again.")) return;
    const token = await run((r) => r.createCalendarFeed!(), "The calendar link was not made.");
    if (token) {
      setLink(`${window.location.origin}/api/calendar/${token}.ics`);
      setOn(true);
      setCopied(false);
    }
  }
  async function turnOff() {
    const ok = await run(async (r) => {
      await r.revokeCalendarFeed!();
      return true;
    }, "The calendar link was not turned off.");
    if (ok) {
      setOn(false);
      setLink(null);
    }
  }

  return (
    <section aria-labelledby="calendar-feed" className="flex flex-col gap-3">
      <h2 id="calendar-feed" className="text-[15px] font-medium text-ink">
        Calendar
      </h2>
      <Surface>
        <div className="flex flex-col gap-3 px-5 py-4 text-[13.5px]">
          <p className="text-ink">Get the studio&apos;s next steps and dated tasks in your own calendar, with a reminder: 15 minutes before a step with a time, and at 9:00 on the day for one without.</p>
          <p className="text-[12.5px] text-ink-subtle">
            The link is private to you. Anyone who has it can see the titles, client names and times, so do not share it. Your calendar app fetches it from its own servers, which may be outside the EU. Turn it off here at any time.
          </p>
          {link ? (
            <div className="flex flex-col gap-2 rounded-[var(--radius-control)] border border-line p-3">
              <label htmlFor="calendar-link" className="text-[12.5px] font-medium text-ink">
                Your calendar link. It is shown only now, so copy it:
              </label>
              <div className="flex flex-wrap gap-2">
                <input id="calendar-link" readOnly value={link} className="min-w-0 flex-1 rounded-[var(--radius-control)] border border-line-strong bg-surface px-2 py-1.5 font-mono text-[12px]" onFocus={(e) => e.currentTarget.select()} />
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    void navigator.clipboard?.writeText(link).then(() => setCopied(true));
                  }}
                >
                  <Copy aria-hidden />
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <ul className="list-disc pl-5 text-[12.5px] text-ink-muted">
                <li>Google Calendar: Other calendars › + › From URL, paste the link.</li>
                <li>Apple Calendar: File › New Calendar Subscription, paste the link. On iPhone: Settings › Calendar › Accounts › Add Subscribed Calendar.</li>
                <li>Outlook: Add calendar › Subscribe from web, paste the link.</li>
              </ul>
              <p className="text-[12.5px] text-ink-subtle">Calendar apps refresh subscriptions on their own schedule, from every few minutes to about a day (Google is the slowest).</p>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" variant="primary" onClick={make} disabled={pending || on === null}>
              {on ? "Make a new link" : "Make my calendar link"}
            </Button>
            {on ? (
              <Button size="sm" variant="ghost" onClick={turnOff} disabled={pending}>
                Turn the link off
              </Button>
            ) : null}
            <span className="text-[12.5px] text-ink-subtle">{on === null ? "" : on ? "Your calendar link is on." : "You have no calendar link."}</span>
          </div>
        </div>
      </Surface>
    </section>
  );
}
