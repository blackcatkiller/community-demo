// @ts-nocheck
import type {
  OccConvertRequest,
  OccConvertResponse,
  OccConvertedNode,
  OccSourceFormat
} from "./convertWorkerTypes";
import chiliWasmUrl from "./wasmAsset";

function createId() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

function resolveWasmUrl() {
  if (typeof window === "undefined") return chiliWasmUrl;
  return new URL(chiliWasmUrl, window.location.origin).href;
}

type Pending = {
  resolve: (value: OccConvertedNode) => void;
  reject: (reason?: unknown) => void;
};

let workerInstance: Worker | null = null;
const pending = new Map<string, Pending>();

function getWorker() {
  if (workerInstance) return workerInstance;

  workerInstance = new Worker(
    new URL("./occConvert.worker.ts", import.meta.url),
    {
      type: "module"
    }
  );

  workerInstance.onmessage = (event: MessageEvent<OccConvertResponse>) => {
    const message = event.data;
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    if (message.ok === true) entry.resolve(message.root);
    else entry.reject(new Error(message.error));
  };

  workerInstance.onerror = error => {
    const entries = Array.from(pending.values());
    pending.clear();
    for (const entry of entries) {
      entry.reject(error);
    }
  };

  return workerInstance;
}

export async function convertOccFileInWorker(
  data: ArrayBuffer,
  format: OccSourceFormat
): Promise<OccConvertedNode> {
  const worker = getWorker();
  const id = createId();
  const request: OccConvertRequest = {
    id,
    format,
    data,
    wasmUrl: resolveWasmUrl()
  };
  return await new Promise<OccConvertedNode>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage(request, [data]);
  });
}

export function disposeOccConvertWorker() {
  if (!workerInstance) return;
  workerInstance.terminate();
  workerInstance = null;
  const entries = Array.from(pending.values());
  pending.clear();
  for (const entry of entries) {
    entry.reject(new Error("Worker disposed"));
  }
}
