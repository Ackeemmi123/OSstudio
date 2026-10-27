import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { SupabaseRepository } from "@/lib/data/supabase-repository";
import { isLocalUrl, stagingEnv } from "../../scripts/staging-env.mjs";

/**
 * The staging smoke test: one real pass through Studio OS against a hosted
 * Supabase project and, when STAGING_APP_URL is set, the deployed app and the
 * real model provider.
 *
 * It writes to the project: one studio named "Smoke test …" and one client,
 * plus, when it has the service role key, three throwaway accounts
 * (staging-smoke+…@example.com). Without that key it signs in to three
 * existing test accounts instead (STAGING_SMOKE_*_EMAIL and their passwords),
 * which need no Studio OS role: the owner account creates the studio and
 * adds the viewer itself, and the outsider is never added.
 * It deletes nothing. Run it only against a dedicated staging project:
 * `npm run staging:smoke`.
 */
const config = stagingEnv();
const accounts = config.smokeAccounts;
const allowTestProvider = process.env.STAGING_SMOKE_ALLOW_TEST_PROVIDER === "1" && isLocalUrl(config.url);
const run = `${new Date().toISOString().slice(0, 16).replace(/\D/g, "")}-${Math.random().toString(36).slice(2, 6)}`;
const password = `smoke-${crypto.randomUUID()}`;
const options = { auth: { persistSession: false, autoRefreshToken: false } };

/** Made-up client material. The labeled lines give any provider something to quote. */
const EMAIL = [
  "Hi Axivo team,",
  "",
  "We run a small chain of yoga studios in Gothenburg and want a new website where members can book classes.",
  "Budget: 80 000 SEK",
  "Deadline: the site should be live before 1 March 2027",
  "Most of our members are working adults between 25 and 45.",
  "",
  "Best regards,",
  "Anna Berg, Lumen Yoga",
].join("\n");

interface Person {
  id: string;
  email: string;
  client: SupabaseClient;
}

const admin = () => createClient(config.url!, config.serviceKey!, options);

/** A new throwaway account (with the service role key), or an existing test account. */
async function person(role: "owner" | "viewer" | "outsider"): Promise<Person> {
  let email = accounts[role];
  let secret = accounts[`${role}Password`];
  if (config.serviceKey) {
    email = `staging-smoke+${run}-${role}@example.com`;
    secret = password;
    const created = await admin().auth.admin.createUser({ email, password: secret, email_confirm: true });
    if (created.error) throw created.error;
  }
  const client = createClient(config.url!, config.anonKey!, options);
  const signIn = await client.auth.signInWithPassword({ email: email!, password: secret! });
  if (signIn.error) throw new Error(`The ${role} test account could not sign in: ${signIn.error.message}`);
  return { id: signIn.data.user.id, email: email!, client };
}

async function token(who: Person) {
  return (await who.client.auth.getSession()).data.session!.access_token;
}

describe(`staging smoke ${run}`, () => {
  let owner: Person;
  let viewer: Person;
  let outsider: Person;
  let studioId: string;
  let clientId: string;
  let repo: SupabaseRepository;

  beforeAll(() => {
    if (process.env.STAGING_SMOKE !== "1") throw new Error("Set STAGING_SMOKE=1 to confirm this may write test data to the staging project.");
    if (!config.url || !config.anonKey) throw new Error("STAGING_SUPABASE_URL and STAGING_SUPABASE_ANON_KEY must be set. See docs/staging.md.");
    if (!config.serviceKey) {
      const { owner, viewer, outsider, ownerPassword, viewerPassword, outsiderPassword } = accounts;
      if (!(owner && viewer && outsider && ownerPassword && viewerPassword && outsiderPassword)) {
        throw new Error("Set STAGING_SUPABASE_SERVICE_ROLE_KEY, or the three STAGING_SMOKE_*_EMAIL test accounts and their passwords. See docs/staging.md.");
      }
      if (new Set([owner, viewer, outsider].map((email) => email.toLowerCase())).size < 3) {
        throw new Error("The owner, viewer and outsider test accounts must be three different accounts.");
      }
    }
  });

  it("signs in the owner, viewer and outsider, and the owner creates a studio and adds the viewer", async () => {
    [owner, viewer, outsider] = await Promise.all([person("owner"), person("viewer"), person("outsider")]);
    const created = await owner.client.rpc("create_studio", { p_name: `Smoke test ${run}`, p_display_name: "Smoke owner" });
    expect(created.error).toBeNull();
    studioId = created.data as string;
    expect((await owner.client.rpc("load_studio", { p_studio: studioId })).data).toMatchObject({ role: "owner" });
    const added = await owner.client.rpc("add_studio_member", { p_studio: studioId, p_email: viewer.email, p_display_name: "Smoke viewer", p_role: "viewer" });
    expect(added.error).toBeNull();
    expect((await viewer.client.rpc("load_studio", { p_studio: studioId })).data).toMatchObject({ role: "viewer" });
  });

  it("stores a client and its source material through the app's repository", async () => {
    repo = new SupabaseRepository({
      client: owner.client,
      studioId,
      user: { id: owner.id, email: owner.email },
      agentEndpoint: config.appUrl ? `${config.appUrl}/api/agents/intake` : undefined,
    });
    await repo.load();
    expect(repo.info).toMatchObject({ kind: "supabase", role: "owner" });
    const client = await repo.createClient({ name: `Lumen Yoga ${run}`, contactPerson: "Anna Berg" });
    clientId = client.id;
    await repo.addSource(clientId, { type: "email", label: "Email from Anna", content: EMAIL });

    const fresh = await repo.load();
    expect(fresh.clients.find((c) => c.id === clientId)?.name).toBe(`Lumen Yoga ${run}`);
    expect(fresh.sources.filter((s) => s.clientId === clientId)).toHaveLength(1);
  });

  it("keeps the studio private to its members", async () => {
    const anon = createClient(config.url!, config.anonKey!, options);
    const anonRead = await anon.from("clients").select("id").eq("id", clientId);
    expect(anonRead.data ?? []).toHaveLength(0);

    const outsiderRead = await outsider.client.from("clients").select("id").eq("id", clientId);
    expect(outsiderRead.error).toBeNull();
    expect(outsiderRead.data).toHaveLength(0);
    const outsiderLoad = await outsider.client.rpc("load_studio", { p_studio: studioId });
    expect(outsiderLoad.error?.code).toBe("42501");

    const viewerRead = await viewer.client.from("clients").select("id").eq("id", clientId);
    expect(viewerRead.data).toHaveLength(1);
    const viewerWrite = await viewer.client.from("clients").update({ name: "Changed by a viewer" }).eq("id", clientId).select();
    expect(viewerWrite.error !== null || (viewerWrite.data ?? []).length === 0).toBe(true);
  });

  it.skipIf(!config.serviceKey)("refuses to confirm a client fact for anyone but a signed-in person", async () => {
    const attempt = await admin()
      .from("client_context_fields")
      .update({ value: "Made up", confidence: "confirmed" })
      .eq("studio_id", studioId)
      .eq("client_id", clientId)
      .eq("field_key", "goal");
    expect(attempt.error?.code).toBe("42501");
  });

  describe.skipIf(!config.appUrl)("the deployed app and the intake agent", () => {
    it("reports a real model provider", async () => {
      const response = await fetch(`${config.appUrl}/api/agents/status`);
      expect(response.status).toBe(200);
      const { intake } = (await response.json()) as { intake: { available: boolean; provider: string | null; test: boolean; reason: string | null } };
      expect(intake.reason).toBeNull();
      expect(intake.available).toBe(true);
      if (!allowTestProvider) {
        expect(intake.test).toBe(false);
        expect(intake.provider).toBe("anthropic");
      }
    });

    it("refuses viewers and people outside the studio", async () => {
      const post = async (who: Person) =>
        fetch(`${config.appUrl}/api/agents/intake`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${await token(who)}` },
          body: JSON.stringify({ studioId, clientId }),
        });
      expect((await post(viewer)).status).toBe(403);
      expect((await post(outsider)).status).toBe(404);
    });

    it("turns the source material into proposals that quote it, without changing the brief", { timeout: 150_000 }, async () => {
      const result = await repo.requestIntakeAnalysis(clientId);
      expect(result.error).toBeNull();
      expect(["needs_approval", "succeeded"]).toContain(result.status);
      if (!allowTestProvider) expect(result.runner).toBe("anthropic");

      const snapshot = await repo.load();
      const proposals = snapshot.proposals.filter((p) => p.runId === result.id);
      expect(proposals.length).toBeGreaterThan(0);
      for (const proposal of proposals) {
        expect(proposal.status).toBe("pending");
        expect(proposal.evidence.length).toBeGreaterThan(0);
        for (const evidence of proposal.evidence) {
          const source = evidence.sourceId.startsWith("initial-notes-") ? "" : snapshot.sources.find((s) => s.id === evidence.sourceId)?.content;
          expect(source).toContain(evidence.quote);
        }
      }
      // Nothing reached the brief yet.
      const client = snapshot.clients.find((c) => c.id === clientId)!;
      for (const field of Object.values(client.context)) expect(field.confidence).not.toBe("confirmed");
      expect(client.context.budget.value).toBeNull();
    });

    it("reuses the run for unchanged material", async () => {
      const again = await repo.requestIntakeAnalysis(clientId);
      const latest = (await repo.load()).agentRuns.filter((r) => r.clientId === clientId);
      expect(latest).toHaveLength(1);
      expect(again.id).toBe(latest[0].id);
    });

    it("adds an accepted proposal to the brief as observed, not confirmed", async () => {
      const snapshot = await repo.load();
      const proposal = snapshot.proposals.find((p) => p.clientId === clientId && p.status === "pending" && p.target !== "companyName")!;
      expect(proposal).toBeDefined();
      await repo.reviewProposal(proposal.id, { action: "accept", confidence: "observed" });

      const after = await repo.load();
      expect(after.proposals.find((p) => p.id === proposal.id)?.status).toBe("accepted");
      const client = after.clients.find((c) => c.id === clientId)!;
      const field = (client.context as Record<string, { value: string | null; confidence: string }>)[proposal.target];
      if (field) {
        expect(field.value).toBe(proposal.value);
        expect(field.confidence).toBe("observed");
      }
    });
  });
});
