import type { QualityReport } from "@/lib/quality/site-quality";
import type { DeliveryFacts } from "@/lib/domain/delivery";
import { BRAND_LOGO_BUCKET, cleanBrand, type AgencyBrand } from "@/lib/domain/agency-brand";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentRunRecord } from "@/lib/agents/contract";
import { buildNewClient, DomainConflictError, DomainError, setContextField, updateClientDetails, type DomainDeps } from "@/lib/domain/clients";
import { addContextItem, buildSource, reviewProposal } from "@/lib/domain/intake";
import { approveInquiry, assertDecidable, cleanRejectionReason, getRepeats, linkInquiry, openFirstInquiry } from "@/lib/domain/inquiries";
import { buildOnboarding, completeOnboarding, findOnboarding, saveOnboardingStep } from "@/lib/domain/onboarding";
import { buildProject, buildTask, setTaskStatus, updateProject, updateTaskDetails } from "@/lib/domain/projects";
import { cleanHoldReason } from "@/lib/domain/retention";
import { approvalProblems, SIGNED_URL_TTL_SECONDS, STORAGE_BUCKET, type ImageProvenance } from "@/lib/site-assets/limits";
import { approvedSiteSpec, approveSiteSpec, type FirstDraft, requestSiteSpecChanges, saveSiteSpecDraft, startSiteSpec, submitSiteSpec } from "@/lib/domain/site-specs";
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
  type SiteBuildRecord,
  type SitePublicationRecord,
  type DomainSetup,
  type SiteDocumentRecord,
  type ClientMaterialRecord,
  type ReadMaterial,
  type SiteSpecRecord,
  type SourceDocument,
  type StudioSnapshot,
  type Task,
  type TaskDetailsInput,
  type TaskStatus,
  type NewNextStep,
  type NextStep,
} from "@/lib/domain/types";
import { validateIdentity } from "./local-repository";
import { RepositoryError, SiteSpecBlockedError, type AiSpend, type EmailSettings, type RepositoryErrorCode, type SiteMaintenance, type RepositoryInfo, type StudioRepository } from "./repository";
import { approvalBlockers, parseSiteSpec } from "@/lib/site-spec/validate";
import { toRepositoryError } from "./supabase-errors";
import type { RenderImageFile } from "@/lib/site-render/model";
import type { SiteSpec } from "@/lib/site-spec/schema";
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
  /** Where a website spec is checked and approved (POST /api/site-specs/approve). */
  approveEndpoint?: string;
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
  private readonly approveEndpoint: string;
  private readonly fetchImpl: typeof fetch;
  private readonly createId: () => string;

  constructor(options: SupabaseRepositoryOptions) {
    this.client = options.client;
    this.studioId = options.studioId;
    this.user = options.user;
    this.agentEndpoint = options.agentEndpoint ?? "/api/agents/intake";
    this.assetEndpoint = options.assetEndpoint ?? "/api/site-assets/upload";
    this.approveEndpoint = options.approveEndpoint ?? "/api/site-specs/approve";
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

  requestIntakeAnalysis(clientId: string, options: { force?: boolean; aiConsent: true }): Promise<AgentRunRecord> {
    return this.runAgent(this.agentEndpoint, { clientId, force: options.force ?? false, aiConsent: options.aiConsent }, "The analysis could not be started.");
  }

  suggestTasks(clientId: string, projectType: ProjectType): Promise<AgentRunRecord> {
    return this.runAgent(this.agentEndpoint.replace(/\/intake$/, "/plan"), { clientId, projectType }, "Suggestions could not be requested.");
  }

  async agencyBrand(): Promise<AgencyBrand> {
    const { data, error } = await this.client.from("studios").select("brand").eq("id", this.studioId).maybeSingle();
    if (error) throw toRepositoryError(error);
    return (data?.brand ?? {}) as AgencyBrand;
  }

  async saveAgencyBrand(brand: AgencyBrand): Promise<AgencyBrand> {
    const { data, error } = await this.client.rpc("update_studio_brand", { p_studio: this.studioId, p_brand: cleanBrand(brand) });
    if (error) throw toRepositoryError(error);
    return data as AgencyBrand;
  }

  async uploadBrandLogo(file: Blob): Promise<string> {
    const { data } = await this.client.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new RepositoryError("Your session has ended. Sign in again to continue.", "session");
    const form = new FormData();
    form.set("studioId", this.studioId);
    form.set("file", file);
    let response: Response;
    try {
      response = await this.fetchImpl("/api/studio-brand/logo", { method: "POST", headers: { authorization: `Bearer ${token}` }, body: form });
    } catch {
      throw new RepositoryError("Studio OS could not reach the server. Check your connection and try again.", "network");
    }
    const body = (await response.json().catch(() => null)) as { path?: string; error?: string } | null;
    if (response.ok && body?.path) return body.path;
    throw new RepositoryError(body?.error ?? "The logo was not stored.", response.status === 403 ? "permission" : "storage");
  }

  brandLogoUrl(path: string): string {
    return this.client.storage.from(BRAND_LOGO_BUCKET).getPublicUrl(path).data.publicUrl;
  }

  requestSiteDraft(clientId: string, projectId: string, options: { force?: boolean } = {}): Promise<AgentRunRecord> {
    return this.runAgent(this.agentEndpoint.replace(/\/intake$/, "/site-draft"), { clientId, projectId, force: options.force ?? false }, "The draft could not be started.");
  }

  requestBenchmark(clientId: string, projectId: string, competitors: string[]): Promise<AgentRunRecord> {
    return this.runAgent(this.agentEndpoint.replace(/\/intake$/, "/benchmark"), { clientId, projectId, competitors }, "The comparison could not be started.");
  }

  requestWarmText(clientId: string, projectId: string, specId: string, options: { force?: boolean; focus?: string[] } = {}): Promise<AgentRunRecord> {
    return this.runAgent(this.agentEndpoint.replace(/\/intake$/, "/warm-text"), { clientId, projectId, specId, force: options.force ?? false, ...(options.focus?.length ? { focus: options.focus } : {}) }, "The text pass could not be started.");
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

  async listStudioDesigns(): Promise<{ projectId: string; clientId: string; brand: SiteSpec["brand"] }[]> {
    // Only the brand of each spec is read, newest version first; the content stays where it is.
    const { data, error } = await this.client
      .from("site_specs")
      .select("project_id, client_id, version, brand:spec->brand")
      .eq("studio_id", this.studioId)
      .neq("status", "superseded")
      .order("version", { ascending: false })
      .limit(500);
    if (error) throw toRepositoryError(error);
    const seen = new Set<string>();
    return ((data ?? []) as unknown as { project_id: string; client_id: string; brand: SiteSpec["brand"] | null }[]).flatMap((row) => {
      if (seen.has(row.project_id) || !row.brand) return [];
      seen.add(row.project_id);
      return [{ projectId: row.project_id, clientId: row.client_id, brand: row.brand }];
    });
  }

  async listDeliveryFacts(): Promise<DeliveryFacts[]> {
    // The newest version per project; a superseded one was replaced by a later approval.
    const { data: specs, error } = await this.client
      .from("site_specs")
      .select("id, project_id, client_id, version, status, approved_at, updated_at")
      .eq("studio_id", this.studioId)
      .neq("status", "superseded")
      .order("version", { ascending: false })
      .limit(500);
    if (error) throw toRepositoryError(error);
    const newest = new Map<string, Row>();
    for (const row of (specs ?? []) as Row[]) if (!newest.has(String(row.project_id))) newest.set(String(row.project_id), row);
    const specIds = [...newest.values()].map((row) => String(row.id));
    const [builds, live] = await Promise.all([
      specIds.length
        ? this.client
            .from("site_builds")
            .select("spec_id, spec_version, share_token, created_at, expires_at, revoked_at, site_approvals(approver_name, created_at), site_review_comments(status)")
            .eq("studio_id", this.studioId)
            .in("spec_id", specIds)
            .order("created_at", { ascending: false })
            .limit(500)
        : Promise.resolve({ data: [] as Row[], error: null }),
      this.client.from("site_publications").select("project_id, spec_version, deployment_url, domain, created_at").eq("studio_id", this.studioId).eq("status", "live").limit(500),
    ]);
    if (builds.error) throw toRepositoryError(builds.error);
    if (live.error) throw toRepositoryError(live.error);
    const many = (value: unknown) => ([] as Row[]).concat((value as Row | Row[] | null) ?? []);
    return [...newest.values()].map((row): DeliveryFacts => {
      const published = ((live.data ?? []) as Row[]).find((p) => p.project_id === row.project_id);
      return {
        projectId: String(row.project_id),
        clientId: String(row.client_id),
        spec: { id: String(row.id), version: Number(row.version), status: row.status as "draft", approvedAt: (row.approved_at as string | null) ?? null, updatedAt: String(row.updated_at) },
        builds: ((builds.data ?? []) as Row[])
          .filter((b) => b.spec_id === row.id)
          .map((b) => {
            const approval = many(b.site_approvals)[0];
            return {
              specVersion: Number(b.spec_version),
              createdAt: String(b.created_at),
              expiresAt: String(b.expires_at),
              revokedAt: (b.revoked_at as string | null) ?? null,
              link: `/s/${b.share_token}/`,
              approval: approval ? { name: String(approval.approver_name), at: String(approval.created_at) } : null,
              openComments: many(b.site_review_comments).filter((c) => c.status === "open").length,
            };
          }),
        live: published
          ? { specVersion: Number(published.spec_version), url: published.domain ? `https://${published.domain}` : String(published.deployment_url), domain: (published.domain as string | null) ?? null, at: String(published.created_at) }
          : null,
      };
    });
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

  async draftQuality(spec: SiteSpec): Promise<QualityReport | { missing: string[] } | null> {
    const { data } = await this.client.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new RepositoryError("Your session has ended. Sign in again to continue.", "session");
    let response: Response;
    try {
      response = await this.fetchImpl("/api/site-quality", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ studioId: this.studioId, spec }),
      });
    } catch {
      throw new RepositoryError("Studio OS could not reach the server. Check your connection and try again.", "network");
    }
    const body = (await response.json().catch(() => null)) as { report?: QualityReport | { missing: string[] } | null; error?: string } | null;
    if (!response.ok || !body) throw new RepositoryError(body?.error ?? "The draft could not be checked. Try again in a moment.", response.status === 401 ? "session" : "storage");
    return body.report ?? null;
  }

  async previewServices(spec: SiteSpec, images: Readonly<Record<string, RenderImageFile>>, pageId: string): Promise<{ html: string } | { missing: string[] }> {
    const { data } = await this.client.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new RepositoryError("Your session has ended. Sign in again to continue.", "session");
    let response: Response;
    try {
      response = await this.fetchImpl("/api/site-preview/services", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ studioId: this.studioId, spec, images, pageId }),
      });
    } catch {
      throw new RepositoryError("Studio OS could not reach the server. Check your connection and try again.", "network");
    }
    const body = (await response.json().catch(() => null)) as { html?: string; missing?: string[]; error?: string } | null;
    if (!response.ok || !body) throw new RepositoryError(body?.error ?? "The preview could not be drawn. Try again in a moment.", response.status === 401 ? "session" : "storage");
    if (typeof body.html === "string") return { html: body.html };
    return { missing: body.missing ?? [] };
  }

  async buildSite(spec: SiteSpecRecord): Promise<SiteBuildRecord> {
    if (!this.current.canWrite) throw new RepositoryError("You have read-only access to this studio. Ask an owner for member access.", "permission");
    const { data } = await this.client.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new RepositoryError("Your session has ended. Sign in again to continue.", "session");
    let response: Response;
    try {
      response = await this.fetchImpl("/api/site-builds", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ studioId: this.studioId, specId: spec.id }),
      });
    } catch {
      throw new RepositoryError("Studio OS could not reach the server. Check your connection and try again.", "network");
    }
    const body = (await response.json().catch(() => null)) as { id?: string; error?: string; checks?: { level: string; message: string }[] } | null;
    if (!response.ok) {
      const reasons = (body?.checks ?? []).filter((check) => check.level === "error").map((check) => check.message);
      const codes: Record<number, RepositoryErrorCode> = { 401: "session", 403: "permission", 404: "not_found", 422: "validation" };
      throw new RepositoryError([body?.error ?? "The site could not be built. Try again in a moment.", ...reasons].join(" "), codes[response.status] ?? "storage");
    }
    const stored = (await this.listSiteBuilds(spec.id)).find((build) => build.id === body?.id);
    if (!stored) throw new RepositoryError("The site was built, but could not be read back. Reload the page.", "storage");
    return stored;
  }

  async listSiteBuilds(specId: string): Promise<SiteBuildRecord[]> {
    const { data, error } = await this.client
      .from("site_builds")
      .select(
        "id, spec_id, spec_version, design_system, share_token, checks, file_count, expires_at, revoked_at, created_by, created_at, reviews_enabled, client_questions, questions_answered_at, site_approvals(approver_name, approver_role, approver_email, created_at), site_review_comments(id, page_path, target, body, author_name, status, reply, created_at)",
      )
      .eq("studio_id", this.studioId)
      .eq("spec_id", specId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw toRepositoryError(error);
    return (data ?? []).map((row) => ({
      id: row.id,
      specId: row.spec_id,
      specVersion: row.spec_version,
      designSystem: row.design_system,
      link: `/s/${row.share_token}/`,
      checks: (Array.isArray(row.checks) ? row.checks : []).filter((c: { level?: string }) => c.level === "warning" || c.level === "error"),
      quality: (Array.isArray(row.checks) ? row.checks : []).find((c: { level?: string }) => c.level === "quality") ?? null,
      fileCount: row.file_count,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
      createdBy: String((row.created_by as { name?: string } | null)?.name ?? "Studio member"),
      createdAt: row.created_at,
      reviewsEnabled: row.reviews_enabled !== false,
      clientQuestions: Array.isArray(row.client_questions) ? (row.client_questions as unknown[]).filter((q): q is string => typeof q === "string") : [],
      questionsAnsweredAt: (row.questions_answered_at as string | null) ?? null,
      approval: (() => {
        const found = ([] as Row[]).concat((row.site_approvals as Row | Row[] | null) ?? [])[0];
        return found ? { name: String(found.approver_name), role: String(found.approver_role ?? ""), email: String(found.approver_email), at: String(found.created_at) } : null;
      })(),
      comments: ((row.site_review_comments as Row[] | null) ?? [])
        .map((c) => ({ id: String(c.id), page: String(c.page_path), target: String(c.target ?? ""), body: String(c.body), author: String(c.author_name), status: c.status === "resolved" ? ("resolved" as const) : ("open" as const), reply: (c.reply as string | null) ?? null, createdAt: String(c.created_at) }))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    }));
  }

  async revokeSiteBuild(build: SiteBuildRecord): Promise<void> {
    if (!this.current.canWrite) throw new RepositoryError("You have read-only access to this studio. Ask an owner for member access.", "permission");
    const { error } = await this.client.rpc("revoke_site_build", { p_build: build.id });
    if (error) throw toRepositoryError(error);
  }

  private async publishRequest<T>(path: string, request: Record<string, unknown>, failure: string): Promise<T> {
    if (!this.current.canWrite) throw new RepositoryError("You have read-only access to this studio. Ask an owner for member access.", "permission");
    const { data } = await this.client.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new RepositoryError("Your session has ended. Sign in again to continue.", "session");
    let response: Response;
    try {
      response = await this.fetchImpl(path, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ studioId: this.studioId, ...request }) });
    } catch {
      throw new RepositoryError("Studio OS could not reach the server. Check your connection and try again.", "network");
    }
    const body = (await response.json().catch(() => null)) as (T & { error?: string; reasons?: string[] }) | null;
    if (!response.ok) {
      const codes: Record<number, RepositoryErrorCode> = { 401: "session", 403: "permission", 404: "not_found", 409: "validation", 422: "validation", 503: "unavailable" };
      throw new RepositoryError([body?.error ?? failure, ...(body?.reasons ?? [])].join(" "), codes[response.status] ?? "storage");
    }
    return body as T;
  }

  publishSite(spec: SiteSpecRecord, domain: string) {
    return this.publishRequest<{ url: string; domain: DomainSetup | null }>("/api/site-publish", { specId: spec.id, domain }, "The site was not published.");
  }

  async restorePublication(publication: SitePublicationRecord): Promise<void> {
    await this.publishRequest("/api/site-publish/restore", { publicationId: publication.id }, "The earlier version was not restored.");
  }

  domainStatus(publication: SitePublicationRecord) {
    return this.publishRequest<DomainSetup>("/api/site-publish/domain", { publicationId: publication.id }, "The domain could not be checked.");
  }

  async listPublications(projectId: string): Promise<SitePublicationRecord[]> {
    const { data, error } = await this.client
      .from("site_publications")
      .select("id, spec_version, deployment_url, domain, status, published_by, created_at")
      .eq("studio_id", this.studioId)
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw toRepositoryError(error);
    return (data ?? []).map((row) => ({
      id: String(row.id),
      specVersion: Number(row.spec_version),
      url: row.domain ? `https://${row.domain}` : String(row.deployment_url),
      domain: (row.domain as string | null) ?? null,
      status: row.status === "live" ? ("live" as const) : ("previous" as const),
      publishedBy: String((row.published_by as { name?: string } | null)?.name ?? "Studio member"),
      createdAt: String(row.created_at),
    }));
  }

  async sendReviewLink(build: SiteBuildRecord, mail: { to: string; subject: string; message: string }): Promise<void> {
    if (!this.current.canWrite) throw new RepositoryError("You have read-only access to this studio. Ask an owner for member access.", "permission");
    const { data } = await this.client.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new RepositoryError("Your session has ended. Sign in again to continue.", "session");
    let response: Response;
    try {
      response = await this.fetchImpl("/api/site-reviews/send", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ studioId: this.studioId, buildId: build.id, ...mail }),
      });
    } catch {
      throw new RepositoryError("Studio OS could not reach the server. Check your connection and try again.", "network");
    }
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      const codes: Record<number, RepositoryErrorCode> = { 401: "session", 403: "permission", 404: "not_found", 400: "validation" };
      throw new RepositoryError(body?.error ?? "The link was not sent. Try again in a moment.", codes[response.status] ?? "storage");
    }
  }

  async setBuildReviews(build: SiteBuildRecord, enabled: boolean): Promise<void> {
    if (!this.current.canWrite) throw new RepositoryError("You have read-only access to this studio. Ask an owner for member access.", "permission");
    const { error } = await this.client.rpc("set_build_reviews", { p_build: build.id, p_enabled: enabled });
    if (error) throw toRepositoryError(error);
  }

  async listNextSteps(clientId?: string): Promise<NextStep[]> {
    let query = this.client.from("client_next_steps").select("*").eq("studio_id", this.studioId);
    if (clientId) query = query.eq("client_id", clientId);
    const { data, error } = await query.order("status", { ascending: false }).order("due_on").order("due_time", { nullsFirst: true }).limit(500);
    if (error) throw toRepositoryError(error);
    return (data ?? []).map(toNextStep);
  }

  async addNextStep(step: NewNextStep): Promise<NextStep> {
    if (!this.current.canWrite) throw new RepositoryError("You have read-only access to this studio. Ask an owner for member access.", "permission");
    const { data, error } = await this.client
      .from("client_next_steps")
      .insert({
        studio_id: this.studioId,
        client_id: step.clientId,
        title: step.title.trim(),
        note: (step.note ?? "").trim(),
        due_on: step.dueOn,
        due_time: step.dueTime || null,
        assignee: step.assignee ?? null,
        created_by: this.actor(),
      })
      .select("*")
      .single();
    if (error) throw toRepositoryError(error);
    return toNextStep(data);
  }

  async updateNextStep(step: NextStep, change: Partial<Pick<NextStep, "title" | "note" | "dueOn" | "dueTime" | "assignee" | "status">>): Promise<NextStep> {
    if (!this.current.canWrite) throw new RepositoryError("You have read-only access to this studio. Ask an owner for member access.", "permission");
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (change.title !== undefined) row.title = change.title.trim();
    if (change.note !== undefined) row.note = change.note.trim();
    if (change.dueOn !== undefined) row.due_on = change.dueOn;
    if (change.dueTime !== undefined) row.due_time = change.dueTime || null;
    if (change.assignee !== undefined) row.assignee = change.assignee;
    if (change.status !== undefined) {
      row.status = change.status;
      row.done_at = change.status === "done" ? new Date().toISOString() : null;
    }
    const { data, error } = await this.client.from("client_next_steps").update(row).eq("id", step.id).eq("studio_id", this.studioId).select("*").single();
    if (error) throw toRepositoryError(error);
    return toNextStep(data);
  }

  async deleteNextStep(step: NextStep): Promise<void> {
    if (!this.current.canWrite) throw new RepositoryError("You have read-only access to this studio. Ask an owner for member access.", "permission");
    const { error } = await this.client.rpc("delete_next_step", { p_step: step.id });
    if (error) throw toRepositoryError(error);
  }

  async emailSettings(): Promise<EmailSettings> {
    const { data, error } = await this.client.from("member_email_settings").select("daily_digest, client_events").eq("studio_id", this.studioId).eq("user_id", this.user.id).maybeSingle();
    if (error) throw toRepositoryError(error);
    return { dailyDigest: data?.daily_digest !== false, clientEvents: data?.client_events !== false };
  }

  async saveEmailSettings(settings: EmailSettings): Promise<void> {
    const { error } = await this.client.rpc("set_email_settings", { p_studio: this.studioId, p_daily: settings.dailyDigest, p_events: settings.clientEvents });
    if (error) throw toRepositoryError(error);
  }

  async clientPortal(clientId: string): Promise<{ createdAt: string; expiresAt: string } | null> {
    const { data, error } = await this.client
      .from("client_portals")
      .select("created_at, expires_at")
      .eq("studio_id", this.studioId)
      .eq("client_id", clientId)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) throw toRepositoryError(error);
    const row = (data ?? [])[0];
    return row ? { createdAt: String(row.created_at), expiresAt: String(row.expires_at) } : null;
  }

  async createClientPortal(clientId: string): Promise<string> {
    if (!this.current.canWrite) throw new RepositoryError("You have read-only access to this studio. Ask an owner for member access.", "permission");
    const { data, error } = await this.client.rpc("create_client_portal", { p_client: clientId });
    if (error) throw toRepositoryError(error);
    return String(data);
  }

  async revokeClientPortal(clientId: string): Promise<void> {
    const { error } = await this.client.rpc("revoke_client_portal", { p_client: clientId });
    if (error) throw toRepositoryError(error);
  }

  async siteMaintenance(projectId: string): Promise<SiteMaintenance> {
    const [settings, check] = await Promise.all([
      this.client.from("site_maintenance").select("report_enabled, report_to").eq("studio_id", this.studioId).eq("project_id", projectId).maybeSingle(),
      this.client.from("site_health_checks").select("checked_at, ok, detail").eq("studio_id", this.studioId).eq("project_id", projectId).order("checked_at", { ascending: false }).limit(1),
    ]);
    if (settings.error) throw toRepositoryError(settings.error);
    if (check.error) throw toRepositoryError(check.error);
    const last = (check.data ?? [])[0];
    const detail = (last?.detail ?? {}) as { problems?: string[]; certDaysLeft?: number | null };
    return {
      reportEnabled: settings.data?.report_enabled === true,
      reportTo: (settings.data?.report_to as string | null) ?? null,
      lastCheck: last ? { checkedAt: String(last.checked_at), ok: last.ok === true, problems: Array.isArray(detail.problems) ? detail.problems : [], certDaysLeft: detail.certDaysLeft ?? null } : null,
    };
  }

  async saveSiteMaintenance(projectId: string, enabled: boolean, to: string | null): Promise<void> {
    if (!this.current.canWrite) throw new RepositoryError("You have read-only access to this studio. Ask an owner for member access.", "permission");
    const { error } = await this.client.rpc("set_site_maintenance", { p_project: projectId, p_enabled: enabled, p_to: to ?? "" });
    if (error) throw toRepositoryError(error);
  }

  async siteReport(projectId: string, send: boolean): Promise<{ subject: string; text: string; to: string | null; sent?: boolean }> {
    const { data } = await this.client.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new RepositoryError("Your session has ended. Sign in again to continue.", "session");
    let response: Response;
    try {
      response = await this.fetchImpl("/api/maintenance/report", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ studioId: this.studioId, projectId, send }) });
    } catch {
      throw new RepositoryError("Studio OS could not reach the server. Check your connection and try again.", "network");
    }
    const body = (await response.json().catch(() => null)) as { subject?: string; text?: string; to?: string | null; sent?: boolean; error?: string } | null;
    if (!response.ok || !body?.subject) throw new RepositoryError(body?.error ?? "The report could not be made. Try again in a moment.", response.status === 401 ? "session" : "storage");
    return { subject: body.subject, text: body.text ?? "", to: body.to ?? null, sent: body.sent };
  }

  async hasCalendarFeed(): Promise<boolean> {
    const { data, error } = await this.client.from("calendar_feeds").select("id").eq("studio_id", this.studioId).eq("user_id", this.user.id).is("revoked_at", null).limit(1);
    if (error) throw toRepositoryError(error);
    return (data ?? []).length > 0;
  }

  async createCalendarFeed(): Promise<string> {
    const { data, error } = await this.client.rpc("create_calendar_feed", { p_studio: this.studioId });
    if (error) throw toRepositoryError(error);
    return String(data);
  }

  async revokeCalendarFeed(): Promise<void> {
    const { error } = await this.client.rpc("revoke_calendar_feed", { p_studio: this.studioId });
    if (error) throw toRepositoryError(error);
  }

  async setBuildQuestions(build: SiteBuildRecord, questions: string[]): Promise<void> {
    if (!this.current.canWrite) throw new RepositoryError("You have read-only access to this studio. Ask an owner for member access.", "permission");
    const { error } = await this.client.rpc("set_build_questions", { p_build: build.id, p_questions: questions });
    if (error) throw toRepositoryError(error);
  }

  async answerReviewComment(commentId: string, reply: string | null, resolve: boolean): Promise<void> {
    if (!this.current.canWrite) throw new RepositoryError("You have read-only access to this studio. Ask an owner for member access.", "permission");
    const { error } = await this.client.rpc("answer_review_comment", { p_comment: commentId, p_reply: reply, p_resolve: resolve, p_actor: this.actor() });
    if (error) throw toRepositoryError(error);
  }

  private async materialRequest(path: string, init: RequestInit, failure: string): Promise<Record<string, unknown>> {
    if (!this.current.canWrite) throw new RepositoryError("You have read-only access to this studio. Ask an owner for member access.", "permission");
    const { data } = await this.client.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new RepositoryError("Your session has ended. Sign in again to continue.", "session");
    let response: Response;
    try {
      response = await this.fetchImpl(path, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), authorization: `Bearer ${token}` } });
    } catch {
      throw new RepositoryError("Studio OS could not reach the server. Check your connection and try again.", "network");
    }
    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (!response.ok) {
      const codes: Record<number, RepositoryErrorCode> = { 400: "validation", 401: "session", 403: "permission", 404: "not_found", 422: "validation" };
      throw new RepositoryError(String(body?.error ?? failure), codes[response.status] ?? "storage");
    }
    return body ?? {};
  }

  async listClientMaterials(clientId: string): Promise<ClientMaterialRecord[]> {
    const { data, error } = await this.client
      .from("client_materials")
      .select("id, client_id, title, mime_type, byte_size, created_at")
      .eq("studio_id", this.studioId)
      .eq("client_id", clientId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) throw toRepositoryError(error);
    return (data ?? []).map((row) => ({ id: row.id, clientId: row.client_id, title: row.title, mimeType: row.mime_type, byteSize: row.byte_size, createdAt: row.created_at }));
  }

  async addClientMaterial(clientId: string, file: Blob, title: string): Promise<{ kind: "text"; read: ReadMaterial } | { kind: "file"; material: ClientMaterialRecord }> {
    const form = new FormData();
    form.set("studioId", this.studioId);
    form.set("clientId", clientId);
    form.set("title", title);
    form.set("file", file);
    const body = await this.materialRequest("/api/client-materials", { method: "POST", body: form }, "The file could not be added. Try again in a moment.");
    if (body.kind === "text") return { kind: "text", read: { title: String(body.title), parts: (body.parts as string[]) ?? [] } };
    const material = (await this.listClientMaterials(clientId)).find((m) => m.id === body.id);
    if (!material) throw new RepositoryError("The file was stored, but could not be read back. Reload the page.", "storage");
    return { kind: "file", material };
  }

  async readClientWebPage(clientId: string, url: string): Promise<ReadMaterial> {
    const body = await this.materialRequest(
      "/api/client-materials/web",
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ studioId: this.studioId, clientId, url }) },
      "The page could not be read. Try again in a moment.",
    );
    return { title: String(body.title), url: String(body.url), parts: (body.parts as string[]) ?? [] };
  }

  async deleteClientMaterial(material: ClientMaterialRecord): Promise<void> {
    if (!this.current.canWrite) throw new RepositoryError("You have read-only access to this studio. Ask an owner for member access.", "permission");
    const { error } = await this.client.rpc("delete_client_material", { p_material: material.id });
    if (error) throw toRepositoryError(error);
  }

  async listSiteDocuments(clientId: string): Promise<SiteDocumentRecord[]> {
    const { data, error } = await this.client
      .from("site_documents")
      .select("id, client_id, title, byte_size, created_at")
      .eq("studio_id", this.studioId)
      .eq("client_id", clientId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) throw toRepositoryError(error);
    return (data ?? []).map((row) => ({ id: row.id, clientId: row.client_id, title: row.title, byteSize: row.byte_size, createdAt: row.created_at }));
  }

  async uploadSiteDocument(clientId: string, file: Blob, title: string): Promise<SiteDocumentRecord> {
    if (!this.current.canWrite) throw new RepositoryError("You have read-only access to this studio. Ask an owner for member access.", "permission");
    const { data } = await this.client.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new RepositoryError("Your session has ended. Sign in again to continue.", "session");
    const form = new FormData();
    form.set("studioId", this.studioId);
    form.set("clientId", clientId);
    form.set("title", title);
    form.set("file", file);
    let response: Response;
    try {
      response = await this.fetchImpl("/api/site-documents", { method: "POST", headers: { authorization: `Bearer ${token}` }, body: form });
    } catch {
      throw new RepositoryError("Studio OS could not reach the server. Check your connection and try again.", "network");
    }
    const body = (await response.json().catch(() => null)) as { id?: string; error?: string } | null;
    if (!response.ok) {
      const codes: Record<number, RepositoryErrorCode> = { 400: "validation", 401: "session", 403: "permission", 404: "not_found" };
      throw new RepositoryError(body?.error ?? "The document could not be stored. Try again in a moment.", codes[response.status] ?? "storage");
    }
    const stored = (await this.listSiteDocuments(clientId)).find((document) => document.id === body?.id);
    if (!stored) throw new RepositoryError("The document was stored, but could not be read back. Reload the page.", "storage");
    return stored;
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

  async startSiteSpec(projectId: string, from?: FirstDraft): Promise<SiteSpecRecord> {
    const versions = await this.listSiteSpecs(projectId);
    return this.writeSpec((s, deps) => {
      const project = find(s.projects, projectId, "project");
      const { record, event } = startSiteSpec(find(s.clients, project.clientId, "client"), project, versions, deps, from);
      return [record, event && { events: [eventRow(event)], spec: { op: "insert", row: siteSpecRow(record) } }];
    });
  }

  saveSiteSpecDraft(expected: SiteSpecRecord, spec: unknown, options: { quiet?: boolean } = {}): Promise<SiteSpecRecord> {
    return this.writeSpec(
      (_, deps) => {
        const { record, event } = saveSiteSpecDraft(expected, spec, deps);
        return [record, event && { events: options.quiet ? [] : [eventRow(event)], spec: update(siteSpecRow(record), expected.updatedAt) }];
      },
      // Saving reads nothing from the studio, so typing never waits for a full reload.
      { noSnapshot: true },
    );
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

  /**
   * Asks the server to check and approve this version. The database refuses
   * an approval the server has not checked, so there is no other way.
   */
  async approveSiteSpec(expected: SiteSpecRecord): Promise<SiteSpecRecord> {
    if (!this.current.canWrite) throw new RepositoryError("You have read-only access to this studio. Ask an owner for member access.", "permission");
    const { data } = await this.client.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new RepositoryError("Your session has ended. Sign in again to continue.", "session");
    let response: Response;
    try {
      response = await this.fetchImpl(this.approveEndpoint, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ studioId: this.studioId, specId: expected.id, expectedUpdatedAt: expected.updatedAt }),
      });
    } catch {
      throw new RepositoryError("Studio OS could not reach the server. Check your connection and try again.", "network");
    }
    const body = (await response.json().catch(() => null)) as { error?: string; blockers?: string[] } | null;
    if (!response.ok) {
      if (body?.blockers?.length) throw new SiteSpecBlockedError(body.blockers);
      const codes: Record<number, RepositoryErrorCode> = { 401: "session", 403: "permission", 404: "not_found", 409: "conflict", 422: "validation" };
      throw new RepositoryError(body?.error ?? "The website spec could not be approved. Try again in a moment.", codes[response.status] ?? "storage");
    }
    this.snapshot = null;
    const stored = (await this.listSiteSpecs(expected.projectId)).find((r) => r.id === expected.id);
    if (!stored) throw new RepositoryError("This website spec no longer exists, or you do not have access to it.", "not_found");
    return stored;
  }

  /**
   * The server's side of an approval, run as the signed-in person: every rule
   * in approvalBlockers against what is stored now, then the pass
   * (recordCheck, as the service role), then the approval itself.
   */
  async approveCheckedSiteSpec(specId: string, expectedUpdatedAt: string, recordCheck: () => Promise<void>): Promise<SiteSpecRecord> {
    const snapshot = await this.load();
    const { data, error } = await this.client.from("site_specs").select(SITE_SPEC_COLUMNS).eq("studio_id", this.studioId).eq("id", specId).maybeSingle();
    if (error) throw toRepositoryError(error);
    if (!data) throw new RepositoryError("This website spec no longer exists, or you do not have access to it.", "not_found");
    const expected = toSiteSpecRecord(data as unknown as Row);
    if (Date.parse(expected.updatedAt) !== Date.parse(expectedUpdatedAt)) {
      throw new RepositoryError("Someone else changed this in the meantime. Reload to see the latest version.", "conflict");
    }
    const client = find(snapshot.clients, expected.clientId, "client");
    const files = await this.listSiteAssets(expected.clientId);
    const parsed = parseSiteSpec(expected.spec);
    const blockers = parsed.ok ? approvalBlockers(parsed.spec, client, files) : parsed.issues;
    if (blockers.length) throw new SiteSpecBlockedError(blockers.map((b) => b.message));

    const current = approvedSiteSpec(await this.listSiteSpecs(expected.projectId));
    return this.writeSpec(
      (_, deps) => {
        const { record, superseded, event } = approveSiteSpec(expected, client, current, deps, files);
        return [
          record,
          {
            events: [eventRow(event)],
            spec: update(siteSpecRow(record), expected.updatedAt),
            supersede: superseded && current ? { id: current.id, expected: current.updatedAt } : null,
          },
        ];
      },
      { beforeWrite: recordCheck },
    );
  }

  /**
   * Applies one change to a website spec with its activity, in one
   * transaction, and returns the version as the database stored it (its
   * `updated_at` is what the next save must send back).
   */
  private async writeSpec(
    change: (snapshot: StudioSnapshot, deps: DomainDeps) => [SiteSpecRecord, SpecChange | null],
    options: { beforeWrite?: () => Promise<void>; noSnapshot?: boolean } = {},
  ): Promise<SiteSpecRecord> {
    if (!this.current.canWrite) {
      throw new RepositoryError("You have read-only access to this studio. Ask an owner for member access.", "permission");
    }
    // Without a snapshot the change must not read one; the people and role it needs are already loaded.
    const snapshot = options.noSnapshot ? (this.snapshot as StudioSnapshot) : (this.snapshot ?? (await this.load()));
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
    await options.beforeWrite?.();

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

function toNextStep(row: Record<string, unknown>): NextStep {
  const assignee = row.assignee as NextStep["assignee"];
  return {
    id: String(row.id),
    clientId: String(row.client_id),
    title: String(row.title),
    note: String(row.note ?? ""),
    dueOn: String(row.due_on),
    dueTime: row.due_time ? String(row.due_time).slice(0, 5) : null,
    assignee: assignee && assignee.kind === "human" ? assignee : null,
    status: row.status === "done" ? "done" : "open",
    doneAt: (row.done_at as string | null) ?? null,
    createdBy: row.created_by as NextStep["createdBy"],
    createdAt: String(row.created_at),
  };
}

