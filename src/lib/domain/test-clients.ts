import type { Client } from "./types";

/** A client made for trying Studio OS out, named with "(TEST)" as the team does. */
export function isTestClient(client: Pick<Client, "name">): boolean {
  return /\(test\)/i.test(client.name);
}
