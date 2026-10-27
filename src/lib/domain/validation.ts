import type { Client } from "./types";

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Accepts "example.com", "www.example.com/path" and full http(s) URLs.
const WEBSITE_PATTERN = /^(https?:\/\/)?([\p{L}\p{N}-]+\.)+[\p{L}]{2,}(:\d+)?(\/\S*)?$/iu;

export const NAME_MAX_LENGTH = 120;

export interface ClientIdentityValues {
  name: string;
  email?: string;
  website?: string;
}

export function validateClientIdentity(
  values: ClientIdentityValues,
): FieldErrors<"name" | "email" | "website"> {
  const errors: FieldErrors<"name" | "email" | "website"> = {};
  const name = values.name.trim();

  if (!name) {
    errors.name = "Enter the company or client name.";
  } else if (name.length > NAME_MAX_LENGTH) {
    errors.name = `Keep the name under ${NAME_MAX_LENGTH} characters.`;
  }

  const email = values.email?.trim();
  if (email && !EMAIL_PATTERN.test(email)) {
    errors.email = "Enter a valid email address, like name@company.com.";
  }

  const website = values.website?.trim();
  if (website && !WEBSITE_PATTERN.test(website)) {
    errors.website = "Enter a valid web address, like company.com.";
  }

  return errors;
}

export function hasErrors(errors: Record<string, string | undefined>): boolean {
  return Object.values(errors).some(Boolean);
}

/** Finds an existing client with the same name, ignoring case and spacing. */
export function findDuplicateClient(
  clients: Client[],
  name: string,
  excludeId?: string,
): Client | undefined {
  const normalized = normalizeName(name);
  if (!normalized) return undefined;
  return clients.find((client) => client.id !== excludeId && normalizeName(client.name) === normalized);
}

function normalizeName(name: string): string {
  return name.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}
