/**
 * Saving a draft while a person types: after a pause, one save at a time,
 * always the newest text, and never over someone else's change. It holds no
 * opinion on what is saved or how the status looks, so the rules can be tested
 * without a browser.
 */
export type SaveStatus =
  | { kind: "saved" }
  /** Edited; a save is coming. */
  | { kind: "waiting" }
  | { kind: "saving" }
  /** The draft cannot be stored as it is; the person has to fix it. */
  | { kind: "invalid"; message: string }
  /** The save failed and will be tried again. */
  | { kind: "failed"; message: string }
  /** Saving again would not help, for example someone else changed the draft. The text is kept. */
  | { kind: "stopped"; message: string };

export interface AutosaverOptions<T> {
  save: (value: T) => Promise<void>;
  /** The error will not go away by trying again. */
  isFinal: (error: unknown) => boolean;
  messageOf: (error: unknown) => string;
  onStatus: (status: SaveStatus) => void;
  delayMs?: number;
  retryMs?: number;
}

export const SAVE_DELAY_MS = 2000;
const RETRY_DELAY_MS = 5000;

export class Autosaver<T> {
  private pending: { value: T } | null = null;
  private invalid: string | null = null;
  private stopped = false;
  private closed = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight: Promise<boolean> | null = null;

  constructor(private readonly options: AutosaverOptions<T>) {}

  /** A new valid text. It replaces any text still waiting. */
  edit(value: T) {
    this.pending = { value };
    this.invalid = null;
    if (this.stopped) return;
    if (!this.inFlight) this.options.onStatus({ kind: "waiting" });
    this.schedule(this.options.delayMs ?? SAVE_DELAY_MS);
  }

  /** The newest text cannot be stored: anything older must not be saved in its place. */
  hold(message: string) {
    this.pending = null;
    this.invalid = message;
    this.clearTimer();
    if (!this.stopped) this.options.onStatus({ kind: "invalid", message });
  }

  /** Saves everything now. True when everything is stored. */
  async flush(): Promise<boolean> {
    this.clearTimer();
    for (;;) {
      if (this.inFlight) await this.inFlight;
      if (this.stopped || this.invalid !== null) return false;
      if (!this.pending) return true;
      if (!(await this.attempt())) return false;
    }
  }

  /** Allows retries again after close(): React runs effects twice in development. */
  open() {
    this.closed = false;
  }

  /** The page is going away: try what is waiting once more, and then stop. */
  close() {
    this.closed = true;
    void this.flush();
  }

  private schedule(delay: number) {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      // One at a time. The save in progress schedules the next when it ends.
      if (!this.inFlight) void this.attempt();
    }, delay);
  }

  private clearTimer() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private attempt(): Promise<boolean> {
    const current = this.pending;
    if (!current) return Promise.resolve(true);
    this.pending = null;
    this.options.onStatus({ kind: "saving" });
    const attempt = this.options.save(current.value).then(
      () => {
        this.inFlight = null;
        if (this.invalid !== null) this.options.onStatus({ kind: "invalid", message: this.invalid });
        else if (this.pending) {
          this.options.onStatus({ kind: "waiting" });
          if (!this.closed) this.schedule(this.options.delayMs ?? SAVE_DELAY_MS);
        } else this.options.onStatus({ kind: "saved" });
        return true;
      },
      (error: unknown) => {
        this.inFlight = null;
        // Newer text wins; otherwise keep what failed, so it is not lost.
        if (this.invalid === null) this.pending ??= current;
        const message = this.options.messageOf(error);
        if (this.options.isFinal(error)) {
          this.stopped = true;
          this.clearTimer();
          this.options.onStatus({ kind: "stopped", message });
        } else {
          this.options.onStatus({ kind: "failed", message });
          if (!this.closed) this.schedule(this.options.retryMs ?? RETRY_DELAY_MS);
        }
        return false;
      },
    );
    this.inFlight = attempt;
    return attempt;
  }
}
