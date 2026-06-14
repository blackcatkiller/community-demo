// @ts-nocheck
import type { IStorage } from "@modelai/core/storage";
import { HttpStorage } from "./httpStorage";
import { IndexedDBStorage } from "./indexedDBStorage";

/**
 * Switches storage backend via `VITE_MODELAI_STORAGE_DRIVER`:
 * - `indexeddb` 鈫?{@link IndexedDBStorage} (local import / legacy tooling)
 * - unset / other 鈫?{@link HttpStorage} (default; configure `VITE_MODELAI_STORAGE_API_BASE`)
 */
export function createModelAIStorage(): IStorage {
  const driver = import.meta.env.VITE_MODELAI_STORAGE_DRIVER;
  if (driver === "indexeddb") {
    return new IndexedDBStorage();
  }
  return new HttpStorage();
}
