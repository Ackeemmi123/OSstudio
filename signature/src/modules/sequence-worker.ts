/** The image sequence's worker: its frames are fetched and decoded here, off the page's main thread (sequence-loader.ts). */
import { loader, type FromLoader, type ToLoader } from "./sequence-loader";

const scope = globalThis as unknown as {
  postMessage: (message: FromLoader | { type: "ready" }, transfer?: Transferable[]) => void;
  onmessage: ((event: MessageEvent<ToLoader>) => void) | null;
};

const handle = loader((message, transfer) => scope.postMessage(message, transfer ?? []));
scope.onmessage = ({ data }) => handle(data);
scope.postMessage({ type: "ready" });
