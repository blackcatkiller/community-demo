// @ts-nocheck
import { isDisposable } from "@modelai/core/gc";
import type {
  EdgeMeshData,
  FaceMeshData,
  INode,
  IVisualContext,
  IVisualObject,
  NodeRecord,
  ShapeMeshData
} from "@modelai/core/types";
import type { Matrix4 } from "@modelai/core/math";
import { MeshDataUtils, NodeAction } from "@modelai/core/types";
import type { IDocument } from "@modelai/core/types";
import { GroupNode, NodeUtils } from "@modelai/model/node";
import { ReferenceArrayNode } from "@modelai/model/referenceArrayNode";
import { ReferenceInstanceNode } from "@modelai/model/referenceInstanceNode";
import { GeometryNode, ShapeNode } from "@modelai/model/shapeNode";
import {
  BufferAttribute,
  BufferGeometry,
  Group,
  InstancedMesh,
  LineSegments,
  Object3D,
  type Scene
} from "three";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { applyForegroundOverlay } from "@modelai/geometry/foregroundOverlay";
import { ThreeGeometry } from "./geometry";
import { Layers } from "./constants";
import { ThreeGeometryFactory } from "./geometryFactory";
import { ThreeHelper } from "./helper";
import {
  ReferenceShapeBatchVisual,
  ReferenceShapeVisual,
  ReferenceSourceHitAssets,
  ReferenceInstanceVisual,
  ThreeReferenceArrayVisual
} from "./referenceArrayVisual";
import { GroupVisualObject } from "./visualObject";
import { ThreeVisualObject } from "./visualObject";
import type { ThreeView } from "./view";

type PropertyHandler = (prop: string) => void;

export class ThreeVisualContext implements IVisualContext {
  private readonly _visualNodeMap = new Map<IVisualObject, INode>();
  private readonly _nodeVisualMap = new Map<INode, IVisualObject & Object3D>();
  private readonly _referenceShapeBatches = new Map<
    string,
    ReferenceShapeBatchVisual
  >();
  private readonly _referenceShapeAssets = new Map<
    string,
    ReferenceSourceHitAssets
  >();
  private readonly _referenceShapeAssetsByNode = new Map<
    ShapeNode,
    ReferenceSourceHitAssets
  >();
  private readonly _visibilityHandlers = new Map<INode, PropertyHandler>();
  private readonly _tempMeshMap = new Map<number, Object3D>();
  private _tempMeshId = 1;

  /** Called whenever a node's visibility changes so the view re-renders. */
  onNeedsUpdate?: () => void;
  /** Called after async visual-shape rebuilds so bounds-dependent helpers can refresh. */
  onVisualShapesChanged?: () => void;

  readonly visualShapes: Group;
  readonly tempShapes: Group;

  constructor(
    readonly scene: Scene,
    readonly document: IDocument
  ) {
    this.visualShapes = new Group();
    this.tempShapes = new Group();
    scene.add(this.visualShapes, this.tempShapes);
  }

  readonly handleNodeChanged = (records: NodeRecord[]) => {
    const adds: INode[] = [];
    const rms: INode[] = [];
    const redraws = new Set<ReferenceArrayNode>();
    records.forEach(x => {
      if (
        x.action === NodeAction.add ||
        x.action === NodeAction.insertBefore ||
        x.action === NodeAction.insertAfter
      ) {
        NodeUtils.nodeOrChildrenAppendToNodes(adds, x.node);
        if (
          x.node instanceof ReferenceInstanceNode &&
          x.newParent instanceof ReferenceArrayNode
        ) {
          redraws.add(x.newParent);
        }
      } else if (
        x.action === NodeAction.remove ||
        x.action === NodeAction.transfer
      ) {
        NodeUtils.nodeOrChildrenAppendToNodes(rms, x.node);
        if (
          x.node instanceof ReferenceInstanceNode &&
          x.oldParent instanceof ReferenceArrayNode
        ) {
          redraws.add(x.oldParent);
        }
      } else if (x.action === NodeAction.move && x.newParent) {
        this.moveNode(x.node, x.oldParent!);
        if (x.node instanceof ReferenceInstanceNode) {
          if (x.oldParent instanceof ReferenceArrayNode)
            redraws.add(x.oldParent);
          if (x.newParent instanceof ReferenceArrayNode)
            redraws.add(x.newParent);
        }
      }
    });
    this.addNode(adds);
    this.removeNode(rms);
    this.redrawNode([...redraws]);
  };

  /**
   * Clears persisted scene visuals and rebuilds them from the current model root.
   * Needed after the entire scene graph is replaced (e.g. document JSON load) because
   * incremental notifications ran while an outdated root was still assigned.
   */
  resyncDocumentVisuals() {
    const stale = [...this._nodeVisualMap.keys()];
    if (stale.length > 0) this.removeNode(stale);
    const bundle: INode[] = [];
    NodeUtils.nodeOrChildrenAppendToNodes(
      bundle,
      this.document.modelManager.rootNode as INode
    );
    this.addNode(bundle);
  }

  addNode(nodes: INode[]) {
    nodes.forEach(node => {
      if (!this._nodeVisualMap.has(node)) this.displayNode(node);
    });
  }

  private displayNode(node: INode) {
    let visual: (IVisualObject & Object3D) | undefined;
    if (node instanceof ShapeNode && this.shouldBatchReferenceShape(node)) {
      const sourceNode = node.resolvedShapeSource;
      const batch = this.getOrCreateReferenceShapeBatch(sourceNode);
      const sourceAssets = this.getOrCreateReferenceShapeAssets(sourceNode);
      sourceAssets.retain();
      visual = new ReferenceShapeVisual(node, this, batch, sourceAssets);
    } else if (node instanceof GeometryNode) {
      visual = new ThreeGeometry(node, this);
    } else if (node instanceof ReferenceArrayNode) {
      visual = new ThreeReferenceArrayVisual(node, this);
    } else if (node instanceof GroupNode) {
      visual = new GroupVisualObject(node as any);
    }
    if (visual) {
      const parent = this.getParentVisual(node);
      parent.add(visual);
      this._visualNodeMap.set(visual, node);
      this._nodeVisualMap.set(node, visual);
      if (visual instanceof ReferenceShapeVisual) {
        this._referenceShapeAssetsByNode.set(
          visual.referenceNode,
          visual.sourceAssets
        );
      }

      // Subscribe to visibility changes to trigger re-render
      const handler: PropertyHandler = prop => {
        if (prop === "visible" || prop === "parentVisible") {
          // ThreeVisualObject / GroupVisualObject already syncs its own .visible
          // We just need to schedule a re-render
          this.onNeedsUpdate?.();
        }
      };
      node.onPropertyChanged(handler);
      this._visibilityHandlers.set(node, handler);
    }
  }

  removeNode(nodes: INode[]) {
    nodes.forEach(node => {
      const handler = this._visibilityHandlers.get(node);
      if (handler) {
        node.removePropertyChanged(handler);
        this._visibilityHandlers.delete(node);
      }
      const visual = this._nodeVisualMap.get(node);
      this._nodeVisualMap.delete(node);
      if (!visual) return;
      let referenceBatch: ReferenceShapeBatchVisual | undefined;
      if (visual instanceof ReferenceShapeVisual) {
        referenceBatch = visual.batch;
        const sourceAssets = this._referenceShapeAssetsByNode.get(
          visual.referenceNode
        );
        this._referenceShapeAssetsByNode.delete(visual.referenceNode);
        if (sourceAssets?.release()) {
          this._referenceShapeAssets.delete(sourceAssets.sourceNode.id);
        }
      }
      this._visualNodeMap.delete(visual);
      visual.parent?.remove(visual);
      visual.dispose();
      if (referenceBatch?.isEmpty()) {
        this._referenceShapeBatches.delete(referenceBatch.sourceNode.id);
        (referenceBatch as unknown as Object3D).parent?.remove(
          referenceBatch as unknown as Object3D
        );
        referenceBatch.dispose();
      }
    });
  }

  redrawNode(nodes: INode[]) {
    this.removeNode(nodes);
    this.addNode(nodes);
  }

  getVisual(node: INode): IVisualObject | undefined {
    if (node instanceof ReferenceInstanceNode) {
      const parent = node.parent;
      const visual = parent ? this._nodeVisualMap.get(parent) : undefined;
      if (visual instanceof ThreeReferenceArrayVisual) {
        return visual.getInstanceVisual(node);
      }
    }
    return this._nodeVisualMap.get(node);
  }
  getNode(visual: IVisualObject): INode | undefined {
    if (visual instanceof ReferenceInstanceVisual) {
      return visual.instanceNode;
    }
    return this._visualNodeMap.get(visual);
  }

  setVisible(node: INode, visible: boolean) {
    if (node instanceof ReferenceInstanceNode) {
      node.visible = visible;
      return;
    }
    const v = this.getVisual(node);
    if (v) v.visible = visible;
  }

  visuals(): IVisualObject[] {
    const result: IVisualObject[] = [];
    const walk = (obj: Object3D) => {
      if (
        obj instanceof ThreeVisualObject ||
        obj instanceof ThreeReferenceArrayVisual ||
        obj instanceof ReferenceShapeBatchVisual
      ) {
        result.push(obj);
      } else if (obj instanceof Group) obj.children.forEach(walk);
    };
    this.visualShapes.children.forEach(walk);
    return result;
  }

  private getParentVisual(node: INode): Group {
    if (node.parent) {
      const pv = this._nodeVisualMap.get(node.parent);
      if (pv instanceof Group) return pv;
    }
    return this.visualShapes;
  }

  private moveNode(node: INode, oldParent: INode) {
    if (oldParent === node.parent) return;
    const visual = this._nodeVisualMap.get(node);
    if (!(visual instanceof Object3D)) return;
    const oldGroup =
      (this._nodeVisualMap.get(oldParent) as any) ?? this.visualShapes;
    const newGroup =
      (this._nodeVisualMap.get(node.parent!) as any) ?? this.visualShapes;
    if (oldGroup !== newGroup) {
      oldGroup.remove(visual);
      newGroup.add(visual);
    }
  }

  displayMesh(
    meshes: ShapeMeshData[],
    opacity?: number,
    depthTest?: boolean
  ): number {
    const group = new Group();
    let shouldUseForegroundOverlay = false;
    meshes.forEach(mesh => {
      const obj = this.createTempObject(mesh, opacity, depthTest);
      if (!obj) return;
      group.add(obj);
      if (MeshDataUtils.isVertexMesh(mesh) && mesh.alwaysOnTop) {
        shouldUseForegroundOverlay = true;
      }
    });
    const id = this._tempMeshId++;
    this.tempShapes.add(group);
    if (shouldUseForegroundOverlay) {
      this.attachForegroundOverlay(group);
    }
    this._tempMeshMap.set(id, group);
    this.onNeedsUpdate?.();
    return id;
  }

  displayObject(obj: Object3D): number {
    const id = this._tempMeshId++;
    this.tempShapes.add(obj);
    this._tempMeshMap.set(id, obj);
    this.onNeedsUpdate?.();
    return id;
  }

  removeMesh(id: number): void {
    const obj = this._tempMeshMap.get(id);
    if (!obj) return;
    this.tempShapes.remove(obj);
    this.detachOverlayHooks(obj);
    obj.traverse(child => {
      (child as any).geometry?.dispose?.();
    });
    this._tempMeshMap.delete(id);
    this.onNeedsUpdate?.();
  }

  setTempMeshEmphasis(id: number, emphasized: boolean): void {
    const obj = this._tempMeshMap.get(id);
    if (!obj) return;
    obj.traverse(child => this.applyTempMaterialEmphasis(child, emphasized));
    this.onNeedsUpdate?.();
  }

  setTempMeshTransform(id: number, matrix: Matrix4): void {
    const obj = this._tempMeshMap.get(id);
    if (!obj) return;
    obj.matrixAutoUpdate = false;
    obj.matrix.copy(ThreeHelper.fromMatrix(matrix));
    obj.matrixWorldNeedsUpdate = true;
    this.onNeedsUpdate?.();
  }

  displayLineSegments(data: EdgeMeshData): number {
    const bufferGeometry = new BufferGeometry();
    bufferGeometry.setAttribute(
      "position",
      new BufferAttribute(data.position, 3)
    );
    bufferGeometry.computeBoundingBox();
    const material = ThreeGeometryFactory.resolveBasicEdgeMaterial(
      typeof data.color === "number" ? data.color : undefined
    );
    const lineSegments = new LineSegments(bufferGeometry, material);
    lineSegments.layers.set(Layers.Wireframe);

    const id = this._tempMeshId++;
    this.tempShapes.add(lineSegments);
    this._tempMeshMap.set(id, lineSegments);
    this.onNeedsUpdate?.();
    return id;
  }

  setPosition(id: number, position: Float32Array): void {
    const obj = this._tempMeshMap.get(id);
    if (!obj) return;
    const updateGeometry = (target: Object3D) => {
      const geom = (target as any).geometry;
      if (!geom || !(geom instanceof BufferGeometry)) return;
      if (geom instanceof LineSegmentsGeometry) {
        // Preview edge meshes use LineSegmentsGeometry, which stores segment
        // data in instanceStart/instanceEnd instead of the plain position attribute.
        geom.setPositions(position);
        geom.boundingSphere = null;
        (target as any).computeLineDistances?.();
        return;
      }
      geom.setAttribute("position", new BufferAttribute(position, 3));
      (geom.attributes.position as any).needsUpdate = true;
      geom.computeBoundingBox?.();
      geom.boundingSphere = null;
    };
    if (obj instanceof Group) {
      obj.children.forEach(updateGeometry);
    } else {
      updateGeometry(obj);
    }
    this.onNeedsUpdate?.();
  }

  displayInstancedMesh(
    data: FaceMeshData,
    matrixs: Matrix4[],
    opacity?: number
  ): number {
    const geometry = ThreeGeometryFactory.createFaceBufferGeometry(data);
    const variants = ThreeGeometryFactory.resolveFaceMaterialVariants(
      data,
      opacity
    );
    const instancedMesh = new InstancedMesh(
      geometry,
      variants.normal,
      matrixs.length
    );
    instancedMesh.userData.tempMaterialVariants = variants;
    matrixs.forEach((matrix, index) => {
      instancedMesh.setMatrixAt(index, ThreeHelper.fromMatrix(matrix));
    });
    const id = this._tempMeshId++;
    this.tempShapes.add(instancedMesh);
    this._tempMeshMap.set(id, instancedMesh);
    this.onNeedsUpdate?.();
    return id;
  }

  setInstanceMatrix(id: number, matrixs: Matrix4[]) {
    const obj = this._tempMeshMap.get(id);
    if (!obj || !(obj instanceof InstancedMesh)) return;
    matrixs.forEach((matrix, index) => {
      obj.setMatrixAt(index, ThreeHelper.fromMatrix(matrix));
    });
    obj.instanceMatrix.needsUpdate = true;
    this.onNeedsUpdate?.();
  }

  dispose() {
    this._visibilityHandlers.forEach((handler, node) =>
      node.removePropertyChanged(handler)
    );
    this._visibilityHandlers.clear();
    this.visualShapes.traverse(x => {
      if (isDisposable(x)) x.dispose();
    });
    this.visualShapes.clear();
    this._referenceShapeBatches.clear();
    this._referenceShapeAssetsByNode.forEach(assets => {
      assets.release();
    });
    this._referenceShapeAssets.clear();
    this._referenceShapeAssetsByNode.clear();
    this.tempShapes.traverse(x => {
      (x as any).geometry?.dispose?.();
    });
    this.tempShapes.clear();
    this._visualNodeMap.clear();
    this._nodeVisualMap.clear();
    this._tempMeshMap.clear();
  }

  private shouldBatchReferenceShape(node: ShapeNode) {
    if (!node.isReferenceShape) return false;
    return !!node.resolvedShapeSource.mesh.faces?.position.length;
  }

  private getOrCreateReferenceShapeBatch(sourceNode: ShapeNode) {
    let batch = this._referenceShapeBatches.get(sourceNode.id);
    if (!batch) {
      batch = new ReferenceShapeBatchVisual(sourceNode, this);
      this._referenceShapeBatches.set(sourceNode.id, batch);
      this.visualShapes.add(batch);
    }
    return batch;
  }

  private getOrCreateReferenceShapeAssets(sourceNode: ShapeNode) {
    let assets = this._referenceShapeAssets.get(sourceNode.id);
    if (!assets) {
      assets = new ReferenceSourceHitAssets(sourceNode);
      this._referenceShapeAssets.set(sourceNode.id, assets);
    }
    return assets;
  }

  private createTempObject(
    mesh: ShapeMeshData,
    opacity?: number,
    depthTest?: boolean
  ): Object3D | undefined {
    if (MeshDataUtils.isVertexMesh(mesh)) {
      const obj = ThreeGeometryFactory.createVertexGeometry(mesh);
      this.setObjectLayer(obj, Layers.Wireframe);
      return obj;
    }
    if (MeshDataUtils.isEdgeMesh(mesh)) {
      const obj = ThreeGeometryFactory.createEdgeGeometry(mesh);
      this.setObjectLayer(obj, Layers.Wireframe);
      return obj;
    }
    if (MeshDataUtils.isFaceMesh(mesh)) {
      const obj = ThreeGeometryFactory.createFaceGeometry(
        mesh,
        opacity,
        depthTest
      );
      if (depthTest !== false) {
        this.setObjectLayer(obj, Layers.Solid);
      }
      return obj;
    }
    return undefined;
  }

  private attachForegroundOverlay(obj: Object3D) {
    const view = this.getActiveThreeView();
    if (!view) return;
    obj.userData.detachForegroundOverlay = applyForegroundOverlay(view, obj);
  }

  private detachOverlayHooks(obj: Object3D) {
    obj.traverse(child => {
      const detachForeground = (child as any).userData?.detachForegroundOverlay;
      if (typeof detachForeground === "function") {
        detachForeground();
      }
      const detachOcclusion = (child as any).userData?.detachOcclusionOverlay;
      if (typeof detachOcclusion === "function") {
        detachOcclusion();
      }
      if ((child as any).userData) {
        delete (child as any).userData.detachForegroundOverlay;
        delete (child as any).userData.detachOcclusionOverlay;
      }
    });
  }

  private getActiveThreeView(): ThreeView | undefined {
    const view = this.document.application.activeView;
    if (
      view &&
      typeof (view as any).addAfterSceneRenderHook === "function" &&
      typeof (view as any).removeAfterSceneRenderHook === "function"
    ) {
      return view as ThreeView;
    }
    return undefined;
  }

  private setObjectLayer(obj: Object3D, layer: number) {
    obj.traverse(child => child.layers.set(layer));
  }

  private applyTempMaterialEmphasis(object: Object3D, emphasized: boolean) {
    const variants = (object.userData?.tempMaterialVariants ?? undefined) as
      | { normal?: unknown; emphasized?: unknown }
      | undefined;
    if (!variants?.normal || !("material" in object)) return;
    (object as any).material = emphasized
      ? (variants.emphasized ?? variants.normal)
      : variants.normal;
  }
}
