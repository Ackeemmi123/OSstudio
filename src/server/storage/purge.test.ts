import { describe, expect, it, vi } from "vitest";
import { PURGE_BATCH, purgeSiteAssets, type PurgeSteps } from "./purge";

vi.mock("server-only", () => ({}));

function rows(n: number, from = 0) {
  return Array.from({ length: n }, (_, i) => ({ id: `id-${from + i}`, storage_path: `s/c/${from + i}.webp` }));
}

describe("purging image files", () => {
  it("removes the files before forgetting the rows, in batches, until nothing is due", async () => {
    const queue = [rows(PURGE_BATCH), rows(3, PURGE_BATCH)];
    const order: string[] = [];
    const steps: PurgeSteps = {
      due: vi.fn(async () => queue.shift() ?? []),
      remove: vi.fn(async (paths) => void order.push(`remove ${paths.length}`)),
      forget: vi.fn(async (ids) => (order.push(`forget ${ids.length}`), ids.length)),
    };
    expect(await purgeSiteAssets(steps)).toEqual({ filesRemoved: 103, rowsForgotten: 103, rounds: 2 });
    expect(order).toEqual([`remove ${PURGE_BATCH}`, `forget ${PURGE_BATCH}`, "remove 3", "forget 3"]);
  });

  it("forgets nothing when removing the files fails", async () => {
    const steps: PurgeSteps = {
      due: async () => rows(2),
      remove: async () => {
        throw new Error("storage unavailable");
      },
      forget: vi.fn(async () => 0),
    };
    await expect(purgeSiteAssets(steps)).rejects.toThrow("storage unavailable");
    expect(steps.forget).not.toHaveBeenCalled();
  });

  it("does nothing when nothing is due", async () => {
    expect(await purgeSiteAssets({ due: async () => [], remove: vi.fn(), forget: vi.fn() })).toEqual({ filesRemoved: 0, rowsForgotten: 0, rounds: 0 });
  });
});
