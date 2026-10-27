import { getBrowserStorage, LocalDemoRepository } from "./local-repository";
import type { StudioRepository } from "./repository";

/**
 * The one place that decides where workspace data lives. Today that is always
 * the browser. When a real backend exists, choose it here (behind sign-in) and
 * nothing else in the UI needs to change. See docs/persistence.md.
 */
export function createRepository(): StudioRepository {
  return new LocalDemoRepository({ storage: getBrowserStorage() });
}
