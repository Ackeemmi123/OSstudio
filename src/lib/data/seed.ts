/**
 * Demonstration data. Every record is flagged with `isDemo: true` and the UI
 * labels it as example data. Timestamps are generated relative to the moment
 * the demo workspace is first created so that "2 hours ago" stays meaningful.
 */
import {
  CONTEXT_FIELD_KEYS,
  type ActivityEvent,
  type Client,
  type ClientContext,
  type ContextField,
  type FieldConfidence,
  type ISODateString,
  type Onboarding,
  type Project,
  type SourceReference,
  type StudioSnapshot,
  type Task,
} from "@/lib/domain/types";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export function createSeedSnapshot(nowMs: number = Date.now()): StudioSnapshot {
  const ago = (ms: number): ISODateString => new Date(nowMs - ms).toISOString();
  const inDays = (days: number): string => new Date(nowMs + days * DAY).toISOString().slice(0, 10);

  const field = (
    value: string | null,
    confidence: FieldConfidence,
    updatedAt: ISODateString,
    source?: SourceReference,
    note?: string,
  ): ContextField =>
    value === null
      ? { value: null, confidence: "unknown", updatedAt }
      : { value, confidence, updatedAt, source, note };

  const unknownContext = (at: ISODateString): ClientContext =>
    Object.fromEntries(CONTEXT_FIELD_KEYS.map((key) => [key, field(null, "unknown", at)])) as ClientContext;

  /* ---------------------------------------------------------------------- */
  /* Clients                                                                */
  /* ---------------------------------------------------------------------- */

  const henrikKickoff: SourceReference = { type: "meeting", label: "Kickoff meeting notes" };
  const henrikEmail: SourceReference = { type: "email", label: "Intro email from Henrik" };

  const clients: Client[] = [
    {
      id: "demo-atelje-henrik",
      name: "Ateljé Henrik",
      contactPerson: "Henrik Ström",
      email: "henrik@ateljehenrik.se",
      website: "ateljehenrik.se",
      status: "active",
      projectType: "website_ecommerce",
      source: {
        type: "email",
        initialNotes:
          "Henrik runs a small furniture and interior atelier in Gothenburg. Wants a new website with a shop for limited-edition pieces. Current site is a single page with no ordering.",
        receivedAt: ago(34 * DAY),
      },
      context: {
        ...unknownContext(ago(34 * DAY)),
        industry: field("Furniture and interior atelier", "confirmed", ago(26 * DAY), henrikKickoff),
        salesChannels: field("Not selling online yet", "observed", ago(34 * DAY), henrikEmail, "The current site is a single page with no ordering."),
        goal: field(
          "Sell limited-edition pieces online and present the atelier's craft to architects and private buyers.",
          "confirmed",
          ago(26 * DAY),
          henrikKickoff,
          "Confirmed by Henrik during kickoff.",
        ),
        targetAudience: field(
          "Interior architects and design-conscious private buyers in Scandinavia.",
          "observed",
          ago(26 * DAY),
          henrikKickoff,
          "Mentioned in kickoff; not yet confirmed in writing.",
        ),
        requirements: field(
          "Product catalogue with variants, editorial project pages, Swedish and English, newsletter sign-up.",
          "confirmed",
          ago(20 * DAY),
          { type: "document", label: "Signed scope document" },
        ),
        budget: {
          ...field("SEK 280,000", "confirmed", ago(20 * DAY), { type: "document", label: "Signed scope document" }),
          history: [{ value: "SEK 220,000–250,000", confidence: "observed", supersededAt: ago(20 * DAY) }],
        },
        deadline: {
          ...field(
            inDays(68),
            "proposed",
            ago(6 * DAY),
            { type: "manual", label: "Production plan draft" },
            "Proposed by the team to align with the spring collection. Awaiting Henrik's confirmation.",
          ),
          recordedBy: { kind: "human", name: "Alex" },
        },
        platform: field(
          "Shopify for commerce, headless front end. Existing Fortnox accounting must remain.",
          "observed",
          ago(18 * DAY),
          henrikEmail,
        ),
      },
      contextItems: [
        {
          id: "demo-ci-1",
          kind: "question",
          text: "Who will produce the product photography, and when will it be ready?",
          confidence: "unknown",
          createdAt: ago(9 * DAY),
        },
        {
          id: "demo-ci-2",
          kind: "assumption",
          text: "Shipping is limited to the Nordics at launch.",
          confidence: "proposed",
          createdAt: ago(12 * DAY),
        },
        {
          id: "demo-ci-3",
          kind: "question",
          text: "Should custom commissions be requested through the shop or a separate inquiry form?",
          confidence: "unknown",
          createdAt: ago(4 * DAY),
        },
      ],
      isDemo: true,
      createdAt: ago(34 * DAY),
      updatedAt: ago(6 * DAY),
    },
    {
      id: "demo-nordvik",
      name: "Nordvik Arkitekter",
      contactPerson: "Elin Nordvik",
      email: "elin@nordvikarkitekter.no",
      website: "nordvikarkitekter.no",
      status: "onboarding",
      projectType: "brand_website",
      source: {
        type: "referral",
        initialNotes: "Referred by Ateljé Henrik. Small architecture practice in Bergen preparing a rebrand.",
        receivedAt: ago(9 * DAY),
      },
      context: {
        ...unknownContext(ago(9 * DAY)),
        goal: field(
          "Reposition the practice toward public and cultural commissions.",
          "observed",
          ago(5 * DAY),
          { type: "meeting", label: "Intro call" },
        ),
        deadline: field(
          "Before the competition season in spring",
          "observed",
          ago(5 * DAY),
          { type: "meeting", label: "Intro call" },
          "Not a fixed date yet.",
        ),
      },
      contextItems: [
        {
          id: "demo-ci-4",
          kind: "question",
          text: "Is the rebrand limited to the identity, or does it include signage and print?",
          confidence: "unknown",
          createdAt: ago(5 * DAY),
        },
      ],
      isDemo: true,
      createdAt: ago(9 * DAY),
      updatedAt: ago(5 * DAY),
    },
    {
      id: "demo-solberg",
      name: "Solberg Coffee Roasters",
      contactPerson: "Jonas Solberg",
      email: "jonas@solbergcoffee.com",
      website: "solbergcoffee.com",
      status: "active",
      projectType: "ecommerce",
      source: { type: "contact_form", initialNotes: null, receivedAt: ago(61 * DAY) },
      context: {
        ...unknownContext(ago(61 * DAY)),
        salesChannels: field("Shopify", "confirmed", ago(55 * DAY), { type: "meeting", label: "Discovery workshop" }),
        storeUrl: field("solbergcoffee.com", "confirmed", ago(55 * DAY), { type: "meeting", label: "Discovery workshop" }),
        goal: field("Launch subscriptions and grow direct online sales.", "confirmed", ago(55 * DAY), {
          type: "meeting",
          label: "Discovery workshop",
        }),
        targetAudience: field("Home brewers and specialty cafés.", "confirmed", ago(55 * DAY), {
          type: "meeting",
          label: "Discovery workshop",
        }),
        requirements: field(
          "Subscription checkout, wholesale price lists behind login, roast calendar.",
          "confirmed",
          ago(48 * DAY),
          { type: "document", label: "Requirements sign-off" },
        ),
        budget: field("SEK 190,000", "confirmed", ago(48 * DAY), { type: "document", label: "Requirements sign-off" }),
        deadline: field(inDays(21), "confirmed", ago(48 * DAY), { type: "document", label: "Requirements sign-off" }),
        platform: field("Shopify with a subscription app.", "confirmed", ago(40 * DAY), {
          type: "meeting",
          label: "Technical review",
        }),
      },
      contextItems: [],
      isDemo: true,
      createdAt: ago(61 * DAY),
      updatedAt: ago(2 * DAY),
    },
    {
      id: "demo-lumen",
      name: "Lumen Dental Studio",
      contactPerson: null,
      email: null,
      website: "lumendental.se",
      status: "lead",
      projectType: "website",
      source: {
        type: "contact_form",
        initialNotes: "Form message: \"We need a calmer, more modern website. Can you send a rough price?\"",
        receivedAt: ago(20 * HOUR),
      },
      context: unknownContext(ago(20 * HOUR)),
      contextItems: [],
      isDemo: true,
      createdAt: ago(20 * HOUR),
      updatedAt: ago(20 * HOUR),
    },
    {
      id: "demo-fjallgard",
      name: "Fjällgård Hotel",
      contactPerson: "Maria Ek",
      email: "maria.ek@fjallgard.se",
      website: null,
      status: "on_hold",
      projectType: "brand_website",
      source: { type: "phone", initialNotes: "Mountain hotel reopening after renovation.", receivedAt: ago(80 * DAY) },
      context: {
        ...unknownContext(ago(80 * DAY)),
        goal: field("Relaunch the hotel with a new identity after renovation.", "confirmed", ago(70 * DAY), {
          type: "meeting",
          label: "Strategy session",
        }),
        budget: field("SEK 320,000", "observed", ago(70 * DAY), { type: "phone", label: "Call with Maria" }),
        deadline: {
          ...field("Paused until the owners confirm the reopening date.", "confirmed", ago(15 * DAY), {
            type: "email",
            label: "Email from Maria",
          }),
          history: [{ value: "December reopening", confidence: "confirmed", supersededAt: ago(15 * DAY) }],
        },
      },
      contextItems: [],
      isDemo: true,
      createdAt: ago(80 * DAY),
      updatedAt: ago(15 * DAY),
    },
    {
      id: "demo-kontur",
      name: "Kontur Studio",
      contactPerson: "Alva Berg",
      email: "alva@konturstudio.se",
      website: "konturstudio.se",
      status: "archived",
      projectType: "website",
      source: { type: "referral", initialNotes: null, receivedAt: ago(160 * DAY) },
      context: {
        ...unknownContext(ago(160 * DAY)),
        goal: field("Portfolio site for a small landscape practice.", "confirmed", ago(150 * DAY)),
        budget: field("SEK 95,000", "confirmed", ago(150 * DAY)),
        deadline: field("Launched", "confirmed", ago(40 * DAY)),
      },
      contextItems: [],
      isDemo: true,
      createdAt: ago(160 * DAY),
      updatedAt: ago(40 * DAY),
    },
  ];

  /* ---------------------------------------------------------------------- */
  /* Projects                                                               */
  /* ---------------------------------------------------------------------- */

  const projects: Project[] = [
    {
      id: "demo-p-henrik",
      clientId: "demo-atelje-henrik",
      name: "Website & E-commerce",
      projectType: "website_ecommerce",
      status: "active",
      stage: "design",
      isDemo: true,
      createdAt: ago(26 * DAY),
      updatedAt: ago(1 * DAY),
    },
    {
      id: "demo-p-nordvik",
      clientId: "demo-nordvik",
      name: "Identity & Website",
      projectType: "brand_website",
      status: "active",
      stage: "discovery",
      isDemo: true,
      createdAt: ago(5 * DAY),
      updatedAt: ago(5 * DAY),
    },
    {
      id: "demo-p-solberg",
      clientId: "demo-solberg",
      name: "Subscription Shop",
      projectType: "ecommerce",
      status: "active",
      stage: "development",
      isDemo: true,
      createdAt: ago(55 * DAY),
      updatedAt: ago(2 * DAY),
    },
    {
      id: "demo-p-fjallgard",
      clientId: "demo-fjallgard",
      name: "Reopening Brand & Website",
      projectType: "brand_website",
      status: "on_hold",
      stage: "strategy",
      isDemo: true,
      createdAt: ago(70 * DAY),
      updatedAt: ago(15 * DAY),
    },
    {
      id: "demo-p-kontur",
      clientId: "demo-kontur",
      name: "Portfolio Website",
      projectType: "website",
      status: "completed",
      stage: "launch",
      isDemo: true,
      createdAt: ago(150 * DAY),
      updatedAt: ago(40 * DAY),
    },
  ];

  /* ---------------------------------------------------------------------- */
  /* Tasks                                                                  */
  /* ---------------------------------------------------------------------- */

  const task = (
    id: string,
    projectId: string,
    title: string,
    status: Task["status"],
    assignedTo: string | null,
    createdDaysAgo: number,
    updatedAgoMs: number,
    extra: Partial<Task> = {},
  ): Task => ({
    id,
    projectId,
    title,
    status,
    assignee: assignedTo ? { kind: "human", name: assignedTo } : null,
    isDemo: true,
    createdAt: ago(createdDaysAgo * DAY),
    updatedAt: ago(updatedAgoMs),
    ...extra,
  });

  const tasks: Task[] = [
    task("demo-t-1", "demo-p-henrik", "Moodboard and visual direction", "done", "Sara", 24, 16 * DAY),
    task("demo-t-2", "demo-p-henrik", "Sitemap and content structure", "done", "Sara", 22, 12 * DAY),
    task("demo-t-3", "demo-p-henrik", "Homepage design direction", "awaiting_approval", "Sara", 10, 1 * DAY),
    task("demo-t-4", "demo-p-henrik", "Product page design", "in_progress", "Sara", 8, 5 * HOUR),
    task("demo-t-5", "demo-p-henrik", "Product data import template", "blocked", "Oskar", 7, 2 * DAY, {
      blockedReason: "Waiting for the product list and photography from Henrik.",
    }),
    task("demo-t-6", "demo-p-henrik", "Shopify store configuration", "todo", "Oskar", 7, 7 * DAY),
    task("demo-t-7", "demo-p-henrik", "Copywriting for About and Process pages", "todo", null, 6, 6 * DAY),
    task("demo-t-8", "demo-p-nordvik", "Discovery workshop agenda", "in_review", "Alex", 4, 3 * HOUR),
    task("demo-t-9", "demo-p-nordvik", "Competitor and reference review", "in_progress", "Sara", 4, 1 * DAY),
    task("demo-t-10", "demo-p-solberg", "Subscription checkout flow", "in_review", "Oskar", 30, 4 * HOUR),
    task("demo-t-11", "demo-p-solberg", "Wholesale login and price lists", "in_progress", "Oskar", 25, 2 * DAY),
    task("demo-t-12", "demo-p-solberg", "Roast calendar component", "done", "Oskar", 25, 9 * DAY),
    task("demo-t-13", "demo-p-solberg", "Launch checklist and QA plan", "todo", "Alex", 10, 10 * DAY),
    task("demo-t-14", "demo-p-fjallgard", "Brand strategy presentation", "done", "Alex", 60, 30 * DAY),
    task("demo-t-15", "demo-p-kontur", "Launch and handover", "done", "Alex", 60, 40 * DAY),
  ];

  /* ---------------------------------------------------------------------- */
  /* Activity                                                               */
  /* ---------------------------------------------------------------------- */

  let n = 0;
  const event = (
    entityType: ActivityEvent["entityType"],
    entityId: string,
    eventType: ActivityEvent["eventType"],
    description: string,
    agoMs: number,
    actor?: string,
  ): ActivityEvent => ({
    id: `demo-e-${++n}`,
    entityType,
    entityId,
    eventType,
    description,
    actor: actor ? { kind: "human", name: actor } : undefined,
    timestamp: ago(agoMs),
  });

  const activity: ActivityEvent[] = [
    event("task", "demo-t-8", "task.status_changed", "Discovery workshop agenda moved to review", 3 * HOUR, "Alex"),
    event("task", "demo-t-10", "task.status_changed", "Subscription checkout flow moved to review", 4 * HOUR, "Oskar"),
    event("task", "demo-t-4", "task.status_changed", "Started product page design", 5 * HOUR, "Sara"),
    event("client", "demo-lumen", "client.created", "New inquiry received through the contact form", 20 * HOUR),
    event("task", "demo-t-3", "task.status_changed", "Homepage design direction sent to Henrik for approval", 1 * DAY, "Sara"),
    event("project", "demo-p-henrik", "project.stage_changed", "Project moved to Design", 1 * DAY + 2 * HOUR, "Alex"),
    event("task", "demo-t-5", "task.status_changed", "Product data import blocked: product list not received", 2 * DAY, "Oskar"),
    event("project", "demo-p-solberg", "note.added", "Wholesale pricing rules clarified with Jonas", 2 * DAY + 3 * HOUR, "Oskar"),
    event("project", "demo-p-nordvik", "project.created", "Identity & Website project created", 5 * DAY, "Alex"),
    event("client", "demo-nordvik", "client.context_updated", "Onboarding: added goal and deadline", 5 * DAY, "Alex"),
    event("client", "demo-nordvik", "onboarding.started", "Started guided onboarding", 5 * DAY + HOUR, "Alex"),
    event("client", "demo-atelje-henrik", "client.updated", "Proposed launch date added to deadline", 6 * DAY, "Alex"),
    event("client", "demo-nordvik", "client.created", "Client record created from referral", 9 * DAY, "Alex"),
    event("client", "demo-fjallgard", "client.status_changed", "Paused at the client's request", 15 * DAY, "Alex"),
    event("client", "demo-atelje-henrik", "client.updated", "Budget confirmed in signed scope document", 20 * DAY, "Alex"),
    event("project", "demo-p-henrik", "project.created", "Website & E-commerce project created", 26 * DAY, "Alex"),
    event("client", "demo-atelje-henrik", "client.created", "Client record created from intro email", 34 * DAY, "Alex"),
    event("project", "demo-p-kontur", "project.stage_changed", "Portfolio Website launched", 40 * DAY, "Alex"),
  ];

  /* ---------------------------------------------------------------------- */
  /* Onboarding                                                             */
  /* ---------------------------------------------------------------------- */

  // Nordvik's onboarding was left halfway, so the demo shows how to resume one.
  const onboardings: Onboarding[] = [
    {
      id: "demo-onboarding-nordvik",
      clientId: "demo-nordvik",
      projectId: null,
      status: "in_progress",
      currentStep: "scope",
      skipped: ["industry"],
      createdAt: ago(5 * DAY + HOUR),
      updatedAt: ago(5 * DAY),
      completedAt: null,
    },
  ];

  return { clients, projects, tasks, activity, sources: [], agentRuns: [], proposals: [], onboardings };
}
