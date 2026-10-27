import { createClient } from "@supabase/supabase-js";
import { SupabaseRepository } from "@/lib/data/supabase-repository";
import { localSupabase, saveFixture, type SeedUser } from "./supabase";

/**
 * Seeds two studios in the local Supabase stack:
 * - studio A with an owner, a member and a viewer;
 * - studio B with its own owner and one client, which studio A must never see.
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

  const [owner, member, viewer, outsider] = await Promise.all([
    user("owner", "Alex Owner"),
    user("member", "Sam Member"),
    user("viewer", "Vera Viewer"),
    user("outsider", "Bo Outsider"),
  ]);

  const ownerClient = await as(owner);
  const studioA = await rpc<string>(ownerClient.rpc("create_studio", { p_name: `Axivo e2e ${run}`, p_display_name: owner.name }));
  await rpc(ownerClient.rpc("add_studio_member", { p_studio: studioA, p_email: member.email, p_display_name: member.name, p_role: "member" }));
  await rpc(ownerClient.rpc("add_studio_member", { p_studio: studioA, p_email: viewer.email, p_display_name: viewer.name, p_role: "viewer" }));

  const outsiderClient = await as(outsider);
  const studioB = await rpc<string>(outsiderClient.rpc("create_studio", { p_name: `Other studio ${run}`, p_display_name: outsider.name }));
  const repository = new SupabaseRepository({ client: outsiderClient, studioId: studioB, user: { id: outsider.id, email: outsider.email } });
  await repository.load();
  const foreign = await repository.createClient({ name: "Confidential Client B", initialNotes: "Studio B only" });
  const foreignClientId = foreign.id;

  saveFixture({ url, anonKey, studioA, studioB, owner, member, viewer, outsider, foreignClientId });
}

async function rpc<T = unknown>(call: PromiseLike<{ data: unknown; error: unknown }>): Promise<T> {
  const { data, error } = await call;
  if (error) throw new Error(`Seeding failed: ${JSON.stringify(error)}`);
  return data as T;
}
