"use client";

import { useId, useState } from "react";
import { useStudioAction } from "@/components/providers/use-studio-action";
import { Button } from "@/components/ui/button";
import { Field, Select, TextArea, TextInput } from "@/components/ui/field";
import { Modal, ModalBody, ModalFooter } from "@/components/ui/modal";
import type { SiteAssetRecord } from "@/lib/domain/types";
import {
  approvalProblems,
  emptyProvenance,
  IMAGE_LIMITS,
  NOTE_MAX_LENGTH,
  PEOPLE_BASES,
  PEOPLE_BASIS_LABELS,
  RIGHTS_BASES,
  RIGHTS_BASIS_LABELS,
  type ImageProvenance,
  type PeopleBasis,
  type RightsBasis,
} from "@/lib/site-assets/limits";
import { processImage } from "./process-image";

/**
 * The three questions every image answers, kept apart: who holds the
 * copyright (and under what licence), whether there is permission to use it
 * on this client's website, and, when identifiable people are shown, the
 * lawful basis the studio relies on and where it is documented. Consent is
 * one possible basis, not assumed.
 */
export function ProvenanceFields({ value, onChange, disabled }: { value: ImageProvenance; onChange: (next: ImageProvenance) => void; disabled?: boolean }) {
  const id = useId();
  const set = <K extends keyof ImageProvenance>(key: K, v: ImageProvenance[K]) => onChange({ ...value, [key]: v });
  const note = (key: "sourceNote" | "licenceNote" | "usePermissionNote" | "peopleBasisNote" | "description", label: string, hint?: string) => (
    <Field id={`${id}-${key}`} label={label} hint={hint}>
      <TextArea id={`${id}-${key}`} rows={2} value={value[key]} maxLength={NOTE_MAX_LENGTH} disabled={disabled} onChange={(e) => set(key, e.target.value)} />
    </Field>
  );
  return (
    <div className="flex flex-col gap-4">
      <Field id={`${id}-description`} label="What the image shows" required>
        <TextInput id={`${id}-description`} value={value.description} maxLength={NOTE_MAX_LENGTH} disabled={disabled} onChange={(e) => set("description", e.target.value)} />
      </Field>
      {note("sourceNote", "Where the file came from", "For example: sent by the client by email on 3 November.")}

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-[13px] font-medium text-ink">Copyright and licence</legend>
        <Field id={`${id}-rights`} label="Who holds the rights">
          <Select id={`${id}-rights`} value={value.rightsBasis ?? ""} disabled={disabled} onChange={(e) => set("rightsBasis", (e.target.value || null) as RightsBasis | null)}>
            <option value="">Choose…</option>
            {RIGHTS_BASES.map((b) => (
              <option key={b} value={b}>
                {RIGHTS_BASIS_LABELS[b]}
              </option>
            ))}
          </Select>
        </Field>
        {value.rightsBasis === "licensed" || value.rightsBasis === "other" ? note("licenceNote", "Licence", "Its name, a link, or the agreement it comes from.") : null}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-[13px] font-medium text-ink">Permission to use</legend>
        <label className="flex items-center gap-2 text-[13px] text-ink">
          <input type="checkbox" checked={value.usePermitted} disabled={disabled} onChange={(e) => set("usePermitted", e.target.checked)} />
          There is permission to use this image on this client&apos;s website
        </label>
        {value.usePermitted ? note("usePermissionNote", "Who gave permission, and where it is recorded") : null}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-[13px] font-medium text-ink">People in the image</legend>
        <label className="flex items-center gap-2 text-[13px] text-ink">
          <input type="checkbox" checked={value.identifiablePeople} disabled={disabled} onChange={(e) => set("identifiablePeople", e.target.checked)} />
          Shows people who can be identified
        </label>
        {value.identifiablePeople ? (
          <>
            <Field
              id={`${id}-people`}
              label="Lawful basis for showing them"
              hint="Which basis applies depends on the situation (for example a staff photo or a public event). Check with your adviser when unsure."
            >
              <Select id={`${id}-people`} value={value.peopleBasis ?? ""} disabled={disabled} onChange={(e) => set("peopleBasis", (e.target.value || null) as PeopleBasis | null)}>
                <option value="">Choose…</option>
                {PEOPLE_BASES.map((b) => (
                  <option key={b} value={b}>
                    {PEOPLE_BASIS_LABELS[b]}
                  </option>
                ))}
              </Select>
            </Field>
            {note("peopleBasisNote", "Where the basis is documented")}
          </>
        ) : null}
      </fieldset>
    </div>
  );
}

/** Pick, process and upload one image; the answers go with it and can be completed at the rights decision. */
export function UploadDialog({
  open,
  onClose,
  clientId,
  defaultDescription,
  peopleByDefault,
  onUploaded,
}: {
  open: boolean;
  onClose: () => void;
  clientId: string;
  defaultDescription?: string;
  peopleByDefault?: boolean;
  onUploaded: (asset: SiteAssetRecord, existing: boolean) => void;
}) {
  const { run, pending } = useStudioAction();
  const id = useId();
  const [file, setFile] = useState<File | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [provenance, setProvenance] = useState<ImageProvenance>(() => ({ ...emptyProvenance(defaultDescription ?? ""), identifiablePeople: Boolean(peopleByDefault) }));

  async function upload() {
    if (!file) return;
    setBusy(true);
    setProblem(null);
    try {
      const processed = await processImage(file);
      if (!processed.ok) {
        setProblem(processed.reason);
        return;
      }
      const result = await run((r) => r.uploadSiteAsset!(clientId, processed.file, provenance), "The image was not uploaded.");
      if (result) {
        onUploaded(result.asset, result.existing);
        setFile(null);
        onClose();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Upload an image" description="JPEG, PNG or WebP up to 15 MB. It is resized to at most 2560 pixels and saved without camera or location details." busy={busy || pending} size="lg">
      <ModalBody>
        <div className="flex flex-col gap-5">
          <Field id={`${id}-file`} label="Image file" error={problem ?? undefined}>
            <input
              id={`${id}-file`}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="text-[13px]"
              onChange={(e) => {
                const picked = e.target.files?.[0] ?? null;
                setFile(picked);
                setProblem(picked && picked.size > IMAGE_LIMITS.inputBytes ? "Larger than 15 MB." : null);
              }}
            />
          </Field>
          <ProvenanceFields value={provenance} onChange={setProvenance} disabled={busy} />
          <p className="text-[12.5px] text-ink-subtle">The rights are decided separately, by a person, before the image can be used in an approved website spec.</p>
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button variant="primary" onClick={upload} disabled={!file || !provenance.description.trim() || busy || pending}>
          {busy ? "Uploading…" : "Upload"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

/** A person's rights decision on one image, with the answers it rests on. */
export function RightsDialog({ asset, onClose, onDecided }: { asset: SiteAssetRecord | null; onClose: () => void; onDecided: (asset: SiteAssetRecord) => void }) {
  const { run, pending } = useStudioAction();
  const id = useId();
  const [provenance, setProvenance] = useState<ImageProvenance>(() => (asset ? { ...asset } : emptyProvenance()));
  const [note, setNote] = useState(asset?.reviewNote ?? "");
  if (!asset) return null;
  const problems = approvalProblems(provenance);

  async function decide(decision: "approve" | "reject") {
    const updated = await run((r) => r.reviewSiteAsset!(asset!, decision, provenance, note), "The decision was not saved.");
    if (updated) {
      onDecided(updated);
      onClose();
    }
  }

  return (
    <Modal open onClose={onClose} title="Decide the rights for this image" description="Answer each question. The decision is recorded in your name." busy={pending} size="lg">
      <ModalBody>
        <div className="flex flex-col gap-5">
          <ProvenanceFields value={provenance} onChange={setProvenance} disabled={pending} />
          <Field id={`${id}-note`} label="Note on the decision" hint="Optional. Shown with the image.">
            <TextArea id={`${id}-note`} rows={2} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
          </Field>
          {problems.length ? (
            <ul className="flex flex-col gap-1 text-[12.5px] text-ink-muted" data-testid="rights-problems">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" onClick={() => decide("reject")} disabled={pending}>
          Reject
        </Button>
        <Button variant="primary" onClick={() => decide("approve")} disabled={pending || problems.length > 0}>
          Approve the rights
        </Button>
      </ModalFooter>
    </Modal>
  );
}
