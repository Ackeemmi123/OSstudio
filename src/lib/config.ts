/**
 * Public configuration, readable in the browser. Only values that are safe to
 * expose belong here: the Supabase URL and its anon (publishable) key are
 * public by design; row-level security protects the data. Privileged keys are
 * read only in `src/server`.
 */
export type DataMode =
  | { kind: "local" }
  | { kind: "supabase"; url: string; anonKey: string }
  | { kind: "misconfigured"; problem: string };

export function getDataMode(env: Record<string, string | undefined> = publicEnv()): DataMode {
  const requested = env.NEXT_PUBLIC_STUDIO_DATA_MODE?.trim();
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (requested && requested !== "supabase" && requested !== "local") {
    return { kind: "misconfigured", problem: `NEXT_PUBLIC_STUDIO_DATA_MODE must be "supabase" or "local", not "${requested}".` };
  }
  if (requested === "local") {
    // Choosing the demo while a backend is configured would hide the real data.
    if (url || anonKey) {
      return {
        kind: "misconfigured",
        problem: "NEXT_PUBLIC_STUDIO_DATA_MODE is \"local\", but Supabase settings are also set. Remove one of them, then rebuild and redeploy.",
      };
    }
    return { kind: "local" };
  }
  if (url && anonKey) return { kind: "supabase", url, anonKey };
  // Asking for Supabase without its settings is an error, never a silent
  // fallback to browser storage.
  if (requested === "supabase" || url || anonKey) {
    return { kind: "misconfigured", problem: "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must both be set." };
  }
  // Nothing configured. A production build (a deployment) must say so rather
  // than look like a working app with demo data; the demo is only a default
  // in development.
  if (env.NODE_ENV === "production") {
    return {
      kind: "misconfigured",
      problem:
        "No database is configured for this build. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, then rebuild and redeploy (they are read at build time). To run the local demo on purpose, set NEXT_PUBLIC_STUDIO_DATA_MODE=local.",
    };
  }
  return { kind: "local" };
}

// Next.js inlines NEXT_PUBLIC_ variables (and NODE_ENV) only when they are referenced by name.
function publicEnv(): Record<string, string | undefined> {
  return {
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_STUDIO_DATA_MODE: process.env.NEXT_PUBLIC_STUDIO_DATA_MODE,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
}
