"use client";

import { Plus, X } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import type { Client } from "@/lib/domain/types";

/** Questions for the client. Existing ones are listed; new ones are saved with the step. */
export function OpenQuestions({
  client,
  pending,
  onChange,
  error,
}: {
  client: Client;
  pending: string[];
  onChange: (questions: string[]) => void;
  error?: string;
}) {
  const inputId = useId();
  const [text, setText] = useState("");
  const existing = client.contextItems.filter((item) => item.kind === "question" && item.confidence !== "superseded");

  function add() {
    const question = text.trim();
    if (!question) return;
    const duplicate = [...existing.map((i) => i.text), ...pending].some((q) => q.toLocaleLowerCase() === question.toLocaleLowerCase());
    if (!duplicate) onChange([...pending, question]);
    setText("");
  }

  return (
    <Surface className="p-5">
      <label htmlFor={inputId} className="text-[14px] font-medium text-ink">
        Anything to ask the client?
      </label>
      <p className="mt-0.5 text-[12.5px] text-ink-subtle">Open questions stay on the brief until they are answered.</p>
      {existing.length + pending.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-1.5">
          {existing.map((item) => (
            <li key={item.id} className="text-[13.5px] text-ink">
              {item.text}
            </li>
          ))}
          {pending.map((question) => (
            <li key={question} className="flex items-start justify-between gap-2 text-[13.5px] text-ink">
              <span>
                {question} <span className="text-[12px] text-ink-subtle">· saved when you continue</span>
              </span>
              <button
                type="button"
                aria-label={`Remove “${question}”`}
                onClick={() => onChange(pending.filter((q) => q !== question))}
                className="rounded-sm text-ink-subtle hover:text-ink"
              >
                <X aria-hidden className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-3 flex gap-2">
        <input
          id={inputId}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
          placeholder="e.g. Who will provide the product photos?"
          aria-invalid={error ? true : undefined}
          className="h-9 min-w-0 flex-1 rounded-[var(--radius-control)] border border-control bg-surface px-3 text-sm text-ink placeholder:text-ink-subtle hover:border-accent focus:border-focus focus:ring-2 focus:ring-focus/15 focus:outline-none"
        />
        <Button onClick={add} disabled={!text.trim()}>
          <Plus aria-hidden />
          Add
        </Button>
      </div>
      {error ? <p className="mt-1.5 text-[12px] text-critical">{error}</p> : null}
    </Surface>
  );
}
