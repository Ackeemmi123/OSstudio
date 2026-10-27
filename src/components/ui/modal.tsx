"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { IconButton } from "./button";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  /** Use <ModalBody> and <ModalFooter> inside, optionally wrapped in a <form>. */
  children: ReactNode;
  /** Prevents closing while a save is in progress. */
  busy?: boolean;
  size?: "md" | "lg";
}

/**
 * Accessible modal built on the native <dialog> element, which provides focus
 * trapping, Escape handling and inert background content.
 */
export function Modal({ open, onClose, title, description, children, busy, size = "md" }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      className={cn(
        "m-auto max-h-[min(88vh,860px)] w-[calc(100vw-2rem)] overflow-hidden rounded-[var(--radius-surface)] border border-line bg-surface p-0 text-ink shadow-[var(--shadow-overlay)]",
        "open:flex open:flex-col",
        size === "lg" ? "max-w-2xl" : "max-w-lg",
      )}
    >
      {open ? (
        <>
          <header className="flex items-start justify-between gap-4 border-b border-line px-6 pt-5 pb-4">
            <div>
              <h2 id={titleId} className="text-[18px] font-semibold tracking-[-0.015em]">
                {title}
              </h2>
              {description ? (
                <p id={descriptionId} className="mt-1 text-[13px] text-ink-subtle">
                  {description}
                </p>
              ) : null}
            </div>
            <IconButton label="Close" onClick={onClose} disabled={busy} className="-mr-2">
              <X />
            </IconButton>
          </header>
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        </>
      ) : null}
    </dialog>
  );
}

export function ModalBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("min-h-0 flex-1 overflow-y-auto px-6 py-5", className)}>{children}</div>;
}

export function ModalFooter({ children }: { children: ReactNode }) {
  return (
    <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-line bg-surface-muted px-6 py-3.5">
      {children}
    </footer>
  );
}
