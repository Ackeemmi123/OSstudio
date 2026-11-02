/**
 * The tabs of a client's page. The address holds the tab, so a reload, the
 * back button and shared links land in the right place, and a link to a task
 * or a brief value opens the tab it lives on.
 */
export const CLIENT_TABS = ["overview", "projects", "brief", "sources", "activity"] as const;
export type ClientTab = (typeof CLIENT_TABS)[number];

export const CLIENT_TAB_LABELS: Record<ClientTab, string> = {
  overview: "Overview",
  projects: "Projects",
  brief: "Brief",
  sources: "Sources",
  activity: "Activity",
};

/** The tab a location hash ("#task-1", "#brief") belongs to. Anything else is the overview. */
export function tabForHash(hash: string): ClientTab {
  const id = hash.replace(/^#/, "");
  if (id === "projects" || id === "new-project" || id.startsWith("project-") || id.startsWith("task-")) return "projects";
  if (id === "brief" || id.startsWith("brief-")) return "brief";
  if (id === "sources" || id === "analysis") return "sources";
  if (id === "activity" || id === "retention") return "activity";
  return "overview";
}

/** The hash points inside a tab, rather than at the tab itself, so the page should scroll to it. */
export function hashTarget(hash: string): string | null {
  const id = decodeURIComponent(hash.replace(/^#/, ""));
  return id && !(CLIENT_TABS as readonly string[]).includes(id) && id !== "new-project" ? id : null;
}
