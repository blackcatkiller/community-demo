// @ts-nocheck
import type {
  BoundingBox,
  IShape,
  ISubShape,
  ShapeMeshRange,
  ShapeType,
  VisualState
} from "@modelai/core/types";
import type { IVisualObject } from "@modelai/core/types";
import { Matrix4, type XYZ } from "@modelai/core/math";
import type { VisualNode } from "@modelai/model/shapeNode";
import {
  Box3,
  Group,
  type Mesh,
  type Object3D,
  type Points,
  type Raycaster
} from "three";
import type { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { ThreeHelper } from "./helper";

export type VisualPointHitContext = {
  raycaster: Raycaster;
};

export type VisualPointHit = {
  target: IVisualObject;
  distance: number;
  point?: XYZ;
};

export type VisualRectHitContext = {
  selectedObjects: ReadonlySet<Object3D>;
  selectedInstances: ReadonlyMap<string, ReadonlySet<number>>;
};

export interface IVisualHitTarget {
  hitTestPoint(ctx: VisualPointHitContext): VisualPointHit[];
  hitTestRect(ctx: VisualRectHitContext): IVisualObject[];
}

export interface IWholeStateVisual {
  applyWholeVisualState(state: VisualState): void;
  clearWholeVisualState(): void;
}

export function isVisualHitTarget(
  value: IVisualObject
): value is IVisualObject & IVisualHitTarget {
  return (
    typeof (value as Partial<IVisualHitTarget>).hitTestPoint === "function" &&
    typeof (value as Partial<IVisualHitTarget>).hitTestRect === "function"
  );
}

export function isWholeStateVisual(
  value: IVisualObject
): value is IVisualObject & IWholeStateVisual {
  return (
    typeof (value as Partial<IWholeStateVisual>).applyWholeVisualState ===
      "function" &&
    typeof (value as Partial<IWholeStateVisual>).clearWholeVisualState ===
      "function"
  );
}

export abstract class ThreeVisualObject
  extends Group
  implements IVisualObject, IVisualHitTarget
{
  declare visible: boolean;
  declare matrixAutoUpdate: boolean;
  declare matrixWorldNeedsUpdate: boolean;
  declare matrixWorld: import("three").Matrix4;
  declare matrix: import("three").Matrix4;

  constructor(readonly node: VisualNode) {
    super();
    this.matrixAutoUpdate = false;
    this.visible = node.visible && node.parentVisible;
    node.onPropertyChanged(this.handlePropertyChanged);
    this.updateMatrix4();
  }

  private readonly handlePropertyChanged = (prop: string) => {
    if (prop === "transform") {
      this.updateMatrix4();
    } else if (prop === "visible" || prop === "parentVisible") {
      this.visible = this.node.visible && this.node.parentVisible;
    }
  };

  private updateMatrix4() {
    this.matrix.copy(ThreeHelper.fromMatrix(this.node.transform));
    this.matrixWorldNeedsUpdate = true;
  }

  get transform(): Matrix4 {
    return this.node.transform;
  }
  set transform(v: Matrix4) {
    this.node.transform = v;
  }

  worldTransform(): Matrix4 {
    return ThreeHelper.toMatrix(this.matrixWorld);
  }

  boundingBox(): BoundingBox | undefined {
    const box = new Box3().setFromObject(this);
    if (box.isEmpty()) return undefined;
    return { min: ThreeHelper.toXYZ(box.min), max: ThreeHelper.toXYZ(box.max) };
  }

  getSubShapeAndIndex(
    _type: "face" | "edge" | "vertex",
    _subIndex: number
  ): {
    shape: IShape | undefined;
    subShape: ISubShape | undefined;
    index: number;
    groups: ShapeMeshRange[];
    transform?: Matrix4;
  } {
    return { shape: undefined, subShape: undefined, index: -1, groups: [] };
  }

  subShapeVisual(_type: ShapeType): (Mesh | LineSegments2 | Points)[] {
    return [];
  }
  wholeVisual(): (Mesh | LineSegments2 | Points)[] {
    return [];
  }
  hitTestPoint(ctx: VisualPointHitContext): VisualPointHit[] {
    if (!this.visible) return [];
    const wholeVisuals = this.wholeVisual();
    if (wholeVisuals.length === 0) return [];
    const hits = ctx.raycaster.intersectObjects(wholeVisuals, false);
    return hits.length > 0
      ? [
          {
            target: this,
            distance: hits[0].distance,
            point: ThreeHelper.toXYZ(hits[0].pointOnLine ?? hits[0].point)
          }
        ]
      : [];
  }
  hitTestRect(ctx: VisualRectHitContext): IVisualObject[] {
    if (!this.visible) return [];
    return this.wholeVisual().some(obj => ctx.selectedObjects.has(obj))
      ? [this]
      : [];
  }
  add(...object: Object3D[]) {
    return super.add(...object);
  }
  remove(...object: Object3D[]) {
    return super.remove(...object);
  }

  dispose() {
    this.node.removePropertyChanged(this.handlePropertyChanged);
  }
}

export class GroupVisualObject
  extends Group
  implements IVisualObject, IVisualHitTarget
{
  declare visible: boolean;
  declare matrixAutoUpdate: boolean;
  declare matrixWorld: import("three").Matrix4;

  private readonly _handlePropertyChanged = (prop: string) => {
    if (prop === "visible" || prop === "parentVisible") {
      this.visible = this.node.visible && this.node.parentVisible;
    }
  };

  constructor(readonly node: VisualNode) {
    super();
    this.matrixAutoUpdate = false;
    this.visible = node.visible && node.parentVisible;
    node.onPropertyChanged(this._handlePropertyChanged);
  }

  get transform(): Matrix4 {
    return Matrix4.identity();
  }
  set transform(_: Matrix4) {}
  worldTransform(): Matrix4 {
    return ThreeHelper.toMatrix(this.matrixWorld);
  }
  boundingBox(): BoundingBox | undefined {
    const box = new Box3().setFromObject(this);
    if (box.isEmpty()) return undefined;
    return { min: ThreeHelper.toXYZ(box.min), max: ThreeHelper.toXYZ(box.max) };
  }
  wholeVisual(): Object3D[] {
    return [];
  }
  hitTestPoint(ctx: VisualPointHitContext): VisualPointHit[] {
    if (!this.visible) return [];
    const wholeVisuals = this.wholeVisual();
    if (wholeVisuals.length === 0) return [];
    const hits = ctx.raycaster.intersectObjects(wholeVisuals, false);
    return hits.length > 0
      ? [
          {
            target: this,
            distance: hits[0].distance,
            point: ThreeHelper.toXYZ(hits[0].pointOnLine ?? hits[0].point)
          }
        ]
      : [];
  }
  hitTestRect(ctx: VisualRectHitContext): IVisualObject[] {
    if (!this.visible) return [];
    return this.wholeVisual().some(obj => ctx.selectedObjects.has(obj))
      ? [this]
      : [];
  }
  add(...object: Object3D[]) {
    return super.add(...object);
  }
  remove(...object: Object3D[]) {
    return super.remove(...object);
  }
  dispose() {
    this.node.removePropertyChanged(this._handlePropertyChanged);
  }
}
