import type { DomainDeps } from "./clients";
import type { Actor } from "./types";

export function testDeps(actor: Actor = { kind: "human", name: "Alex" }): DomainDeps {
  let n = 0;
  return { now: () => "2026-10-26T12:00:00.000Z", createId: () => `id-${++n}`, actor };
}
