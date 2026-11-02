"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { ActivityTimeline } from "@/components/activity-timeline";
import { useCanEdit } from "@/components/providers/studio-provider";
import { ButtonLink } from "@/components/ui/button";
import { Section, Surface } from "@/components/ui/surface";
import { briefProgress } from "@/lib/domain/brief";
import { getClientActivity, getClientProjects } from "@/lib/domain/insights";
import { PROJECT_STAGE_LABELS } from "@/lib/domain/labels";
import { findOnboarding, stepIndex } from "@/lib/domain/onboarding";
import { isWebsiteProject } from "@/lib/domain/site-specs";
import { ONBOARDING_STEPS, type Client, type StudioSnapshot } from "@/lib/domain/types";

/** Where this client stands, at a glance. Each part links to the tab with the details. */
export function ClientOverview({ client, snapshot }: { client: Client; snapshot: StudioSnapshot }) {
  const projects = getClientProjects(client.id, snapshot.projects);
  const brief = briefProgress(client);
  const onboarding = findOnboarding(snapshot.onboardings, client.id);
  const canEdit = useCanEdit();
  const events = getClientActivity(client.id, snapshot).slice(0, 5);
  const clientPath = `/clients/${encodeURIComponent(client.id)}`;

  return (
    <div className="grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="flex min-w-0 flex-col gap-10">
        <Section id="overview-projects" title="Projects" action={<TabLink hash="projects">All projects</TabLink>}>
          {projects.length === 0 ? (
            <p className="text-[13.5px] text-ink-subtle">No projects yet.</p>
          ) : (
            <Surface>
              <ul className="divide-y divide-line">
                {projects.map((project) => {
                  const open = snapshot.tasks.filter((task) => task.projectId === project.id && task.status !== "done").length;
                  return (
                    <li key={project.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3.5">
                      <a href={`#project-${project.id}`} className="min-w-0 rounded-sm hover:underline">
                        <span className="block text-[14px] text-ink">{project.name}</span>
                        <span className="mt-0.5 block text-[12.5px] text-ink-subtle">
                          {PROJECT_STAGE_LABELS[project.stage]} · {open === 1 ? "1 open task" : `${open} open tasks`}
                        </span>
                      </a>
                      {isWebsiteProject(project) ? (
                        <Link href={`${clientPath}/projects/${encodeURIComponent(project.id)}/site`} className="inline-flex items-center gap-1 rounded-sm text-[12.5px] text-ink-muted hover:text-ink">
                          Open website spec
                          <ArrowRight aria-hidden className="size-3.5" />
                        </Link>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </Surface>
          )}
        </Section>
      </div>

      <div className="flex min-w-0 flex-col gap-10">
        <Section id="overview-brief" title="Brief" action={<TabLink hash="brief">Open</TabLink>}>
          <div data-testid="brief-progress" className="text-[13.5px] text-ink-muted">
            <p className="text-ink">
              {brief.known} of {brief.total} answered
            </p>
            <p className="mt-0.5 text-[12.5px] text-ink-subtle">
              {brief.toConfirm === 1 ? "1 to confirm" : `${brief.toConfirm} to confirm`} · {brief.total - brief.known} missing
            </p>
            {onboarding && onboarding.status !== "ready_for_review" ? (
              <div className="mt-3 rounded-[var(--radius-control)] border border-line bg-accent-soft px-3 py-2.5">
                <p className="text-[13px] text-ink">
                  Onboarding {onboarding.status === "draft" ? "started" : "in progress"}: Step {stepIndex(onboarding.currentStep) + 1} of {ONBOARDING_STEPS.length}
                </p>
                {canEdit ? (
                  <ButtonLink href={`${clientPath}/onboarding`} size="sm" variant="primary" className="mt-2">
                    Continue onboarding
                  </ButtonLink>
                ) : null}
              </div>
            ) : null}
          </div>
        </Section>
        <Section id="overview-activity" title="Recent activity" action={<TabLink hash="activity">All activity</TabLink>}>
          {events.length === 0 ? (
            <p className="text-[13.5px] text-ink-subtle">No activity yet.</p>
          ) : (
            <ActivityTimeline entries={events.map((event) => ({ event, clientId: client.id, clientName: client.name }))} showClient={false} />
          )}
        </Section>
      </div>
    </div>
  );
}

function TabLink({ hash, children }: { hash: string; children: string }) {
  return (
    <a href={`#${hash}`} className="rounded-sm text-[12.5px] text-ink-subtle hover:text-ink">
      {children}
    </a>
  );
}
