import { describe, expect, it } from "vitest";
import { standardTexts } from "./standard-texts";

describe("the studio's standard texts", () => {
  it("name the client and its e-mail in each language", () => {
    const texts = standardTexts({ name: "Mätbageriet (TEST)", email: "hej@bageri.fi" }, ["sv", "fi", "en"])!;
    expect(texts.privacy.sv).toContain("Personuppgiftsansvarig är Mätbageriet. Du når oss på hej@bageri.fi.");
    expect(texts.privacy.fi).toContain("tietosuojavaltuutetun toimiston puoleen");
    expect(texts.privacy.en).toContain("the Data Protection Ombudsman");
    expect(texts.reply.sv).toBe("Meddelandet går till hej@bageri.fi. Vi svarar så snart vi kan.");
    expect(texts.submit).toEqual({ sv: "Skicka", fi: "Lähetä", en: "Send" });
  });

  it("say there is no tracking only when nothing tracks", () => {
    expect(standardTexts({ name: "A", email: "a@a.fi" }, ["sv"])!.privacy.sv).toContain("inga kakor");
    expect(standardTexts({ name: "A", email: "a@a.fi" }, ["sv"], true)!.privacy.sv).not.toContain("kakor");
  });

  it("are left out when there is no e-mail to name", () => {
    expect(standardTexts({ name: "A", email: null }, ["sv"])).toBeNull();
    expect(standardTexts({ name: "A", email: "  " }, ["sv"])).toBeNull();
  });
});

describe("a first draft for a client with an e-mail", () => {
  it("has its form and privacy page written, with a reminder to have the client read them", async () => {
    const { briefClient } = await import("./test-helpers");
    const { templateSpec } = await import("./templates");
    const { approvalBlockers } = await import("./validate");
    const { qualityWarnings } = await import("./checks");
    const client = { ...briefClient(), email: "hej@bageri.fi" };
    const { spec } = templateSpec(client, { projectType: "website" }, "services", ["sv"]);
    const blockers = approvalBlockers(spec, client).map((b) => b.message).join(" ");
    expect(blockers).not.toMatch(/consent text|send button|what happens next|Integritet › Text/);
    expect(spec.forms[0].replyNote?.sv).toContain("hej@bageri.fi");
    expect(qualityWarnings(spec).map((w) => w.message)).toContain("The privacy text is the studio's standard wording. Have the client read it, and adjust it if they collect anything more.");
  });
});
