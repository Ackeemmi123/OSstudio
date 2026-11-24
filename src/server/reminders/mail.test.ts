import { describe, expect, it } from "vitest";
import { digestMail, helsinkiDay, reviewEventMail, type DigestEntry } from "./mail";

const ORIGIN = "https://studio.example";
const entry = (over: Partial<DigestEntry> = {}): DigestEntry => ({
  userId: "u",
  email: "a@example.com",
  name: "Alexander Hammarén",
  studio: "Axivo",
  steps: [],
  tasks: [],
  ...over,
});
const step = (dueOn: string, over: Partial<DigestEntry["steps"][number]> = {}) => ({ title: "Call back Mikko", client: "Kafé Testgränd (TEST)", clientId: "c1", dueOn, dueTime: null, assignee: null, mine: false, ...over });

describe("the morning e-mail", () => {
  it("groups what is overdue, due today and due tomorrow, with links", () => {
    const mail = digestMail(
      entry({
        steps: [step("2026-11-24", { dueTime: "10:00", mine: true }), step("2026-11-22", { title: "Send the offer", assignee: "Emilia" }), step("2026-11-25", { title: "Ask for photos" })],
        tasks: [{ title: "Build pages", project: "Website", client: "Nomad", clientId: "c2", dueOn: "2026-11-24" }],
      }),
      "2026-11-24",
      ORIGIN,
    );
    expect(mail.subject).toBe("Today in Studio OS: 3 things to do");
    expect(mail.text).toContain("Good morning, Alexander.");
    expect(mail.text).toContain("Tuesday 24 November");
    const overdue = mail.text.indexOf("Overdue");
    const today = mail.text.indexOf("Today\n");
    const tomorrow = mail.text.indexOf("Tomorrow\n");
    expect(overdue).toBeGreaterThan(-1);
    expect(overdue).toBeLessThan(today);
    expect(today).toBeLessThan(tomorrow);
    expect(mail.text).toContain("- 10:00 Call back Mikko · Kafé Testgränd (TEST) (you)\n  https://studio.example/clients/c1");
    expect(mail.text).toContain("Send the offer · Kafé Testgränd (TEST) (Emilia)");
    expect(mail.text).toContain("Build pages · Nomad, Website");
    expect(mail.text).toContain("Settings › E-mail");
  });

  it("speaks of tomorrow when nothing is due today", () => {
    expect(digestMail(entry({ steps: [step("2026-11-25")] }), "2026-11-24", ORIGIN).subject).toBe("Tomorrow in Studio OS: 1 thing");
  });

  it("takes the day in Helsinki, not in UTC", () => {
    expect(helsinkiDay(new Date("2026-11-24T22:30:00Z"))).toBe("2026-11-25");
    expect(helsinkiDay(new Date("2026-11-24T05:00:00Z"))).toBe("2026-11-24");
  });
});

describe("the e-mail when a client acts on a review link", () => {
  const info = { clientId: "c1", client: "Förvaltningssällskapet", projectId: "p1", version: 1, studio: "Axivo" };

  it("says who approved and what to do next, with a link to Delivery", () => {
    const mail = reviewEventMail({ kind: "approval", author: "Natalie Segercrantz" }, info, ORIGIN);
    expect(mail.subject).toBe("Förvaltningssällskapet approved their website");
    expect(mail.text).toContain("Natalie Segercrantz approved version 1");
    expect(mail.text).toContain("https://studio.example/clients/c1/projects/p1/site#delivery");
  });

  it("quotes a comment on one line", () => {
    const mail = reviewEventMail({ kind: "comment", author: "Natalie", page: "/om-oss/", body: "Byt bilden\n\npå styrelsen" }, info, ORIGIN);
    expect(mail.subject).toBe("New comment from Förvaltningssällskapet");
    expect(mail.text).toContain('"Byt bilden på styrelsen"');
    expect(mail.text).toContain("on the page /om-oss/");
  });
});
