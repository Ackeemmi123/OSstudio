"use client";

import { useState } from "react";
import { useCanEdit } from "@/components/providers/studio-provider";
import { useStudioAction } from "@/components/providers/use-studio-action";
import { Button } from "@/components/ui/button";
import { Field, Select, TextInput } from "@/components/ui/field";
import { StatusLabel, type Tone } from "@/components/ui/status";
import { SITE_ASSET_STATUS_LABELS } from "@/lib/domain/labels";
import type { SiteAssetRecord, SiteAssetStatus } from "@/lib/domain/types";
import { attachFile, newImageFromFile, newPlaceholderImage } from "@/lib/site-spec/edit";
import type { SiteSpec } from "@/lib/site-spec/schema";
import { RightsDialog, UploadDialog } from "./asset-upload";
import { LocalizedInput } from "./localized-input";
import type { SpecEditing } from "./site-spec-editor";

/** The client's stored images and short-lived links to them, loaded by the editor. */
export interface ImageLibrary {
  assets: SiteAssetRecord[];
  links: Record<string, string>;
  reload: () => void;
}

const ASSET_TONES: Record<SiteAssetStatus, Tone> = { uploading: "neutral", pending_review: "caution", approved: "positive", rejected: "critical", deleted: "neutral" };

function Thumbnail({ url, label }: { url?: string; label: string }) {
  if (!url) {
    return (
      <div className="flex size-20 shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-dashed border-line bg-sunken px-1 text-center text-[11px] text-ink-subtle">
        {label}
      </div>
    );
  }
  // A signed link to a private image; next/image would need it as a remote pattern and re-fetch it.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" className="size-20 shrink-0 rounded-[var(--radius-control)] border border-line object-cover" referrerPolicy="no-referrer" />;
}

/** Images of the website: placeholders and stored images, with alternative texts; and the client's image library. */
export function ImagesEditor({ spec, clientId, editing, library }: { spec: SiteSpec; clientId: string; editing: SpecEditing; library: ImageLibrary }) {
  const { editable, change } = editing;
  const canEdit = useCanEdit();
  const { run, pending } = useStudioAction();
  const [description, setDescription] = useState("");
  const [uploadFor, setUploadFor] = useState<{ assetId: string | null; description: string; people: boolean } | null>(null);
  const [deciding, setDeciding] = useState<SiteAssetRecord | null>(null);
  const locales = spec.locales.available;
  const usable = library.assets.filter((a) => a.status !== "deleted");
  const peopleImages = new Set(
    spec.pages.flatMap((p) => p.sections.flatMap((s) => (s.kind === "team" ? s.items.flatMap((i) => (i.assetId ? [i.assetId] : [])) : []))),
  );

  async function remove(asset: SiteAssetRecord) {
    if (!window.confirm(`Delete "${asset.description}"? It is hidden at once and its file is deleted within a day.`)) return;
    await run((r) => r.deleteSiteAsset!(asset), "The image was not deleted.");
    library.reload();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <p className="text-[12.5px] text-ink-subtle">
          Each image of the website shows one of the client&apos;s stored images. Until it does, it is a placeholder, which blocks approval. Only images whose rights are approved can be used in an approved spec.
        </p>
        {spec.assets.map((asset, a) => {
          const file = asset.fileId ? library.assets.find((f) => f.id === asset.fileId) : undefined;
          return (
            <div key={asset.id} className="flex flex-col gap-3 rounded-[var(--radius-control)] border border-line p-3" data-testid="spec-image">
              <div className="flex gap-3">
                <Thumbnail url={asset.fileId ? library.links[asset.fileId] : undefined} label={asset.fileId ? "Not available" : "Placeholder"} />
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <Field id={`asset-${asset.id}`} label="What the image shows">
                    <TextInput id={`asset-${asset.id}`} value={asset.description} maxLength={500} disabled={!editable} onChange={(e) => change((s) => void (s.assets[a].description = e.target.value))} />
                  </Field>
                  {asset.fileId ? (
                    <StatusLabel tone={file ? ASSET_TONES[file.status] : "critical"}>{file ? SITE_ASSET_STATUS_LABELS[file.status] : "Image not available"}</StatusLabel>
                  ) : (
                    <StatusLabel tone="caution">Placeholder</StatusLabel>
                  )}
                </div>
              </div>
              <LocalizedInput label="Alternative text" hint="Read aloud to people who cannot see the image." value={asset.alt} locales={locales} maxLength={150} disabled={!editable} onChange={(alt) => change((s) => void (s.assets[a].alt = alt))} />
              {editable ? (
                <div className="flex flex-wrap items-end gap-2">
                  <Button size="xs" onClick={() => setUploadFor({ assetId: asset.id, description: asset.description, people: peopleImages.has(asset.id) })}>
                    Upload image
                  </Button>
                  {usable.length ? (
                    <Field id={`asset-${asset.id}-choose`} label="Or use a stored image" className="min-w-56">
                      <Select
                        id={`asset-${asset.id}-choose`}
                        value={asset.fileId ?? ""}
                        onChange={(e) => {
                          const chosen = usable.find((f) => f.id === e.target.value);
                          if (chosen) change((s) => attachFile(s, asset.id, chosen));
                        }}
                      >
                        <option value="">Choose…</option>
                        {usable.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.description} · {SITE_ASSET_STATUS_LABELS[f.status]}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  ) : null}
                  <Button size="xs" variant="ghost" onClick={() => change((s) => void s.assets.splice(a, 1))}>
                    Remove image
                  </Button>
                </div>
              ) : null}
            </div>
          );
        })}
        {editable ? (
          <div className="flex flex-wrap items-end gap-2">
            <Field id="new-image" label="New image" className="max-w-sm flex-1">
              <TextInput id="new-image" value={description} placeholder="For example: shop front in the morning" maxLength={500} onChange={(e) => setDescription(e.target.value)} />
            </Field>
            <Button
              disabled={!description.trim()}
              onClick={() => {
                const asset = newPlaceholderImage(spec, description.trim());
                change((s) => void s.assets.push(asset));
                setDescription("");
              }}
            >
              Add placeholder
            </Button>
            <Button onClick={() => setUploadFor({ assetId: null, description: description.trim(), people: false })}>Upload new image</Button>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-3" data-testid="image-library">
        <p className="text-[13px] font-medium text-ink">This client&apos;s stored images ({usable.length})</p>
        {usable.length === 0 ? <p className="text-[12.5px] text-ink-subtle">None yet.</p> : null}
        {usable.map((asset) => (
          <div key={asset.id} className="flex items-center gap-3 rounded-[var(--radius-control)] border border-line p-2.5">
            <Thumbnail url={library.links[asset.id]} label="No preview" />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="truncate text-[13.5px] text-ink">{asset.description}</p>
              <StatusLabel tone={ASSET_TONES[asset.status]}>{SITE_ASSET_STATUS_LABELS[asset.status]}</StatusLabel>
              <p className="text-[12px] text-ink-subtle">
                {asset.width} × {asset.height} px · {Math.round(asset.byteSize / 1024)} KB
                {asset.reviewNote ? ` · ${asset.reviewNote}` : ""}
              </p>
            </div>
            {canEdit ? (
              <div className="flex shrink-0 flex-col items-end gap-1">
                {asset.status === "pending_review" || asset.status === "rejected" ? (
                  <Button size="xs" onClick={() => setDeciding(asset)}>
                    Decide rights
                  </Button>
                ) : null}
                <Button size="xs" variant="ghost" onClick={() => remove(asset)} disabled={pending}>
                  Delete
                </Button>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {uploadFor ? (
        <UploadDialog
          open
          onClose={() => setUploadFor(null)}
          clientId={clientId}
          defaultDescription={uploadFor.description}
          peopleByDefault={uploadFor.people}
          onUploaded={(file) => {
            if (editable) {
              if (uploadFor.assetId) change((s) => attachFile(s, uploadFor.assetId!, file));
              else change((s) => void s.assets.push(newImageFromFile(s, file)));
            }
            library.reload();
          }}
        />
      ) : null}
      <RightsDialog key={deciding?.id ?? "none"} asset={deciding} onClose={() => setDeciding(null)} onDecided={() => library.reload()} />
    </div>
  );
}
