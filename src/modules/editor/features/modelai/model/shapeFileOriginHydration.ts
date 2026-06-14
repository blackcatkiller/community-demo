// @ts-nocheck
import type { IStorage } from "@modelai/core/storage";
import type { INode } from "@modelai/core/types";
import type { IShape } from "@modelai/core/types";
import { Result } from "@modelai/core/result";
import { Logger } from "@modelai/core";
import { convertOccFileInWorker } from "@modelai/occ/occConvertWorkerClient";
import type { OccConvertedNode } from "@modelai/occ/convertWorkerTypes";
import { downloadObject } from "@/api/oss";
import { WorkpieceNode } from "./workpieceNode";
import type { ShapeFileOrigin } from "./shapeFileOrigin";

type OccShapeLeaf = Extract<OccConvertedNode, { type: "shape" }>;

function collectLeafShapesFromOccChildren(
  children: OccConvertedNode[]
): OccShapeLeaf[] {
  const out: OccShapeLeaf[] = [];
  const walk = (nodes: OccConvertedNode[]) => {
    for (const n of nodes) {
      if (n.type === "group") {
        walk(n.children);
      } else {
        out.push(n);
      }
    }
  };
  walk(children);
  return out;
}

function occRootToChildren(root: OccConvertedNode): OccConvertedNode[] {
  return root.type === "group" ? root.children : [root];
}

function resolveOssBucketKey(ref: {
  ossPath: string;
  bucket?: string;
  key?: string;
}): { bucket: string; key: string } | undefined {
  const b = ref.bucket?.trim();
  const k = ref.key?.trim();
  if (b && k) return { bucket: b, key: k };
  const p = ref.ossPath.trim();
  if (!p.startsWith("oss://")) return undefined;
  const normalizedPath = p.slice("oss://".length);
  const separatorIndex = normalizedPath.indexOf("/");
  if (separatorIndex <= 0 || separatorIndex >= normalizedPath.length - 1) {
    return undefined;
  }
  return {
    bucket: normalizedPath.slice(0, separatorIndex),
    key: normalizedPath.slice(separatorIndex + 1)
  };
}

async function readBufferForOrigin(
  storage: IStorage,
  origin: ShapeFileOrigin
): Promise<ArrayBuffer> {
  if (origin.kind === "indexeddb") {
    const raw = await storage.get(origin.database, origin.table, origin.key);
    if (raw instanceof ArrayBuffer) return raw;
    if (raw instanceof Blob) return await raw.arrayBuffer();
    throw new Error("[ModelAI] IndexedDB source blob missing or invalid type");
  }
  const bk = resolveOssBucketKey(origin.ref);
  if (!bk) throw new Error("[ModelAI] Invalid OSS ref for shape file origin");
  const downloaded = await downloadObject(bk.bucket, bk.key, false);
  return downloaded.blob.arrayBuffer();
}

type HydrationHost = {
  id: string;
  storage: IStorage;
  converter: {
    convertFromBREP: (brep: string) => Result<IShape>;
  };
};

function getHydrationHost(doc: unknown): HydrationHost | undefined {
  const d = doc as Partial<HydrationHost> & {
    application?: { storage?: IStorage };
  };
  const storage = d.application?.storage;
  const converter = d.converter;
  const id = d.id;
  if (!storage || !converter || typeof id !== "string") return undefined;
  return { id, storage, converter };
}

function groupKey(origin: ShapeFileOrigin): string {
  if (origin.kind === "indexeddb") {
    return `idb:${origin.database}:${origin.table}:${origin.key}:${origin.format}`;
  }
  return `oss:${origin.ref.ossPath}:${origin.format}`;
}

export interface FileOriginHydrationModelRoot {
  readonly document: unknown;
  findNodes(predicate?: (v: INode) => boolean): INode[];
}

export async function hydrateWorkpieceShapesFromShapeOrigins(
  modelRoot: FileOriginHydrationModelRoot
): Promise<void> {
  const host = getHydrationHost(modelRoot.document);
  if (!host) {
    Logger.warn(
      "[ModelAI] hydrate shapes skipped: document has no storage/converter"
    );
    return;
  }

  const targets = modelRoot.findNodes(
    n =>
      n instanceof WorkpieceNode &&
      !n.isReferenceShape &&
      !!(n as WorkpieceNode).shapeOrigin &&
      !(n as WorkpieceNode).shape.isOk
  ) as WorkpieceNode[];

  if (!targets.length) return;

  const byGroup = new Map<string, WorkpieceNode[]>();
  for (const node of targets) {
    const origin = node.shapeOrigin!;
    const k = groupKey(origin);
    const list = byGroup.get(k);
    if (list) list.push(node);
    else byGroup.set(k, [node]);
  }

  for (const nodes of byGroup.values()) {
    const origin = nodes[0]?.shapeOrigin;
    if (!origin) continue;
    try {
      const buffer = await readBufferForOrigin(host.storage, origin);
      const root = await convertOccFileInWorker(buffer, origin.format);
      const leaves = collectLeafShapesFromOccChildren(occRootToChildren(root));

      for (const node of nodes) {
        const fo = node.shapeOrigin;
        if (!fo) continue;
        const leaf = leaves[fo.leafShapeIndex];
        if (!leaf) {
          Logger.warn(
            `[ModelAI] hydrate shape missing leaf index ${fo.leafShapeIndex} for node ${node.id}`
          );
          continue;
        }
        const shapeResult = host.converter.convertFromBREP(leaf.brep);
        if (!shapeResult.isOk) {
          Logger.warn(
            `[ModelAI] hydrate BREP failed for node ${node.id}: ${shapeResult.error}`
          );
          continue;
        }
        const shape = shapeResult.value as any;
        if (leaf.faceColors?.length) shape.faceColors = leaf.faceColors;
        if (leaf.shapeColor) shape.shapeColor = leaf.shapeColor;
        node.shape = Result.ok(shape);
      }
    } catch (error) {
      Logger.warn("[ModelAI] hydrate shape group failed:", origin, error);
    }
  }
}

export const hydrateEditableShapesFromShapeOrigins =
  hydrateWorkpieceShapesFromShapeOrigins;
