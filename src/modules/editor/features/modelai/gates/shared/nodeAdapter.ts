// @ts-nocheck
import type { Plane } from "@modelai/core/math";
import type { INode } from "@modelai/core/types";

export type GateNodeApplyOptions = {
  recordHistory?: boolean;
  rebuild?: boolean;
};

export interface GateNodeAdapter<P, TNode extends INode = INode> {
  isNode(node: INode): node is TNode;
  createNode(name: string, plane: Plane, params: P): TNode;
  fromNode(node: TNode): P;
  getPlane(node: TNode): Plane;
  applyToNode(node: TNode, params: P, options?: GateNodeApplyOptions): void;
  applyPlacement(
    node: TNode,
    plane: Plane,
    options?: GateNodeApplyOptions
  ): void;
}
