// @ts-nocheck
import type { IView, VisualShapeData } from "@modelai/core/types";
import { VisualState } from "@modelai/core/types";
import type { XYZ } from "@modelai/core/math";
import type { ISnap, MouseAndDetected, SnapResult } from "../snap";

export abstract class BaseSnap implements ISnap {
  protected tempMeshIds: Map<IView, number[]> = new Map();
  protected highlightedShapes: VisualShapeData[] = [];
  private highlightedView?: IView;

  constructor(readonly referencePoint?: () => XYZ) {}

  abstract snap(data: MouseAndDetected): SnapResult | undefined;

  removeDynamicObject(): void {
    this.clearTempMeshes();
    this.unhighlight();
  }

  clear(): void {
    this.removeDynamicObject();
  }

  protected clearTempMeshes(): void {
    this.tempMeshIds.forEach((ids, view) => {
      ids.forEach(id => view.document.visual.context.removeMesh(id));
    });
    this.tempMeshIds.clear();
  }

  protected addTempMesh(view: IView, meshId: number): void {
    let ids = this.tempMeshIds.get(view);
    if (!ids) {
      ids = [];
      this.tempMeshIds.set(view, ids);
    }
    ids.push(meshId);
  }

  protected highlight(view: IView, shapes: VisualShapeData[]): void {
    const highlighter = view.document.visual.highlighter;
    shapes.forEach(shape => {
      if (shape.guide) return;
      highlighter.addState(
        shape.owner,
        VisualState.snapHighlight,
        shape.shape.shapeType,
        ...shape.indexes
      );
    });
    this.highlightedView = view;
    this.highlightedShapes.push(...shapes);
  }

  protected unhighlight(): void {
    const highlighter = this.highlightedView?.document.visual.highlighter;
    if (highlighter) {
      this.highlightedShapes.forEach(shape => {
        if (shape.guide) return;
        highlighter.removeState(
          shape.owner,
          VisualState.snapHighlight,
          shape.shape.shapeType,
          ...shape.indexes
        );
      });
    }
    this.highlightedShapes.length = 0;
    this.highlightedView = undefined;
  }

  protected calculateDistance(point: XYZ): number | undefined {
    return this.referencePoint
      ? this.referencePoint().distanceTo(point)
      : undefined;
  }
}
