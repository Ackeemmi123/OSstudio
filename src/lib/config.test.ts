import { describe, expect, it } from "vitest";
import { getDataMode } from "./config";

const supabase = { NEXT_PUBLIC_SUPABASE_URL: "https://abcd.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_example" };

describe("getDataMode", () => {
  it("uses Supabase when its URL and key are set, in any build", () => {
    for (const NODE_ENV of ["production", "development", undefined]) {
      expect(getDataMode({ NODE_ENV, ...supabase })).toEqual({ kind: "supabase", url: supabase.NEXT_PUBLIC_SUPABASE_URL, anonKey: supabase.NEXT_PUBLIC_SUPABASE_ANON_KEY });
      expect(getDataMode({ NODE_ENV, NEXT_PUBLIC_STUDIO_DATA_MODE: "supabase", ...supabase })).toMatchObject({ kind: "supabase" });
    }
  });

  it("refuses to show the demo in a production build with nothing configured", () => {
    const mode = getDataMode({ NODE_ENV: "production" });
    expect(mode.kind).toBe("misconfigured");
    expect(mode.kind === "misconfigured" && mode.problem).toMatch(/NEXT_PUBLIC_SUPABASE_URL.*rebuild and redeploy.*NEXT_PUBLIC_STUDIO_DATA_MODE=local/);
  });

  it("treats blank values as not set", () => {
    expect(getDataMode({ NODE_ENV: "production", NEXT_PUBLIC_STUDIO_DATA_MODE: " ", NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "  " })).toMatchObject({ kind: "misconfigured" });
  });

  it("runs the local demo when it is chosen explicitly, also in a production build", () => {
    expect(getDataMode({ NODE_ENV: "production", NEXT_PUBLIC_STUDIO_DATA_MODE: "local" })).toEqual({ kind: "local" });
  });

  it("runs the local demo by default only outside production builds", () => {
    expect(getDataMode({ NODE_ENV: "development" })).toEqual({ kind: "local" });
    expect(getDataMode({ NODE_ENV: "test" })).toEqual({ kind: "local" });
  });

  it("refuses the local demo when Supabase settings are also set", () => {
    for (const settings of [supabase, { NEXT_PUBLIC_SUPABASE_URL: supabase.NEXT_PUBLIC_SUPABASE_URL }, { NEXT_PUBLIC_SUPABASE_ANON_KEY: "key" }]) {
      expect(getDataMode({ NODE_ENV: "production", NEXT_PUBLIC_STUDIO_DATA_MODE: "local", ...settings })).toMatchObject({ kind: "misconfigured" });
    }
  });

  it("reports half a Supabase configuration instead of falling back", () => {
    for (const NODE_ENV of ["production", "development"]) {
      expect(getDataMode({ NODE_ENV, NEXT_PUBLIC_SUPABASE_URL: supabase.NEXT_PUBLIC_SUPABASE_URL })).toMatchObject({ kind: "misconfigured" });
      expect(getDataMode({ NODE_ENV, NEXT_PUBLIC_SUPABASE_ANON_KEY: "key" })).toMatchObject({ kind: "misconfigured" });
      expect(getDataMode({ NODE_ENV, NEXT_PUBLIC_STUDIO_DATA_MODE: "supabase" })).toMatchObject({ kind: "misconfigured" });
    }
  });

  it("rejects an unknown mode", () => {
    expect(getDataMode({ NODE_ENV: "production", NEXT_PUBLIC_STUDIO_DATA_MODE: "demo", ...supabase })).toMatchObject({ kind: "misconfigured" });
  });
});
