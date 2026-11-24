import { describe, expect, it } from "vitest";
import { reviewLinkMail } from "./review-mail";

describe("the e-mail with the review link", () => {
  const facts = { contact: "Natalie Segercrantz", until: "2026-12-23T12:46:00Z", sender: "Alexander Hammarén", studio: "Axivo" };

  it("greets the contact by first name in the site's language, and says how to comment and approve", () => {
    const mail = reviewLinkMail("sv", facts);
    expect(mail.subject).toBe("Utkastet till er nya webbplats är klart");
    expect(mail.message).toMatch(/^Hej Natalie!/);
    expect(mail.message).toContain("Kommentera");
    expect(mail.message).toContain("Godkänn");
    expect(mail.message).toContain("23 december");
    expect(mail.message).toMatch(/Hälsningar\nAlexander Hammarén\nAxivo$/);
  });

  it("works without a contact person, in Finnish and English too", () => {
    expect(reviewLinkMail("fi", { ...facts, contact: null }).message).toMatch(/^Hei!/);
    expect(reviewLinkMail("en", facts).message).toMatch(/^Hi Natalie,/);
  });
});
