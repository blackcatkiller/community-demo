// @ts-nocheck
import type { IDocument } from "@modelai/core/types";
import { MeshDataUtils, VisualConfig } from "@modelai/core/types";
import type { SnapResult } from "./types";

export abstract class TrackingBase {
  protected readonly tempMeshes: Map<IDocument, number[]> = new Map();
  protected isCleared = false;

  constructor(readonly trackingZ: boolean) {}

  clear(): void {
    this.clearTempMeshes();
    this.isCleared = true;
  }

  protected clearTempMeshes(): void {
    this.tempMeshes.forEach((ids, document) => {
      ids.forEach(id => document.visual.context.removeMesh(id));
    });
    this.tempMeshes.clear();
  }

  protected addTempMesh(document: IDocument, meshId: number): void {
    let ids = this.tempMeshes.get(document);
    if (!ids) {
      ids = [];
      this.tempMeshes.set(document, ids);
    }
    ids.push(meshId);
  }

  protected displayPoint(
    document: IDocument,
    point: SnapResult,
    size?: number,
    color?: number
  ): number {
    const data = MeshDataUtils.createVertexMesh(
      point.point!,
      size ?? VisualConfig.trackingVertexSize,
      color ?? VisualConfig.trackingVertexColor
    );
    const id = document.visual.context.displayMesh([data]);
    this.addTempMesh(document, id);
    return id;
  }
}
