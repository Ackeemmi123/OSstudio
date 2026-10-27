"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { Upload } from "lucide-react";
import { useState } from "react";
import { useStudioStore } from "@/components/providers/studio-provider";
import { Button } from "@/components/ui/button";
import { Modal, ModalBody, ModalFooter } from "@/components/ui/modal";
import { Section, Surface } from "@/components/ui/surface";
import { useToast } from "@/components/ui/toast";
import {
  hasImportableData,
  planImport,
  readImportMarker,
  sendImport,
  verifyImport,
  writeImportMarker,
  type ImportMarker,
  type ImportPlan,
} from "@/lib/data/browser-import";
import { getBrowserStorage, LEGACY_STORAGE_KEYS, readStoredSnapshot, STORAGE_KEY } from "@/lib/data/local-repository";
import { errorMessage } from "@/lib/data/studio-store";
import { formatDate } from "@/lib/format";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Offers a one-time copy of the local demo workspace into this studio. Shown
 * only when this browser holds data that people entered (not demo records).
 */
export function ImportSection({ supabase, studioId, canWrite }: { supabase: SupabaseClient; studioId: string; canWrite: boolean }) {
  const store = useStudioStore();
  const toast = useToast();
  const [storage] = useState(() => getBrowserStorage());
  const [local, setLocal] = useState(() => (storage ? readStoredSnapshot(storage)?.snapshot ?? null : null));
  const [marker, setMarker] = useState<ImportMarker | null>(() => readImportMarker(storage, studioId));
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  if (!hasImportableData(local) && !marker) return null;

  async function review() {
    if (!local) return;
    setBusy(true);
    setError(null);
    try {
      setPlan(await planImport(local, studioId));
    } catch (failure) {
      setError(`The browser data could not be read. ${errorMessage(failure)}`);
    } finally {
      setBusy(false);
    }
  }

  async function runImport() {
    if (!plan) return;
    setBusy(true);
    setError(null);
    try {
      const outcome = await sendImport(supabase, studioId, plan);
      const snapshot = await store.run((repository) => repository.load());
      const check = verifyImport(plan, snapshot);
      const next: ImportMarker = { hash: plan.hash, batchId: outcome.batchId, at: new Date().toISOString(), verified: check.ok };
      writeImportMarker(storage, studioId, next);
      setMarker(next);
      setPlan(null);
      if (!check.ok) {
        setError(`${plural(check.missing, "record")} could not be found on the server after the import. Your browser copy has been kept. Try again, or contact your administrator.`);
      } else if (outcome.status === "already_imported") {
        toast.success("This data had already been imported. Nothing was duplicated.");
      } else {
        toast.success(`Imported ${plural(plan.counts.clients, "client")}, ${plural(plan.counts.projects, "project")} and ${plural(plan.counts.tasks, "task")}.`);
      }
    } catch (failure) {
      setError(`Nothing was imported. ${errorMessage(failure)} Your browser copy is unchanged.`);
    } finally {
      setBusy(false);
    }
  }

  function removeBrowserCopy() {
    for (const key of [STORAGE_KEY, ...LEGACY_STORAGE_KEYS]) storage?.removeItem(key);
    setLocal(null);
    setRemoving(false);
    toast.success("The browser copy was removed. Your imported data is on the server.");
  }

  const localCounts = local
    ? { clients: local.clients.filter((c) => !c.isDemo).length, projects: local.projects.filter((p) => !p.isDemo).length, tasks: local.tasks.filter((t) => !t.isDemo).length }
    : null;

  return (
    <Section id="import" title="Import from this browser">
      <Surface>
        <div className="flex flex-col gap-3 px-5 py-4 text-[13.5px] leading-relaxed text-ink-muted">
          {marker?.verified ? (
            <p>
              Data from this browser was imported on {formatDate(marker.at)} and checked on the server.
              {local ? " The browser copy is still here; you can remove it." : " The browser copy has been removed."}
            </p>
          ) : localCounts ? (
            <p>
              This browser has {plural(localCounts.clients, "client")}, {plural(localCounts.projects, "project")} and {plural(localCounts.tasks, "task")} entered in
              the local demo. They are not on the server. Import them once to share them with your studio. Example records are not imported.
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-critical">
              {error}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3.5">
          {marker?.verified && local ? (
            <Button size="sm" variant="ghost" onClick={() => setRemoving(true)}>
              Remove browser copy
            </Button>
          ) : null}
          {local && hasImportableData(local) && !(marker?.verified) ? (
            <Button size="sm" onClick={review} disabled={busy || !canWrite} title={canWrite ? undefined : "Viewers cannot import data."}>
              <Upload aria-hidden />
              Review import
            </Button>
          ) : null}
        </div>
      </Surface>

      <Modal open={plan !== null} onClose={() => setPlan(null)} busy={busy} title="Import from this browser" description="Review what will be copied to the server.">
        {plan ? (
          <>
            <ModalBody>
              <ul className="flex flex-col gap-1 text-[14px] text-ink">
                <li>{plural(plan.counts.clients, "client")} with their brief values and open questions</li>
                <li>{plural(plan.counts.projects, "project")} and {plural(plan.counts.tasks, "task")}</li>
                {plan.counts.sources ? <li>{plural(plan.counts.sources, "source document")}</li> : null}
                <li>{plural(plan.counts.activity, "activity entry", "activity entries")}, kept with their original dates</li>
              </ul>
              <p className="mt-3 text-[13px] leading-relaxed text-ink-muted">
                Earlier changes keep the names they were made under and are marked as imported. {plan.demoRecords ? `${plural(plan.demoRecords, "example record")} will be left out.` : ""}
              </p>
              {plan.skipped.length ? (
                <div className="mt-3">
                  <p className="text-[13px] font-medium text-ink">Not imported</p>
                  <ul className="mt-1 flex flex-col gap-1 text-[13px] text-ink-muted">
                    {plan.skipped.map((item, index) => (
                      <li key={index}>
                        {item.label} ({item.kind}): {item.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <p className="mt-3 text-[12.5px] text-ink-subtle">Nothing is removed from this browser. Importing the same data again does not create duplicates.</p>
            </ModalBody>
            <ModalFooter>
              <Button variant="ghost" onClick={() => setPlan(null)} disabled={busy}>
                Cancel
              </Button>
              <Button variant="primary" onClick={runImport} disabled={busy || plan.counts.clients === 0}>
                {busy ? "Importing…" : "Import"}
              </Button>
            </ModalFooter>
          </>
        ) : null}
      </Modal>

      <Modal open={removing} onClose={() => setRemoving(false)} title="Remove the browser copy?" description="The imported data stays on the server.">
        <ModalBody>
          <p className="text-[14px] leading-relaxed text-ink-muted">
            This deletes the local demo workspace from this browser. Its records were imported and found on the server on {marker ? formatDate(marker.at) : ""}.
          </p>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setRemoving(false)}>
            Keep it
          </Button>
          <Button variant="primary" onClick={removeBrowserCopy}>
            Remove browser copy
          </Button>
        </ModalFooter>
      </Modal>
    </Section>
  );
}
