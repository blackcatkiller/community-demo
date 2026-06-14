// @ts-nocheck
import {
  type BoundingBox,
  BoundingBoxUtils,
  Matrix4,
  Plane,
  XYZ
} from "@modelai/core/math";
import { Result } from "@modelai/core/result";
import type { IShape, IShapeMeshData } from "@modelai/core/types";
import type {
  FeatureGeometryResult,
  FeatureGuideDescriptor
} from "@/features/modelai/geometry/featureGeometry";
import { disposeGuideDescriptors } from "@/features/modelai/geometry/featureGeometry";
import { Node } from "./node";

export abstract class VisualNode extends Node {
  get transform(): Matrix4 {
    return this.getPrivateValue("transform" as any, Matrix4.identity()) as any;
  }
  set transform(v: Matrix4) {
    this.setProperty("transform" as any, v as any, undefined, {
      equals: (a: any, b: any) => a.equals(b)
    });
  }

  protected onVisibleChanged() {}
  protected onParentVisibleChanged() {}

  abstract boundingBox(): BoundingBox | undefined;
}

export abstract class GeometryNode extends VisualNode {
  protected _mesh: IShapeMeshData | undefined;

  get mesh(): IShapeMeshData {
    this._mesh ??= this.createMesh();
    return this._mesh;
  }

  override boundingBox(): BoundingBox | undefined {
    let points = this.mesh.faces?.position;
    if (!points || points.length === 0) points = this.mesh.edges?.position;
    if (!points || points.length === 0) return undefined;
    return BoundingBoxUtils.fromNumbers(this.transform.ofPoints(points));
  }

  protected abstract createMesh(): IShapeMeshData;

  override disposeInternal() {
    super.disposeInternal();
    this._mesh = undefined;
  }
}

export abstract class ShapeNode extends GeometryNode {
  protected _shape: Result<IShape> = Result.err("Shape not initialized");
  protected _guides: FeatureGuideDescriptor[] = [];
  private _shapeSource?: ShapeNode;

  get shapeMode(): "owned" | "reference" {
    return this._shapeSource ? "reference" : "owned";
  }

  get isReferenceShape() {
    return this._shapeSource !== undefined;
  }

  get shapeSource(): ShapeNode | undefined {
    return this._shapeSource;
  }

  get resolvedShapeSource(): ShapeNode {
    return this._shapeSource?.resolvedShapeSource ?? this;
  }

  get shape(): Result<IShape> {
    return this._shapeSource?.shape ?? this._shape;
  }

  get guides(): readonly FeatureGuideDescriptor[] {
    return this._shapeSource?.guides ?? this._guides;
  }

  protected setShape(shape: Result<IShape>) {
    this.setFeatureGeometry({
      shape,
      guides: []
    });
  }

  protected setFeatureGeometry(result: FeatureGeometryResult) {
    if (this._shapeSource) {
      throw new Error("Cannot set geometry on a reference ShapeNode");
    }
    if (!result.shape.isOk) {
      disposeGuideDescriptors(result.guides);
      return;
    }
    const old = this._shape;
    const oldGuides = this._guides;
    this._shape = result.shape;
    this._guides = [...result.guides];
    this._mesh = undefined;
    this.emitPropertyChanged("shape", old);
    disposeGuideDescriptors(oldGuides);
    old.unchecked()?.dispose();
  }

  protected setShapeSource(source?: ShapeNode) {
    const nextSource = source?.resolvedShapeSource;
    if (nextSource === this) {
      throw new Error("A ShapeNode cannot reference itself");
    }
    if (this._shapeSource === nextSource) return;

    const oldShape = this.shape;
    const ownedShape = this._shape;
    this.detachShapeSource();
    this._shapeSource = nextSource;
    this._mesh = undefined;
    this.emitPropertyChanged("shape", oldShape);

    if (nextSource) {
      disposeGuideDescriptors(this._guides);
      this._guides = [];
    }

    if (nextSource && ownedShape.isOk) {
      this._shape = Result.err("Shape is provided by reference source");
      ownedShape.value.dispose();
    }

    if (nextSource) {
      nextSource.onPropertyChanged(this.handleShapeSourceChanged);
    }
  }

  protected override createMesh(): IShapeMeshData {
    if (!this.shape.isOk) {
      return { edges: undefined, faces: undefined, vertexs: undefined };
    }
    return this.shape.value.mesh;
  }

  override disposeInternal() {
    const isOwnedShape = !this._shapeSource;
    this.detachShapeSource();
    super.disposeInternal();
    if (isOwnedShape) {
      disposeGuideDescriptors(this._guides);
      this._guides = [];
    }
    if (isOwnedShape) {
      this._shape.unchecked()?.dispose();
    }
  }

  private readonly handleShapeSourceChanged = (prop: string) => {
    if (prop !== "shape") return;
    this._mesh = undefined;
    this.emitPropertyChanged("shape", undefined);
  };

  private detachShapeSource() {
    this._shapeSource?.removePropertyChanged(this.handleShapeSourceChanged);
    this._shapeSource = undefined;
  }
}

export type ShapeNodeConstructOptions = {
  id?: string;
  rebuild?: boolean;
};

export function resolveShapeNodeConstructOptions(
  options?: string | ShapeNodeConstructOptions
): ShapeNodeConstructOptions {
  return typeof options === "string" ? { id: options } : (options ?? {});
}

const pendingShapeSourceIds = new WeakMap<ShapeNode, string | undefined>();

export function bindShapeReference(target: ShapeNode, source: ShapeNode): void {
  (target as any).setShapeSource(source);
  pendingShapeSourceIds.delete(target);
}

export function resolveEditableShapeSource<TNode>(node: TNode): TNode {
  if (node instanceof ShapeNode) {
    return node.resolvedShapeSource as TNode;
  }
  return node;
}

function cloneShapePoint(point: XYZ): XYZ {
  return new XYZ(point.x, point.y, point.z);
}

function resolveNodeViewTransform(node: unknown): Matrix4 | undefined {
  return node instanceof VisualNode ? node.transform : undefined;
}

function transformShapeVector(
  transform: Matrix4 | undefined,
  vector: XYZ
): XYZ {
  const mapped = transform ? transform.ofVector(vector) : vector;
  return mapped.normalize();
}

export function mapEditablePointToNodeView(node: unknown, point: XYZ): XYZ {
  const transform = resolveNodeViewTransform(node);
  const mapped = transform ? transform.ofPoint(point) : point;
  return cloneShapePoint(mapped);
}

export function mapNodeViewPointToEditable(node: unknown, point: XYZ): XYZ {
  const inverse = resolveNodeViewTransform(node)?.invert();
  const mapped = inverse ? inverse.ofPoint(point) : point;
  return cloneShapePoint(mapped);
}

export function mapEditablePlaneToNodeView(node: unknown, plane: Plane): Plane {
  const transform = resolveNodeViewTransform(node);
  return new Plane(
    mapEditablePointToNodeView(node, plane.origin),
    transformShapeVector(transform, plane.normal),
    transformShapeVector(transform, plane.xvec)
  );
}

export function mapNodeViewPlaneToEditable(node: unknown, plane: Plane): Plane {
  const inverse = resolveNodeViewTransform(node)?.invert();
  return new Plane(
    mapNodeViewPointToEditable(node, plane.origin),
    transformShapeVector(inverse, plane.normal),
    transformShapeVector(inverse, plane.xvec)
  );
}

export function serializeShapeReference(target: ShapeNode) {
  return {
    shapeMode: target.shapeMode,
    shapeSourceId: target.shapeSource?.id
  };
}

export function restorePendingShapeReference(
  target: ShapeNode,
  data: Record<string, unknown>
): void {
  if (data.shapeMode !== "reference") {
    pendingShapeSourceIds.delete(target);
    return;
  }
  pendingShapeSourceIds.set(
    target,
    typeof data.shapeSourceId === "string" ? data.shapeSourceId : undefined
  );
}

export function getPendingShapeSourceId(target: ShapeNode): string | undefined {
  return pendingShapeSourceIds.get(target);
}

export function reconnectPendingShapeReferences(nodes: Iterable<unknown>) {
  const shapeNodes = [...nodes].filter((node): node is ShapeNode => {
    return node instanceof ShapeNode;
  });
  const nodeMap = new Map(shapeNodes.map(node => [node.id, node]));
  const reconnected = new Set<ShapeNode>();
  const reconnecting = new Set<ShapeNode>();

  const reconnect = (node: ShapeNode) => {
    if (reconnected.has(node) || !pendingShapeSourceIds.has(node)) return;
    if (reconnecting.has(node)) {
      throw new Error(
        `[ModelAI] circular reference shape source detected: ${node.id}`
      );
    }
    reconnecting.add(node);
    try {
      const sourceId = pendingShapeSourceIds.get(node);
      if (!sourceId) {
        throw new Error(
          `[ModelAI] reference shape source not found: ${String(sourceId)}`
        );
      }
      const source = nodeMap.get(sourceId);
      if (!source) {
        throw new Error(
          `[ModelAI] reference shape source not found: ${sourceId}`
        );
      }
      reconnect(source);
      bindShapeReference(node, source);
      reconnected.add(node);
    } finally {
      reconnecting.delete(node);
    }
  };

  for (const node of shapeNodes) {
    reconnect(node);
  }
}
