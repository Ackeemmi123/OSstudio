#!/usr/bin/env node
/**
 * Runs the image purge once, by hand: deletes from Storage the files of
 * images that were deleted or belonged to anonymised clients, and uploads
 * never checked within an hour, then forgets their rows. The same steps as
 * the daily /api/storage/purge (src/server/storage/purge.ts).
 *
 *   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=… npm run storage:purge
 *
 * The service role key stays in your shell. Prints counts only.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (the service role or secret key) in your shell.");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const report = { filesRemoved: 0, rowsForgotten: 0, rounds: 0 };
for (let round = 0; round < 20; round++) {
  const { data: due, error } = await db.rpc("site_assets_due_for_purge", { p_limit: 100 });
  if (error) throw new Error(`Could not list images to purge: ${error.message}`);
  if (!due.length) break;
  report.rounds++;
  const removed = await db.storage.from("site-assets").remove(due.map((row) => row.storage_path));
  if (removed.error) throw new Error(`Could not remove files: ${removed.error.message}`);
  report.filesRemoved += due.length;
  const forgotten = await db.rpc("forget_purged_site_assets", { p_ids: due.map((row) => row.id) });
  if (forgotten.error) throw new Error(`Could not forget rows: ${forgotten.error.message}`);
  report.rowsForgotten += Number(forgotten.data ?? 0);
  if (due.length < 100) break;
}
console.log(`Purged ${report.filesRemoved} file(s), forgot ${report.rowsForgotten} row(s) in ${report.rounds} round(s).`);
