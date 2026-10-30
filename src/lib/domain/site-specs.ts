/**
 * The life of a project's SiteSpec: start a version, edit the draft, submit
 * it, approve it or send it back. Pure functions, like the rest of the
 * domain: each returns the changed records and the activity events, and the
 * repository stores them in one transaction. The database repeats the rules
 * that matter (supabase/migrations/20261030000200_site_specs.sql).
 *
 * Only a person does any of this. Agents may later propose content, never
 * approve it.
 */
import { startingSpec } from "@/lib/site-spec/from-brief";
import { approvalBlockers, parseSiteSpec, type SpecIssue } from "@/lib/site-spec/validate";
import { clean, DomainError, type DomainDeps } from "./clients";
import { WEBSITE_PROJECT_TYPES, type ActivityEvent, type Client, type Project, type SiteSpecRecord } from "./types";

export const REVIEW_NOTE_MAX_LENGTH = 1000;

/** The spec does not have the SiteSpec v1 shape, or its parts do not fit together. */
export class SiteSpecInvalidError extends DomainError {
  constructor(readonly issues: SpecIssue[]) {
    super(issues.length === 1 ? issues[0].message : `${issues[0].message} (and ${issues.length - 1} more problems)`);
    this.name = "SiteSpecInvalidError";
  }
}

export function isWebsiteProject(project: Pick<Project, "projectType">): boolean {
  return (WEBSITE_PROJECT_TYPES as readonly string[]).includes(project.projectType);
}

/** A project's versions, newest first. */
export function siteSpecVersions(records: SiteSpecRecord[], projectId: string): SiteSpecRecord[] {
  return records.filter((r) => r.projectId === projectId).sort((a, b) => b.version - a.version);
}

/** The draft or the version waiting for approval. At most one per project. */
export function openSiteSpec(versions: SiteSpecRecord[]): SiteSpecRecord | null {
  return versions.find((r) => r.status === "draft" || r.status === "in_review") ?? null;
}

export function approvedSiteSpec(versions: SiteSpecRecord[]): SiteSpecRecord | null {
  return versions.find((r) => r.status === "approved") ?? null;
}

function requirePerson(deps: DomainDeps, what: string) {
  if (deps.actor.kind !== "human") throw new DomainError(`Only a person can ${what}.`);
}

function specEvent(record: SiteSpecRecord, eventType: ActivityEvent["eventType"], description: string, deps: DomainDeps, now: string): ActivityEvent {
  return { id: deps.createId(), entityType: "project", entityId: record.projectId, eventType, description, actor: deps.actor, timestamp: now };
}

function refuseBlocked(spec: SiteSpecRecord["spec"], client: Client, what: string) {
  const blockers = approvalBlockers(spec, client);
  if (blockers.length) {
    throw new DomainError(`${blockers.length === 1 ? "1 thing needs" : `${blockers.length} things need`} fixing before it can be ${what}: ${blockers[0].message}`);
  }
}

/**
 * Starts a new version for the project, or returns the one already open.
 * After an approval the new draft is a copy of the approved version;
 * otherwise it is built from the confirmed brief.
 */
export function startSiteSpec(
  client: Client,
  project: Project,
  versions: SiteSpecRecord[],
  deps: DomainDeps,
): { record: SiteSpecRecord; event: ActivityEvent | null } {
  requirePerson(deps, "start a website spec");
  if (project.clientId !== client.id) throw new DomainError("This project belongs to another client.");
  if (!isWebsiteProject(project)) throw new DomainError("Only website projects have a website spec.");
  const open = openSiteSpec(versions);
  if (open) return { record: open, event: null };

  const approved = approvedSiteSpec(versions);
  const now = deps.now();
  const version = Math.max(0, ...versions.map((r) => r.version)) + 1;
  const record: SiteSpecRecord = {
    id: deps.createId(),
    clientId: client.id,
    projectId: project.id,
    version,
    basedOn: approved?.id ?? null,
    status: "draft",
    spec: approved ? structuredClone(approved.spec) : startingSpec(client, project).spec,
    createdBy: deps.actor,
    submittedBy: null,
    submittedAt: null,
    approvedBy: null,
    approvedAt: null,
    reviewNote: null,
    createdAt: now,
    updatedAt: now,
  };
  const description = approved ? `Started website spec v${version} from v${approved.version}` : `Started website spec v${version} from the brief`;
  return { record, event: specEvent(record, "site_spec.created", description, deps, now) };
}

/** Saves the draft's content. It must be a valid SiteSpec; it may be incomplete. */
export function saveSiteSpecDraft(record: SiteSpecRecord, value: unknown, deps: DomainDeps): { record: SiteSpecRecord; event: ActivityEvent | null } {
  requirePerson(deps, "edit a website spec");
  if (record.status !== "draft") {
    throw new DomainError(record.status === "in_review" ? "This version is waiting for approval. Ask for changes to edit it again." : "Approved versions cannot change. Start a new version instead.");
  }
  const parsed = parseSiteSpec(value);
  if (!parsed.ok) throw new SiteSpecInvalidError(parsed.issues);
  if (JSON.stringify(parsed.spec) === JSON.stringify(record.spec)) return { record, event: null };
  const now = deps.now();
  const next: SiteSpecRecord = { ...record, spec: parsed.spec, updatedAt: now };
  return { record: next, event: specEvent(next, "site_spec.updated", `Edited website spec v${record.version}`, deps, now) };
}

/** Sends the draft for approval. Only a version with nothing blocking approval can be submitted. */
export function submitSiteSpec(record: SiteSpecRecord, client: Client, deps: DomainDeps): { record: SiteSpecRecord; event: ActivityEvent } {
  requirePerson(deps, "submit a website spec");
  if (record.status !== "draft") throw new DomainError("Only a draft can be submitted for approval.");
  refuseBlocked(record.spec, client, "submitted");
  const now = deps.now();
  const next: SiteSpecRecord = { ...record, status: "in_review", submittedBy: deps.actor, submittedAt: now, reviewNote: null, updatedAt: now };
  return { record: next, event: specEvent(next, "site_spec.submitted", `Submitted website spec v${record.version} for approval`, deps, now) };
}

/** Sends a version waiting for approval back to draft, optionally with a note. */
export function requestSiteSpecChanges(record: SiteSpecRecord, note: string | undefined, deps: DomainDeps): { record: SiteSpecRecord; event: ActivityEvent } {
  requirePerson(deps, "ask for changes");
  if (record.status !== "in_review") throw new DomainError("Only a version waiting for approval can be sent back.");
  const reviewNote = clean(note);
  if (reviewNote && reviewNote.length > REVIEW_NOTE_MAX_LENGTH) throw new DomainError(`Keep the note under ${REVIEW_NOTE_MAX_LENGTH} characters.`);
  const now = deps.now();
  const next: SiteSpecRecord = { ...record, status: "draft", submittedBy: null, submittedAt: null, reviewNote, updatedAt: now };
  return { record: next, event: specEvent(next, "site_spec.changes_requested", `Asked for changes to website spec v${record.version}`, deps, now) };
}

/**
 * Approves the version. The brief values it uses must still be confirmed,
 * and nothing may block it. The previously approved version, if any, is
 * superseded in the same change.
 */
export function approveSiteSpec(
  record: SiteSpecRecord,
  client: Client,
  current: SiteSpecRecord | null,
  deps: DomainDeps,
): { record: SiteSpecRecord; superseded: SiteSpecRecord | null; event: ActivityEvent } {
  requirePerson(deps, "approve a website spec");
  if (record.status !== "in_review") throw new DomainError("Only a version waiting for approval can be approved.");
  if (current && (current.projectId !== record.projectId || current.status !== "approved")) throw new DomainError("The approved version to replace is not this project's.");
  refuseBlocked(record.spec, client, "approved");
  const now = deps.now();
  const next: SiteSpecRecord = { ...record, status: "approved", approvedBy: deps.actor, approvedAt: now, updatedAt: now };
  const superseded: SiteSpecRecord | null = current ? { ...current, status: "superseded", updatedAt: now } : null;
  const description = current ? `Approved website spec v${record.version} (replaces v${current.version})` : `Approved website spec v${record.version}`;
  return { record: next, superseded, event: specEvent(next, "site_spec.approved", description, deps, now) };
}
