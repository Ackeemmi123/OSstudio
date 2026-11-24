import type { DeliveryFacts } from "@/lib/domain/delivery";
import type { AgencyBrand } from "@/lib/domain/agency-brand";
import type { FirstDraft } from "@/lib/domain/site-specs";
import type { AgentRunRecord } from "@/lib/agents/contract";
import type { ImageProvenance } from "@/lib/site-assets/limits";
import type { RenderImageFile } from "@/lib/site-render/model";
import type { SiteSpec } from "@/lib/site-spec/schema";
import type {
  AgentProposal,
  Client,
  ClientDetailsInput,
  ContextFieldInput,
  ContextFieldKey,
  Inquiry,
  InquiryDecision,
  NewClientInput,
  NewContextItemInput,
  NewProjectInput,
  NewSourceInput,
  NewTaskInput,
  Onboarding,
  OnboardingStepInput,
  Project,
  ProjectType,
  ProjectUpdateInput,
  ProposalDecision,
  SiteAssetRecord,
  SiteBuildRecord,
  SitePublicationRecord,
  DomainSetup,
  SiteDocumentRecord,
  ClientMaterialRecord,
  ReadMaterial,
  SiteSpecRecord,
  SourceDocument,
  StudioSnapshot,
  Task,
  TaskDetailsInput,
  TaskStatus, NewNextStep, NextStep } from "@/lib/domain/types";

/**
 * Data access boundary. The UI and the agent runner both go through it, so
 * they share one version of client and project information. Implementations
 * validate input and enforce domain rules before saving.
 */
export interface StudioRepository {
  readonly info: RepositoryInfo;
  load(): Promise<StudioSnapshot>;
  createClient(input: NewClientInput): Promise<Client>;
  updateClient(clientId: string, input: ClientDetailsInput): Promise<Client>;
  setContextField(clientId: string, key: ContextFieldKey, input: ContextFieldInput): Promise<Client>;
  addContextItem(clientId: string, input: NewContextItemInput): Promise<Client>;
  addSource(clientId: string, input: NewSourceInput): Promise<SourceDocument>;
  /** Starts the client's guided onboarding, or returns the one already started. */
  startOnboarding(clientId: string): Promise<Onboarding>;
  /** Saves one onboarding step atomically: details, answers, skips, questions and progress. */
  saveOnboardingStep(onboardingId: string, input: OnboardingStepInput): Promise<Onboarding>;
  /** Marks the brief ready for review. Unknown values stay unknown. */
  completeOnboarding(onboardingId: string): Promise<Onboarding>;
  createProject(clientId: string, input: NewProjectInput): Promise<Project>;
  updateProject(projectId: string, input: ProjectUpdateInput): Promise<Project>;
  createTask(projectId: string, input: NewTaskInput): Promise<Task>;
  /** A reason is kept only when the task is blocked. */
  setTaskStatus(taskId: string, status: TaskStatus, options?: { blockedReason?: string }): Promise<Task>;
  /** Owner and due date. */
  updateTask(taskId: string, input: TaskDetailsInput): Promise<Task>;
  /** A person accepts or dismisses an agent's proposal. */
  reviewProposal(proposalId: string, decision: ProposalDecision): Promise<AgentProposal>;
  /** Asks the server to run the intake agent on this client's source material. */
  requestIntakeAnalysis(clientId: string, options?: { force?: boolean }): Promise<AgentRunRecord>;
  /**
   * Asks the server for suggested changes to a new project's starting tasks.
   * The run's result holds them; nothing is created.
   */
  suggestTasks(clientId: string, projectType: ProjectType): Promise<AgentRunRecord>;
  /** The agency brand clients see instead of Studio OS. Only server workspaces have one. */
  agencyBrand?(): Promise<AgencyBrand>;
  /** Owners only. Empty values are left out. Returns the brand as stored. */
  saveAgencyBrand?(brand: AgencyBrand): Promise<AgencyBrand>;
  /** Owners only. Stores a logo and returns its path, to save with the brand. */
  uploadBrandLogo?(file: Blob): Promise<string>;
  /** The public address of a stored logo. */
  brandLogoUrl?(path: string): string;
  /** Asks the server to draft a project's website spec from the client's material. The draft is stored on the run. */
  requestSiteDraft?(clientId: string, projectId: string, options?: { force?: boolean }): Promise<AgentRunRecord>;
  /** The brand of each project's newest website spec in the studio, for the uniqueness check. */
  listStudioDesigns?(): Promise<{ projectId: string; clientId: string; brand: SiteSpec["brand"] }[]>;
  /** Compares the project's site with up to three competitors' public sites. No AI. */
  requestBenchmark?(clientId: string, projectId: string, competitors: string[]): Promise<AgentRunRecord>;
  /** Asks the Design agent for warmer wordings of a saved spec version's texts. Proposals only. */
  requestWarmText?(clientId: string, projectId: string, specId: string, options?: { force?: boolean }): Promise<AgentRunRecord>;
  /** This month's AI spend across all agents, for owners. Only server workspaces have one. */
  aiSpend?(): Promise<AiSpend>;
  /**
   * A person decides a new website inquiry: approve it as a new client (with
   * a draft onboarding), add it to an existing client, reject it or mark it
   * as spam. Each inquiry is decided once.
   */
  decideInquiry(inquiryId: string, decision: InquiryDecision): Promise<Inquiry>;
  /**
   * An owner pauses the client's retention with a reason (an open dispute, a
   * legal requirement), or releases it with null. Every change is logged.
   */
  setRetentionHold(clientId: string, reason: string | null): Promise<Client>;
  /**
   * Website specs (src/lib/site-spec). Only server workspaces have them; the
   * local demo leaves these out. Versions are read per project, newest first,
   * and are not part of the snapshot.
   */
  listSiteSpecs?(projectId: string): Promise<SiteSpecRecord[]>;
  /** Where every website project stands on its way to going live (src/lib/domain/delivery). */
  listDeliveryFacts?(): Promise<DeliveryFacts[]>;
  /** Starts the next version (from the brief, or from the approved one), or returns the open one. */
  startSiteSpec?(projectId: string, from?: FirstDraft): Promise<SiteSpecRecord>;
  /** Saves the draft's content. `expected` is the version as the person last saw it. */
  /** `quiet`: store the draft without an activity entry, for saves that follow an earlier one by moments. */
  saveSiteSpecDraft?(expected: SiteSpecRecord, spec: unknown, options?: { quiet?: boolean }): Promise<SiteSpecRecord>;
  submitSiteSpec?(expected: SiteSpecRecord): Promise<SiteSpecRecord>;
  requestSiteSpecChanges?(expected: SiteSpecRecord, note?: string): Promise<SiteSpecRecord>;
  /** Approves the version and supersedes the project's earlier approved version. */
  approveSiteSpec?(expected: SiteSpecRecord): Promise<SiteSpecRecord>;
  /**
   * Website images (src/lib/site-assets). The client's stored images, not
   * deleted, newest first. Only server workspaces have them.
   */
  listSiteAssets?(clientId: string): Promise<SiteAssetRecord[]>;
  /** Sends one processed image to the server, which checks its bytes before storing it. Returns the stored (or reused) image. */
  uploadSiteAsset?(clientId: string, file: Blob, provenance: ImageProvenance): Promise<{ asset: SiteAssetRecord; existing: boolean }>;
  /** A person's rights decision, with the answers it rests on. */
  reviewSiteAsset?(asset: SiteAssetRecord, decision: "approve" | "reject", provenance: ImageProvenance, note?: string): Promise<SiteAssetRecord>;
  /** Hides the image at once; the file is purged from Storage within a day. */
  deleteSiteAsset?(asset: SiteAssetRecord): Promise<void>;
  /** Signed links (at most 15 minutes) for the given images, by image id. Images that cannot be read are left out. */
  imageLinks?(assets: Pick<SiteAssetRecord, "id" | "storagePath">[]): Promise<Record<string, string>>;
  /** One page drawn with the company design, on the server; or what the design still needs. */
  previewServices?(spec: SiteSpec, images: Readonly<Record<string, RenderImageFile>>, pageId: string): Promise<{ html: string } | { missing: string[] }>;
  /** Builds a version with its spec's design system, behind a private link. Only server workspaces build. */
  buildSite?(spec: SiteSpecRecord): Promise<SiteBuildRecord>;
  /** A spec version's builds, newest first. */
  listSiteBuilds?(specId: string): Promise<SiteBuildRecord[]>;
  /** Turns a build's link off for good. */
  revokeSiteBuild?(build: SiteBuildRecord): Promise<void>;
  /** Publishes an approved spec version to the hosting and, if given, the client's domain. */
  publishSite?(spec: SiteSpecRecord, domain: string): Promise<{ url: string; domain: DomainSetup | null }>;
  listPublications?(projectId: string): Promise<SitePublicationRecord[]>;
  restorePublication?(publication: SitePublicationRecord): Promise<void>;
  domainStatus?(publication: SitePublicationRecord): Promise<DomainSetup>;
  /** Turns the client's review on a build's link on or off. */
  setBuildReviews?(build: SiteBuildRecord, enabled: boolean): Promise<void>;
  /** E-mails a build's review link to the client, in the person's words; replies go to them. */
  sendReviewLink?(build: SiteBuildRecord, mail: { to: string; subject: string; message: string }): Promise<void>;
  /** Next steps: the studio's own, by client and date. Open ones first, then the last done. */
  listNextSteps?(clientId?: string): Promise<NextStep[]>;
  addNextStep?(step: NewNextStep): Promise<NextStep>;
  updateNextStep?(step: NextStep, change: Partial<Pick<NextStep, "title" | "note" | "dueOn" | "dueTime" | "assignee" | "status">>): Promise<NextStep>;
  deleteNextStep?(step: NextStep): Promise<void>;
  /** The caller's own calendar feed: whether one is on, and making a new link (shown once) or turning it off. */
  hasCalendarFeed?(): Promise<boolean>;
  /** Which of Studio OS's e-mails the signed-in person gets from this studio. Both are on until they turn one off. */
  emailSettings?(): Promise<EmailSettings>;
  saveEmailSettings?(settings: EmailSettings): Promise<void>;
  createCalendarFeed?(): Promise<string>;
  revokeCalendarFeed?(): Promise<void>;
  /** Up to eight questions the client answers on the link. An empty list takes them off. */
  setBuildQuestions?(build: SiteBuildRecord, questions: string[]): Promise<void>;
  /** Answers a client's comment (a null reply keeps the earlier one) and marks it resolved or open. */
  answerReviewComment?(commentId: string, reply: string | null, resolve: boolean): Promise<void>;
  /** The client's documents for download, newest first, without deleted ones. */
  listSiteDocuments?(clientId: string): Promise<SiteDocumentRecord[]>;
  /** Sends one PDF to the server, which checks it before storing it. */
  uploadSiteDocument?(clientId: string, file: Blob, title: string): Promise<SiteDocumentRecord>;
  /** The files a client sent, newest first, without deleted ones. */
  listClientMaterials?(clientId: string): Promise<ClientMaterialRecord[]>;
  /** Sends one file: a Word document comes back as text to keep as sources; a PDF or image is kept as a file. */
  addClientMaterial?(clientId: string, file: Blob, title: string): Promise<{ kind: "text"; read: ReadMaterial } | { kind: "file"; material: ClientMaterialRecord }>;
  /** Reads a public web page into text to keep as sources. */
  readClientWebPage?(clientId: string, url: string): Promise<ReadMaterial>;
  /** Hides a kept file; it is left out of every AI draft. */
  deleteClientMaterial?(material: ClientMaterialRecord): Promise<void>;
  /** Restores the demonstration workspace. Only meaningful for demo repositories. */
  resetDemoData(): Promise<StudioSnapshot>;
}

export type MemberRole = "owner" | "member" | "viewer";

export interface StudioMember {
  userId: string;
  displayName: string;
  role: MemberRole;
}

export type RepositoryInfo =
  | {
      kind: "local-demo";
      /** Where data actually lives, so the UI never over-promises persistence. */
      persistence: "browser" | "memory";
      canWrite: true;
    }
  | {
      kind: "supabase";
      persistence: "server";
      studio: { id: string; name: string };
      role: MemberRole;
      /** Owners and members can change data; viewers can only read. */
      canWrite: boolean;
      members: StudioMember[];
      user: { id: string; email: string | null };
    };

export type RepositoryErrorCode =
  | "not_found"
  | "validation"
  | "storage"
  /** The signed-in user may not do this. */
  | "permission"
  /** Someone else changed the record since it was loaded. */
  | "conflict"
  /** The sign-in session ended. */
  | "session"
  /** The server could not be reached. */
  | "network"
  /** The feature is not available in this setup. */
  | "unavailable";

export class RepositoryError extends Error {
  constructor(
    message: string,
    readonly code: RepositoryErrorCode,
  ) {
    super(message);
    this.name = "RepositoryError";
  }
}

/** The server refused an approval: what needs fixing, in plain language. */
export class SiteSpecBlockedError extends RepositoryError {
  constructor(readonly blockers: string[]) {
    super(blockers.length === 1 ? `1 thing needs fixing: ${blockers[0]}` : `${blockers.length} things need fixing.`, "validation");
    this.name = "SiteSpecBlockedError";
  }
}

/** Amounts in micro-dollars (see src/lib/agents/pricing.ts). */
export interface AiSpend {
  /** First day of the month, YYYY-MM-DD (UTC). */
  month: string;
  spentMicros: number;
  /** Held for analyses still running. */
  reservedMicros: number;
  capMicros: number;
}

/** The morning list of what is due, and a note when a client comments or approves on a review link. */
export interface EmailSettings {
  dailyDigest: boolean;
  clientEvents: boolean;
}
