import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { SupabaseRepository } from "@/lib/data/supabase-repository";
import { localSupabase, saveFixtures, type Fixture, type SeedUser } from "./supabase";

/**
 * Seeds the local Supabase stack:
 * - for each spec file, its own studio A with an owner, a member and a viewer;
 * - one studio B with its own owner and one client, which no studio A may see.
 *
 * Own studios keep each spec's data small. load_studio's time grows with the
 * studio's clients and activity, and every page load and write waits for it:
 * in one shared studio it reached about 3 s by the end of a run, which alone
 * took the later tests past their time limits.
 *
 * Emails are unique per run, so the stack does not need resetting between runs.
 */
export default async function globalSetup() {
  const { url, anonKey, serviceKey } = localSupabase();
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const run = Date.now().toString(36);

  async function user(role: string, name: string): Promise<SeedUser> {
    const email = `${role}-${run}@e2e.studio-os.test`;
    const password = `e2e-${run}-password`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    return { id: data.user.id, email, password, name };
  }

  async function as(person: SeedUser) {
    const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await client.auth.signInWithPassword({ email: person.email, password: person.password });
    if (error) throw error;
    return client;
  }

  const outsider = await user("outsider", "Bo Outsider");
  const outsiderClient = await as(outsider);
  const studioB = await rpc<string>(outsiderClient.rpc("create_studio", { p_name: `Other studio ${run}`, p_display_name: outsider.name }));
  const repository = new SupabaseRepository({ client: outsiderClient, studioId: studioB, user: { id: outsider.id, email: outsider.email } });
  await repository.load();
  const foreign = await repository.createClient({ name: "Confidential Client B", initialNotes: "Studio B only" });
  const foreignClientId = foreign.id;

  const fixtures: Record<string, Fixture> = {};
  const specs = readdirSync(__dirname).filter((file) => file.endsWith(".spec.ts") && readFileSync(path.join(__dirname, file), "utf8").includes("fixture()"));
  for (const spec of specs) {
    const slug = spec.replace(".spec.ts", "");
    const [owner, member, viewer] = await Promise.all([
      user(`owner-${slug}`, "Alex Owner"),
      user(`member-${slug}`, "Sam Member"),
      user(`viewer-${slug}`, "Vera Viewer"),
    ]);
    const ownerClient = await as(owner);
    const studioA = await rpc<string>(ownerClient.rpc("create_studio", { p_name: `Axivo e2e ${slug} ${run}`, p_display_name: owner.name }));
    await rpc(ownerClient.rpc("add_studio_member", { p_studio: studioA, p_email: member.email, p_display_name: member.name, p_role: "member" }));
    await rpc(ownerClient.rpc("add_studio_member", { p_studio: studioA, p_email: viewer.email, p_display_name: viewer.name, p_role: "viewer" }));
    fixtures[spec] = { url, anonKey, studioA, studioB, owner, member, viewer, outsider, foreignClientId };
  }
  saveFixtures(fixtures);
}

async function rpc<T = unknown>(call: PromiseLike<{ data: unknown; error: unknown }>): Promise<T> {
  const { data, error } = await call;
  if (error) throw new Error(`Seeding failed: ${JSON.stringify(error)}`);
  return data as T;
}
