/**
 * Inquiry retention against a local Supabase stack: which inquiries are
 * anonymised after 12 months, that nothing else changes, that a run is safe
 * to retry, that only the database owner (and its daily schedule) can run
 * it, and that the schedule really executes.
 *
 * The aged rows are written directly as the database owner with dates in the
 * past, the way they will look a year from now. Every value is invented.
 */
import { randomUUID } from "node:crypto";
import type pg from "pg";
import { beforeAll, describe, expect, it } from "vitest";
import { addMember, admin, anonClient, asDatabaseOwner, createStudio, createUser, repositoryFor, type TestUser } from "./helpers";

let owner: TestUser;
let member: TestUser;
let studio: string;
let clientId: string;

/** Personal columns: cleared by anonymising. */
const PERSONAL = ["contact_name", "email", "company", "website", "message", "content_hash", "budget_amount_eur", "desired_date", "privacy_notice_version", "decision_reason"];

beforeAll(async () => {
  owner = await createUser("retention-owner");
  member = await createUser("retention-member");
  studio = await createStudio(owner, "Retention test");
  await addMember(owner, studio, member, "member", "Sam Member");
  const repository = repositoryFor(owner, studio);
  await repository.load();
  clientId = (await repository.createClient({ name: "Converted Client" })).id;
});

type Status = "new" | "approved" | "rejected" | "spam";

/** Writes one test inquiry received and (optionally) decided at the given ages, as Postgres intervals. */
async function aged(db: pg.Client, status: Status, received: string, decided: string | null = null): Promise<string> {
  const id = randomUUID();
  await db.query(
    `insert into public.inquiries (id, studio_id, source, submission_id, content_hash, status, is_test, locale, contact_name, email,
       company, website, service, budget_range, budget_amount_eur, desired_date, message, privacy_notice_version, submitted_at,
       received_at, decided_at, decided_by, decision_reason, client_id, created_client)
     values ($1::uuid, $2::uuid, 'axivo_website', gen_random_uuid(), repeat('a', 64), $3::text, true, 'sv', 'Maja Lind', $7::text,
       'Lumen Yoga (test)', 'lumen.example', 'websites', 'custom', 4500, '2026-01-15', 'Vi vill ha en ny webbplats med bokning.', 'v1',
       now() - $4::interval, now() - $4::interval, case when $5::interval is null then null else now() - $5::interval end,
       case when $3::text = 'new' then null else '{"kind":"human","name":"Owner"}'::jsonb end,
       case when $3::text = 'rejected' then 'Outside what we do (mentions Maja).' end,
       case when $3::text = 'approved' then $6::uuid end, $3::text = 'approved')`,
    [id, studio, status, received, decided, clientId, `maja-${id}@example.test`],
  );
  return id;
}

async function rows(db: pg.Client, ids: string[]): Promise<Record<string, Record<string, unknown>>> {
  const result = await db.query<{ id: string; row: Record<string, unknown> }>(
    "select id::text, to_jsonb(i) as row from public.inquiries i where id = any($1::uuid[])",
    [ids],
  );
  return Object.fromEntries(result.rows.map((r) => [r.id, r.row]));
}

async function run(db: pg.Client, dryRun = false) {
  const result = await db.query<{ report: { dryRun: boolean; anonymised: { id: string; status: string; isTest: boolean }[]; rateLimitsDeleted: number; skipped?: string } }>(
    "select private.run_inquiry_retention($1) as report",
    [dryRun],
  );
  return result.rows[0].report;
}

describe("the retention run", () => {
  it("lists in a dry run, then anonymises, only unconverted inquiries past 12 months; everything else stays identical", async () => {
    await asDatabaseOwner(async (db) => {
      const due = {
        rejected: await aged(db, "rejected", "13 months", "12 months 1 day"),
        spam: await aged(db, "spam", "12 months 2 days", "12 months 1 day"),
        undecided: await aged(db, "new", "12 months 1 day"),
      };
      const kept = {
        // The clock starts at the decision: received 13 months ago, rejected 11 months and 30 days ago.
        rejectedRecently: await aged(db, "rejected", "13 months", "12 months -1 day"),
        undecidedYoung: await aged(db, "new", "12 months -1 day"),
        approvedOld: await aged(db, "approved", "3 years", "3 years"),
      };
      const old = await db.query<{ id: number }>(
        `insert into public.inquiry_rate_limits (studio_id, ip_hash, created_at) values
           ($1, repeat('b', 64), now() - interval '25 hours'), ($1, repeat('c', 64), now() - interval '23 hours') returning id`,
        [studio],
      );
      const ids = [...Object.values(due), ...Object.values(kept)];
      const before = await rows(db, ids);

      // Dry run: names exactly the due inquiries, changes nothing.
      const preview = await run(db, true);
      expect(preview.dryRun).toBe(true);
      const listed = preview.anonymised.filter((i) => ids.includes(i.id));
      expect(listed.map((i) => i.id).sort()).toEqual(Object.values(due).sort());
      expect(listed.every((i) => i.isTest)).toBe(true);
      expect(preview.rateLimitsDeleted).toBeGreaterThanOrEqual(1);
      expect(await rows(db, ids)).toEqual(before);
      expect((await db.query("select count(*)::int as n from public.inquiry_rate_limits where id = any($1)", [old.rows.map((r) => r.id)])).rows[0].n).toBe(2);

      // Real run.
      const report = await run(db);
      expect(report.dryRun).toBe(false);
      expect(report.anonymised.filter((i) => ids.includes(i.id)).map((i) => i.id).sort()).toEqual(Object.values(due).sort());
      const after = await rows(db, ids);

      for (const id of Object.values(due)) {
        for (const column of PERSONAL) expect(after[id][column], `${column} of ${id}`).toBeNull();
        expect(after[id].email_normalized).toBeNull();
        expect(after[id].anonymised_at).not.toBeNull();
        // What is kept to count and audit stays as it was.
        const keep = (row: Record<string, unknown>) => Object.fromEntries(Object.entries(row).filter(([k]) => ![...PERSONAL, "email_normalized", "anonymised_at"].includes(k)));
        expect(keep(after[id])).toEqual(keep(before[id]));
      }
      for (const id of Object.values(kept)) expect(after[id]).toEqual(before[id]);

      const left = await db.query<{ created_at: Date }>("select created_at from public.inquiry_rate_limits where id = any($1)", [old.rows.map((r) => r.id)]);
      expect(left.rows).toHaveLength(1);
      expect(Date.now() - left.rows[0].created_at.getTime()).toBeLessThan(24 * 3600 * 1000);

      // Every run is recorded, with ids only.
      const recorded = await db.query<{ dry_run: boolean; anonymised: string[] }>("select dry_run, anonymised from private.inquiry_retention_runs order by id desc limit 2");
      expect(recorded.rows.map((r) => r.dry_run)).toEqual([false, true]);
      expect(recorded.rows[0].anonymised).toEqual(expect.arrayContaining(Object.values(due)));
    });
  });

  it("is safe to retry: a second run changes nothing and two runs never overlap", async () => {
    await asDatabaseOwner(async (db) => {
      const id = await aged(db, "spam", "2 years", "2 years");
      await run(db);
      const once = await rows(db, [id]);
      const again = await run(db);
      expect(again.anonymised.map((i) => i.id)).not.toContain(id);
      expect(await rows(db, [id])).toEqual(once);
      await expect(db.query("select private.anonymise_inquiry($1)", [id])).rejects.toThrow(/already anonymised/);

      // A run started while another holds the lock steps aside instead of waiting or doubling up.
      await asDatabaseOwner(async (other) => {
        await db.query("begin");
        await run(db, true);
        const second = await run(other, true);
        expect(second.skipped).toBe("another run is in progress");
        await db.query("commit");
      });
    });
  });

  it("never touches approved inquiries or young ones, except an erasure request by the owner", async () => {
    await asDatabaseOwner(async (db) => {
      const approved = await aged(db, "approved", "3 years", "3 years");
      const young = await aged(db, "rejected", "2 days", "1 day");
      await expect(db.query("select private.anonymise_inquiry($1, true)", [approved])).rejects.toThrow(/did not become clients/);
      await expect(db.query("select private.anonymise_inquiry($1)", [young])).rejects.toThrow(/within its 12 months/);
      await db.query("select private.anonymise_inquiry($1, true)", [young]);
      expect((await rows(db, [young]))[young].anonymised_at).not.toBeNull();

      // Even the owner cannot use anonymising to change anything else.
      const other = await aged(db, "spam", "2 years", "2 years");
      await expect(
        db.query(
          `begin; select set_config('studio_os.anonymising_inquiry', 'on', true);
           update public.inquiries set status = 'approved', contact_name = null, email = null, company = null, website = null,
             message = null, content_hash = null, budget_amount_eur = null, desired_date = null, privacy_notice_version = null
           where id = '${other}'; commit;`,
        ),
      ).rejects.toThrow(/only clears personal details/);
      await db.query("rollback");
    });
  });

  it("an anonymised inquiry disappears from the app and can no longer be decided", async () => {
    const id = await asDatabaseOwner(async (db) => {
      const undecided = await aged(db, "new", "13 months");
      await db.query("select private.anonymise_inquiry($1)", [undecided]);
      return undecided;
    });
    const repository = repositoryFor(member, studio);
    expect((await repository.load()).inquiries.map((i) => i.id)).not.toContain(id);
    const { error } = await member.client.rpc("decide_inquiry", {
      p_studio: studio, p_inquiry: id, p_decision: { status: "spam", decided_by: { kind: "human", name: "Sam Member", userId: member.id } }, p_changes: null, p_onboarding: null,
    });
    expect(error).toMatchObject({ code: "SO409", message: "This inquiry was anonymised and can no longer be decided." });
  });
});

describe("who can run it", () => {
  it("only the database owner: not visitors, signed-in people or the service role", async () => {
    const privileges = await asDatabaseOwner(async (db) =>
      (
        await db.query<{ fn: string; role: string; allowed: boolean }>(
          `select f as fn, r as role, has_function_privilege(r, f, 'execute') as allowed
             from unnest(array['private.run_inquiry_retention(boolean)', 'private.anonymise_inquiry(uuid, boolean)',
                               'private.inquiry_retention_ends(text, uuid, timestamptz, timestamptz)']) f,
                  unnest(array['anon', 'authenticated', 'service_role']) r`,
        )
      ).rows,
    );
    expect(privileges).toHaveLength(9);
    expect(privileges.filter((p) => p.allowed)).toEqual([]);

    const runs = await asDatabaseOwner(async (db) =>
      (await db.query<{ role: string; allowed: boolean }>(
        `select r as role, has_table_privilege(r, 'private.inquiry_retention_runs', 'select') as allowed from unnest(array['anon', 'authenticated', 'service_role']) r`,
      )).rows,
    );
    expect(runs.filter((r) => r.allowed)).toEqual([]);

    // Through the API: the private schema is not exposed, and nothing in public runs it.
    for (const client of [anonClient(), member.client, admin]) {
      const { error } = await client.schema("private").rpc("run_inquiry_retention", { p_dry_run: true });
      expect(error).not.toBeNull();
      const pub = await client.rpc("run_inquiry_retention", { p_dry_run: true });
      expect(pub.error).not.toBeNull();
    }
  });

  it("ordinary roles cannot reach the scheduler", async () => {
    const access = await asDatabaseOwner(async (db) =>
      (await db.query<{ role: string; allowed: boolean }>(
        `select r as role, has_schema_privilege(r, 'cron', 'usage') as allowed from unnest(array['anon', 'authenticated', 'service_role']) r`,
      )).rows,
    );
    expect(access.filter((a) => a.allowed)).toEqual([]);
  });
});

describe("the daily schedule", () => {
  it("is one active job, daily, run as the database owner", async () => {
    const jobs = await asDatabaseOwner(async (db) =>
      (await db.query("select schedule, command, username, active from cron.job where jobname = 'inquiry-retention'")).rows,
    );
    expect(jobs).toEqual([{ schedule: "17 3 * * *", command: "select private.run_inquiry_retention()", username: "postgres", active: true }]);
  });

  it("really executes through pg_cron", async () => {
    await asDatabaseOwner(async (db) => {
      const before = (await db.query<{ id: number }>("select coalesce(max(id), 0)::int as id from private.inquiry_retention_runs")).rows[0].id;
      // A temporary every-2-seconds job running the same function as a dry run.
      await db.query("select cron.schedule('inquiry-retention-test', '2 seconds', 'select private.run_inquiry_retention(true)')");
      try {
        let ran: { dry_run: boolean }[] = [];
        for (let i = 0; i < 20 && ran.length === 0; i++) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          ran = (await db.query("select dry_run from private.inquiry_retention_runs where id > $1", [before])).rows;
        }
        expect(ran.length).toBeGreaterThan(0);
        const details = await db.query(
          `select d.status from cron.job_run_details d join cron.job j on j.jobid = d.jobid where j.jobname = 'inquiry-retention-test' order by d.runid desc limit 1`,
        );
        expect(details.rows[0]?.status).toBe("succeeded");
      } finally {
        await db.query("select cron.unschedule('inquiry-retention-test')");
      }
    });
  }, 30_000);
});
