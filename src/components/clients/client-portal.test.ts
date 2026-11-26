import { describe, expect, it } from "vitest";
import { portalMailto } from "./client-portal";

const client = { contactPerson: "Liisa Rantala", email: "liisa@example.fi" };
const read = (href: string) => {
  const url = new URL(href);
  return { to: decodeURIComponent(url.pathname), subject: url.searchParams.get("subject"), body: url.searchParams.get("body") ?? "" };
};

describe("the portal link e-mail", () => {
  it("is written in the language chosen for the client", () => {
    const fi = read(portalMailto(client, "https://x.example/p/abc", "Alexander", "Axivo", "fi"));
    expect(fi.to).toBe("liisa@example.fi");
    expect(fi.subject).toBe("Verkkosivustonne oma sivu");
    expect(fi.body).toMatch(/^Hei Liisa!/);
    expect(fi.body).toContain("https://x.example/p/abc");
    expect(fi.body).toContain("Terveisin\nAlexander\nAxivo");
    expect(read(portalMailto(client, "l", "A", "S", "sv")).body).toMatch(/^Hej Liisa!/);
    expect(read(portalMailto({ contactPerson: null, email: null }, "l", "A", "S", "en")).body).toMatch(/^Hi!/);
  });
});
