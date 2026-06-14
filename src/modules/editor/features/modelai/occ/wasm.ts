// @ts-nocheck
import MainModuleFactory, { type MainModule } from "chili-wasm";

declare global {
  var wasm: MainModule;
}

let wasmInitPromise: Promise<MainModule> | null = null;
let activeWasmUrl: string | null = null;
let wasmModule: MainModule | null = null;

export function getInitializedWasm(): MainModule {
  const module = wasmModule ?? globalThis.wasm;
  if (!module?.Converter) {
    const keys = Object.keys(module ?? {})
      .slice(0, 12)
      .join(", ");
    throw new Error(
      `WASM Converter is not initialized${keys ? `; exports=${keys}` : ""}`
    );
  }
  return module;
}

export async function initWasm(wasmUrl: string): Promise<MainModule> {
  if (!wasmUrl) {
    throw new Error("WASM URL is required");
  }

  if (globalThis.wasm?.Converter) {
    activeWasmUrl ??= wasmUrl;
    wasmModule = globalThis.wasm;
    return globalThis.wasm;
  }

  if (wasmInitPromise) {
    if (activeWasmUrl && activeWasmUrl !== wasmUrl) {
      throw new Error(
        `WASM is already initializing with a different URL: ${activeWasmUrl}`
      );
    }
    return await wasmInitPromise;
  }

  activeWasmUrl = wasmUrl;
  wasmInitPromise = (async () => {
    // Preload the WASM file so the browser can cache it and download in parallel.
    const wasmFetchPromise = fetch(wasmUrl, {
      credentials: "same-origin",
      cache: "force-cache" // Always prefer the cached response when available.
    }).then(async response => {
      if (!response.ok) {
        throw new Error(
          `Failed to fetch WASM (${response.status}): ${wasmUrl}`
        );
      }
      return response.arrayBuffer();
    });

    const module = await MainModuleFactory({
      locateFile: (path: string) => {
        if (path.endsWith(".wasm")) return wasmUrl;
        return path;
      },
      // Reuse the preloaded WASM binary data.
      wasmBinary: await wasmFetchPromise
    });

    if (!module?.Converter) {
      const exportedKeys = Object.keys(module ?? {})
        .slice(0, 12)
        .join(", ");
      throw new Error(
        `WASM initialized without Converter. url=${wasmUrl}; exports=${exportedKeys}`
      );
    }

    globalThis.wasm = module;
    wasmModule = module;
    return module;
  })().catch(error => {
    wasmInitPromise = null;
    activeWasmUrl = null;
    throw error;
  });

  return await wasmInitPromise;
}
