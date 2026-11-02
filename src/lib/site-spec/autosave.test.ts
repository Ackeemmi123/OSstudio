import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Autosaver, type SaveStatus } from "./autosave";

class Final extends Error {}

function setup() {
  const saved: string[] = [];
  const statuses: SaveStatus["kind"][] = [];
  let release: Array<(error?: Error) => void> = [];
  let manual = false;
  const saver = new Autosaver<string>({
    save: (value) =>
      new Promise((resolve, reject) => {
        const done = (error?: Error) => {
          if (error) reject(error);
          else {
            saved.push(value);
            resolve();
          }
        };
        if (manual) release.push(done);
        else done();
      }),
    isFinal: (error) => error instanceof Final,
    messageOf: (error) => (error as Error).message,
    onStatus: (status) => statuses.push(status.kind),
    delayMs: 2000,
    retryMs: 5000,
  });
  return {
    saver,
    saved,
    statuses,
    hold: () => void (manual = true),
    finish: (error?: Error) => {
      const next = release;
      release = [];
      next.forEach((done) => done(error));
    },
  };
}

describe("autosaving a draft", () => {
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());

  it("saves once, after the typing pauses, with the newest text", async () => {
    const { saver, saved, statuses } = setup();
    saver.edit("a");
    await vi.advanceTimersByTimeAsync(1000);
    saver.edit("ab");
    await vi.advanceTimersByTimeAsync(1999);
    expect(saved).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(saved).toEqual(["ab"]);
    expect(statuses.at(-1)).toBe("saved");
  });

  it("keeps what is typed during a save, and saves it next, never two at once", async () => {
    const { saver, saved, statuses, hold, finish } = setup();
    hold();
    saver.edit("first");
    await vi.advanceTimersByTimeAsync(2000);
    saver.edit("second");
    await vi.advanceTimersByTimeAsync(5000);
    expect(saved).toEqual([]);
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(saved).toEqual(["first"]);
    expect(statuses.at(-1)).toBe("waiting");
    await vi.advanceTimersByTimeAsync(2000);
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(saved).toEqual(["first", "second"]);
    expect(statuses.at(-1)).toBe("saved");
  });

  it("does not save text older than a draft that cannot be stored, and resumes once fixed", async () => {
    const { saver, saved, statuses } = setup();
    saver.edit("valid");
    saver.hold("Two pages have the same address.");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(saved).toEqual([]);
    expect(statuses.at(-1)).toBe("invalid");
    expect(await saver.flush()).toBe(false);
    saver.edit("fixed");
    await vi.advanceTimersByTimeAsync(2000);
    expect(saved).toEqual(["fixed"]);
  });

  it("stays invalid when a save in progress finishes after the draft became invalid", async () => {
    const { saver, statuses, hold, finish } = setup();
    hold();
    saver.edit("valid");
    await vi.advanceTimersByTimeAsync(2000);
    saver.hold("Not storable.");
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(statuses.at(-1)).toBe("invalid");
  });

  it("tries a failed save again, with the newest text", async () => {
    const { saver, saved, statuses, hold, finish } = setup();
    hold();
    saver.edit("first");
    await vi.advanceTimersByTimeAsync(2000);
    finish(new Error("offline"));
    await vi.advanceTimersByTimeAsync(0);
    expect(statuses.at(-1)).toBe("failed");
    saver.edit("newer");
    await vi.advanceTimersByTimeAsync(2000);
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(saved).toEqual(["newer"]);
    expect(statuses.at(-1)).toBe("saved");
  });

  it("stops at a conflict and overwrites nothing, whatever is typed after", async () => {
    const { saver, saved, statuses, hold, finish } = setup();
    hold();
    saver.edit("mine");
    await vi.advanceTimersByTimeAsync(2000);
    finish(new Final("Someone else changed this."));
    await vi.advanceTimersByTimeAsync(0);
    expect(statuses.at(-1)).toBe("stopped");
    saver.edit("more of mine");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(saved).toEqual([]);
    expect(await saver.flush()).toBe(false);
  });

  it("flush saves what is waiting at once, and waits for a save in progress", async () => {
    const { saver, saved, hold, finish } = setup();
    hold();
    saver.edit("first");
    await vi.advanceTimersByTimeAsync(2000);
    saver.edit("second");
    const flushed = saver.flush();
    finish();
    await vi.advanceTimersByTimeAsync(0);
    finish();
    await expect(flushed).resolves.toBe(true);
    expect(saved).toEqual(["first", "second"]);
  });

  it("flush says so when the save fails, so nothing is submitted on old text", async () => {
    const { saver, hold, finish } = setup();
    hold();
    saver.edit("text");
    const flushed = saver.flush();
    finish(new Error("offline"));
    await expect(flushed).resolves.toBe(false);
  });

  it("closing saves what is waiting once, and does not retry after", async () => {
    const { saver, saved } = setup();
    saver.edit("last words");
    saver.close();
    await vi.advanceTimersByTimeAsync(0);
    expect(saved).toEqual(["last words"]);

    const other = setup();
    other.hold();
    other.saver.edit("text");
    other.saver.close();
    other.finish(new Error("offline"));
    await vi.advanceTimersByTimeAsync(60_000);
    other.finish();
    expect(other.saved).toEqual([]);
  });
});
