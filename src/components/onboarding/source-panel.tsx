"use client";

import { Plus, Sparkles } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { useCanEdit, useStudio } from "@/components/providers/studio-provider";
import { useStudioAction } from "@/components/providers/use-studio-action";
import { Button } from "@/components/ui/button";
import { Select, TextArea, TextInput } from "@/components/ui/field";
import { RelativeTime } from "@/components/ui/relative-time";
import { Section } from "@/components/ui/surface";
import { isFinished } from "@/lib/agents/contract";
import { getLatestIntakeRun } from "@/lib/domain/insights";
import { SOURCE_TYPE_LABELS } from "@/lib/domain/labels";
import { SOURCE_TYPES, type Client, type SourceDocument, type SourceType, type StudioSnapshot } from "@/lib/domain/types";

/**
 * The material answers come from, kept beside the questions so nobody has to
 * retype what the client already said. Text is shown exactly as received.
 */
export function SourcePanel({ client, snapshot }: { client: Client; snapshot: StudioSnapshot }) {
  const sources = snapshot.sources.filter((source) => source.clientId === client.id);
  const canEdit = useCanEdit();
  const [adding, setAdding] = useState(false);

  return (
    <aside className="flex min-w-0 flex-col gap-8 lg:sticky lg:top-20 lg:self-start">
      <Section title="Source material">
        <div className="flex flex-col gap-4 text-[13.5px]">
          {client.source.initialNotes ? (
            <Excerpt label={`First contact · ${SOURCE_TYPE_LABELS[client.source.type]}`} text={client.source.initialNotes} />
          ) : null}
          {sources.map((source) => (
            <Excerpt key={source.id} label={`${source.label} · ${SOURCE_TYPE_LABELS[source.type]}`} text={source.content} />
          ))}
          {!client.source.initialNotes && sources.length === 0 ? (
            <p className="text-ink-subtle">No emails, notes or documents yet. Paste them here so answers can point back to them.</p>
          ) : null}
          {canEdit ? (
            adding ? (
              <AddSourceForm clientId={client.id} onDone={() => setAdding(false)} />
            ) : (
              <Button size="sm" variant="secondary" className="self-start" onClick={() => setAdding(true)}>
                <Plus aria-hidden />
                Add notes or an email
              </Button>
            )
          ) : null}
        </div>
      </Section>
      <IntakeAssist client={client} snapshot={snapshot} sources={sources} />
    </aside>
  );
}

function Excerpt({ label, text }: { label: string; text: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > 280;
  return (
    <div>
      <p className="text-ink">{label}</p>
      <p className={`mt-1 leading-relaxed whitespace-pre-wrap text-ink-muted ${long && !expanded ? "line-clamp-5" : ""}`}>{text}</p>
      {long ? (
        <button type="button" onClick={() => setExpanded((v) => !v)} className="mt-1 rounded-sm text-[12.5px] text-ink-subtle hover:text-ink">
          {expanded ? "Show less" : "Show all"}
        </button>
      ) : null}
    </div>
  );
}

function AddSourceForm({ clientId, onDone }: { clientId: string; onDone: () => void }) {
  const formId = useId();
  const [label, setLabel] = useState("");
  const [type, setType] = useState<SourceType>("email");
  const [content, setContent] = useState("");
  const { run, pending } = useStudioAction();

  async function save(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    const saved = await run((r) => r.addSource(clientId, { label, type, content }), "The source was not added.");
    if (saved) onDone();
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-2.5" aria-label="Add source material">
      <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-2">
        <TextInput aria-label="Name" placeholder="e.g. Intro email" value={label} onChange={(e) => setLabel(e.target.value)} id={`${formId}-label`} />
        <Select aria-label="Type" value={type} onChange={(e) => setType(e.target.value as SourceType)}>
          {SOURCE_TYPES.filter((t) => t !== "manual").map((t) => (
            <option key={t} value={t}>
              {SOURCE_TYPE_LABELS[t]}
            </option>
          ))}
        </Select>
      </div>
      <TextArea aria-label="Text" rows={5} placeholder="Paste the text exactly as received" value={content} onChange={(e) => setContent(e.target.value)} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="primary" disabled={pending || !label.trim() || !content.trim()}>
          {pending ? "Adding…" : "Add"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/**
 * Where the Client Intake agent plugs in. It only runs server-side in a
 * signed-in workspace; its suggestions appear on the matching questions as
 * proposals a person accepts or dismisses. Nothing is simulated here.
 */
function IntakeAssist({ client, snapshot, sources }: { client: Client; snapshot: StudioSnapshot; sources: SourceDocument[] }) {
  const state = useStudio();
  const canEdit = useCanEdit();
  const { run, pending } = useStudioAction();
  const latest = getLatestIntakeRun(snapshot, client.id);
  const serverWorkspace = state.status === "ready" && state.info.kind === "supabase";
  const running = latest && !isFinished(latest.status);
  const hasMaterial = sources.length > 0 || Boolean(client.source.initialNotes);

  return (
    <Section title="Suggested answers">
      <div className="flex flex-col gap-3 text-[13px] text-ink-muted">
        {!serverWorkspace ? (
          <p className="text-ink-subtle">
            The intake agent can read the source material and suggest answers for you to review. It runs only in a signed-in
            workspace, so it is not available in the local demo.
          </p>
        ) : (
          <>
            <p>
              The intake agent reads the material above and suggests answers. Suggestions appear on each question; nothing is saved
              until you accept it.
            </p>
            {latest ? (
              <p className="text-ink-subtle">
                Last analysis: {latest.status.replaceAll("_", " ")} · <RelativeTime iso={latest.createdAt} />
              </p>
            ) : null}
            {canEdit ? (
              <Button
                size="sm"
                variant="secondary"
                className="self-start"
                disabled={pending || Boolean(running) || !hasMaterial}
                title={hasMaterial ? undefined : "Add source material first"}
                onClick={() => run((r) => r.requestIntakeAnalysis(client.id), "The analysis did not start.")}
              >
                <Sparkles aria-hidden />
                {running ? "Analyzing…" : pending ? "Starting…" : "Suggest answers from sources"}
              </Button>
            ) : null}
          </>
        )}
      </div>
    </Section>
  );
}
