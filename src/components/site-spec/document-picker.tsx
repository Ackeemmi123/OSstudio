"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useStudioStore } from "@/components/providers/studio-provider";
import { useStudioAction } from "@/components/providers/use-studio-action";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import type { SiteDocumentRecord } from "@/lib/domain/types";

interface DocumentLibrary {
  clientId: string;
  documents: SiteDocumentRecord[];
  add: (document: SiteDocumentRecord) => void;
}

const Library = createContext<DocumentLibrary | null>(null);

/** The client's documents, loaded once for the whole spec editor. Only server workspaces have them. */
export function DocumentLibraryProvider({ clientId, children }: { clientId: string; children: ReactNode }) {
  const store = useStudioStore();
  const [documents, setDocuments] = useState<SiteDocumentRecord[]>([]);
  useEffect(() => {
    let active = true;
    store.read((r) => (r.listSiteDocuments ? r.listSiteDocuments(clientId) : Promise.resolve([]))).then(
      (list) => active && setDocuments(list),
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [store, clientId]);
  const add = useCallback((document: SiteDocumentRecord) => setDocuments((list) => [document, ...list.filter((d) => d.id !== document.id)]), []);
  return <Library.Provider value={{ clientId, documents, add }}>{children}</Library.Provider>;
}

/** Choose one of the client's PDFs for a list item, or add a new one. */
export function DocumentPicker({ id, label, value, disabled, title, onChange }: { id: string; label: string; value?: string; disabled: boolean; title: string; onChange: (id: string | undefined) => void }) {
  const library = useContext(Library);
  const { run, pending } = useStudioAction();
  const input = useRef<HTMLInputElement>(null);
  if (!library) return null;
  const missing = value && !library.documents.some((d) => d.id === value);

  async function upload(file: File) {
    const name = title.trim() || file.name.replace(/\.pdf$/i, "");
    const added = await run((r) => r.uploadSiteDocument!(library!.clientId, file, name), "The document was not added.");
    if (added) {
      library!.add(added);
      onChange(added.id);
    }
  }

  return (
    <Field id={id} label={label} hint={missing ? "The chosen document was deleted. Choose another." : "Shown as a download link on the site."}>
      <div className="flex flex-wrap items-center gap-2">
        <Select id={id} value={value ?? ""} disabled={disabled} onChange={(e) => onChange(e.target.value || undefined)} className="min-w-56">
          <option value="">No document</option>
          {library.documents.map((d) => (
            <option key={d.id} value={d.id}>
              {d.title} ({Math.max(1, Math.round(d.byteSize / 1024))} KB)
            </option>
          ))}
        </Select>
        {!disabled ? (
          <>
            <Button size="xs" onClick={() => input.current?.click()} disabled={pending}>
              {pending ? "Adding…" : "Add a PDF"}
            </Button>
            <input
              ref={input}
              type="file"
              accept="application/pdf"
              className="hidden"
              aria-label={`${label}: choose a PDF`}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void upload(file);
              }}
            />
          </>
        ) : null}
      </div>
    </Field>
  );
}
