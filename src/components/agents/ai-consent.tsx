"use client";

/**
 * The tick a person gives before a client's material goes to the AI model:
 * the client agreed to it. The server refuses the request without it.
 */
export function AiConsent({ checked, onChange, disabled }: { checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) {
  return (
    <label className="flex items-start gap-2 text-[13px] text-ink">
      <input type="checkbox" className="mt-0.5" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>
        The client agreed that their material is processed by AI (Anthropic, USA).
        <span className="block text-[12px] text-ink-subtle">Required before any of their material is sent.</span>
      </span>
    </label>
  );
}
