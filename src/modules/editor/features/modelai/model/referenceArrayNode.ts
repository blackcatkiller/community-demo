// @ts-nocheck
import type { BoundingBox } from "@modelai/core/math";
import { GroupNode } from "./node";
import { serializable, serialize } from "../serialize";

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
    sourceBounds: toSerializedBounds(target.sourceBounds)
  }),
  deserialize: (data: Record<string, unknown>) => {
    const node = new ReferenceArrayNode(
      String(data.name ?? "ReferenceArray"),
      String(data.sourceNodeId ?? ""),
      fromSerializedBounds(data.sourceBounds as SerializedBounds | undefined),
      String(data.id ?? "")
    );
    node.visible = Boolean(data.visible);
    return node;
  }
})
export class ReferenceArrayNode extends GroupNode {
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
}
