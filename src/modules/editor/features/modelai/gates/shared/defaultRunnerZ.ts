// @ts-nocheck
import type { IDocument, INode, IVisualObject } from "@modelai/core/types";

type NodeWithBoundingBox = INode & Pick<IVisualObject, "boundingBox">;

function hasBoundingBox(node: INode): node is NodeWithBoundingBox {
  return "boundingBox" in node && typeof node.boundingBox === "function";
}

export function resolveDefaultRunnerZ(document: IDocument): number {
  if (Number.isFinite(document.pushPlatePlane.z)) {
    return document.pushPlatePlane.z;
  }

  let minZ = Infinity;
  let maxZ = -Infinity;

  for (const node of document.modelManager.findNodes()) {
    if (!hasBoundingBox(node)) continue;
    const box = node.boundingBox();
    if (!box) continue;
    minZ = Math.min(minZ, box.min.z);
    maxZ = Math.max(maxZ, box.max.z);
  }

  if (!Number.isFinite(minZ) || !Number.isFinite(maxZ)) {
    return 0;
  }

  return maxZ + (maxZ - minZ) * 0.5;
}
