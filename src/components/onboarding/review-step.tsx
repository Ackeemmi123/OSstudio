"use client";

import type { ReactNode } from "react";
import { ArrowLeft, Check, CircleHelp, Pencil, Plus, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef } from "react";
import { ConfidenceTag } from "@/components/clients/status";
import { useStudioAction } from "@/components/providers/use-studio-action";
import { Button, ButtonLink } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { useToast } from "@/components/ui/toast";
import { intakeResultOf } from "@/lib/agents/contract";
import { BRIEF_FIELD, briefConditions, fieldApplies, getBriefGaps } from "@/lib/domain/brief";
import { getLatestIntakeRun } from "@/lib/domain/insights";
import { CONTEXT_FIELD_LABELS, ONBOARDING_STEP_LABELS } from "@/lib/domain/labels";
import { CONTEXT_FIELD_KEYS, ONBOARDING_STEPS, type Client, type ContextFieldKey, type Onboarding, type OnboardingStep, type StudioSnapshot } from "@/lib/domain/types";
import { formatContextValue, formatDate } from "@/lib/format";

/**
 * The brief as onboarding left it: what is known and how certain, what is
 * still missing, and what to ask. Everything here is the client's live brief,
 * not a copy, so it stays editable from the client workspace afterwards.
 */
export function ReviewStep({
  client,
  onboarding,
  snapshot,
  canEdit,
  onEditStep,
  onBack,
}: {
  client: Client;
  onboarding: Onboarding;
  snapshot: StudioSnapshot;
  canEdit: boolean;
  onEditStep: (step: OnboardingStep) => void;
  onBack: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const { run, pending } = useStudioAction();
  const finishing = useRef(false);
  const gaps = getBriefGaps(client, onboarding);
  const conditions = briefConditions(client);
  const unknown = [...gaps.missing, ...gaps.skipped];
  const questions = client.contextItems.filter((item) => item.kind === "question" && item.confidence !== "superseded");
  const workspace = `/clients/${encodeURIComponent(client.id)}`;
  const hasProject = snapshot.projects.some((project) => project.clientId === client.id && project.status !== "completed");

  const latestRun = getLatestIntakeRun(snapshot, client.id);
  const suggested = (intakeResultOf(latestRun)?.questions ?? []).filter(
    (q) => !questions.some((item) => item.text.toLocaleLowerCase() === q.toLocaleLowerCase()),
  );

  const confirm = (key: ContextFieldKey) =>
    run((r) => r.saveOnboardingStep(onboarding.id, { nextStep: "review", confirm: [key] }), "The value was not confirmed.");
  const addQuestion = (text: string) =>
    run((r) => r.saveOnboardingStep(onboarding.id, { nextStep: "review", questions: [text] }), "The question was not added.");

  async function finish() {
    if (finishing.current) return;
    finishing.current = true;
    const done = await run((r) => r.completeOnboarding(onboarding.id), "The brief was not marked ready.");
    finishing.current = false;
    if (done) {
      toast.success("The brief is ready for review.");
      router.push(`${workspace}#brief`);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Surface className="flex flex-wrap gap-x-8 gap-y-2 px-5 py-4 text-[13.5px]">
        <p>
          <span className="font-medium text-ink">{CONTEXT_FIELD_KEYS.filter((k) => client.context[k].value !== null).length}</span>{" "}
          <span className="text-ink-muted">details recorded</span>
        </p>
        <p>
          <span className="font-medium text-ink">{gaps.unconfirmed.length}</span> <span className="text-ink-muted">to confirm</span>
        </p>
        <p>
          <span className="font-medium text-ink">{unknown.length}</span> <span className="text-ink-muted">still unknown</span>
        </p>
      </Surface>

      {ONBOARDING_STEPS.filter((s): s is Exclude<OnboardingStep, "review"> => s !== "review").map((step) => {
        // Show recorded values even when the question no longer applies, so nothing is hidden.
        const keys = CONTEXT_FIELD_KEYS.filter(
          (key) => BRIEF_FIELD[key].step === step && (fieldApplies(key, conditions) || client.context[key].value !== null),
        );
        return (
          <section key={step} aria-labelledby={`review-${step}`}>
            <div className="mb-2 flex items-center justify-between">
              <h3 id={`review-${step}`} className="text-[14.5px] font-medium text-ink">
                {ONBOARDING_STEP_LABELS[step]}
              </h3>
              <Button size="xs" variant="ghost" onClick={() => onEditStep(step)}>
                <Pencil aria-hidden />
                Edit
              </Button>
            </div>
            <Surface>
              <dl className="divide-y divide-line">
                {step === "business" ? (
                  <>
                    <Row label="Contact person" value={client.contactPerson} />
                    <Row label="Email" value={client.email} />
                    <Row label="Website" value={client.website} />
                  </>
                ) : null}
                {keys.map((key) => {
                  const field = client.context[key];
                  const skipped = onboarding.skipped.includes(key) && field.value === null;
                  return (
                    <Row
                      key={key}
                      label={CONTEXT_FIELD_LABELS[key]}
                      value={field.value === null ? null : formatContextValue(field.value)}
                      missing={skipped ? "Not known yet" : "Unknown"}
                      tag={field.value !== null ? <ConfidenceTag confidence={field.confidence} /> : null}
                      action={
                        canEdit && field.value !== null && field.confidence !== "confirmed" ? (
                          <Button size="xs" variant="secondary" onClick={() => confirm(key)} disabled={pending} title="The client or an authorized team member confirmed this">
                            <Check aria-hidden />
                            Confirm
                          </Button>
                        ) : null
                      }
                    />
                  );
                })}
              </dl>
            </Surface>
          </section>
        );
      })}

      <section aria-labelledby="review-questions">
        <h3 id="review-questions" className="mb-2 text-[14.5px] font-medium text-ink">
          Open questions
        </h3>
        <Surface className="px-5 py-4">
          {questions.length ? (
            <ul className="flex flex-col gap-1.5 text-[13.5px] text-ink">
              {questions.map((item) => (
                <li key={item.id} className="flex gap-2">
                  <CircleHelp aria-hidden className="mt-0.5 size-3.5 shrink-0 text-ink-subtle" />
                  {item.text}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13.5px] text-ink-subtle">No open questions yet. Add them in Budget & timing.</p>
          )}
          {suggested.length ? (
            <div className="mt-4 border-t border-line pt-4">
              <p className="mb-2 flex items-center gap-1.5 text-[12.5px] text-ink-muted">
                <Sparkles aria-hidden className="size-3.5" />
                Suggested by intake analysis{latestRun ? ` on ${formatDate(latestRun.createdAt)}` : ""}. Add the ones worth asking.
              </p>
              <ul className="flex flex-col gap-1.5">
                {suggested.map((question) => (
                  <li key={question} className="flex items-start justify-between gap-3 text-[13.5px] text-ink-muted">
                    {question}
                    {canEdit ? (
                      <Button size="xs" variant="ghost" onClick={() => addQuestion(question)} disabled={pending}>
                        <Plus aria-hidden />
                        Add
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Surface>
      </section>

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-5">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft aria-hidden />
          Back
        </Button>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          {onboarding.status === "ready_for_review" ? (
            <>
              <span className="text-[13px] text-ink-subtle">Ready for review since {formatDate(onboarding.completedAt ?? onboarding.updatedAt)}</span>
              {hasProject ? (
                <ButtonLink href={`${workspace}#brief`} variant="primary">
                  Open the brief
                </ButtonLink>
              ) : (
                <>
                  <ButtonLink href={`${workspace}#brief`} variant="ghost">
                    Open the brief
                  </ButtonLink>
                  {canEdit ? (
                    <ButtonLink href={`${workspace}#new-project`} variant="primary">
                      Start the project
                    </ButtonLink>
                  ) : null}
                </>
              )}
            </>
          ) : canEdit ? (
            <Button variant="primary" onClick={finish} disabled={pending} aria-busy={pending}>
              <Check aria-hidden />
              {pending ? "Saving…" : unknown.length ? "Mark ready, with gaps" : "Mark ready for review"}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  missing = "Unknown",
  tag,
  action,
}: {
  label: string;
  value: string | null;
  missing?: string;
  tag?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="grid gap-x-6 gap-y-1 px-5 py-3 sm:grid-cols-[150px_minmax(0,1fr)]">
      <dt className="text-[13px] text-ink-subtle">{label}</dt>
      <dd className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <span className={value ? "min-w-0 text-[14px] leading-relaxed whitespace-pre-wrap text-ink" : "text-[13.5px] text-ink-subtle"}>{value ?? missing}</span>
        {tag || action ? (
          <span className="flex items-center gap-2">
            {tag}
            {action}
          </span>
        ) : null}
      </dd>
    </div>
  );
}
