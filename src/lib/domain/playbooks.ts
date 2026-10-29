/**
 * Playbooks: the tasks a project of each type usually needs, offered when a
 * person starts a project. They are a starting list, not a plan: the person
 * unticks what does not apply, and nothing is created until they confirm.
 * Titles are generic on purpose, so no client detail is copied into tasks.
 */
import { PROJECT_STAGES, type ProjectStage, type ProjectType } from "./types";

export interface PlaybookTask {
  stage: ProjectStage;
  title: string;
}

const START: PlaybookTask[] = [
  { stage: "intake", title: "Kickoff call with the client" },
  { stage: "intake", title: "Confirm scope, budget and timeline in writing" },
  { stage: "discovery", title: "Collect logins and access (domain, hosting, analytics)" },
  { stage: "discovery", title: "Collect content and brand material" },
];

const BRAND: PlaybookTask[] = [
  { stage: "strategy", title: "Brand workshop" },
  { stage: "design", title: "Logo and identity direction" },
  { stage: "design", title: "Brand guidelines" },
];

const WEBSITE: PlaybookTask[] = [
  { stage: "strategy", title: "Sitemap and content structure" },
  { stage: "design", title: "Design direction" },
  { stage: "design", title: "Page designs" },
  { stage: "development", title: "Build pages" },
  { stage: "development", title: "Copy and images in place" },
  { stage: "development", title: "Forms, analytics and SEO basics" },
];

const STORE: PlaybookTask[] = [
  { stage: "discovery", title: "Product data import template" },
  { stage: "development", title: "Store configuration" },
  { stage: "development", title: "Payment and shipping setup" },
  { stage: "development", title: "Product and collection pages" },
  { stage: "review", title: "Test orders through checkout" },
];

const FINISH: PlaybookTask[] = [
  { stage: "review", title: "Review with the client" },
  { stage: "launch", title: "Launch checklist" },
  { stage: "launch", title: "Launch and handover" },
];

/** Combined lists are put in stage order, keeping each part's own order within a stage. */
function inStageOrder(...parts: PlaybookTask[][]): PlaybookTask[] {
  return parts.flat().sort((a, b) => PROJECT_STAGES.indexOf(a.stage) - PROJECT_STAGES.indexOf(b.stage));
}

export const PLAYBOOKS: Record<ProjectType, PlaybookTask[]> = {
  website: inStageOrder(START, WEBSITE, FINISH),
  ecommerce: inStageOrder(START, STORE, FINISH),
  website_ecommerce: inStageOrder(START, WEBSITE, STORE, FINISH),
  brand_website: inStageOrder(START, BRAND, WEBSITE, FINISH),
  other: inStageOrder(START, [{ stage: "review", title: "Review with the client" }]),
};

/** At most this many tasks are created with a project. */
export const PLAYBOOK_MAX_TASKS = 40;

/** The task added for a client's open questions. Generic, so no question text is copied into it. */
export function openQuestionsTaskTitle(count: number): string {
  return count === 1 ? "Ask the client the open question" : `Ask the client the ${count} open questions`;
}
