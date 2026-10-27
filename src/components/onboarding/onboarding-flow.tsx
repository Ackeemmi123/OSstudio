"use client";

import { ArrowLeft, ArrowRight, Check, SearchX } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { LoadError } from "@/components/load-error";
import { useCanEdit, useStudio, useStudioStore } from "@/components/providers/studio-provider";
import { useStudioAction } from "@/components/providers/use-studio-action";
import { Button, ButtonLink } from "@/components/ui/button";
import { describedBy, Field, Select, TextInput } from "@/components/ui/field";
import { EmptyState, Skeleton, Surface } from "@/components/ui/surface";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/data/studio-store";
import { BRIEF_FIELDS, briefConditions, decodeSalesChannels, isCommerce, questionState, stepFields, type BriefConditions } from "@/lib/domain/brief";
import { clean } from "@/lib/domain/clients";
import { ONBOARDING_STATUS_LABELS, ONBOARDING_STEP_LABELS, PROJECT_TYPE_LABELS } from "@/lib/domain/labels";
import { adjacentStep, briefProgress, findOnboarding, stepIndex, validateOnboardingStep, type OnboardingFieldName } from "@/lib/domain/onboarding";
import {
  ONBOARDING_STEPS,
  PROJECT_TYPES,
  type Client,
  type ContextFieldKey,
  type Onboarding,
  type OnboardingStep,
  type OnboardingStepInput,
  type ProjectType,
  type StudioSnapshot,
} from "@/lib/domain/types";
import { type FieldErrors } from "@/lib/domain/validation";
import { OpenQuestions } from "./open-questions";
import { QuestionField, type QuestionDraft } from "./question-field";
import { ReviewStep } from "./review-step";
import { SourcePanel } from "./source-panel";

export function OnboardingRoute({ clientId }: { clientId: string }) {
  const state = useStudio();
  if (state.status === "error") return <LoadError message={state.message} />;
  if (state.status === "loading") return <OnboardingSkeleton />;

  const client = state.snapshot.clients.find((c) => c.id === clientId);
  if (!client) {
    return (
      <Surface>
        <EmptyState icon={<SearchX />} title="Client not found" action={<ButtonLink href="/clients">Back to clients</ButtonLink>} />
      </Surface>
    );
  }
  const onboarding = findOnboarding(state.snapshot.onboardings, client.id);
  if (!onboarding) return <NotStarted client={client} />;
  return <OnboardingFlow client={client} onboarding={onboarding} snapshot={state.snapshot} />;
}

function NotStarted({ client }: { client: Client }) {
  const router = useRouter();
  const canEdit = useCanEdit();
  const { run, pending } = useStudioAction();
  async function start() {
    const started = await run((r) => r.startOnboarding(client.id), "Onboarding could not start.");
    if (started) router.refresh();
  }
  return (
    <Surface>
      <EmptyState
        title={`Onboarding for ${client.name} has not started`}
        description="A few short steps that fill in the brief. Every question can be skipped."
        action={
          <div className="flex gap-2">
            <ButtonLink href={`/clients/${encodeURIComponent(client.id)}`} variant="ghost">
              Back to client
            </ButtonLink>
            {canEdit ? (
              <Button variant="primary" onClick={start} disabled={pending}>
                {pending ? "Starting…" : "Start onboarding"}
              </Button>
            ) : null}
          </div>
        }
      />
    </Surface>
  );
}

/* -------------------------------------------------------------------------- */
/* The flow                                                                   */
/* -------------------------------------------------------------------------- */

const STEP_INTRO: Record<OnboardingStep, (c: BriefConditions) => string> = {
  business: () => "Who they are. Fill in what you know and skip the rest.",
  setup: (c) => (isCommerce(c.projectType) ? "Where and how they sell today." : "What they run on today."),
  goals: () => "What the project should achieve, and for whom.",
  scope: () => "What the project must include.",
  timeline: () => "Leave anything that is not known. Nothing is filled in for you.",
  review: () => "Check what is known, confirm what is right, and see what is still missing.",
};

function OnboardingFlow({ client, onboarding, snapshot }: { client: Client; onboarding: Onboarding; snapshot: StudioSnapshot }) {
  const store = useStudioStore();
  const router = useRouter();
  const toast = useToast();
  const canEdit = useCanEdit();
  const [step, setStep] = useState<OnboardingStep>(onboarding.currentStep);
  // Remounts the step form after each save so it starts from what was stored.
  const [version, setVersion] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const savingRef = useRef(false);
  const dirtyRef = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  // The current step's form registers its save, so the stepper saves before jumping.
  const stepSubmit = useRef<StepSubmit | null>(null);
  const workspace = `/clients/${encodeURIComponent(client.id)}`;

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  /**
   * Saves the step and moves on. One save at a time: a double click cannot
   * submit twice. On failure the person stays on the step with their answers.
   */
  async function save(input: OnboardingStepInput | null, then: { step?: OnboardingStep; exit?: boolean }) {
    if (savingRef.current) return false;
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      if (input && canEdit) await store.run((r) => r.saveOnboardingStep(onboarding.id, input));
      dirtyRef.current = false;
      if (then.exit) {
        toast.success("Progress saved. Continue any time from the client.");
        router.push(workspace);
        return true;
      }
      if (then.step) {
        setStep(then.step);
        setVersion((v) => v + 1);
        requestAnimationFrame(() => {
          headingRef.current?.focus();
          window.scrollTo({ top: 0, behavior: "smooth" });
        });
      }
      return true;
    } catch (error) {
      setSaveError(errorMessage(error));
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const progress = briefProgress(client);
  const conditions = briefConditions(client);

  return (
    <>
      <Link
        href={workspace}
        onClick={(event) => {
          if (dirtyRef.current && !window.confirm("Leave without saving the answers on this step?")) event.preventDefault();
        }}
        className="mb-6 inline-flex items-center gap-1.5 rounded-sm text-[13px] text-ink-subtle transition-colors hover:text-ink"
      >
        <ArrowLeft aria-hidden className="size-3.5" />
        {client.name}
      </Link>

      <header className="pb-6">
        <h1 className="text-[26px] leading-tight font-medium tracking-[-0.032em] text-ink">Onboarding</h1>
        <p className="mt-1.5 text-[13.5px] text-ink-muted">
          {client.name}
          {client.projectType ? ` · ${PROJECT_TYPE_LABELS[client.projectType]}` : ""} · {ONBOARDING_STATUS_LABELS[onboarding.status]} ·{" "}
          {progress.answered} of {progress.total} details known
        </p>
      </header>

      <Stepper
        current={step}
        disabled={saving}
        onSelect={(target) => {
          if (target === step) return;
          if (step !== "review" && stepSubmit.current) void stepSubmit.current({ step: target });
          else setStep(target);
        }}
      />

      <div className="mt-8 grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <h2 ref={headingRef} tabIndex={-1} className="text-[18px] font-medium tracking-[-0.02em] text-ink focus:outline-none">
            {stepIndex(step) + 1}. {ONBOARDING_STEP_LABELS[step]}
          </h2>
          <p className="mt-1 mb-6 text-[13.5px] text-ink-muted">{STEP_INTRO[step](conditions)}</p>

          {step === "review" ? (
            <ReviewStep
              key={`review-${version}`}
              client={client}
              onboarding={onboarding}
              snapshot={snapshot}
              canEdit={canEdit}
              onEditStep={(target) => setStep(target)}
              onBack={() => setStep(adjacentStep("review", -1))}
            />
          ) : (
            <StepForm
              key={`${step}-${version}`}
              step={step}
              client={client}
              onboarding={onboarding}
              snapshot={snapshot}
              saving={saving}
              canEdit={canEdit}
              saveError={saveError}
              onDirtyChange={(dirty) => (dirtyRef.current = dirty)}
              registerSubmit={(submit) => (stepSubmit.current = submit)}
              onSave={save}
            />
          )}
        </div>
        <SourcePanel client={client} snapshot={snapshot} />
      </div>
    </>
  );
}

function Stepper({ current, onSelect, disabled }: { current: OnboardingStep; onSelect: (step: OnboardingStep) => void; disabled?: boolean }) {
  const index = stepIndex(current);
  return (
    <nav aria-label="Onboarding steps">
      <p className="mb-2 text-[12.5px] text-ink-subtle sm:hidden">
        Step {index + 1} of {ONBOARDING_STEPS.length}
      </p>
      <ol className="flex gap-1 overflow-x-auto pb-1 sm:gap-1.5">
        {ONBOARDING_STEPS.map((step, i) => (
          <li key={step} className="min-w-0 flex-1">
            <button
              type="button"
              disabled={disabled}
              aria-current={step === current ? "step" : undefined}
              onClick={() => onSelect(step)}
              className="group flex w-full min-w-[44px] flex-col gap-2 rounded-sm pt-1 text-left disabled:cursor-wait"
            >
              <span className={cn("h-[3px] w-full rounded-full transition-colors", i <= index ? "bg-primary" : "bg-line-strong group-hover:bg-accent")} />
              <span className={cn("hidden truncate text-[12.5px] sm:block", step === current ? "font-medium text-ink" : "text-ink-subtle group-hover:text-ink")}>
                {ONBOARDING_STEP_LABELS[step]}
              </span>
              <span className="sr-only sm:hidden">{ONBOARDING_STEP_LABELS[step]}</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/* -------------------------------------------------------------------------- */
/* One step                                                                   */
/* -------------------------------------------------------------------------- */

type StepSubmit = (then: { step?: OnboardingStep; exit?: boolean }) => Promise<void>;

interface DetailsDraft {
  contactPerson: string;
  email: string;
  website: string;
  projectType: ProjectType | "";
}

function StepForm({
  step,
  client,
  onboarding,
  snapshot,
  saving,
  canEdit,
  saveError,
  onDirtyChange,
  registerSubmit,
  onSave,
}: {
  step: Exclude<OnboardingStep, "review">;
  client: Client;
  onboarding: Onboarding;
  snapshot: StudioSnapshot;
  saving: boolean;
  canEdit: boolean;
  saveError: string | null;
  onDirtyChange: (dirty: boolean) => void;
  registerSubmit: (submit: StepSubmit | null) => void;
  onSave: (input: OnboardingStepInput | null, then: { step?: OnboardingStep; exit?: boolean }) => Promise<boolean>;
}) {
  const formId = useId();
  const id = (name: string) => `${formId}-${name}`;
  const [details, setDetails] = useState<DetailsDraft>(() => ({
    contactPerson: client.contactPerson ?? "",
    email: client.email ?? "",
    website: client.website ?? "",
    projectType: client.projectType ?? "",
  }));
  const [drafts, setDrafts] = useState<Partial<Record<ContextFieldKey, QuestionDraft>>>(() =>
    Object.fromEntries(
      BRIEF_FIELDS.filter((d) => d.step === step).map((d) => [
        d.key,
        { value: client.context[d.key].value ?? "", editing: false, confirming: false, skipping: false },
      ]),
    ),
  );
  const [questions, setQuestions] = useState<string[]>([]);
  const [confirmedByClient, setConfirmedByClient] = useState(false);
  const [errors, setErrors] = useState<FieldErrors<OnboardingFieldName>>({});

  // Questions follow the answers on this page as they are typed.
  const conditions: BriefConditions = {
    projectType: step === "business" ? details.projectType || null : client.projectType,
    salesChannels: drafts.salesChannels ? decodeSalesChannels(drafts.salesChannels.value).channels : briefConditions(client).salesChannels,
  };
  const fields = stepFields(step, conditions);

  function buildInput(nextStep: OnboardingStep): OnboardingStepInput {
    const answers: OnboardingStepInput["answers"] = {};
    const confirm: ContextFieldKey[] = [];
    const skip: ContextFieldKey[] = [];
    for (const definition of fields) {
      const draft = drafts[definition.key]!;
      const field = client.context[definition.key];
      const state = questionState(field, definition.key, onboarding);
      if (state === "ask" && draft.skipping) skip.push(definition.key);
      else if ((state === "ask" || draft.editing) && clean(draft.value) !== field.value) answers[definition.key] = draft.value;
      else if (draft.confirming && !draft.editing) confirm.push(definition.key);
    }
    const input: OnboardingStepInput = { nextStep, answers, confirm, skip, questions };
    if (step === "business") {
      const changed = (Object.keys(details) as (keyof DetailsDraft)[]).filter((key) => (clean(details[key]) ?? null) !== (client[key] ?? null));
      if (changed.length) input.details = Object.fromEntries(changed.map((key) => [key, details[key]]));
    }
    if (confirmedByClient) input.answerConfidence = "confirmed";
    return input;
  }

  function isDirty(input: OnboardingStepInput) {
    return Boolean(
      Object.keys(input.answers ?? {}).length || input.confirm?.length || input.skip?.length || input.questions?.length || input.details,
    );
  }

  useEffect(() => {
    onDirtyChange(isDirty(buildInput(step)));
  });

  async function submit(then: { step?: OnboardingStep; exit?: boolean }) {
    const input = buildInput(then.step ?? step);
    const found = validateOnboardingStep(client, input);
    setErrors(found);
    const first = Object.keys(found)[0];
    if (first) {
      requestAnimationFrame(() => (document.getElementById(id(first)) ?? document.querySelector<HTMLElement>(`[data-question="${first}"] button`))?.focus());
      return;
    }
    // Moving without changes still records where the person is, unless nothing would change at all.
    const progressOnly = !isDirty(input) && (then.step ?? step) === onboarding.currentStep;
    await onSave(progressOnly ? null : input, then);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void submit({ step: adjacentStep(step, 1) });
  }

  useEffect(() => {
    registerSubmit(submit);
    return () => registerSubmit(null);
  });

  const setDetail = (key: keyof DetailsDraft) => (event: { target: { value: string } }) =>
    setDetails((current) => ({ ...current, [key]: event.target.value }));
  const proposalsFor = (key: ContextFieldKey) =>
    snapshot.proposals.filter((p) => p.clientId === client.id && p.status === "pending" && p.target === key);
  const typedAnything = fields.some((d) => {
    const draft = drafts[d.key]!;
    return (questionState(client.context[d.key], d.key, onboarding) === "ask" || draft.editing) && clean(draft.value) && clean(draft.value) !== client.context[d.key].value;
  });

  return (
    <form onSubmit={handleSubmit} noValidate aria-label={ONBOARDING_STEP_LABELS[step]}>
      <fieldset disabled={saving || !canEdit} className="flex flex-col gap-6">
        {step === "business" ? (
          <Surface className="grid gap-4 p-5 sm:grid-cols-2">
            <Field id={id("projectType")} label="Project type" className="sm:col-span-2" hint="Decides which questions come next.">
              <Select id={id("projectType")} value={details.projectType} onChange={setDetail("projectType")} aria-describedby={`${id("projectType")}-hint`}>
                <option value="">Not sure yet</option>
                {PROJECT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {PROJECT_TYPE_LABELS[type]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id={id("contactPerson")} label="Contact person">
              <TextInput id={id("contactPerson")} autoComplete="off" value={details.contactPerson} onChange={setDetail("contactPerson")} />
            </Field>
            <Field id={id("email")} label="Email" error={errors.email}>
              <TextInput
                id={id("email")}
                type="email"
                autoComplete="off"
                value={details.email}
                onChange={setDetail("email")}
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
                value={details.website}
                onChange={setDetail("website")}
                invalid={Boolean(errors.website)}
                aria-describedby={describedBy(id("website"), { error: errors.website })}
              />
            </Field>
          </Surface>
        ) : null}

        <Surface className="divide-y divide-line p-5">
          {fields.map((definition) => (
            <QuestionField
              key={definition.key}
              id={id(definition.key)}
              definition={definition}
              conditions={conditions}
              field={client.context[definition.key]}
              state={questionState(client.context[definition.key], definition.key, onboarding)}
              draft={drafts[definition.key]!}
              error={errors[definition.key]}
              proposals={proposalsFor(definition.key)}
              disabled={saving || !canEdit}
              onChange={(next) => setDrafts((current) => ({ ...current, [definition.key]: { ...current[definition.key]!, ...next } }))}
            />
          ))}
        </Surface>

        {step === "timeline" ? (
          <OpenQuestions client={client} pending={questions} onChange={setQuestions} error={errors.questions} />
        ) : null}

        {typedAnything ? (
          <label className="inline-flex items-start gap-2 text-[13px] text-ink-muted">
            <input
              type="checkbox"
              checked={confirmedByClient}
              onChange={(event) => setConfirmedByClient(event.target.checked)}
              className="mt-0.5 size-3.5 accent-[var(--color-primary)]"
            />
            <span>
              The client confirmed the answers I typed on this step
              <span className="block text-[12px] text-ink-subtle">Otherwise they are saved as observed, to confirm later.</span>
            </span>
          </label>
        ) : null}
      </fieldset>

      {saveError ? (
        <p role="alert" className="mt-6 rounded-[var(--radius-control)] border border-critical/30 bg-critical/[0.05] px-3 py-2.5 text-[13px] text-critical">
          Your answers were not saved. {saveError} They are still here, so you can try again.
        </p>
      ) : null}
      {!canEdit ? <p className="mt-6 text-[13px] text-ink-subtle">You have read-only access, so answers can’t be changed here.</p> : null}

      <div className="mt-8 flex flex-wrap items-center gap-2 border-t border-line pt-5">
        {step !== "business" ? (
          <Button variant="ghost" onClick={() => void submit({ step: adjacentStep(step, -1) })} disabled={saving}>
            <ArrowLeft aria-hidden />
            Back
          </Button>
        ) : null}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {canEdit ? (
            <Button variant="ghost" onClick={() => void submit({ exit: true })} disabled={saving}>
              Save and finish later
            </Button>
          ) : null}
          <Button type="submit" variant="primary" disabled={saving} aria-busy={saving}>
            {saving ? "Saving…" : step === "timeline" ? "Review brief" : "Continue"}
            {saving ? null : step === "timeline" ? <Check aria-hidden /> : <ArrowRight aria-hidden />}
          </Button>
        </div>
      </div>
    </form>
  );
}

export function OnboardingSkeleton() {
  return (
    <div aria-busy aria-label="Loading onboarding">
      <Skeleton className="mb-8 h-3 w-24" />
      <Skeleton className="mb-3 h-7 w-48" />
      <Skeleton className="mb-8 h-3.5 w-72 max-w-full" />
      <Skeleton className="mb-10 h-1 w-full" />
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Skeleton className="h-96" />
        <Skeleton className="h-56" />
      </div>
    </div>
  );
}
