/**
 * Every function in the public schema (the API) fixes its search path, so no
 * caller can make it resolve a name to an object of their own. Supabase's
 * security advisor checks the same (function_search_path_mutable).
 */
import { describe, expect, it } from "vitest";
import { asDatabaseOwner } from "./helpers";

describe("function settings", () => {
  it("sets search_path on every public function Studio OS defines", async () => {
    const mutable = await asDatabaseOwner(async (db) =>
      (
        await db.query<{ name: string }>(
          `select p.oid::regprocedure::text as name
             from pg_proc p
            where p.pronamespace = 'public'::regnamespace
              and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
              and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
            order by 1`,
        )
      ).rows.map((r) => r.name),
    );
    expect(mutable).toEqual([]);
  });
});
