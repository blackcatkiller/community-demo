// @ts-nocheck
import {
  type BoundingBox,
  BoundingBoxUtils,
  Matrix4,
  XYZ
} from "@modelai/core/math";
import { VisualNode } from "./shapeNode";
import { serializable, serialize } from "../serialize";

function boundingBoxCorners(box: BoundingBox): XYZ[] {
  return [
    new XYZ(box.min.x, box.min.y, box.min.z),
    new XYZ(box.min.x, box.min.y, box.max.z),
    new XYZ(box.min.x, box.max.y, box.min.z),
    new XYZ(box.min.x, box.max.y, box.max.z),
    new XYZ(box.max.x, box.min.y, box.min.z),
    new XYZ(box.max.x, box.min.y, box.max.z),
    new XYZ(box.max.x, box.max.y, box.min.z),
    new XYZ(box.max.x, box.max.y, box.max.z)
  ];
}

function transformBoundingBox(
  box: BoundingBox,
  transform: Matrix4
): BoundingBox {
  const points = boundingBoxCorners(box).flatMap(point =>
    transform.ofPoint(point).toArray()
  );
  return BoundingBoxUtils.fromNumbers(points);
}

type SerializedBounds = {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
};

function toSerializedBounds(
  bounds?: BoundingBox
): SerializedBounds | undefined {
  if (!bounds) return undefined;
  return {
    min: { x: bounds.min.x, y: bounds.min.y, z: bounds.min.z },
    max: { x: bounds.max.x, y: bounds.max.y, z: bounds.max.z }
  };
}

function fromSerializedBounds(
  bounds?: SerializedBounds
): BoundingBox | undefined {
  if (!bounds) return undefined;
  return {
    min: { ...bounds.min },
    max: { ...bounds.max }
  } as BoundingBox;
}

const serializableClass: any = serializable;

@serializableClass({
  serialize: target => ({
    id: target.id,
    name: target.name,
    visible: target.visible,
    sourceNodeId: target.sourceNodeId,
    sourceBounds: toSerializedBounds(target.sourceBounds),
    transform: target.transform.toArray()
  }),
  deserialize: (data: Record<string, unknown>) => {
    const node = new ReferenceInstanceNode(
      String(data.name ?? "ReferenceInstance"),
      String(data.sourceNodeId ?? ""),
      fromSerializedBounds(data.sourceBounds as SerializedBounds | undefined),
      String(data.id ?? "")
    );
    node.visible = Boolean(data.visible);
    const transformArray = data.transform as number[] | undefined;
    if (Array.isArray(transformArray) && transformArray.length === 16) {
      node.transform = Matrix4.fromArray(transformArray);
    }
    return node;
  }
})
export class ReferenceInstanceNode extends VisualNode {
  @serialize()
  readonly sourceNodeId: string;
  @serialize()
  readonly sourceBounds?: BoundingBox;

  constructor(
    name: string,
    sourceNodeId: string,
    sourceBounds?: BoundingBox,
    id?: string
  ) {
    super(name, id);
    this.sourceNodeId = sourceNodeId;
    this.sourceBounds = sourceBounds;
  }

  override boundingBox(): BoundingBox | undefined {
    if (!this.sourceBounds) return undefined;
    return transformBoundingBox(this.sourceBounds, this.transform);
  }
}
