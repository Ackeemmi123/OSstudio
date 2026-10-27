/**
 * Reads the staging configuration for the staging scripts.
 *
 * Each value is read from its STAGING_ name first (so staging credentials can
 * sit next to other tools' variables without being picked up by them), then
 * from the name the app itself uses. Nothing here is ever printed.
 *
 *   STAGING_SUPABASE_URL              or NEXT_PUBLIC_SUPABASE_URL
 *   STAGING_SUPABASE_ANON_KEY         or NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   STAGING_SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_ROLE_KEY
 *   STAGING_DATABASE_URL              (optional: migration and grant checks)
 *   STAGING_ANTHROPIC_API_KEY         or ANTHROPIC_API_KEY (optional)
 *   STAGING_AGENT_MODEL               or STUDIO_AGENT_MODEL (optional)
 *   STAGING_APP_URL                   (optional: the deployed app, for the smoke test)
 *   STAGING_SMOKE_OWNER_EMAIL, STAGING_SMOKE_VIEWER_EMAIL, STAGING_SMOKE_OUTSIDER_EMAIL,
 *   STAGING_SMOKE_PASSWORD            (optional: existing test accounts for the smoke
 *                                      test, used instead of the service role key)
 *   STAGING_SMOKE_OWNER_PASSWORD, …_VIEWER_PASSWORD, …_OUTSIDER_PASSWORD
 *                                     (optional: one password per account; each falls
 *                                      back to STAGING_SMOKE_PASSWORD)
 */
export const ANTHROPIC_API_URL = "https://api.anthropic.com";
export const DEFAULT_MODEL = "claude-opus-5-5";

export function stagingEnv(env = process.env) {
  const pick = (...names) => {
    for (const name of names) {
      const value = env[name]?.trim();
      if (value) return value;
    }
    return undefined;
  };
  return {
    url: pick("STAGING_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL")?.replace(/\/+$/, ""),
    anonKey: pick("STAGING_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    serviceKey: pick("STAGING_SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_ROLE_KEY"),
    databaseUrl: pick("STAGING_DATABASE_URL"),
    anthropicKey: pick("STAGING_ANTHROPIC_API_KEY", "ANTHROPIC_API_KEY"),
    model: pick("STAGING_AGENT_MODEL", "STUDIO_AGENT_MODEL") ?? DEFAULT_MODEL,
    appUrl: pick("STAGING_APP_URL")?.replace(/\/+$/, ""),
    smokeAccounts: {
      owner: pick("STAGING_SMOKE_OWNER_EMAIL"),
      viewer: pick("STAGING_SMOKE_VIEWER_EMAIL"),
      outsider: pick("STAGING_SMOKE_OUTSIDER_EMAIL"),
      ownerPassword: pick("STAGING_SMOKE_OWNER_PASSWORD", "STAGING_SMOKE_PASSWORD"),
      viewerPassword: pick("STAGING_SMOKE_VIEWER_PASSWORD", "STAGING_SMOKE_PASSWORD"),
      outsiderPassword: pick("STAGING_SMOKE_OUTSIDER_PASSWORD", "STAGING_SMOKE_PASSWORD"),
    },
  };
}

/** "legacy anon key", "secret key", …: what a key is, never the key. */
export function keyKind(key) {
  if (!key) return "missing";
  if (key.startsWith("sb_publishable_")) return "publishable";
  if (key.startsWith("sb_secret_")) return "secret";
  const [, payload] = key.split(".");
  if (payload) {
    try {
      const role = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")).role;
      if (role === "anon") return "legacy anon";
      if (role === "service_role") return "legacy service_role";
    } catch {
      // not a JWT
    }
  }
  return "unrecognized";
}

export function isLocalUrl(url) {
  try {
    return ["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname);
  } catch {
    return false;
  }
}
