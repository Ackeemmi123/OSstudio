import { describe, expect, it } from "vitest";
import { createSeedSnapshot } from "@/lib/data/seed";
import { findDuplicateClient, validateClientIdentity } from "./validation";

describe("validateClientIdentity", () => {
  it("requires a name", () => {
    expect(validateClientIdentity({ name: "  " }).name).toBeDefined();
    expect(validateClientIdentity({ name: "Studio" })).toEqual({});
  });

  it("accepts empty optional fields", () => {
    expect(validateClientIdentity({ name: "Studio", email: "", website: "" })).toEqual({});
  });

  it("checks email and website format when provided", () => {
    const errors = validateClientIdentity({ name: "Studio", email: "not-an-email", website: "not a site" });
    expect(errors.email).toBeDefined();
    expect(errors.website).toBeDefined();
  });

  it.each(["ateljehenrik.se", "www.example.com/shop", "https://example.co.uk", "http://ateljé.se"])(
    "accepts the website %s",
    (website) => {
      expect(validateClientIdentity({ name: "Studio", website }).website).toBeUndefined();
    },
  );
});

describe("findDuplicateClient", () => {
  const { clients } = createSeedSnapshot(0);

  it("matches names regardless of case and spacing", () => {
    expect(findDuplicateClient(clients, "  ateljé   henrik ")?.id).toBe("demo-atelje-henrik");
  });

  it("ignores the client being edited", () => {
    expect(findDuplicateClient(clients, "Ateljé Henrik", "demo-atelje-henrik")).toBeUndefined();
  });
});
