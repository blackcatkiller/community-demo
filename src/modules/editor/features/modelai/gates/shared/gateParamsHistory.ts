// @ts-nocheck
import type { IHistoryRecord, INode } from "@modelai/core";
import { Plane, XYZ } from "@modelai/core/math";
import type { GateNodeAdapter } from "./nodeAdapter";
import {
  mapNodeViewPlaneToEditable,
  resolveEditableShapeSource
} from "@/features/modelai/model/shapeNode";

export function cloneGateParams<P extends Record<string, unknown>>(
  params: P
): P {
  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => [
      key,
      value instanceof XYZ ? cloneGateXYZ(value) : value
    ])
  ) as P;
}

export function cloneGateXYZ(point: XYZ): XYZ {
  return new XYZ(point.x, point.y, point.z);
}

export function cloneGatePlane(plane: Plane): Plane {
  return new Plane(
    cloneGateXYZ(plane.origin),
    cloneGateXYZ(plane.normal),
    cloneGateXYZ(plane.xvec)
  );
}

export function isSameGateXYZ(previous: XYZ, next: XYZ): boolean {
  return (
    previous.x === next.x && previous.y === next.y && previous.z === next.z
  );
}

export function hasGatePlaneChanged(previous: Plane, next: Plane): boolean {
  return (
    !isSameGateXYZ(previous.origin, next.origin) ||
    !isSameGateXYZ(previous.normal, next.normal) ||
    !isSameGateXYZ(previous.xvec, next.xvec)
  );
}

export function hasGateParamsChanged<P extends Record<string, unknown>>(
  previous: P,
  next: P
): boolean {
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  for (const key of keys) {
    const previousValue = previous[key];
    const nextValue = next[key];
    if (previousValue instanceof XYZ && nextValue instanceof XYZ) {
      if (!isSameGateXYZ(previousValue, nextValue)) {
        return true;
      }
      continue;
    }
    if (previousValue !== nextValue) {
      return true;
    }
  }
  return false;
}

export class GateParamsHistoryRecord<
  P extends Record<string, unknown>,
  TNode extends INode = INode
> implements IHistoryRecord
{
  readonly name: string;
  private readonly before: P;
  private readonly after: P;
  private readonly beforePlane?: Plane;
  private readonly afterPlane?: Plane;
  private readonly sourceNode: TNode;

  constructor(options: {
    name: string;
    node: TNode;
    adapter: GateNodeAdapter<P, TNode>;
    before: P;
    after: P;
    beforePlane?: Plane;
    afterPlane?: Plane;
  }) {
    this.name = options.name;
    this.node = options.node;
    this.adapter = options.adapter;
    this.before = cloneGateParams(options.before);
    this.after = cloneGateParams(options.after);
    this.beforePlane = options.beforePlane
      ? cloneGatePlane(
          mapNodeViewPlaneToEditable(options.node, options.beforePlane)
        )
      : undefined;
    this.afterPlane = options.afterPlane
      ? cloneGatePlane(
          mapNodeViewPlaneToEditable(options.node, options.afterPlane)
        )
      : undefined;
    this.sourceNode = resolveEditableShapeSource(options.node) as TNode;
  }

  private readonly node: TNode;
  private readonly adapter: GateNodeAdapter<P, TNode>;

  dispose(): void {}

  undo(): void {
    if (this.beforePlane) {
      this.applyPlane(this.beforePlane, false);
    }
    this.adapter.applyToNode(this.sourceNode, cloneGateParams(this.before), {
      recordHistory: false,
      rebuild: true
    });
  }

  redo(): void {
    if (this.afterPlane) {
      this.applyPlane(this.afterPlane, false);
    }
    this.adapter.applyToNode(this.sourceNode, cloneGateParams(this.after), {
      recordHistory: false,
      rebuild: true
    });
  }

  private applyPlane(plane: Plane, rebuild: boolean): void {
    this.adapter.applyPlacement(this.sourceNode, cloneGatePlane(plane), {
      recordHistory: false,
      rebuild
    });
  }
}

export class NodeParamsHistoryRecord<
  P extends Record<string, unknown>,
  TNode extends INode = INode
> implements IHistoryRecord
{
  readonly name: string;
  private readonly before: P;
  private readonly after: P;

  constructor(options: {
    name: string;
    node: TNode;
    before: P;
    after: P;
    apply: (node: TNode, params: P) => void;
  }) {
    this.name = options.name;
    this.node = options.node;
    this.apply = options.apply;
    this.before = cloneGateParams(options.before);
    this.after = cloneGateParams(options.after);
  }

  private readonly node: TNode;
  private readonly apply: (node: TNode, params: P) => void;

  dispose(): void {}

  undo(): void {
    this.apply(this.node, cloneGateParams(this.before));
  }

  redo(): void {
    this.apply(this.node, cloneGateParams(this.after));
  }
}

export function resolveNodeParamsHistoryTarget<TNode>(node: TNode): TNode {
  return resolveEditableShapeSource(node);
}
