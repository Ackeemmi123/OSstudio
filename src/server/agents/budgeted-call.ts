/**
 * One model call within the monthly AI budget, for any agent. The most the
 * call could cost is reserved before it starts; afterwards the reservation
 * is settled to what the provider reported, to nothing when the provider
 * refused before doing any work, or in full when the cost is unknown.
 */
import { formatUsd, spentMicros, type TokenUsage } from "@/lib/agents/pricing";
import { ModelError, type ModelAnswer } from "./model";

export type BudgetReservation = { ok: true } | { ok: false; spentMicros: number; reservedMicros: number };

export interface Spend {
  usage: TokenUsage;
  servedBy: string | null;
  costMicros: number;
}

export interface BudgetStore {
  /** Holds `amountMicros` of this month's AI budget for a running run, unless that would pass `capMicros`. */
  reserveBudget(runId: string, amountMicros: number, capMicros: number): Promise<BudgetReservation>;
  /** Settles a run's reservation at what it cost; null charges the whole reservation. Settling twice changes nothing. */
  settleBudget(runId: string, chargedMicros: number | null): Promise<void>;
}

export type BudgetedCall =
  /** The budget had no room; no call was made. `message` says why, for a person. */
  | { kind: "refused"; message: string }
  | { kind: "answered"; answer: ModelAnswer; spend: Spend }
  | { kind: "failed"; error: ModelError; spend: Spend | undefined };

export async function callWithinBudget(
  store: BudgetStore,
  options: { runId: string; neededMicros: number; capMicros: number; nowMs: number },
  call: () => Promise<ModelAnswer>,
): Promise<BudgetedCall> {
  const { runId, neededMicros, capMicros, nowMs } = options;
  const reservation = await store.reserveBudget(runId, neededMicros, capMicros);
  if (!reservation.ok) return { kind: "refused", message: budgetMessage(reservation, capMicros, neededMicros, nowMs) };

  let answer: ModelAnswer;
  try {
    answer = await call();
  } catch (error) {
    const failure = error instanceof ModelError ? error : new ModelError("The request failed unexpectedly.", true);
    if (failure.spent === "nothing") {
      await store.settleBudget(runId, 0);
      return { kind: "failed", error: failure, spend: undefined };
    }
    if (failure.spent) {
      const spend = { usage: failure.spent.usage, servedBy: failure.spent.servedBy, costMicros: spentMicros(failure.spent) };
      await store.settleBudget(runId, spend.costMicros);
      return { kind: "failed", error: failure, spend };
    }
    // The call may still have been billed.
    await store.settleBudget(runId, null);
    return { kind: "failed", error: failure, spend: undefined };
  }
  const spend = { usage: answer.usage, servedBy: answer.servedBy, costMicros: spentMicros(answer) };
  await store.settleBudget(runId, spend.costMicros);
  return { kind: "answered", answer, spend };
}

function budgetMessage(reservation: { spentMicros: number; reservedMicros: number }, capMicros: number, neededMicros: number, nowMs: number) {
  const today = new Date(nowMs);
  const resets = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1)).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
  const cap = formatUsd(capMicros);
  const spent = formatUsd(reservation.spentMicros);
  const after = `AI features work again from ${resets}, or sooner if an administrator raises the limit.`;
  if (reservation.spentMicros >= capMicros) return `This month's AI budget of ${cap} is used up (${spent} spent). ${after}`;
  if (reservation.reservedMicros > 0) {
    return `This month's AI budget of ${cap} has no room for another request while others are running (${spent} spent, ${formatUsd(reservation.reservedMicros)} held for requests in progress). Try again in a few minutes.`;
  }
  return `This month's AI budget of ${cap} is almost used up (${spent} spent), and this request can cost up to ${formatUsd(neededMicros)}. ${after}`;
}
