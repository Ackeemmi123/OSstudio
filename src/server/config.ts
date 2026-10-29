import "server-only";
import { AnthropicIntakeModel } from "./agents/anthropic-model";
import { FixtureIntakeModel } from "./agents/fixture-model";
import type { IntakeModel } from "./agents/model";

/**
 * Server-only configuration. Privileged values (the service-role key, model
 * provider keys) are read here and never sent to the browser.
 */
type Env = Record<string, string | undefined>;

export interface ServerSupabase {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
}

export type ServerSupabaseConfig = ({ ok: true } & ServerSupabase) | { ok: false; reason: string };

export function serverSupabase(env: Env = process.env): ServerSupabaseConfig {
  const publicUrl = clean(env.NEXT_PUBLIC_SUPABASE_URL);
  const url = clean(env.SUPABASE_URL) ?? publicUrl;
  const anonKey = clean(env.SUPABASE_ANON_KEY) ?? clean(env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const serviceRoleKey = clean(env.SUPABASE_SERVICE_ROLE_KEY);
  if (!url || !anonKey || !serviceRoleKey) {
    return { ok: false, reason: "The server is not connected to Supabase (SUPABASE_SERVICE_ROLE_KEY is not set), so agent runs cannot be recorded." };
  }
  // Sessions are issued by the project the browser talks to. A server pointed
  // at another project would reject every one of them as expired.
  if (publicUrl && sameOrigin(publicUrl, url) === false) {
    return { ok: false, reason: "SUPABASE_URL and NEXT_PUBLIC_SUPABASE_URL point to different Supabase projects." };
  }
  if (serviceRoleKey === anonKey || isPublishableKey(serviceRoleKey)) {
    return { ok: false, reason: "SUPABASE_SERVICE_ROLE_KEY holds the public key, not the service role (secret) key." };
  }
  return { ok: true, url, anonKey, serviceRoleKey };
}

/** True for the local Supabase stack; the test provider is refused anywhere else. */
export function isLocalSupabase(url: string): boolean {
  try {
    return ["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

export const DEFAULT_INTAKE_MODEL = "claude-opus-5-5";

export type IntakeModelConfig = { ok: true; model: IntakeModel } | { ok: false; reason: string };

/**
 * Which provider runs the intake agent:
 * - STUDIO_AGENT_PROVIDER=anthropic (default when ANTHROPIC_API_KEY is set),
 *   model from STUDIO_AGENT_MODEL;
 * - STUDIO_AGENT_PROVIDER=fixture, a deterministic test provider without AI,
 *   which additionally requires STUDIO_ALLOW_TEST_PROVIDER=1.
 */
export function intakeModel(env: Env = process.env): IntakeModelConfig {
  const supabase = serverSupabase(env);
  if (!supabase.ok) return supabase;
  const apiKey = clean(env.ANTHROPIC_API_KEY);
  const provider = clean(env.STUDIO_AGENT_PROVIDER) ?? (apiKey ? "anthropic" : "");

  if (provider === "anthropic") {
    if (!apiKey) return { ok: false, reason: "ANTHROPIC_API_KEY is not set on the server." };
    return { ok: true, model: new AnthropicIntakeModel(apiKey, clean(env.STUDIO_AGENT_MODEL) ?? DEFAULT_INTAKE_MODEL, intakeTimeoutMs(env)) };
  }
  if (provider === "fixture") {
    if (env.STUDIO_ALLOW_TEST_PROVIDER !== "1") return { ok: false, reason: "The test provider is configured but not allowed (STUDIO_ALLOW_TEST_PROVIDER is not 1)." };
    // A provider without AI must never answer for a shared environment.
    if (!isLocalSupabase(supabase.url)) return { ok: false, reason: "The test provider only runs against a local Supabase stack." };
    return { ok: true, model: new FixtureIntakeModel() };
  }
  if (provider) return { ok: false, reason: `Unknown STUDIO_AGENT_PROVIDER "${provider}".` };
  return { ok: false, reason: "No AI model is configured on the server. Set ANTHROPIC_API_KEY to enable client analysis." };
}

export interface InquiryConfig {
  supabase: ServerSupabase;
  /** Key id → shared signing secret. More than one during a rotation. */
  signingKeys: ReadonlyMap<string, string>;
  /** The studio that receives website inquiries. */
  studioId: string;
  /** Keys the hash of a visitor's IP address for rate limiting. */
  hashKey: string;
}

export type InquiryConfigResult = { ok: true; value: InquiryConfig } | { ok: false; reason: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY_ID = /^[A-Za-z0-9._-]{1,64}$/;
const MIN_SECRET_LENGTH = 32;

/**
 * Website inquiries (POST /api/inquiries) need, all server only:
 * - INQUIRY_SIGNING_KEYS: "keyId:secret", comma-separated during a rotation.
 *   Each secret at least 32 characters, created by a person, never committed.
 * - INQUIRY_STUDIO_ID: the studio that receives inquiries.
 * - INQUIRY_HASH_KEY: at least 32 characters, keys the IP hash for rate limits.
 * - the Supabase service role, as for the intake agent.
 * Without all of them the endpoint answers 503 and stores nothing.
 */
export function inquiryConfig(env: Env = process.env): InquiryConfigResult {
  const supabase = serverSupabase(env);
  if (!supabase.ok) return supabase;

  const rawKeys = clean(env.INQUIRY_SIGNING_KEYS);
  const studioId = clean(env.INQUIRY_STUDIO_ID);
  const hashKey = clean(env.INQUIRY_HASH_KEY);
  if (!rawKeys || !studioId || !hashKey) {
    return { ok: false, reason: "Website inquiries are not configured (INQUIRY_SIGNING_KEYS, INQUIRY_STUDIO_ID and INQUIRY_HASH_KEY must be set)." };
  }
  const signingKeys = new Map<string, string>();
  for (const entry of rawKeys.split(",")) {
    const at = entry.indexOf(":");
    const id = entry.slice(0, at).trim();
    const secret = entry.slice(at + 1).trim();
    if (at < 1 || !KEY_ID.test(id) || secret.length < MIN_SECRET_LENGTH || signingKeys.has(id)) {
      return { ok: false, reason: `INQUIRY_SIGNING_KEYS must be "keyId:secret" pairs with unique ids and secrets of at least ${MIN_SECRET_LENGTH} characters.` };
    }
    signingKeys.set(id, secret);
  }
  if (!UUID.test(studioId)) return { ok: false, reason: "INQUIRY_STUDIO_ID must be a studio id (a UUID)." };
  if (hashKey.length < MIN_SECRET_LENGTH) return { ok: false, reason: `INQUIRY_HASH_KEY must be at least ${MIN_SECRET_LENGTH} characters.` };
  if ([...signingKeys.values()].includes(hashKey)) return { ok: false, reason: "INQUIRY_HASH_KEY must differ from every signing secret." };

  const { url, anonKey, serviceRoleKey } = supabase;
  return { ok: true, value: { supabase: { url, anonKey, serviceRoleKey }, signingKeys, studioId: studioId.toLowerCase(), hashKey } };
}

/** The monthly AI budget Alexander approved for every agent together, in USD. */
export const DEFAULT_AI_MONTHLY_BUDGET_USD = 25;
const MAX_AI_MONTHLY_BUDGET_USD = 1000;

export type AiBudgetConfig = { ok: true; capMicros: number } | { ok: false; reason: string };

/**
 * The monthly cap on AI spend across all agents: STUDIO_AI_MONTHLY_BUDGET_USD,
 * $25 when unset. A value that is not a positive number of dollars stops
 * every agent instead of running uncapped.
 */
export function aiMonthlyBudget(env: Env = process.env): AiBudgetConfig {
  const raw = clean(env.STUDIO_AI_MONTHLY_BUDGET_USD);
  if (raw === undefined) return { ok: true, capMicros: DEFAULT_AI_MONTHLY_BUDGET_USD * 1_000_000 };
  const usd = /^\d+(\.\d{1,2})?$/.test(raw) ? Number(raw) : NaN;
  if (!(usd > 0 && usd <= MAX_AI_MONTHLY_BUDGET_USD)) {
    return { ok: false, reason: `STUDIO_AI_MONTHLY_BUDGET_USD must be an amount in dollars above 0 and at most ${MAX_AI_MONTHLY_BUDGET_USD}. AI analysis is off until it is fixed.` };
  }
  return { ok: true, capMicros: Math.round(usd * 1_000_000) };
}

export function intakeTimeoutMs(env: Env = process.env): number {
  return clamp(Number(env.STUDIO_AGENT_TIMEOUT_MS) || 90_000, 10_000, 110_000);
}

function clean(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

function sameOrigin(a: string, b: string): boolean | null {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return null;
  }
}

function isPublishableKey(key: string): boolean {
  if (key.startsWith("sb_publishable_")) return true;
  return jwtRole(key) === "anon";
}

/** The role claim of a legacy Supabase key (a JWT), without verifying it. */
function jwtRole(key: string): string | null {
  const [, payload] = key.split(".");
  if (!payload) return null;
  try {
    return (JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { role?: string }).role ?? null;
  } catch {
    return null;
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
