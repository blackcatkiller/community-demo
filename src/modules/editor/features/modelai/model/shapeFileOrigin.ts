// @ts-nocheck
import type { IStorage } from "@modelai/core/storage";
import type { OccSourceFormat } from "@modelai/occ/convertWorkerTypes";

/** OSS object reference (aligned with DfmProjectObjectRef). */
export interface ShapeFileOssRef {
  ossPath: string;
  objectUrl?: string;
  bucket?: string;
  key?: string;
  sizeBytes?: number;
  contentType?: string | null;
}

/** Source CAD file persisted in IndexedDB (binary store). */
export type ShapeFileOriginIndexedDb = {
  kind: "indexeddb";
  database: string;
  table: string;
  key: string;
  format: OccSourceFormat;
  fileName: string;
  /** Index among leaf `shape` nodes from worker root (DFS, same order as import). */
  leafShapeIndex: number;
  /** When set (e.g. DFM import), backend jobs use OSS while reopen prefers IDB. */
  mirrorOss?: ShapeFileOssRef;
};

/** Source file on OSS (DFM backend / remote). */
export type ShapeFileOriginOss = {
  kind: "oss-file";
  format: OccSourceFormat;
  fileName: string;
  ref: ShapeFileOssRef;
  /** Same semantics as indexeddb branch when geometry was split from one file. */
  leafShapeIndex: number;
};

export type ShapeFileOrigin = ShapeFileOriginIndexedDb | ShapeFileOriginOss;

/** OSS path for DFM backend jobs (mirror on IDB origins, or primary on oss-file). */
export function getOssRefForDfmBackend(
  origin: ShapeFileOrigin | undefined
): ShapeFileOssRef | undefined {
  if (!origin) return undefined;
  if (origin.kind === "oss-file") return origin.ref;
  return origin.mirrorOss;
}

export function createIndexedDbShapeFileOrigin(
  database: string,
  table: string,
  key: string,
  format: OccSourceFormat,
  fileName: string,
  leafShapeIndex: number,
  mirrorOss?: ShapeFileOssRef
): ShapeFileOriginIndexedDb {
  return {
    kind: "indexeddb",
    database,
    table,
    key,
    format,
    fileName,
    leafShapeIndex,
    ...(mirrorOss ? { mirrorOss } : {})
  };
}

/** Unique key segment for import blobs under a document. */
export function newImportBlobId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `imp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Deep-copy IDB blob to a new key; shallow-copy OSS ref (shared remote object). */
export async function cloneShapeFileOriginForNodeCopy(
  storage: IStorage,
  documentId: string,
  origin: ShapeFileOrigin | undefined
): Promise<ShapeFileOrigin | undefined> {
  if (!origin) return undefined;
  if (origin.kind === "oss-file") {
    return {
      kind: "oss-file",
      format: origin.format,
      fileName: origin.fileName,
      leafShapeIndex: origin.leafShapeIndex,
      ref: { ...origin.ref }
    };
  }
  const raw = await storage.get(origin.database, origin.table, origin.key);
  if (raw === undefined || raw === null) return undefined;
  const buffer =
    raw instanceof Blob ? await raw.arrayBuffer() : (raw as ArrayBuffer);
  const extMatch = origin.fileName.match(/\.[^.]+$/i);
  const newKey = `${documentId}/imports/${newImportBlobId()}${extMatch?.[0] ?? ""}`;
  const toStore = buffer.byteLength ? buffer.slice(0) : buffer;
  await storage.put(origin.database, origin.table, newKey, toStore);
  return {
    kind: "indexeddb",
    database: origin.database,
    table: origin.table,
    key: newKey,
    format: origin.format,
    fileName: origin.fileName,
    leafShapeIndex: origin.leafShapeIndex,
    ...(origin.mirrorOss ? { mirrorOss: { ...origin.mirrorOss } } : {})
  };
}

export function parseShapeFileOrigin(
  raw: unknown
): ShapeFileOrigin | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const kind = o.kind;
  if (kind === "indexeddb") {
    const database = o.database;
    const table = o.table;
    const key = o.key;
    const format = o.format;
    const fileName = o.fileName;
    const leafShapeIndex = o.leafShapeIndex;
    if (
      typeof database !== "string" ||
      typeof table !== "string" ||
      typeof key !== "string" ||
      (format !== "step" && format !== "iges") ||
      typeof fileName !== "string" ||
      typeof leafShapeIndex !== "number" ||
      !Number.isFinite(leafShapeIndex) ||
      leafShapeIndex < 0
    ) {
      return undefined;
    }
    const mirrorRaw = o.mirrorOss;
    let mirrorOss: ShapeFileOssRef | undefined;
    if (mirrorRaw && typeof mirrorRaw === "object") {
      const mr = mirrorRaw as Record<string, unknown>;
      if (typeof mr.ossPath === "string") {
        mirrorOss = {
          ossPath: mr.ossPath,
          objectUrl:
            typeof mr.objectUrl === "string" ? mr.objectUrl : undefined,
          bucket: typeof mr.bucket === "string" ? mr.bucket : undefined,
          key: typeof mr.key === "string" ? mr.key : undefined,
          sizeBytes:
            typeof mr.sizeBytes === "number" ? mr.sizeBytes : undefined,
          contentType:
            mr.contentType === null || typeof mr.contentType === "string"
              ? (mr.contentType as string | null)
              : undefined
        };
      }
    }
    return {
      kind: "indexeddb",
      database,
      table,
      key,
      format,
      fileName,
      leafShapeIndex: Math.floor(leafShapeIndex),
      ...(mirrorOss ? { mirrorOss } : {})
    };
  }
  if (kind === "oss-file") {
    const format = o.format;
    const fileName = o.fileName;
    const leafShapeIndex = o.leafShapeIndex;
    const ref = o.ref;
    if (
      (format !== "step" && format !== "iges") ||
      typeof fileName !== "string" ||
      typeof leafShapeIndex !== "number" ||
      !Number.isFinite(leafShapeIndex) ||
      leafShapeIndex < 0 ||
      !ref ||
      typeof ref !== "object"
    ) {
      return undefined;
    }
    const r = ref as Record<string, unknown>;
    if (typeof r.ossPath !== "string") return undefined;
    return {
      kind: "oss-file",
      format,
      fileName,
      leafShapeIndex: Math.floor(leafShapeIndex),
      ref: {
        ossPath: r.ossPath,
        objectUrl: typeof r.objectUrl === "string" ? r.objectUrl : undefined,
        bucket: typeof r.bucket === "string" ? r.bucket : undefined,
        key: typeof r.key === "string" ? r.key : undefined,
        sizeBytes: typeof r.sizeBytes === "number" ? r.sizeBytes : undefined,
        contentType:
          r.contentType === null || typeof r.contentType === "string"
            ? (r.contentType as string | null)
            : undefined
      }
    };
  }
  return undefined;
}
