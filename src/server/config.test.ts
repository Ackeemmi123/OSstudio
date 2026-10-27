import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { intakeModel, intakeTimeoutMs, isLocalSupabase, serverSupabase } = await import("./config");

/** A legacy Supabase key: an unsigned JWT is enough to carry the role claim. */
function jwt(role: string) {
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "HS256" })}.${part({ role })}.signature`;
}

const hosted = {
  NEXT_PUBLIC_SUPABASE_URL: "https://abcd.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt("anon"),
  SUPABASE_SERVICE_ROLE_KEY: jwt("service_role"),
};
const local = { ...hosted, NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" };

describe("serverSupabase", () => {
  it("uses the public URL and key when no server-only ones are set", () => {
    expect(serverSupabase(hosted)).toEqual({ ok: true, url: hosted.NEXT_PUBLIC_SUPABASE_URL, anonKey: hosted.NEXT_PUBLIC_SUPABASE_ANON_KEY, serviceRoleKey: hosted.SUPABASE_SERVICE_ROLE_KEY });
  });

  it("is unavailable without the service role key", () => {
    expect(serverSupabase({ ...hosted, SUPABASE_SERVICE_ROLE_KEY: "  " })).toMatchObject({ ok: false });
  });

  it("refuses a server URL for another project than the browser's", () => {
    const config = serverSupabase({ ...hosted, SUPABASE_URL: "https://other.supabase.co" });
    expect(config).toEqual({ ok: false, reason: expect.stringContaining("different Supabase projects") });
  });

  it("accepts the same project written with a trailing slash", () => {
    expect(serverSupabase({ ...hosted, SUPABASE_URL: "https://abcd.supabase.co/" })).toMatchObject({ ok: true });
  });

  it.each([
    ["the anon key", jwt("anon")],
    ["a publishable key", "sb_publishable_abc"],
  ])("refuses %s in place of the service role key", (_, key) => {
    expect(serverSupabase({ ...hosted, SUPABASE_SERVICE_ROLE_KEY: key })).toEqual({ ok: false, reason: expect.stringContaining("public key") });
  });

  it("accepts the new secret keys", () => {
    expect(serverSupabase({ ...hosted, NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_abc", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_abc" })).toMatchObject({ ok: true });
  });
});

describe("intakeModel", () => {
  it("uses Claude when an API key is set, with the default model", () => {
    const config = intakeModel({ ...hosted, ANTHROPIC_API_KEY: "sk-ant-test" });
    expect(config.ok && { runner: config.model.runner, model: config.model.model, test: config.model.test }).toEqual({ runner: "anthropic", model: "claude-opus-5-5", test: false });
  });

  it("sends the key only to the Anthropic API, whatever ANTHROPIC_BASE_URL says", () => {
    const config = intakeModel({ ...hosted, ANTHROPIC_API_KEY: "sk-ant-test", ANTHROPIC_BASE_URL: "https://proxy.example.com" });
    expect(config.ok && (config.model as unknown as { client: { baseURL: string } }).client.baseURL).toBe("https://api.anthropic.com");
  });

  it("is unavailable without a model provider", () => {
    expect(intakeModel(hosted)).toEqual({ ok: false, reason: expect.stringContaining("No AI model") });
  });

  it("is unavailable when Supabase is not configured on the server", () => {
    expect(intakeModel({ ANTHROPIC_API_KEY: "sk-ant-test" })).toMatchObject({ ok: false });
  });

  it("needs an explicit allowance for the test provider", () => {
    expect(intakeModel({ ...local, STUDIO_AGENT_PROVIDER: "fixture" })).toEqual({ ok: false, reason: expect.stringContaining("not allowed") });
    const allowed = intakeModel({ ...local, STUDIO_AGENT_PROVIDER: "fixture", STUDIO_ALLOW_TEST_PROVIDER: "1" });
    expect(allowed.ok && allowed.model.test).toBe(true);
  });

  it("never runs the test provider against a hosted project", () => {
    const config = intakeModel({ ...hosted, STUDIO_AGENT_PROVIDER: "fixture", STUDIO_ALLOW_TEST_PROVIDER: "1" });
    expect(config).toEqual({ ok: false, reason: expect.stringContaining("local Supabase") });
  });

  it("rejects an unknown provider", () => {
    expect(intakeModel({ ...hosted, STUDIO_AGENT_PROVIDER: "openai" })).toEqual({ ok: false, reason: expect.stringContaining("Unknown") });
  });
});

describe("intakeTimeoutMs", () => {
  it.each([
    [undefined, 90_000],
    ["abc", 90_000],
    ["5000", 10_000],
    ["60000", 60_000],
    ["500000", 110_000],
  ])("turns %s into %i ms", (value, expected) => {
    expect(intakeTimeoutMs({ STUDIO_AGENT_TIMEOUT_MS: value })).toBe(expected);
  });
});

describe("isLocalSupabase", () => {
  it.each([
    ["http://127.0.0.1:54321", true],
    ["http://localhost:54321", true],
    ["https://abcd.supabase.co", false],
    ["https://127.0.0.1.example.com", false],
    ["not a url", false],
  ])("%s → %s", (url, expected) => {
    expect(isLocalSupabase(url)).toBe(expected);
  });
});
