import "server-only";

/**
 * Deletes image files from Storage that Studio OS no longer keeps: images a
 * person deleted, images of anonymised clients, and uploads never checked
 * within an hour. Storage refuses deletes from SQL, so the database only
 * marks them (the files are hidden at once) and this removes them through
 * the Storage API, then forgets the rows. Safe to run again: an already
 * removed file is simply not found.
 */
export interface PurgeSteps {
  /** site_assets_due_for_purge(limit): rows to purge, oldest first. */
  due(limit: number): Promise<{ id: string; storage_path: string }[]>;
  /** Storage remove; resolves when the files are gone (or were never there). */
  remove(paths: string[]): Promise<void>;
  /** forget_purged_site_assets(ids): how many rows were deleted. */
  forget(ids: string[]): Promise<number>;
}

export interface PurgeReport {
  filesRemoved: number;
  rowsForgotten: number;
  rounds: number;
}

export const PURGE_BATCH = 100;

export async function purgeSiteAssets(steps: PurgeSteps, maxRounds = 20): Promise<PurgeReport> {
  const report: PurgeReport = { filesRemoved: 0, rowsForgotten: 0, rounds: 0 };
  while (report.rounds < maxRounds) {
    const due = await steps.due(PURGE_BATCH);
    if (!due.length) break;
    report.rounds++;
    await steps.remove(due.map((row) => row.storage_path));
    report.filesRemoved += due.length;
    report.rowsForgotten += await steps.forget(due.map((row) => row.id));
    if (due.length < PURGE_BATCH) break;
  }
  return report;
}
