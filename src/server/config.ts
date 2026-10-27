import "server-only";
import { AnthropicIntakeModel } from "./agents/anthropic-model";
import { FixtureIntakeModel } from "./agents/fixture-model";
import type { IntakeModel } from "./agents/model";

/**
 * Server-only configuration. Privileged values (the service-role key, model
 * provider keys) are read here and never sent to the browser.
 */
export interface ServerSupabase {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
}

export function serverSupabase(env = process.env): ServerSupabase | null {
  const url = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = env.SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  return url && anonKey && serviceRoleKey ? { url, anonKey, serviceRoleKey } : null;
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
export function intakeModel(env = process.env): IntakeModelConfig {
  if (!serverSupabase(env)) {
    return { ok: false, reason: "The server is not connected to Supabase (SUPABASE_SERVICE_ROLE_KEY is not set), so agent runs cannot be recorded." };
  }
  const provider = env.STUDIO_AGENT_PROVIDER?.trim() || (env.ANTHROPIC_API_KEY ? "anthropic" : "");
  const timeoutMs = clamp(Number(env.STUDIO_AGENT_TIMEOUT_MS) || 90_000, 10_000, 110_000);

  if (provider === "anthropic") {
    if (!env.ANTHROPIC_API_KEY) return { ok: false, reason: "ANTHROPIC_API_KEY is not set on the server." };
    return { ok: true, model: new AnthropicIntakeModel(env.ANTHROPIC_API_KEY, env.STUDIO_AGENT_MODEL?.trim() || DEFAULT_INTAKE_MODEL, timeoutMs) };
  }
  if (provider === "fixture") {
    if (env.STUDIO_ALLOW_TEST_PROVIDER !== "1") return { ok: false, reason: "The test provider is configured but not allowed (STUDIO_ALLOW_TEST_PROVIDER is not 1)." };
    return { ok: true, model: new FixtureIntakeModel() };
  }
  if (provider) return { ok: false, reason: `Unknown STUDIO_AGENT_PROVIDER "${provider}".` };
  return { ok: false, reason: "No AI model is configured on the server. Set ANTHROPIC_API_KEY to enable client analysis." };
}

export function intakeTimeoutMs(env = process.env): number {
  return clamp(Number(env.STUDIO_AGENT_TIMEOUT_MS) || 90_000, 10_000, 110_000);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
