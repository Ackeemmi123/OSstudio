import { describe, expect, it } from "vitest";
import { portalPage, portalStep } from "./page";
import { postPortalAnswers, postPortalFiles, readPortal, type PortalDeps, type PortalState } from "./portal";

const TOKEN = "a".repeat(64);
const QID = "00000000-0000-4000-8000-000000000001";
const STATE: PortalState = { client: "Bageri", studio: "Axivo", studioEmail: null, color: null, locale: "sv", spec: null, build: null, live: null, questions: [{ id: QID, text: "Öppettider?" }], expiresAt: "2027-02-22T10:00:00Z" };

function deps(over: Partial<PortalDeps> = {}) {
  const calls: Record<string, unknown[]> = { answers: [], store: [], note: [], notify: [] };
  const d: PortalDeps = {
    state: async (t) => (t === TOKEN ? STATE : null),
    answers: async (_t, a) => (calls.answers.push(a), {}),
    claim: async () => ({ data: { studioId: "s", clientId: "c" } }),
    store: async (_target, bytes, title) => (calls.store.push({ title, bytes: bytes.byteLength }), { ok: true }),
    note: async (_t, _a, note) => (calls.note.push(note), {}),
    notify: (_t, event) => void calls.notify.push(event),
    now: () => new Date("2026-11-24T12:00:00Z"),
    ...over,
  };
  return { d, calls };
}

function form(fields: Record<string, string>, files = 1) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  for (let i = 0; i < files; i++) f.append("file", new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" }), `bild${i}.jpg`);
  return f;
}

describe("the client portal", () => {
  it("shows the portal only for an open link", async () => {
    expect((await readPortal(TOKEN, deps().d)).status).toBe(200);
    expect((await readPortal("b".repeat(64), deps().d)).status).toBe(404);
    expect((await readPortal("short", deps().d)).status).toBe(404);
  });

  it("takes answers with a name, leaves out empty ones, and tells the studio", async () => {
    const { d, calls } = deps();
    expect((await postPortalAnswers(TOKEN, { author: "Sara", answers: [{ id: QID, answer: " Mån–fre 7–17 " }] }, d)).status).toBe(201);
    expect(calls.answers).toEqual([{ author: "Sara", answers: [{ id: QID, answer: "Mån–fre 7–17" }] }]);
    expect(calls.notify).toEqual([{ kind: "answers", author: "Sara", count: 1 }]);
    expect((await postPortalAnswers(TOKEN, { author: "", answers: [{ id: QID, answer: "x" }] }, d)).status).toBe(400);
    expect((await postPortalAnswers(TOKEN, { author: "Sara", answers: [{ id: QID, answer: "" }] }, d)).status).toBe(400);
  });

  it("keeps a file only with the answers about rights and people, and records them in the client's words", async () => {
    const { d, calls } = deps();
    const missing = await postPortalFiles(TOKEN, form({ author: "Sara", title_0: "Butiken", rights_0: "own" }), d);
    expect(missing.status).toBe(400);
    expect(await missing.json()).toMatchObject({ stored: 0, refused: [{ title: "Butiken", reason: "answers" }] });
    expect(calls.store).toEqual([]);

    const ok = await postPortalFiles(TOKEN, form({ author: "Sara", title_0: "Butiken", rights_0: "own", people_0: "consent", last: "1", sent: "0" }), d);
    expect(ok.status).toBe(201);
    expect(calls.store).toEqual([{ title: "Butiken", bytes: 3 }]);
    expect(calls.note[0]).toBe("Sara skickade en fil via kundportalen 2026-11-24 och svarade:\n\n- Butiken: vi äger bilden eller filen; personerna som syns har gett sitt samtycke till att visas på webbplatsen.");
    expect(calls.notify).toEqual([{ kind: "files", author: "Sara", count: 1 }]);
  });

  it("stops at the day's limit and says so", async () => {
    const { d } = deps({ claim: async () => ({ error: { code: "54000" } }) });
    const res = await postPortalFiles(TOKEN, form({ author: "Sara", title_0: "A", rights_0: "own", people_0: "none" }), d);
    expect(await res.json()).toMatchObject({ stored: 0, refused: [{ title: "A", reason: "limit" }] });
  });

  it("says where the website stands", () => {
    expect(portalStep(STATE)).toEqual({ step: 0, key: "start" });
    expect(portalStep({ ...STATE, spec: { version: 1, status: "draft" } }).key).toBe("draft");
    expect(portalStep({ ...STATE, spec: { version: 1, status: "approved" }, build: { link: "/s/x/", approval: null, expiresAt: "" } }).key).toBe("review");
    expect(portalStep({ ...STATE, build: { link: "/s/x/", approval: { name: "Sara", at: "" }, expiresAt: "" } }).key).toBe("approved");
    expect(portalStep({ ...STATE, live: { domain: "bageri.fi", url: "https://bageri.fi" } })).toEqual({ step: 4, key: "live" });
  });

  it("shows the draft in a small frame, says whose turn it is, and speaks the client's language", () => {
    const draft = { ...STATE, locale: "fi" as const, studioEmail: "hei@axivo.fi", spec: { version: 1, status: "approved" }, build: { link: "/s/abc/", approval: null, expiresAt: "" } };
    const html = portalPage(draft, TOKEN, "n0nce");
    expect(html).toContain('<html lang="fi">');
    expect(html).toContain('<iframe src="/s/abc/"');
    expect(html).toContain("Teidän vuoronne · Vaihe 3/5");
    expect(html).toContain("Tarkasta ja hyväksy luonnos");
    expect(html).toContain('href="mailto:hei@axivo.fi"');
    expect(html).not.toMatch(/Granska|Er tur/);
    // Nothing a person typed becomes markup.
    const named = portalPage({ ...draft, client: "<b>x</b>", questions: [{ id: QID, text: "<img src=x>" }] }, TOKEN, "n0nce");
    expect(named).not.toContain("<b>x</b>");
    expect(named).not.toContain("<img src=x>");
  });

  it("says the work is with the studio when nothing waits on the client", () => {
    const html = portalPage({ ...STATE, locale: "en", questions: [], spec: { version: 1, status: "draft" } }, TOKEN, "n0nce");
    expect(html).toContain("We are on it · Step 2 of 5");
    expect(html).toContain("The draft appears here when it is ready.");
    expect(html).not.toContain("<iframe");
  });
});
