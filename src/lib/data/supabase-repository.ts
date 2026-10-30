import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentRunRecord } from "@/lib/agents/contract";
import { buildNewClient, DomainConflictError, DomainError, setContextField, updateClientDetails, type DomainDeps } from "@/lib/domain/clients";
import { addContextItem, buildSource, reviewProposal } from "@/lib/domain/intake";
import { approveInquiry, assertDecidable, cleanRejectionReason, getRepeats, linkInquiry, openFirstInquiry } from "@/lib/domain/inquiries";
import { buildOnboarding, completeOnboarding, findOnboarding, saveOnboardingStep } from "@/lib/domain/onboarding";
import { buildProject, buildTask, setTaskStatus, updateProject, updateTaskDetails } from "@/lib/domain/projects";
import { cleanHoldReason } from "@/lib/domain/retention";
import { approvalProblems, SIGNED_URL_TTL_SECONDS, STORAGE_BUCKET, type ImageProvenance } from "@/lib/site-assets/limits";
import { approvedSiteSpec, approveSiteSpec, requestSiteSpecChanges, saveSiteSpecDraft, startSiteSpec, submitSiteSpec } from "@/lib/domain/site-specs";
import {
  CONTEXT_FIELD_KEYS,
  type ActivityEvent,
  type AgentProposal,
  type Client,
  type ClientDetailsInput,
  type ContextFieldInput,
  type ContextFieldKey,
  type Inquiry,
  type InquiryDecision,
  type NewClientInput,
  type NewContextItemInput,
  type NewProjectInput,
  type NewSourceInput,
  type NewTaskInput,
  type Onboarding,
  type OnboardingStepInput,
  type Project,
  type ProjectType,
  type ProjectUpdateInput,
  type ProposalDecision,
  type SiteAssetRecord,
  type SiteSpecRecord,
  type SourceDocument,
  type StudioSnapshot,
  type Task,
  type TaskDetailsInput,
  type TaskStatus,
} from "@/lib/domain/types";
import { validateIdentity } from "./local-repository";
import { RepositoryError, type AiSpend, type RepositoryInfo, type StudioRepository } from "./repository";
import { toRepositoryError } from "./supabase-errors";
import {
  clientRow,
  contextFieldRow,
  contextItemRow,
  eventRow,
  INQUIRY_COLUMNS,
  onboardingRow,
  projectRow,
  SITE_ASSET_COLUMNS,
  SITE_SPEC_COLUMNS,
  siteSpecRow,
  sourceRow,
  taskRow,
  toSiteAssetRecord,
  toSiteSpecRecord,
  toSnapshot,
  type StudioPayload,
} from "./supabase-rows";

type Row = Record<string, unknown>;
type Write = { op: "insert"; row: Row } | { op: "update"; row: Row; expected: string };
/** A website spec version and its activity, written by apply_site_spec_changes(). */
type SpecChange = { events: Row[]; spec: Write; supersede?: { id: string; expected: string } | null };
/** A decision on a website inquiry, recorded by decide_inquiry() with its changes. */
type Decision = { status: "approved" | "rejected" | "spam"; client_id?: string; reason?: string | null; decided_by: Row };

/** One domain change, applied by the database in a single transaction. */
interface Changes {
  clients?: Write[];
  context_fields?: Write[];
  context_items?: Write[];
  sources?: Write[];
  projects?: Write[];
  tasks?: Write[];
  proposals?: { id: string; status: string; review_confidence: string | null; reviewed_by: unknown }[];
  events: Row[];
}

export interface SupabaseRepositoryOptions {
  client: SupabaseClient;
  studioId: string;
  user: { id: string; email: string | null };
  /** Where the server-side intake endpoint lives. The other agent endpoints sit beside it. */
  agentEndpoint?: string;
  /** Where images are uploaded for checking (POST /api/site-assets/upload). */
  assetEndpoint?: string;
  fetch?: typeof fetch;
  createId?: () => string;
}

/**
 * Stores the workspace in Supabase. Reads and writes run as the signed-in
 * user, so row-level security decides what they can see and change; the
 * database also re-checks the domain rules that matter for integrity.
 *
 * Writes reuse the same pure domain functions as the local demo, then send
 * the resulting rows and activity events to `apply_changes` in one call.
 */
export class SupabaseRepository implements StudioRepository {
  private snapshot: StudioSnapshot | null = null;
  private current: RepositoryInfo;
  private readonly client: SupabaseClient;
  private readonly studioId: string;
  private readonly user: { id: string; email: string | null };
  private readonly agentEndpoint: string;
  private readonly assetEndpoint: string;
  private readonly fetchImpl: typeof fetch;
  private readonly createId: () => string;

  constructor(options: SupabaseRepositoryOptions) {
    this.client = options.client;
    this.studioId = options.studioId;
    this.user = options.user;
    this.agentEndpoint = options.agentEndpoint ?? "/api/agents/intake";
    this.assetEndpoint = options.assetEndpoint ?? "/api/site-assets/upload";
    this.fetchImpl = options.fetch ?? ((...args) => fetch(...args));
    this.createId = options.createId ?? (() => crypto.randomUUID());
    this.current = {
      kind: "supabase",
      persistence: "server",
      studio: { id: options.studioId, name: "" },
      role: "viewer",
      canWrite: false,
      members: [],
      user: options.user,
    };
  }

  get info(): RepositoryInfo {
    return this.current;
  }

  /** Always reads fresh data: other people may have changed it. */
  async load(): Promise<StudioSnapshot> {
    const [studio, onboardings, inquiries] = await Promise.all([
      this.client.rpc("load_studio", { p_studio: this.studioId }),
      this.client.from("client_onboardings").select("*").eq("studio_id", this.studioId),
      this.client.from("inquiries").select(INQUIRY_COLUMNS).eq("studio_id", this.studioId).is("anonymised_at", null).order("received_at", { ascending: false }).limit(500),
    ]);
    if (studio.error) throw toRepositoryError(studio.error);
    if (onboardings.error) throw toRepositoryError(onboardings.error);
    if (inquiries.error) throw toRepositoryError(inquiries.error);
    const payload = {
      ...(studio.data as StudioPayload),
      onboardings: onboardings.data as Record<string, unknown>[],
      inquiries: inquiries.data as unknown as Record<string, unknown>[],
    };
    this.snapshot = toSnapshot(payload);
    this.current = {
      kind: "supabase",
      persistence: "server",
      studio: payload.studio,
      role: payload.role,
      canWrite: payload.role !== "viewer",
      members: payload.members,
      user: this.user,
    };
    return this.snapshot;
  }

  createClient(input: NewClientInput): Promise<Client> {
    return this.write((_, deps) => {
      validateIdentity(input);
      const { client, event } = buildNewClient(input, deps);
      return [
        client,
        {
          clients: [{ op: "insert", row: clientRow(client) }],
          context_fields: CONTEXT_FIELD_KEYS.map((key) => ({ op: "insert", row: contextFieldRow(client.id, key, client.context[key]) })),
          events: [eventRow(event)],
        },
      ];
    });
  }

  updateClient(clientId: string, input: ClientDetailsInput): Promise<Client> {
    return this.write((s, deps) => {
      validateIdentity(input);
      const before = find(s.clients, clientId, "client");
      const { client, events } = updateClientDetails(before, input, deps);
      return [client, events.length ? { clients: [update(clientRow(client), before.updatedAt)], events: events.map(eventRow) } : null];
    });
  }

  setContextField(clientId: string, key: ContextFieldKey, input: ContextFieldInput): Promise<Client> {
    return this.write((s, deps) => {
      const before = find(s.clients, clientId, "client");
      const { client, events } = setContextField(before, key, input, deps);
      if (!events.length) return [client, null];
      return [client, { context_fields: [fieldUpdate(client, key, before.context[key].updatedAt)], events: events.map(eventRow) }];
    });
  }

  addContextItem(clientId: string, input: NewContextItemInput): Promise<Client> {
    return this.write((s, deps) => {
      const { client, item, event } = addContextItem(find(s.clients, clientId, "client"), input, deps);
      return [client, { context_items: [{ op: "insert", row: contextItemRow(clientId, item) }], events: [eventRow(event)] }];
    });
  }

  addSource(clientId: string, input: NewSourceInput): Promise<SourceDocument> {
    return this.write((s, deps) => {
      const { source, event } = buildSource(find(s.clients, clientId, "client"), input, deps);
      return [source, { sources: [{ op: "insert", row: sourceRow(source) }], events: [eventRow(event)] }];
    });
  }

  async startOnboarding(clientId: string): Promise<Onboarding> {
    try {
      return await this.write((s, deps) => {
        const client = find(s.clients, clientId, "client");
        const existing = findOnboarding(s.onboardings, client.id);
        if (existing) return [existing, null];
        const { onboarding, event } = buildOnboarding(client, deps);
        return [onboarding, { events: [eventRow(event)] }, { op: "insert", row: onboardingRow(onboarding) }];
      });
    } catch (error) {
      // Started at the same moment elsewhere (a double click, another tab): use that one.
      if (error instanceof RepositoryError && error.code === "conflict") {
        const existing = findOnboarding((await this.load()).onboardings, clientId);
        if (existing) return existing;
      }
      throw error;
    }
  }

  saveOnboardingStep(onboardingId: string, input: OnboardingStepInput): Promise<Onboarding> {
    return this.write((s, deps) => {
      const before = find(s.onboardings, onboardingId, "onboarding");
      const client = find(s.clients, before.clientId, "client");
      const save = saveOnboardingStep(client, before, input, deps);
      const changes: Changes = { events: save.events.map(eventRow) };
      if (save.detailsChanged) changes.clients = [update(clientRow(save.client), client.updatedAt)];
      if (save.changedFields.length) {
        changes.context_fields = save.changedFields.map((key) => fieldUpdate(save.client, key, client.context[key].updatedAt));
      }
      if (save.addedItems.length) {
        changes.context_items = save.addedItems.map((item) => ({ op: "insert" as const, row: contextItemRow(client.id, item) }));
      }
      const hasChanges = Boolean(save.events.length || save.changedFields.length || save.addedItems.length);
      const progress = save.onboardingChanged ? update(onboardingRow(save.onboarding), before.updatedAt) : undefined;
      return [save.onboarding, hasChanges ? changes : null, progress];
    });
  }

  completeOnboarding(onboardingId: string): Promise<Onboarding> {
    return this.write((s, deps) => {
      const before = find(s.onboardings, onboardingId, "onboarding");
      const { onboarding, events } = completeOnboarding(find(s.clients, before.clientId, "client"), before, deps);
      if (!events.length) return [onboarding, null];
      return [onboarding, { events: events.map(eventRow) }, update(onboardingRow(onboarding), before.updatedAt)];
    });
  }

  createProject(clientId: string, input: NewProjectInput): Promise<Project> {
    return this.write((s, deps) => {
      const { project, tasks, event } = buildProject(find(s.clients, clientId, "client"), input, deps);
      // One transaction: the project and its tasks are created together or not at all.
      return [
        project,
        { projects: [{ op: "insert", row: projectRow(project) }], tasks: tasks.map((task) => ({ op: "insert", row: taskRow(task) })), events: [eventRow(event)] },
      ];
    });
  }

  updateProject(projectId: string, input: ProjectUpdateInput): Promise<Project> {
    return this.write((s, deps) => {
      const before = find(s.projects, projectId, "project");
      const { project, events } = updateProject(before, input, deps);
      return [project, events.length ? { projects: [update(projectRow(project), before.updatedAt)], events: events.map(eventRow) } : null];
    });
  }

  createTask(projectId: string, input: NewTaskInput): Promise<Task> {
    return this.write((s, deps) => {
      const { task, event } = buildTask(find(s.projects, projectId, "project"), input, deps);
      return [task, { tasks: [{ op: "insert", row: taskRow(task) }], events: [eventRow(event)] }];
    });
  }

  setTaskStatus(taskId: string, status: TaskStatus, options?: { blockedReason?: string }): Promise<Task> {
    return this.write((s, deps) => {
      const before = find(s.tasks, taskId, "task");
      const { task, events } = setTaskStatus(before, status, deps, options);
      return [task, events.length ? { tasks: [update(taskRow(task), before.updatedAt)], events: events.map(eventRow) } : null];
    });
  }

  updateTask(taskId: string, input: TaskDetailsInput): Promise<Task> {
    return this.write((s, deps) => {
      const before = find(s.tasks, taskId, "task");
      const { task, events } = updateTaskDetails(before, input, deps);
      return [task, events.length ? { tasks: [update(taskRow(task), before.updatedAt)], events: events.map(eventRow) } : null];
    });
  }

  reviewProposal(proposalId: string, decision: ProposalDecision): Promise<AgentProposal> {
    return this.write((s, deps) => {
      const proposal = find(s.proposals, proposalId, "proposal");
      const before = find(s.clients, proposal.clientId, "client");
      const review = reviewProposal(before, proposal, decision, s.sources, deps);
      const changes: Changes = {
        proposals: [
          { id: proposal.id, status: review.proposal.status, review_confidence: review.proposal.reviewConfidence, reviewed_by: deps.actor },
        ],
        events: review.events.map(eventRow),
      };
      if (review.changed?.kind === "context") {
        changes.context_fields = [fieldUpdate(review.client, review.changed.key, before.context[review.changed.key].updatedAt)];
      } else if (review.changed?.kind === "details") {
        changes.clients = [update(clientRow(review.client), before.updatedAt)];
      }
      return [review.proposal, changes];
    });
  }

  async decideInquiry(inquiryId: string, decision: InquiryDecision): Promise<Inquiry> {
    await this.write<Inquiry>((s, deps) => {
      const inquiry = find(s.inquiries, inquiryId, "inquiry");
      if (openFirstInquiry(inquiry, s.inquiries)) {
        throw new DomainConflictError("This inquiry was sent again by the same address. Decide the first inquiry; this one is resolved with it.");
      }
      const repeats = getRepeats(inquiry, s.inquiries);
      const decided = { ...inquiry, decidedBy: deps.actor, decidedAt: deps.now() };
      if (decision.action === "approve") {
        const approval = approveInquiry(inquiry, decision.name, deps, repeats);
        const { client } = approval;
        return [
          { ...decided, status: "approved", clientId: client.id, createdClient: true },
          {
            clients: [{ op: "insert", row: clientRow(client) }],
            context_fields: CONTEXT_FIELD_KEYS.map((key) => ({ op: "insert", row: contextFieldRow(client.id, key, client.context[key]) })),
            context_items: approval.items.map((item) => ({ op: "insert" as const, row: contextItemRow(client.id, item) })),
            sources: [approval.source, ...approval.repeatSources].map((source) => ({ op: "insert" as const, row: sourceRow(source) })),
            events: approval.events.map(eventRow),
          },
          { op: "insert", row: onboardingRow(approval.onboarding) },
          { status: "approved", client_id: client.id, decided_by: deps.actor },
        ];
      }
      if (decision.action === "link") {
        const before = find(s.clients, decision.clientId, "client");
        const link = linkInquiry(inquiry, before, deps, repeats);
        const changes: Changes = {
          sources: [link.source, ...link.repeatSources].map((source) => ({ op: "insert" as const, row: sourceRow(source) })),
          events: link.events.map(eventRow),
        };
        if (link.detailsChanged) changes.clients = [update(clientRow(link.client), before.updatedAt)];
        if (link.changedFields.length) {
          changes.context_fields = link.changedFields.map((key) => fieldUpdate(link.client, key, before.context[key].updatedAt));
        }
        return [
          { ...decided, status: "approved", clientId: before.id, createdClient: false },
          changes,
          undefined,
          { status: "approved", client_id: before.id, decided_by: deps.actor },
        ];
      }
      assertDecidable(inquiry, deps);
      const status = decision.action === "reject" ? "rejected" : "spam";
      const reason = decision.action === "reject" ? cleanRejectionReason(decision.reason) : null;
      return [{ ...decided, status, decisionReason: reason }, null, undefined, { status, reason, decided_by: deps.actor }];
    }, inquiryId);
    return find((await this.load()).inquiries, inquiryId, "inquiry");
  }

  async aiSpend(): Promise<AiSpend> {
    const { data } = await this.client.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new RepositoryError("Your session has ended. Sign in again to continue.", "session");
    let response: Response;
    try {
      response = await this.fetchImpl(`/api/agents/budget?studioId=${encodeURIComponent(this.studioId)}`, { headers: { authorization: `Bearer ${token}` } });
    } catch {
      throw new RepositoryError("Studio OS could not reach the server. Check your connection and try again.", "network");
    }
    const body = (await response.json().catch(() => null)) as (AiSpend & { error?: string }) | null;
    if (!response.ok || !body || body.error) throw new RepositoryError(body?.error ?? "AI spend could not be loaded.", response.status === 403 ? "permission" : "unavailable");
    return { month: body.month, spentMicros: body.spentMicros, reservedMicros: body.reservedMicros, capMicros: body.capMicros };
  }

  async setRetentionHold(clientId: string, reason: string | null): Promise<Client> {
    if (this.current.kind !== "supabase" || this.current.role !== "owner") {
      throw new RepositoryError("Only an owner can place or release a retention hold.", "permission");
    }
    let cleaned: string | null;
    try {
      cleaned = reason === null ? null : cleanHoldReason(reason);
    } catch (error) {
      if (error instanceof DomainError) throw new RepositoryError(error.message, "validation");
      throw error;
    }
    const { error } = await this.client.rpc("set_client_retention_hold", {
      p_studio: this.studioId,
      p_client: clientId,
      p_reason: cleaned,
      p_actor: this.actor(),
    });
    if (error) throw toRepositoryError(error);
    this.snapshot = null;
    return find((await this.load()).clients, clientId, "client");
  }

  requestIntakeAnalysis(clientId: string, options: { force?: boolean } = {}): Promise<AgentRunRecord> {
    return this.runAgent(this.agentEndpoint, { clientId, force: options.force ?? false }, "The analysis could not be started.");
  }

  suggestTasks(clientId: string, projectType: ProjectType): Promise<AgentRunRecord> {
    return this.runAgent(this.agentEndpoint.replace(/\/intake$/, "/plan"), { clientId, projectType }, "Suggestions could not be requested.");
  }

  private async runAgent(endpoint: string, request: Record<string, unknown>, fallback: string): Promise<AgentRunRecord> {
    const { data } = await this.client.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new RepositoryError("Your session has ended. Sign in again to continue.", "session");

    let response: Response;
    try {
      response = await this.fetchImpl(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ studioId: this.studioId, ...request }),
      });
    } catch {
      throw new RepositoryError("Studio OS could not reach the server. Check your connection and try again.", "network");
    }
    // The server answers with the run as the runner returns it, already mapped from its row.
    const body = (await response.json().catch(() => null)) as { run?: AgentRunRecord; error?: string } | null;
    if (body?.run) return body.run;
    const message = body?.error ?? fallback;
    const code =
      response.status === 401 ? "session"
      : response.status === 403 ? "permission"
      : response.status === 404 ? "not_found"
      : response.status === 409 ? "conflict"
      : response.status === 503 || response.status === 429 ? "unavailable"
      : "storage";
    throw new RepositoryError(message, code);
  }

  async resetDemoData(): Promise<StudioSnapshot> {
    throw new RepositoryError("Demo data can only be reset in the local demo.", "unavailable");
  }

  async listSiteSpecs(projectId: string): Promise<SiteSpecRecord[]> {
    const { data, error } = await this.client
      .from("site_specs")
      .select(SITE_SPEC_COLUMNS)
      .eq("studio_id", this.studioId)
      .eq("project_id", projectId)
      .order("version", { ascending: false });
    if (error) throw toRepositoryError(error);
    return (data as unknown as Row[]).map(toSiteSpecRecord);
  }

  async listSiteAssets(clientId: string): Promise<SiteAssetRecord[]> {
    const { data, error } = await this.client
      .from("site_assets")
      .select(SITE_ASSET_COLUMNS)
      .eq("studio_id", this.studioId)
      .eq("client_id", clientId)
      .neq("status", "deleted")
      .neq("status", "uploading")
      .order("created_at", { ascending: false });
    if (error) throw toRepositoryError(error);
    return (data as unknown as Row[]).map(toSiteAssetRecord);
  }

  async uploadSiteAsset(clientId: string, file: Blob, provenance: ImageProvenance): Promise<{ asset: SiteAssetRecord; existing: boolean }> {
    if (!this.current.canWrite) throw new RepositoryError("You have read-only access to this studio. Ask an owner for member access.", "permission");
    const { data } = await this.client.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new RepositoryError("Your session has ended. Sign in again to continue.", "session");
    const form = new FormData();
    form.set("studioId", this.studioId);
    form.set("clientId", clientId);
    form.set("provenance", JSON.stringify(provenance));
    form.set("file", file);
    let response: Response;
    try {
      response = await this.fetchImpl(this.assetEndpoint, { method: "POST", headers: { authorization: `Bearer ${token}` }, body: form });
    } catch {
      throw new RepositoryError("Studio OS could not reach the server. Check your connection and try again.", "network");
    }
    const body = (await response.json().catch(() => null)) as { assetId?: string; existing?: boolean; error?: string } | null;
    if (!response.ok || !body?.assetId) {
      const code = response.status === 401 ? "session" : response.status === 403 ? "permission" : response.status === 400 || response.status === 409 ? "validation" : "storage";
      throw new RepositoryError(body?.error ?? "The image could not be uploaded.", code);
    }
    this.snapshot = null;
    const asset = (await this.listSiteAssets(clientId)).find((a) => a.id === body.assetId);
    if (!asset) throw new RepositoryError("The image was stored but could not be read back. Reload the page.", "storage");
    return { asset, existing: body.existing === true };
  }

  async reviewSiteAsset(asset: SiteAssetRecord, decision: "approve" | "reject", provenance: ImageProvenance, note?: string): Promise<SiteAssetRecord> {
    if (!this.current.canWrite) throw new RepositoryError("You have read-only access to this studio. Ask an owner for member access.", "permission");
    if (decision === "approve") {
      const problems = approvalProblems(provenance);
      if (problems.length) throw new RepositoryError(problems[0], "validation");
    }
    const { error } = await this.client.rpc("review_site_asset", {
      p_studio: this.studioId,
      p_asset: asset.id,
      p_decision: decision,
      p_details: provenance,
      p_note: note ?? null,
      p_actor: this.actor(),
    });
    if (error) throw toRepositoryError(error);
    this.snapshot = null;
    const updated = (await this.listSiteAssets(asset.clientId)).find((a) => a.id === asset.id);
    if (!updated) throw new RepositoryError("This image no longer exists, or you do not have access to it.", "not_found");
    return updated;
  }

  async deleteSiteAsset(asset: SiteAssetRecord): Promise<void> {
    if (!this.current.canWrite) throw new RepositoryError("You have read-only access to this studio. Ask an owner for member access.", "permission");
    const { error } = await this.client.rpc("delete_site_asset", { p_studio: this.studioId, p_asset: asset.id, p_actor: this.actor() });
    if (error) throw toRepositoryError(error);
    this.snapshot = null;
  }

  async imageLinks(assets: Pick<SiteAssetRecord, "id" | "storagePath">[]): Promise<Record<string, string>> {
    if (!assets.length) return {};
    const { data, error } = await this.client.storage.from(STORAGE_BUCKET).createSignedUrls(
      assets.map((a) => a.storagePath),
      SIGNED_URL_TTL_SECONDS,
    );
    if (error) throw toRepositoryError(error);
    const byPath = new Map((data ?? []).filter((d) => d.signedUrl && !d.error).map((d) => [d.path, d.signedUrl]));
    return Object.fromEntries(assets.flatMap((a) => (byPath.get(a.storagePath) ? [[a.id, byPath.get(a.storagePath)!]] : [])));
  }

  async startSiteSpec(projectId: string): Promise<SiteSpecRecord> {
    const versions = await this.listSiteSpecs(projectId);
    return this.writeSpec((s, deps) => {
      const project = find(s.projects, projectId, "project");
      const { record, event } = startSiteSpec(find(s.clients, project.clientId, "client"), project, versions, deps);
      return [record, event && { events: [eventRow(event)], spec: { op: "insert", row: siteSpecRow(record) } }];
    });
  }

  saveSiteSpecDraft(expected: SiteSpecRecord, spec: unknown): Promise<SiteSpecRecord> {
    return this.writeSpec((_, deps) => {
      const { record, event } = saveSiteSpecDraft(expected, spec, deps);
      return [record, event && { events: [eventRow(event)], spec: update(siteSpecRow(record), expected.updatedAt) }];
    });
  }

  async submitSiteSpec(expected: SiteSpecRecord): Promise<SiteSpecRecord> {
    const files = await this.listSiteAssets(expected.clientId);
    return this.writeSpec((s, deps) => {
      const { record, event } = submitSiteSpec(expected, find(s.clients, expected.clientId, "client"), deps, files);
      return [record, { events: [eventRow(event)], spec: update(siteSpecRow(record), expected.updatedAt) }];
    });
  }

  requestSiteSpecChanges(expected: SiteSpecRecord, note?: string): Promise<SiteSpecRecord> {
    return this.writeSpec((_, deps) => {
      const { record, event } = requestSiteSpecChanges(expected, note, deps);
      return [record, { events: [eventRow(event)], spec: update(siteSpecRow(record), expected.updatedAt) }];
    });
  }

  async approveSiteSpec(expected: SiteSpecRecord): Promise<SiteSpecRecord> {
    const current = approvedSiteSpec(await this.listSiteSpecs(expected.projectId));
    const files = await this.listSiteAssets(expected.clientId);
    return this.writeSpec((s, deps) => {
      const { record, superseded, event } = approveSiteSpec(expected, find(s.clients, expected.clientId, "client"), current, deps, files);
      return [
        record,
        {
          events: [eventRow(event)],
          spec: update(siteSpecRow(record), expected.updatedAt),
          supersede: superseded && current ? { id: current.id, expected: current.updatedAt } : null,
        },
      ];
    }, { fresh: true });
  }

  /**
   * Applies one change to a website spec with its activity, in one
   * transaction, and returns the version as the database stored it (its
   * `updated_at` is what the next save must send back). Approving reads the
   * brief fresh, so the approval is judged on what the client confirmed now.
   */
  private async writeSpec(
    change: (snapshot: StudioSnapshot, deps: DomainDeps) => [SiteSpecRecord, SpecChange | null],
    options: { fresh?: boolean } = {},
  ): Promise<SiteSpecRecord> {
    if (!this.current.canWrite) {
      throw new RepositoryError("You have read-only access to this studio. Ask an owner for member access.", "permission");
    }
    const snapshot = options.fresh || !this.snapshot ? await this.load() : this.snapshot;
    const deps: DomainDeps = { now: () => new Date().toISOString(), createId: this.createId, actor: this.actor() };
    let value: SiteSpecRecord;
    let specChange: SpecChange | null;
    try {
      [value, specChange] = change(snapshot, deps);
    } catch (error) {
      if (error instanceof DomainConflictError) throw new RepositoryError(error.message, "conflict");
      if (error instanceof DomainError) throw new RepositoryError(error.message, "validation");
      throw error;
    }
    if (!specChange) return value;

    let failure: unknown;
    try {
      const { error } = await this.client.rpc("apply_site_spec_changes", {
        p_studio: this.studioId,
        p_changes: { events: specChange.events },
        p_spec: specChange.spec,
        p_supersede: specChange.supersede ?? null,
      });
      failure = error;
    } catch (error) {
      failure = error;
    }
    if (failure) throw toRepositoryError(failure);
    this.snapshot = null;
    const stored = (await this.listSiteSpecs(value.projectId)).find((r) => r.id === value.id);
    if (!stored) throw new RepositoryError("This website spec no longer exists, or you do not have access to it.", "not_found");
    return stored;
  }

  /**
   * Applies one domain change. When it also touches onboarding progress, the
   * onboarding row is written in the same transaction.
   */
  private async write<T>(
    change: (snapshot: StudioSnapshot, deps: DomainDeps) => [T, Changes | null, Write?, Decision?],
    inquiryId?: string,
  ): Promise<T> {
    if (!this.current.canWrite) {
      throw new RepositoryError("You have read-only access to this studio. Ask an owner for member access.", "permission");
    }
    const snapshot = this.snapshot ?? (await this.load());
    const deps: DomainDeps = { now: () => new Date().toISOString(), createId: this.createId, actor: this.actor() };
    let value: T;
    let changes: Changes | null;
    let onboarding: Write | undefined;
    let decision: Decision | undefined;
    try {
      [value, changes, onboarding, decision] = change(snapshot, deps);
    } catch (error) {
      if (error instanceof DomainConflictError) throw new RepositoryError(error.message, "conflict");
      if (error instanceof DomainError) throw new RepositoryError(error.message, "validation");
      throw error;
    }
    if (!changes && !onboarding && !decision) return value;

    let failure: unknown;
    try {
      const { error } = decision
        ? await this.client.rpc("decide_inquiry", {
            p_studio: this.studioId,
            p_inquiry: inquiryId,
            p_decision: decision,
            p_changes: changes,
            p_onboarding: onboarding ?? null,
          })
        : onboarding
        ? await this.client.rpc("apply_onboarding_changes", { p_studio: this.studioId, p_changes: changes ?? { events: [] }, p_onboarding: onboarding })
        : await this.client.rpc("apply_changes", { p_studio: this.studioId, p_changes: changes });
      failure = error;
    } catch (error) {
      failure = error;
    }
    if (failure) throw toRepositoryError(failure);
    // The next load() replaces this with what the database stored.
    this.snapshot = null;
    return value;
  }

  private actor(): ActivityEvent["actor"] & { kind: "human" } {
    const member = this.current.kind === "supabase" ? this.current.members.find((m) => m.userId === this.user.id) : undefined;
    return { kind: "human", name: member?.displayName ?? this.user.email ?? "Studio member", userId: this.user.id };
  }
}

function update(row: Row, expected: string): Write {
  return { op: "update", row, expected };
}

function fieldUpdate(client: Client, key: ContextFieldKey, expected: string): Write {
  return update(contextFieldRow(client.id, key, client.context[key]), expected);
}

function find<T extends { id: string }>(items: T[], id: string, what: string): T {
  const item = items.find((candidate) => candidate.id === id);
  if (!item) throw new RepositoryError(`This ${what} no longer exists, or you do not have access to it.`, "not_found");
  return item;
}
