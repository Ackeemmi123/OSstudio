/**
 * Client retention as staff see it. The database decides the dates and does
 * the anonymising (supabase/migrations/20261029000200_client_retention.sql);
 * this only says when to warn and checks a hold reason before it is sent.
 */
import { DomainError } from "./clients";
import type { Client } from "./types";

/** Today lists a client this many days before it is anonymised. */
export const RETENTION_WARNING_DAYS = 30;
export const HOLD_REASON_MAX_LENGTH = 500;

const DAY = 24 * 3600 * 1000;

/** Whole days until the client is anonymised: 0 when due now, null when held or not known. */
export function daysUntilAnonymised(client: Client, nowMs: number): number | null {
  const endsAt = client.retention?.endsAt;
  if (!endsAt) return null;
  return Math.max(0, Math.ceil((Date.parse(endsAt) - nowMs) / DAY));
}

/** Clients that will be anonymised within the warning period, soonest first. */
export function getRetentionWarnings(clients: Client[], nowMs: number): { client: Client; days: number }[] {
  return clients
    .map((client) => ({ client, days: daysUntilAnonymised(client, nowMs) }))
    .filter((entry): entry is { client: Client; days: number } => entry.days !== null && entry.days <= RETENTION_WARNING_DAYS)
    .sort((a, b) => a.days - b.days);
}

export function describeDaysLeft(days: number): string {
  if (days === 0) return "Anonymised at the next daily run";
  return days === 1 ? "Anonymised in 1 day" : `Anonymised in ${days} days`;
}

/** The reason an owner gives for a hold: required, and short enough to log. */
export function cleanHoldReason(reason: string): string {
  const cleaned = reason.trim();
  if (!cleaned) throw new DomainError("Give a reason for the hold, such as an open dispute or a legal requirement.");
  if (cleaned.length > HOLD_REASON_MAX_LENGTH) throw new DomainError(`Keep the reason under ${HOLD_REASON_MAX_LENGTH} characters.`);
  return cleaned;
}
