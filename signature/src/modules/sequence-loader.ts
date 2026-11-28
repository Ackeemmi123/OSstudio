/**
 * The image sequence's frames (sequence.ts): fetched in the order that makes
 * the movement whole soonest, kept as they came (compressed), and decoded one
 * by one when the page asks. It runs in a worker (sequence-worker.ts), so
 * neither the downloads nor the decoding touch the page's main thread in any
 * browser (WebKit decodes `createImageBitmap` on the thread that calls it);
 * where a worker cannot start, the page runs the same code itself.
 */

/** Frames fetched at once. */
const PARALLEL = 4;

/** Messages to the loader. A new `load` drops the frames of the last one (the screen crossed to another set). */
export type ToLoader = { type: "load"; generation: number; urls: string[] } | { type: "decode"; generation: number; index: number } | { type: "stop" };

/** Messages from it, each with the generation of the `load` it belongs to. */
export type FromLoader =
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

  const load = (urls: string[]) => {
    const mine = generation;
    const { signal } = abort;
    const queue = order(urls.length);
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
      load(message.urls);
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
