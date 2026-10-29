import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { aiMonthlyBudget, inquiryConfig, agentModel, intakeTimeoutMs, isLocalSupabase, serverSupabase } = await import("./config");

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

describe("agentModel", () => {
  it("uses Claude when an API key is set, with the default model", () => {
    const config = agentModel({ ...hosted, ANTHROPIC_API_KEY: "sk-ant-test" });
    expect(config.ok && { runner: config.model.runner, model: config.model.model, test: config.model.test }).toEqual({ runner: "anthropic", model: "claude-opus-5-5", test: false });
  });

  it("sends the key only to the Anthropic API, whatever ANTHROPIC_BASE_URL says", () => {
    const config = agentModel({ ...hosted, ANTHROPIC_API_KEY: "sk-ant-test", ANTHROPIC_BASE_URL: "https://proxy.example.com" });
    expect(config.ok && (config.model as unknown as { client: { baseURL: string } }).client.baseURL).toBe("https://api.anthropic.com");
  });

  it("is unavailable without a model provider", () => {
    expect(agentModel(hosted)).toEqual({ ok: false, reason: expect.stringContaining("No AI model") });
  });

  it("is unavailable when Supabase is not configured on the server", () => {
    expect(agentModel({ ANTHROPIC_API_KEY: "sk-ant-test" })).toMatchObject({ ok: false });
  });

  it("needs an explicit allowance for the test provider", () => {
    expect(agentModel({ ...local, STUDIO_AGENT_PROVIDER: "fixture" })).toEqual({ ok: false, reason: expect.stringContaining("not allowed") });
    const allowed = agentModel({ ...local, STUDIO_AGENT_PROVIDER: "fixture", STUDIO_ALLOW_TEST_PROVIDER: "1" });
    expect(allowed.ok && allowed.model.test).toBe(true);
  });

  it("never runs the test provider against a hosted project", () => {
    const config = agentModel({ ...hosted, STUDIO_AGENT_PROVIDER: "fixture", STUDIO_ALLOW_TEST_PROVIDER: "1" });
    expect(config).toEqual({ ok: false, reason: expect.stringContaining("local Supabase") });
  });

  it("rejects an unknown provider", () => {
    expect(agentModel({ ...hosted, STUDIO_AGENT_PROVIDER: "openai" })).toEqual({ ok: false, reason: expect.stringContaining("Unknown") });
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

describe("inquiryConfig", () => {
  const secret = "s".repeat(32);
  const ready = {
    ...hosted,
    INQUIRY_SIGNING_KEYS: `axivo-staging-1:${secret}`,
    INQUIRY_STUDIO_ID: "11111111-2222-4333-8444-555555555555",
    INQUIRY_HASH_KEY: "h".repeat(32),
  };

  it("reads the signing keys, studio and hash key", () => {
    const config = inquiryConfig(ready);
    expect(config.ok).toBe(true);
    if (config.ok) {
      expect([...config.value.signingKeys]).toEqual([["axivo-staging-1", secret]]);
      expect(config.value.studioId).toBe(ready.INQUIRY_STUDIO_ID);
      expect(config.value.supabase.serviceRoleKey).toBe(hosted.SUPABASE_SERVICE_ROLE_KEY);
    }
  });

  it("accepts two keys during a rotation", () => {
    const config = inquiryConfig({ ...ready, INQUIRY_SIGNING_KEYS: `old:${secret}, new:${"t".repeat(40)}` });
    expect(config.ok && [...config.value.signingKeys.keys()]).toEqual(["old", "new"]);
  });

  it.each([
    ["no signing keys", { INQUIRY_SIGNING_KEYS: "" }],
    ["no studio", { INQUIRY_STUDIO_ID: " " }],
    ["no hash key", { INQUIRY_HASH_KEY: undefined }],
    ["a short secret", { INQUIRY_SIGNING_KEYS: "axivo:short" }],
    ["a secret without a key id", { INQUIRY_SIGNING_KEYS: secret }],
    ["a repeated key id", { INQUIRY_SIGNING_KEYS: `a:${secret},a:${secret}x` }],
    ["a studio that is not a UUID", { INQUIRY_STUDIO_ID: "axivo" }],
    ["a short hash key", { INQUIRY_HASH_KEY: "short" }],
    ["a hash key equal to a signing secret", { INQUIRY_HASH_KEY: secret }],
    ["no service role key", { SUPABASE_SERVICE_ROLE_KEY: "" }],
  ])("is unavailable with %s", (_label, change) => {
    const config = inquiryConfig({ ...ready, ...change });
    expect(config.ok).toBe(false);
    // The reason names settings, never their values.
    if (!config.ok) expect(config.reason).not.toContain(secret);
  });
});

describe("aiMonthlyBudget", () => {
  it("caps AI spend at $25 a month when nothing is set", () => {
    expect(aiMonthlyBudget({})).toEqual({ ok: true, capMicros: 25_000_000 });
  });

  it.each([["10", 10_000_000], ["12.50", 12_500_000], [" 5 ", 5_000_000]])("reads %s dollars", (raw, micros) => {
    expect(aiMonthlyBudget({ STUDIO_AI_MONTHLY_BUDGET_USD: raw })).toEqual({ ok: true, capMicros: micros });
  });

  it.each(["0", "-5", "abc", "1e3", "25.001", "Infinity", "1001"])("turns agents off instead of running uncapped for %s", (raw) => {
    expect(aiMonthlyBudget({ STUDIO_AI_MONTHLY_BUDGET_USD: raw })).toEqual({ ok: false, reason: expect.stringContaining("AI analysis is off") });
  });
});
