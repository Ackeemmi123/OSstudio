/** A published site's form: mailed to the client, never stored, and the visitor sent back to the site. */
import { describe, expect, it } from "vitest";
import { handleForm, sendWithResend, type FormDeps, type FormTarget } from "./forms";

const KEY = "k".repeat(32);
const TARGET: FormTarget = { limited: false, recipient: "kontakt@example.test", siteName: "Testsällskapet", siteUrl: "https://forening.example" };

function form(values: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
}

function deps(target: FormTarget | null = TARGET, ok = true) {
  const mails: Parameters<FormDeps["send"]>[0][] = [];
  const d: FormDeps = { take: async () => target, send: async (m) => (mails.push(m), ok) };
  return { d, mails };
}

describe("site forms", () => {
  it("mails the message to the client and sends the visitor to the sent page", async () => {
    const { d, mails } = deps();
    const res = await handleForm(KEY, form({ form: "kontakt", name: "Anna", email: "anna@example.test", message: "Hej!\r\nKan jag bli medlem?", consent: "on" }), d);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://forening.example/sent/");
    expect(mails[0]).toMatchObject({ to: "kontakt@example.test", replyTo: "anna@example.test", subject: "Nytt meddelande från Testsällskapet" });
    expect(mails[0].text).toContain("Meddelande: \nHej!\nKan jag bli medlem?");
  });

  it("tells a bot it was sent without mailing, and says not sent when limited or failing", async () => {
    const bot = deps();
    expect((await handleForm(KEY, form({ name: "x", message: "spam", website: "http://spam" }), bot.d)).headers.get("location")).toBe("https://forening.example/sent/");
    expect(bot.mails).toEqual([]);
    expect((await handleForm(KEY, form({ message: "Hej" }), deps({ ...TARGET, limited: true }).d)).headers.get("location")).toBe("https://forening.example/not-sent/");
    expect((await handleForm(KEY, form({ message: "Hej" }), deps(TARGET, false).d)).headers.get("location")).toBe("https://forening.example/not-sent/");
    expect((await handleForm(KEY, form({ message: "Hej" }), deps(null).d)).status).toBe(404);
  });

  it("writes the mail to the client in the site's language, and in Swedish for a form from before", async () => {
    const fi = deps();
    await handleForm(KEY, form({ form: "kontakt", lang: "fi", name: "Anna", email: "anna@example.test", message: "Hei!", consent: "on" }), fi.d);
    expect(fi.mails[0].subject).toBe("Uusi viesti: Testsällskapet");
    expect(fi.mails[0].text).toContain("Uusi viesti verkkosivustolta Testsällskapet.");
    expect(fi.mails[0].text).toContain("Nimi: Anna");
    expect(fi.mails[0].text).toContain("Viesti: \nHei!");
    expect(fi.mails[0].text).toContain("Lähettäjä hyväksyi suostumustekstin.");
    expect(fi.mails[0].text).not.toMatch(/Namn|Meddelande|Personen/);

    const en = deps();
    await handleForm(KEY, form({ lang: "en", name: "Ann", email: "ann@example.test", message: "Hi" }), en.d);
    expect(en.mails[0].subject).toBe("New message from Testsällskapet");
    expect(en.mails[0].text).toContain("Name: Ann");
    expect(en.mails[0].text).toContain("Reply to this email to answer the sender directly.");

    // No field (a site built before) or anything unexpected: Swedish, as always.
    for (const lang of [undefined, "de", "constructor", "__proto__"]) {
      const sv = deps();
      await handleForm(KEY, form({ ...(lang ? { lang } : {}), name: "Anna", message: "Hej" }), sv.d);
      expect(sv.mails[0].subject).toBe("Nytt meddelande från Testsällskapet");
      expect(sv.mails[0].text).toContain("Namn: Anna");
    }
  });

  it("sends a visitor on another language's pages back to that language's page, and nowhere else", async () => {
    const fi = deps();
    expect((await handleForm(KEY, form({ back: "fi", lang: "sv", name: "Anna", message: "Hei" }), fi.d)).headers.get("location")).toBe("https://forening.example/fi/sent/");
    expect((await handleForm(KEY, form({ back: "fi", website: "http://spam", message: "x" }), deps().d)).headers.get("location")).toBe("https://forening.example/fi/sent/");
    expect((await handleForm(KEY, form({ back: "fi", message: "Hei" }), deps({ ...TARGET, limited: true }).d)).headers.get("location")).toBe("https://forening.example/fi/not-sent/");
    for (const back of ["https://evil.example", "//evil.example", "../x", "de", "constructor"]) {
      expect((await handleForm(KEY, form({ back, name: "Anna", message: "Hej" }), deps().d)).headers.get("location")).toBe("https://forening.example/sent/");
    }
  });

  it("sends through Resend with a reply-to", async () => {
    let body: unknown;
    const fetchImpl = (async (_url: string, init: RequestInit) => ((body = JSON.parse(String(init.body))), new Response("{}", { status: 200 }))) as unknown as typeof fetch;
    expect(await sendWithResend("re_test", "Axivo <form@example.test>", { to: "k@example.test", replyTo: "a@example.test", subject: "S", text: "T" }, fetchImpl)).toBe(true);
    expect(body).toEqual({ from: "Axivo <form@example.test>", to: ["k@example.test"], subject: "S", text: "T", reply_to: "a@example.test" });
  });
});
