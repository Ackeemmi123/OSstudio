import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { handleContact, resendSender } from "./contact.mjs";
import { pack } from "./pack.mjs";

const env = { CONTACT_TO: "client@example.fi", CONTACT_FROM: "site@example.fi", RESEND_API_KEY: "test" };
const good = { name: "Maija Meikäläinen", email: "maija@example.fi", phone: "040 000 0000", message: "Vesivahinko keittiössä." };

describe("the contact form", () => {
  it("passes a message to the client, with replies going to the visitor", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    expect(await handleContact(good, env, send)).toBe("/sent/");
    const mail = send.mock.calls[0][0];
    expect(mail.to).toBe("client@example.fi");
    expect(mail.reply_to).toBe("maija@example.fi");
    expect(mail.text).toContain("Vesivahinko keittiössä.");
    expect(mail.text).toContain("040 000 0000");
  });

  it("sends nothing for a filled spam trap, but looks as if it did", async () => {
    const send = vi.fn();
    expect(await handleContact({ ...good, website: "http://spam" }, env, send)).toBe("/sent/");
    expect(send).not.toHaveBeenCalled();
  });

  it("refuses a message with no name, no message or a bad email", async () => {
    const send = vi.fn();
    for (const change of [{ name: " " }, { message: "" }, { email: "not-an-email" }]) expect(await handleContact({ ...good, ...change }, env, send)).toBe("/not-sent/");
    expect(send).not.toHaveBeenCalled();
  });

  it("cannot be used to add email headers through the name", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    await handleContact({ ...good, name: "Maija\r\nBcc: someone@example.fi" }, env, send);
    expect(send.mock.calls[0][0].subject).not.toMatch(/[\r\n]/);
  });

  it("tells the visitor when sending fails or is not set up, and logs none of their words", async () => {
    const log = vi.spyOn(console, "error");
    const failing = vi.fn().mockRejectedValue(new Error("down"));
    expect(await handleContact(good, env, failing)).toBe("/not-sent/");
    expect(await handleContact(good, { ...env, RESEND_API_KEY: "" }, vi.fn())).toBe("/not-sent/");
    expect(log).not.toHaveBeenCalled();
  });

  it("reports a refused send as a failure", async () => {
    const doFetch = vi.fn().mockResolvedValue({ ok: false, status: 403 });
    await expect(resendSender("key", doFetch)({ to: "x" })).rejects.toThrow("403");
  });
});

describe("packing a site", () => {
  const folder = (html: string) => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "pack-"));
    mkdirSync(path.join(dir, "site"));
    writeFileSync(path.join(dir, "site/index.html"), html);
    return dir;
  };

  it("refuses a test site or a concept", () => {
    expect(() => pack(path.join(folder('<meta name="robots" content="noindex,nofollow">'), "site"), os.tmpdir() + "/never")).toThrow(/not an approved client site/);
    expect(() => pack(path.join(folder('<p class="test-note">x</p>'), "site"), os.tmpdir() + "/never")).toThrow(/test or a concept/);
  });

  it("adds the form and keeps secrets out of the files", () => {
    const dir = folder("<html></html>");
    const out = path.join(dir, "out");
    pack(path.join(dir, "site"), out);
    expect(existsSync(path.join(out, "api/contact.js"))).toBe(true);
    expect(readFileSync(path.join(out, "lib/contact.mjs"), "utf8")).toContain("handleContact");
    expect(readFileSync(path.join(out, "api/contact.js"), "utf8")).toContain("../lib/contact.mjs");
    expect(readFileSync(path.join(out, "vercel.json"), "utf8")).not.toMatch(/key_|re_[a-z0-9]/i);
  });
});
