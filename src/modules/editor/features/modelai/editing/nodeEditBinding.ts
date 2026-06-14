// @ts-nocheck
import type { INode } from "@modelai/core";
import type { Plane } from "@modelai/core/math";
import {
  cloneGateParams,
  cloneGatePlane,
  hasGateParamsChanged,
  hasGatePlaneChanged
} from "@/features/modelai/gates/shared/gateParamsHistory";
import type { GateNodeAdapter } from "@/features/modelai/gates/shared/nodeAdapter";
import {
  mapEditablePlaneToNodeView,
  mapNodeViewPlaneToEditable,
  resolveEditableShapeSource
} from "@/features/modelai/model/shapeNode";

export type NodeEditState<P extends Record<string, unknown>> = {
  params: P;
  plane: Plane;
};

export type NodeEditBinding<
  P extends Record<string, unknown>,
  TNode extends INode
> = {
  getNode(): TNode;
  getParams(): P;
  getPlane(): Plane;
  getState(): NodeEditState<P>;
  setParams(params: P): void;
  patchParams(patch: Partial<P>): void;
  setPlane(plane: Plane): void;
  applyState(state: NodeEditState<P>): void;
  snapshot(): NodeEditState<P>;
  restore(snapshot: NodeEditState<P>): void;
  subscribe(listener: () => void): () => void;
  notifyChanged(): void;
};

export function bindNodeForEdit<
  P extends Record<string, unknown>,
  TNode extends INode
>(node: TNode, adapter: GateNodeAdapter<P, TNode>): NodeEditBinding<P, TNode> {
  const listeners = new Set<() => void>();
  const editNode = resolveEditableShapeSource(node) as TNode;

  const notifyChanged = () => {
    listeners.forEach(listener => listener());
  };

  const getParams = () => cloneGateParams(adapter.fromNode(editNode));
  const getPlane = () =>
    cloneGatePlane(
      mapEditablePlaneToNodeView(node, adapter.getPlane(editNode))
    );

  const applyState = (state: NodeEditState<P>) => {
    const currentParams = adapter.fromNode(editNode);
    const currentPlane = adapter.getPlane(editNode);
    const nextPlane = mapNodeViewPlaneToEditable(node, state.plane);
    const planeChanged = hasGatePlaneChanged(currentPlane, nextPlane);
    const paramsChanged = hasGateParamsChanged(currentParams, state.params);
    if (!planeChanged && !paramsChanged) return;
    if (planeChanged) {
      adapter.applyPlacement(editNode, cloneGatePlane(nextPlane), {
        recordHistory: false,
        rebuild: !paramsChanged
      });
    }
    if (paramsChanged) {
      adapter.applyToNode(editNode, cloneGateParams(state.params), {
        recordHistory: false,
        rebuild: true
      });
    }
    notifyChanged();
  };

  return {
    getNode: () => node,
    getParams,
    getPlane,
    getState: () => ({
      params: getParams(),
      plane: getPlane()
    }),
    setParams: params => {
      applyState({
        params,
        plane: getPlane()
      });
    },
    patchParams: patch => {
      applyState({
        params: {
          ...getParams(),
          ...patch
        },
        plane: getPlane()
      });
    },
    setPlane: plane => {
      applyState({
        params: getParams(),
        plane
      });
    },
    applyState,
    snapshot: () => ({
      params: getParams(),
      plane: getPlane()
    }),
    restore: snapshot => {
      applyState({
        params: cloneGateParams(snapshot.params),
        plane: cloneGatePlane(snapshot.plane)
      });
    },
    subscribe: listener => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    notifyChanged
  };
}
