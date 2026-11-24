/** Taking a client's comment and approval on a preview link. */
import { describe, expect, it } from "vitest";
import { reviewBar } from "./bar";
import { APPROVAL_STATEMENT, postAnswers, postApproval, postComment, readReview, type ReviewDeps } from "./review";

const TOKEN = "e".repeat(40);

function deps(error: { code?: string } | null = null) {
  const calls: unknown[] = [];
  const d: ReviewDeps = {
    state: async (token) => (token === TOKEN ? { buildId: "b1", studioId: "s1", comments: [], approval: null } : null),
    comment: async (_t, c) => (calls.push(c), { error }),
    approve: async (_t, a) => (calls.push(a), { error }),
    answer: async (_t, a) => (calls.push(a), { error }),
  };
  return { d, calls };
}

describe("client review", () => {
  it("takes a comment with its page and part", async () => {
    const { d, calls } = deps();
    const res = await postComment(TOKEN, { page: "/om-oss/", target: "h2: Om oss", body: " Byt rubriken ", author: "Anna" }, d);
    expect(res.status).toBe(201);
    expect(calls).toEqual([{ page: "/om-oss/", target: "h2: Om oss", body: "Byt rubriken", author: "Anna" }]);
  });

  it("refuses empty comments, bad pages, bad tokens and a filled bot field", async () => {
    const { d, calls } = deps();
    expect((await postComment(TOKEN, { page: "/", body: "", author: "Anna" }, d)).status).toBe(400);
    expect((await postComment(TOKEN, { page: "https://evil.example", body: "x", author: "Anna" }, d)).status).toBe(400);
    expect((await postComment("short", { page: "/", body: "x", author: "Anna" }, d)).status).toBe(404);
    expect((await postComment(TOKEN, { page: "/", body: "x", author: "Anna", website: "spam" }, d)).status).toBe(400);
    expect(calls).toEqual([]);
  });

  it("says a closed link is closed, and a busy one to wait", async () => {
    expect((await postComment(TOKEN, { page: "/", body: "x", author: "A" }, deps({ code: "42501" }).d)).status).toBe(404);
    expect((await postComment(TOKEN, { page: "/", body: "x", author: "A" }, deps({ code: "54000" }).d)).status).toBe(429);
    expect((await readReview("f".repeat(40), deps().d)).status).toBe(404);
  });

  it("records an approval with the fixed statement, once", async () => {
    const { d, calls } = deps();
    expect((await postApproval(TOKEN, { name: "Anna", role: "Ordförande", email: "anna@example.fi", agree: true }, d)).status).toBe(201);
    expect(calls).toEqual([{ name: "Anna", role: "Ordförande", email: "anna@example.fi", statement: APPROVAL_STATEMENT }]);
    expect((await postApproval(TOKEN, { name: "Anna", email: "anna@example.fi", agree: false }, d)).status).toBe(400);
    expect((await postApproval(TOKEN, { name: "Anna", email: "anna@example.fi", agree: true }, deps({ code: "23505" }).d)).status).toBe(409);
  });

  it("tells the studio only about what was saved", async () => {
    const told: unknown[] = [];
    const ok = { ...deps().d, notify: (_t: string, event: unknown) => void told.push(event) };
    await postComment(TOKEN, { page: "/om-oss/", target: "", body: "Byt bilden", author: "Anna" }, ok);
    await postApproval(TOKEN, { name: "Anna", role: "", email: "anna@example.fi", agree: true }, ok);
    expect(told).toEqual([{ kind: "comment", author: "Anna", page: "/om-oss/", body: "Byt bilden" }, { kind: "approval", author: "Anna" }]);
    const refused = { ...deps({ code: "23505" }).d, notify: (_t: string, event: unknown) => void told.push(event) };
    await postApproval(TOKEN, { name: "Anna", email: "anna@example.fi", agree: true }, refused);
    expect(told).toHaveLength(2);
  });
});

describe("the review bar script", () => {
  it("is valid JavaScript", () => {
    const html = reviewBar(TOKEN, { name: "Byrå", website: null, email: null, color: "#123456", logoUrl: null });
    const script = html.slice(html.indexOf("<script>") + 8, html.lastIndexOf("</script>"));
    expect(() => new Function(script)).not.toThrow();
    expect(script).toContain(`"token":"${TOKEN}"`);
  });

  it("takes the client's answers, trimmed, and refuses an empty set", async () => {
    const { d, calls } = deps();
    expect((await postAnswers(TOKEN, { author: " Sara ", answers: [" Vi öppnade 2019. ", ""] }, d)).status).toBe(201);
    expect(calls).toEqual([{ author: "Sara", answers: ["Vi öppnade 2019.", ""] }]);
    expect((await postAnswers(TOKEN, { author: "Sara", answers: ["", " "] }, d)).status).toBe(400);
    expect((await postAnswers(TOKEN, { author: "", answers: ["x"] }, d)).status).toBe(400);
    expect((await postAnswers("short", { author: "Sara", answers: ["x"] }, d)).status).toBe(404);
  });

  it("says when the answers are already in, or do not match the questions", async () => {
    expect((await postAnswers(TOKEN, { author: "Sara", answers: ["x"] }, deps({ code: "23505" }).d)).status).toBe(409);
    expect((await postAnswers(TOKEN, { author: "Sara", answers: ["x"] }, deps({ code: "22023" }).d)).status).toBe(400);
    expect((await postAnswers(TOKEN, { author: "Sara", answers: ["x"] }, deps({ code: "42501" }).d)).status).toBe(404);
  });
});
