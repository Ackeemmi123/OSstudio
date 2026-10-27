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

  if (requested === "local") return { kind: "local" };
  if (requested && requested !== "supabase") {
    return { kind: "misconfigured", problem: `NEXT_PUBLIC_STUDIO_DATA_MODE must be "supabase" or "local", not "${requested}".` };
  }
  if (url && anonKey) return { kind: "supabase", url, anonKey };
  // Asking for Supabase without its settings is an error, never a silent
  // fallback to browser storage.
  if (requested === "supabase" || url || anonKey) {
    return { kind: "misconfigured", problem: "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must both be set." };
  }
  return { kind: "local" };
}

// Next.js inlines NEXT_PUBLIC_ variables only when they are referenced by name.
function publicEnv(): Record<string, string | undefined> {
  return {
    NEXT_PUBLIC_STUDIO_DATA_MODE: process.env.NEXT_PUBLIC_STUDIO_DATA_MODE,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
}
