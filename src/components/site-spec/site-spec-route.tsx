"use client";

import { FileText, SearchX } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { LoadError } from "@/components/load-error";
import { useStudio, useStudioStore } from "@/components/providers/studio-provider";
import { useStudioAction } from "@/components/providers/use-studio-action";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState, Skeleton, Surface } from "@/components/ui/surface";
import { errorMessage } from "@/lib/data/studio-store";
import { isWebsiteProject, openSiteSpec } from "@/lib/domain/site-specs";
import type { SiteSpecRecord } from "@/lib/domain/types";
import { startingSpec } from "@/lib/site-spec/from-brief";
import { CONTEXT_FIELD_LABELS } from "@/lib/domain/labels";
import { SiteSpecEditor } from "./site-spec-editor";

export function SiteSpecSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy>
      <Skeleton className="h-9 w-72" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

/**
 * The website spec page for one project: loads the project's versions (they
 * are not part of the studio snapshot) and shows the open version, or the
 * latest one. Only signed-in workspaces have website specs.
 */
export function SiteSpecRoute({ clientId, projectId }: { clientId: string; projectId: string }) {
  const state = useStudio();
  const store = useStudioStore();
  const { run, pending, canEdit } = useStudioAction();
  const [versions, setVersions] = useState<SiteSpecRecord[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const server = state.status === "ready" && state.info.kind === "supabase";

  const show = useCallback((list: SiteSpecRecord[], id?: string) => {
    setVersions(list);
    setSelected(id ?? (openSiteSpec(list) ?? list[0])?.id ?? null);
    setLoadError(null);
  }, []);
  const fetchVersions = useCallback(() => store.read((r) => (r.listSiteSpecs ? r.listSiteSpecs(projectId) : Promise.resolve([]))), [store, projectId]);

  async function reload(id?: string) {
    try {
      show(await fetchVersions(), id);
    } catch (error) {
      setLoadError(errorMessage(error));
    }
  }

  useEffect(() => {
    if (!server) return;
    let active = true;
    fetchVersions().then(
      (list) => active && show(list),
      (error: unknown) => active && setLoadError(errorMessage(error)),
    );
    return () => {
      active = false;
    };
  }, [server, fetchVersions, show]);

  if (state.status === "error") return <LoadError message={state.message} />;
  if (state.status === "loading") return <SiteSpecSkeleton />;

  const client = state.snapshot.clients.find((c) => c.id === clientId);
  const project = state.snapshot.projects.find((p) => p.id === projectId && p.clientId === clientId);
  const back = client ? `/clients/${encodeURIComponent(client.id)}` : "/clients";
  if (!client || !project) {
    return (
      <Surface>
        <EmptyState icon={<SearchX />} title="Project not found" action={<ButtonLink href={back}>Back</ButtonLink>} />
      </Surface>
    );
  }
  if (!isWebsiteProject(project)) {
    return (
      <Surface>
        <EmptyState title="This project does not build a website" description="Website specs are for website and e-commerce projects." action={<ButtonLink href={back}>Back to client</ButtonLink>} />
      </Surface>
    );
  }
  if (!server) {
    return (
      <Surface>
        <EmptyState icon={<FileText />} title="Website specs need a signed-in workspace" description="They are stored on the server with the studio's data. The local demo does not keep them." action={<ButtonLink href={back}>Back to client</ButtonLink>} />
      </Surface>
    );
  }
  if (loadError) return <LoadError message={loadError} />;
  if (!versions) return <SiteSpecSkeleton />;

  const record = versions.find((v) => v.id === selected);
  if (!record) {
    const unconfirmed = startingSpec(client, project).unconfirmed;
    return (
      <Surface>
        <EmptyState
          icon={<FileText />}
          title={`No website spec for ${project.name} yet`}
          description={
            <>
              A website spec describes the site to build: pages, sections, copy, brand and search texts. It starts from the brief&apos;s confirmed values.
              {unconfirmed.length ? ` Not confirmed yet, so left out: ${unconfirmed.map((k) => CONTEXT_FIELD_LABELS[k]).join(", ")}.` : ""}
            </>
          }
          action={
            <div className="flex gap-2">
              <ButtonLink href={back} variant="ghost">
                Back to client
              </ButtonLink>
              {canEdit ? (
                <Button
                  variant="primary"
                  disabled={pending}
                  onClick={async () => {
                    const started = await run((r) => r.startSiteSpec!(project.id), "The website spec could not be started.");
                    if (started) await reload(started.id);
                  }}
                >
                  {pending ? "Starting…" : "Start the website spec"}
                </Button>
              ) : null}
            </div>
          }
        />
      </Surface>
    );
  }

  return (
    <SiteSpecEditor
      key={`${record.id}:${record.updatedAt}`}
      record={record}
      versions={versions}
      client={client}
      project={project}
      onChanged={(next) => void reload(next.id)}
      onSelect={setSelected}
    />
  );
}
