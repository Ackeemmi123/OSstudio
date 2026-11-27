/**
 * The image sequence's frames (sequence.ts): fetched in the order that makes
 * the movement whole soonest, kept as they came (compressed), and decoded one
 * by one when the page asks. It runs in a worker (sequence-worker.ts), so
 * neither the downloads nor the decoding touch the page's main thread in any
 * browser (WebKit decodes `createImageBitmap` on the thread that calls it);
 * where a worker cannot start, the page runs the same code itself.
 *
 * It also settles the format. The page offers the same movement as several
 * sets, the best first (AVIF, then WebP); the first set whose first frame
 * this browser fetches and decodes is the one loaded. So the choice rests on
 * what the browser does with the real file, not on its name or version.
 */

/** Frames fetched at once. */
const PARALLEL = 4;

/** Messages to the loader. A new `load` drops the frames of the last one (the screen crossed to another shape). */
export type ToLoader = { type: "load"; generation: number; sets: string[][] } | { type: "decode"; generation: number; index: number } | { type: "stop" };

/** Messages from it, each with the generation of the `load` it belongs to. `set` comes first: which of the sets it loads. */
export type FromLoader =
  | { type: "set"; generation: number; index: number }
  | { type: "loaded"; generation: number; index: number }
  | { type: "frame"; generation: number; index: number; bitmap: ImageBitmap }
  | { type: "failed"; generation: number; index: number };

/** Every fourth frame, then the last, then every second, then the rest: the movement is whole early and fills in. */
export function order(count: number): number[] {
  const list = new Set<number>();
  for (let i = 0; i < count; i += 4) list.add(i);
  list.add(count - 1);
  for (let i = 2; i < count; i += 4) list.add(i);
  for (let i = 0; i < count; i++) list.add(i);
  return [...list];
}

export function loader(post: (message: FromLoader, transfer?: Transferable[]) => void): (message: ToLoader) => void {
  let generation = -1;
  let files: Array<Blob | undefined> = [];
  let abort = new AbortController();

  const load = async (sets: string[][]) => {
    const mine = generation;
    const { signal } = abort;
    // The last set is not tried: it is all there is, and its frames stand in for each other as before.
    let pick = 0;
    let head: Blob | undefined;
    for (; pick < sets.length - 1; pick++) {
      try {
        head = await (await fetch(sets[pick][0], { signal, priority: "high" })).blob();
        (await createImageBitmap(head)).close();
        break;
      } catch {
        head = undefined;
      }
    }
    if (signal.aborted) return;
    const urls = sets[pick];
    post({ type: "set", generation: mine, index: pick });
    if (head) {
      files[0] = head;
      post({ type: "loaded", generation: mine, index: 0 });
    }
    // The frame that settled the format is not fetched again.
    const queue = order(urls.length).slice(head ? 1 : 0);
    // The first pass (every fourth and the last) goes ahead of anything else the page fetches meanwhile.
    const first = Math.ceil(urls.length / 4) + 1;
    let next = 0;
    const pump = async () => {
      while (next < queue.length && !signal.aborted) {
        const position = next++;
        const index = queue[position];
        try {
          const response = await fetch(urls[index], { signal, priority: position < first ? "high" : "low" });
          if (!response.ok) continue;
          const file = await response.blob();
          if (signal.aborted) return;
          files[index] = file;
          post({ type: "loaded", generation: mine, index });
        } catch {
          // Offline, refused or dropped: the frames that came stand in for it.
        }
      }
    };
    for (let i = 0; i < PARALLEL; i++) void pump();
  };

  return (message) => {
    if (message.type !== "decode") {
      abort.abort();
      abort = new AbortController();
      files = [];
      if (message.type === "stop") return;
      generation = message.generation;
      void load(message.sets);
      return;
    }
    const { index } = message;
    const file = message.generation === generation ? files[index] : undefined;
    const mine = generation;
    if (!file) return post({ type: "failed", generation: message.generation, index });
    createImageBitmap(file).then(
      (bitmap) => post({ type: "frame", generation: mine, index, bitmap }, [bitmap]),
      () => {
        // A file the browser cannot decode: its neighbours stand in.
        files[index] = undefined;
        post({ type: "failed", generation: mine, index });
      },
    );
  };
}
