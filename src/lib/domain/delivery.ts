/**
 * Where a client's website stands on its way to going live, and the one thing
 * to do next. Read from the newest spec version, its builds (with the client's
 * approval and comments on the review link) and the live publication. Pure:
 * the repository gathers the facts, this decides the stage.
 */

export type DeliveryStage = "spec" | "review" | "approved" | "built" | "clientApproved" | "live";

/** The steps shown on the track, in order. "review" sits on the spec step. */
export const DELIVERY_STEPS = [
  { key: "spec", label: "Spec" },
  { key: "approved", label: "Approved" },
  { key: "built", label: "Built" },
  { key: "clientApproved", label: "Client approved" },
  { key: "live", label: "Live" },
] as const;

export interface DeliveryBuildFacts {
  specVersion: number;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  /** The path of the review link, /s/<token>/. */
  link: string;
  approval: { name: string; at: string } | null;
  openComments: number;
}

export interface DeliveryFacts {
  projectId: string;
  clientId: string;
  /** The newest version of the project's website spec, or null when none was started. */
  spec: { id: string; version: number; status: "draft" | "in_review" | "approved" | "superseded"; approvedAt: string | null; updatedAt: string } | null;
  /** Builds of that spec, any order. */
  builds: DeliveryBuildFacts[];
  /** The publication that is live now, if any. */
  live: { specVersion: number; url: string; domain: string | null; at: string } | null;
}

export interface Delivery {
  projectId: string;
  clientId: string;
  stage: DeliveryStage;
  /** Index into DELIVERY_STEPS of the step reached so far. */
  step: number;
  /** What to do next, in a few words. */
  next: string;
  /** One line more, when it helps. */
  detail: string | null;
  /** The review link the client should open, while one is waiting on them. */
  reviewLink: string | null;
  /** The client has the link and the next move is theirs. */
  waitingOnClient: boolean;
  openComments: number;
  /** Where the site is live, when it is, even while a newer version is being made. */
  liveUrl: string | null;
  /** When the current stage began, as far as is known. */
  since: string | null;
}

const STEP_OF: Record<DeliveryStage, number> = { spec: 0, review: 0, approved: 1, built: 2, clientApproved: 3, live: 4 };

export function deliveryOf(facts: DeliveryFacts, now: number): Delivery {
  const base = { projectId: facts.projectId, clientId: facts.clientId, liveUrl: facts.live?.url ?? null };
  const { spec } = facts;
  const make = (stage: DeliveryStage, next: string, detail: string | null, extra: Partial<Delivery> = {}): Delivery => ({
    ...base,
    stage,
    step: STEP_OF[stage],
    next,
    detail,
    reviewLink: null,
    waitingOnClient: false,
    openComments: 0,
    since: null,
    ...extra,
  });

  if (!spec) return make("spec", "Start the website spec", "From the brief, a template or the client's material.");
  if (spec.status === "draft") {
    return make("spec", `Finish spec v${spec.version} and submit it`, facts.live ? "The site is live; this is the next version." : null, { since: spec.updatedAt });
  }
  if (spec.status === "in_review") return make("review", `Review and approve spec v${spec.version}`, "Submitted, waiting for a reviewer at the studio.", { since: spec.updatedAt });

  if (facts.live && facts.live.specVersion >= spec.version) {
    return make("live", facts.live.domain ? `Live on ${facts.live.domain}` : "Live", null, { since: facts.live.at });
  }

  // Only a build made after the approval shows what will be published, as the server requires.
  const approvedAt = spec.approvedAt ? Date.parse(spec.approvedAt) : Number.NEGATIVE_INFINITY;
  const builds = facts.builds
    .filter((b) => b.specVersion === spec.version && Date.parse(b.createdAt) >= approvedAt)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const approved = builds.find((b) => b.approval);
  if (approved) {
    return make("clientApproved", "Publish it on the client's domain", `${approved.approval!.name} approved it on the review link.`, { since: approved.approval!.at });
  }
  const open = builds.find((b) => !b.revokedAt && Date.parse(b.expiresAt) > now);
  if (open) {
    const comments = open.openComments === 1 ? "1 comment" : `${open.openComments} comments`;
    return make("built", "Waiting for the client's approval", open.openComments ? `${comments} to answer on the review link.` : "They approve with the button on the review link.", {
      reviewLink: open.link,
      waitingOnClient: open.openComments === 0,
      openComments: open.openComments,
      since: open.createdAt,
    });
  }
  return make("approved", "Build the site and send the review link", builds.length ? "The last review link was turned off or has expired." : null, { since: spec.approvedAt });
}

/** How long ago, in whole days, for "waiting 3 days". */
export function daysSince(iso: string | null, now: number): number | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  return Number.isNaN(at) ? null : Math.max(0, Math.floor((now - at) / 86_400_000));
}
