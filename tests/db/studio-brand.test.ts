/**
 * The agency brand against a local Supabase stack: only an owner changes it,
 * every value is checked, the studio's people read it, and only the server
 * reads it behind a preview link. Every value is invented.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { addMember, admin, createStudio, createUser, type TestUser } from "./helpers";

let owner: TestUser;
let member: TestUser;
let outsider: TestUser;
let studio: string;

beforeAll(async () => {
  [owner, member, outsider] = await Promise.all([createUser("brand-owner"), createUser("brand-member"), createUser("brand-outsider")]);
  studio = await createStudio(owner, "Brand test");
  await createStudio(outsider, "Elsewhere");
  await addMember(owner, studio, member, "member", "Mona Member");
});

const BRAND = { name: "Testbyrån", website: "https://testbyran.example", email: "hej@testbyran.example", color: "#7A1F2B" };

describe("agency brand", () => {
  it("is changed by an owner only", async () => {
    expect((await member.client.rpc("update_studio_brand", { p_studio: studio, p_brand: BRAND })).error).not.toBeNull();
    expect((await outsider.client.rpc("update_studio_brand", { p_studio: studio, p_brand: BRAND })).error).not.toBeNull();
    const { data, error } = await owner.client.rpc("update_studio_brand", { p_studio: studio, p_brand: { ...BRAND, website: " " } });
    expect(error).toBeNull();
    expect(data).toEqual({ name: "Testbyrån", email: "hej@testbyran.example", color: "#7A1F2B" });
  });

  it("refuses values that are not valid", async () => {
    for (const bad of [{ color: "red" }, { website: "http://insecure.example" }, { email: "nope" }, { logoPath: "other/logo.png" }, { unknown: "x" }, { name: "x".repeat(81) }]) {
      expect((await owner.client.rpc("update_studio_brand", { p_studio: studio, p_brand: bad })).error, JSON.stringify(bad)).not.toBeNull();
    }
    const logoPath = `${studio}/logo-00000000-0000-4000-8000-000000000000.png`;
    expect((await owner.client.rpc("update_studio_brand", { p_studio: studio, p_brand: { ...BRAND, logoPath } })).error).toBeNull();
  });

  it("is read by the studio's people, and behind a link only by the server", async () => {
    expect((await member.client.from("studios").select("brand").eq("id", studio).single()).data?.brand).toMatchObject({ name: "Testbyrån" });
    expect((await outsider.client.from("studios").select("brand").eq("id", studio)).data).toHaveLength(0);
    expect((await owner.client.rpc("studio_brand", { p_studio: studio })).error).not.toBeNull();
    expect((await admin.rpc("studio_brand", { p_studio: studio })).data).toMatchObject({ studioName: "Brand test", name: "Testbyrån" });
  });

  it("keeps the logo bucket closed to direct uploads", async () => {
    const { error } = await owner.client.storage.from("studio-brand").upload(`${studio}/logo-x.png`, new Uint8Array([137, 80, 78, 71]), { contentType: "image/png" });
    expect(error).not.toBeNull();
  });
});
