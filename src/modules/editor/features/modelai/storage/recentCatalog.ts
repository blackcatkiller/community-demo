// @ts-nocheck
import type { IStorage } from "@modelai/core/storage";
import {
  MODEL_AI_DB_NAME,
  MODEL_AI_RECENT_TABLE,
  type PersistedRecentDocument
} from "@modelai/serialize";

/** Must match {@link IndexedDBStorage} default page size in getPage. */
export const RECENT_PAGE_BATCH = 20;

export function recentUpdatedAt(row: PersistedRecentDocument): number {
  return row.updatedAt ?? row.date;
}

export function recentCreatedAt(row: PersistedRecentDocument): number {
  return row.createdAt ?? row.date;
}

export function sortRecentDocumentsDesc(
  items: PersistedRecentDocument[]
): PersistedRecentDocument[] {
  return [...items].sort((a, b) => recentUpdatedAt(b) - recentUpdatedAt(a));
}

/**
 * Loads every row from the `recent` object store without touching full documents.
 */
export async function loadAllRecentDocumentsFromStorage(
  storage: IStorage
): Promise<PersistedRecentDocument[]> {
  const all: PersistedRecentDocument[] = [];
  let page = 0;
  while (true) {
    const chunk = (await storage.page(
      MODEL_AI_DB_NAME,
      MODEL_AI_RECENT_TABLE,
      page
    )) as PersistedRecentDocument[];
    all.push(...chunk);
    if (chunk.length < RECENT_PAGE_BATCH) break;
    page++;
  }
  return sortRecentDocumentsDesc(all);
}
