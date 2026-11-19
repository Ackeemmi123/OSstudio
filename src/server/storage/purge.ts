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

/**
 * Files queued in storage_purge_queue: a client's own files and site
 * documents a person deleted, and everything of an anonymised client,
 * including whole built sites (a folder each). Same shape as the image
 * purge: remove through the Storage API, then forget the queue rows.
 */
export interface QueuedPurgeSteps {
  /** storage_files_due_for_purge(limit). */
  due(limit: number): Promise<{ id: number; bucket: string; path: string; is_prefix: boolean }[]>;
  /** Every file under a folder, at any depth. */
  list(bucket: string, prefix: string): Promise<string[]>;
  remove(bucket: string, paths: string[]): Promise<void>;
  /** forget_purged_storage_files(ids). */
  forget(ids: number[]): Promise<number>;
}

export async function purgeQueuedFiles(steps: QueuedPurgeSteps, maxRounds = 20): Promise<PurgeReport> {
  const report: PurgeReport = { filesRemoved: 0, rowsForgotten: 0, rounds: 0 };
  while (report.rounds < maxRounds) {
    const due = await steps.due(PURGE_BATCH);
    if (!due.length) break;
    report.rounds++;
    for (const row of due) {
      const paths = row.is_prefix ? await steps.list(row.bucket, row.path) : [row.path];
      for (let i = 0; i < paths.length; i += PURGE_BATCH) await steps.remove(row.bucket, paths.slice(i, i + PURGE_BATCH));
      report.filesRemoved += paths.length;
    }
    report.rowsForgotten += await steps.forget(due.map((row) => row.id));
    if (due.length < PURGE_BATCH) break;
  }
  return report;
}
