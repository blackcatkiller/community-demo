// @ts-nocheck
import { Matrix4 } from "@modelai/core/math";
import { Result } from "@modelai/core/result";
import type { IShape } from "@modelai/core/types";
import { serializable } from "../serialize";
import {
  restorePendingShapeReference,
  serializeShapeReference,
  ShapeNode
} from "./shapeNode";
import { parseShapeFileOrigin, type ShapeFileOrigin } from "./shapeFileOrigin";

export class WorkpieceNode extends ShapeNode {
  private _shapeOrigin?: ShapeFileOrigin;

  /** Persisted source CAD (e.g. OSS) for re-hydrating geometry after deserialize. */
  get shapeOrigin(): ShapeFileOrigin | undefined {
    return this._shapeOrigin;
  }
  set shapeOrigin(value: ShapeFileOrigin | undefined) {
    this._shapeOrigin = value;
  }

  override get shape() {
    return super.shape;
  }
  override set shape(s: Result<IShape>) {
    this.setShape(s);
  }

  constructor(name: string, shape: IShape | Result<IShape>, id?: string) {
    super(name, id);
    this._shape = shape instanceof Result ? shape : Result.ok(shape);
  }
}

export function cloneWorkpieceShapeOrigin(
  origin: ShapeFileOrigin | undefined
): ShapeFileOrigin | undefined {
  if (!origin) return undefined;
  if (origin.kind === "oss-file") {
    return {
      ...origin,
      ref: { ...origin.ref }
    };
  }
  return { ...origin };
}

export function copyWorkpieceShapeOrigin(
  target: WorkpieceNode,
  source: ShapeNode
): void {
  const sourceNode = source.resolvedShapeSource;
  if (!(sourceNode instanceof WorkpieceNode)) return;
  target.shapeOrigin = cloneWorkpieceShapeOrigin(sourceNode.shapeOrigin);
}

function deserializeWorkpieceLike(data: Record<string, unknown>) {
  const node = new WorkpieceNode(
    String(data.name ?? "Shape"),
    Result.err("Shape payload is not restored in current phase"),
    typeof data.id === "string" ? data.id : undefined
  );
  node.visible = Boolean(data.visible);
  const transformArray = data.transform as number[] | undefined;
  if (Array.isArray(transformArray) && transformArray.length === 16) {
    node.transform = Matrix4.fromArray(transformArray);
  }
  node.shapeOrigin = parseShapeFileOrigin(data.shapeOrigin);
  restorePendingShapeReference(node, data);
  return node;
}

const serializableClass: any = serializable;

serializableClass({
  serialize: (target: WorkpieceNode) => ({
    id: target.id,
    name: target.name,
    visible: target.visible,
    transform: target.transform.toArray(),
    ...serializeShapeReference(target),
    shapeOrigin: target.shapeOrigin
  }),
  deserialize: deserializeWorkpieceLike
})(WorkpieceNode);

export class EditableShapeNode extends WorkpieceNode {}

serializableClass({
  deserialize: deserializeWorkpieceLike
})(EditableShapeNode);
