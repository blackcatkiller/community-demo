// @ts-nocheck
import { Matrix4, type BoundingBox } from "@modelai/core/math";
import {
  type IVisualObject,
  type ShapeType,
  ShapeTypeUtils,
  VisualState,
  VisualStateUtils,
  type ViewShapeGuidePolicy
} from "@modelai/core/types";
import { Layers } from "@modelai/viewer/constants";
import { GeometryNode, type ShapeNode } from "@modelai/model/shapeNode";
import type { ReferenceArrayNode } from "@modelai/model/referenceArrayNode";
import { ReferenceInstanceNode } from "@modelai/model/referenceInstanceNode";
import type { Intersection, Material } from "three";
import {
  Box3,
  Group,
  InstancedMesh,
  Matrix4 as ThreeMatrix4,
  Mesh,
  type Object3D,
  Points,
  Vector3
} from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import {
  faceBasicDragGhostMaterial,
  faceLambertDefaultMaterial,
  faceLambertHighlightSolidMaterial,
  faceLambertSelectedTransparentMaterial,
  lineDefaultThinMaterial,
  lineHighlightWideMaterial,
  lineSelectedWideMaterial,
  lineSnapWideMaterial,
  pointDefaultMaterial
} from "./materials";
import { ThreeGeometry } from "./geometry";
import type {
  GeometryRenderChannels,
  GeometryVisualBackend
} from "./geometryBackend";
import { ThreeGeometryFactory } from "./geometryFactory";
import {
  buildGuideEdgeMeshesByRole,
  buildGuideEdgeMeshes,
  filterGuidesByRole,
  filterCenterlineGuidesByRole
} from "../geometry/featureGeometry";
import { ThreeHelper } from "./helper";
import {
  GroupVisualObject,
  type IVisualHitTarget,
  type VisualPointHit,
  type VisualPointHitContext,
  type VisualRectHitContext,
  type IWholeStateVisual
} from "./visualObject";
import type { ThreeVisualContext } from "./visualContext";

type InstanceStateKey = "highlight" | "selected" | "snap";

function isReferenceInstanceNode(node: unknown): node is ReferenceInstanceNode {
  return node instanceof ReferenceInstanceNode;
}

export class ReferenceInstanceVisual implements IVisualObject {
  constructor(
    readonly visual: ThreeReferenceArrayVisual,
    readonly instanceNode: ReferenceInstanceNode
  ) {}

  get visible() {
    return this.instanceNode.visible && this.instanceNode.parentVisible;
  }
  set visible(v: boolean) {
    this.instanceNode.visible = v;
  }

  get transform() {
    return this.instanceNode.transform;
  }
  set transform(v: Matrix4) {
    this.instanceNode.transform = v;
  }

  worldTransform() {
    return this.instanceNode.transform;
  }

  boundingBox(): BoundingBox | undefined {
    return this.instanceNode.boundingBox();
  }

  dispose() {}
}

export class ThreeReferenceArrayVisual extends GroupVisualObject {
  private _sourceNode?: GeometryNode;
  private _edges?: LineSegments2;
  private _faces?: InstancedMesh;
  private _faceMaterial?: Material;
  private _faceMaterialOwned = false;
  private _instanceNodes: ReferenceInstanceNode[] = [];
  private readonly _instanceVisualMap = new Map<
    ReferenceInstanceNode,
    ReferenceInstanceVisual
  >();
  private readonly _instanceHandlers = new Map<
    ReferenceInstanceNode,
    (prop: string) => void
  >();
  private readonly _highlighted = new Set<ReferenceInstanceNode>();
  private readonly _selected = new Set<ReferenceInstanceNode>();
  private readonly _snapped = new Set<ReferenceInstanceNode>();
  private _highlightOverlay?: LineSegments2;
  private _selectedOverlay?: LineSegments2;
  private _snapOverlay?: LineSegments2;
  private _overlaySyncQueued = false;
  private _disposed = false;

  constructor(
    readonly referenceNode: ReferenceArrayNode,
    readonly context: ThreeVisualContext
  ) {
    super(referenceNode as any);
    this.generateShape();
  }

  private readonly handleSourceChanged = (prop: string) => {
    if (prop !== "shape") return;
    this.refresh();
  };

  private generateShape() {
    const sourceNode = this.resolveSourceNode();
    const faces = sourceNode?.mesh.faces;
    const edges = sourceNode?.mesh.edges;
    if (
      !sourceNode ||
      ((!faces || faces.position.length === 0) &&
        (!edges || edges.position.length === 0))
    ) {
      return;
    }

    const instanceNodes = this.getInstanceNodes();
    if (instanceNodes.length === 0) {
      return;
    }

    if (faces && faces.position.length > 0) {
      const geometry = ThreeGeometryFactory.createFaceBufferGeometry(faces);
      if (faces.groups.length > 1) {
        geometry.groups = faces.groups;
      }

      const { material, owned } =
        ThreeGeometryFactory.createFaceDisplayMaterial(faces);
      if (Array.isArray(faces.color) && faces.color.length > 0) {
        ThreeGeometryFactory.setColor(geometry, faces, material);
      }
      this._faceMaterial = material;
      this._faceMaterialOwned = owned;
      this._faces = new InstancedMesh(geometry, material, instanceNodes.length);
      this._faces.layers.set(Layers.Solid);
      this._faces.frustumCulled = false;

      instanceNodes.forEach((node, index) => {
        this._faces!.setMatrixAt(index, ThreeHelper.fromMatrix(node.transform));
      });
      this._faces.instanceMatrix.needsUpdate = true;
      this.add(this._faces);
    }

    this._edges = this.createEdgesMesh(instanceNodes);
    if (this._edges) {
      this.add(this._edges);
    }
    this.syncStateOverlays();
  }

  resolveHit(hit: Intersection) {
    if (!Number.isInteger(hit.instanceId)) return this;
    const node = this._instanceNodes[hit.instanceId!];
    return node ? this.getInstanceVisual(node) : this;
  }

  getInstanceVisual(node: ReferenceInstanceNode) {
    let visual = this._instanceVisualMap.get(node);
    if (!visual) {
      visual = new ReferenceInstanceVisual(this, node);
      this._instanceVisualMap.set(node, visual);
    }
    return visual;
  }

  getInstanceVisuals() {
    return this._instanceNodes.map(node => this.getInstanceVisual(node));
  }

  hasInstanceNode(node: ReferenceInstanceNode) {
    return this._instanceNodes.includes(node);
  }

  addInstanceState(node: ReferenceInstanceNode, state: InstanceStateKey) {
    const set = this.getStateSet(state);
    const size = set.size;
    set.add(node);
    if (set.size !== size) {
      this.scheduleOverlaySync();
    }
  }

  removeInstanceState(node: ReferenceInstanceNode, state: InstanceStateKey) {
    if (this.getStateSet(state).delete(node)) {
      this.scheduleOverlaySync();
    }
  }

  clearInstanceStates() {
    if (
      this._highlighted.size === 0 &&
      this._selected.size === 0 &&
      this._snapped.size === 0
    ) {
      return;
    }
    this._highlighted.clear();
    this._selected.clear();
    this._snapped.clear();
    this.scheduleOverlaySync();
  }

  setFacesTemporary(material: Material) {
    if (this._faces) {
      this._faces.material = material;
    }
  }
  setEdgesTemporary(material: Material) {
    if (this._edges) {
      this._edges.material = material as any;
    }
  }

  removeTemporaryMaterial() {
    if (this._faces && this._faceMaterial) {
      this._faces.material = this._faceMaterial;
    }
    if (this._edges) {
      this._edges.material = lineDefaultThinMaterial;
    }
  }
  applyWholeVisualState(state: VisualState) {
    if (VisualStateUtils.hasState(state, VisualState.snapHighlight)) {
      this.setEdgesTemporary(lineSnapWideMaterial);
    } else if (VisualStateUtils.hasState(state, VisualState.edgeHighlight)) {
      this.setEdgesTemporary(lineHighlightWideMaterial);
    } else if (VisualStateUtils.hasState(state, VisualState.edgeSelected)) {
      this.setEdgesTemporary(lineSelectedWideMaterial);
    } else if (VisualStateUtils.hasState(state, VisualState.faceTransparent)) {
      this.setFacesTemporary(faceLambertSelectedTransparentMaterial);
    } else if (VisualStateUtils.hasState(state, VisualState.faceDragGhost)) {
      this.setFacesTemporary(faceBasicDragGhostMaterial);
    } else if (VisualStateUtils.hasState(state, VisualState.faceColored)) {
      this.setFacesTemporary(faceLambertHighlightSolidMaterial);
    } else {
      this.clearWholeVisualState();
    }
  }
  clearWholeVisualState() {
    this.removeTemporaryMaterial();
  }

  wholeVisual() {
    return [this._edges, this._faces].filter(
      (item): item is NonNullable<typeof item> => item !== undefined
    );
  }

  override hitTestPoint(ctx: VisualPointHitContext): VisualPointHit[] {
    if (!this.visible || (!this._faces && !this._edges)) return [];
    const hitsByTarget = new Map<
      IVisualObject,
      { distance: number; point?: ReturnType<typeof ThreeHelper.toXYZ> }
    >();
    const hitTargets = this._faces
      ? [this._faces]
      : this._edges
        ? [this._edges]
        : [];
    ctx.raycaster.intersectObjects(hitTargets, false).forEach(hit => {
      const target = this.resolveHit(hit);
      const previous = hitsByTarget.get(target);
      if (previous === undefined || hit.distance < previous.distance) {
        hitsByTarget.set(target, {
          distance: hit.distance,
          point: ThreeHelper.toXYZ(hit.pointOnLine ?? hit.point)
        });
      }
    });
    return Array.from(hitsByTarget, ([target, hit]) => {
      return {
        target,
        distance: hit.distance,
        point: hit.point
      };
    });
  }

  override hitTestRect(ctx: VisualRectHitContext): IVisualObject[] {
    if (!this.visible || (!this._faces && !this._edges)) return [];

    if (this._faces) {
      const ids = ctx.selectedInstances.get(this._faces.uuid);
      if (!ids || ids.size === 0) return [];
      return Array.from(ids)
        .map(id => this._instanceNodes[id])
        .filter((node): node is ReferenceInstanceNode => node !== undefined)
        .map(node => this.getInstanceVisual(node));
    }

    return this._edges && ctx.selectedObjects.has(this._edges)
      ? this.getInstanceVisuals()
      : [];
  }

  override dispose() {
    super.dispose();
    this._disposed = true;
    this.detachSourceNode();
    this.detachInstanceHandlers();
    this.removeMeshes();
  }

  private getInstanceNodes() {
    this.detachInstanceHandlers();
    this._instanceNodes = this.referenceNode
      .children()
      .filter(isReferenceInstanceNode)
      .filter(node => node.visible && node.parentVisible);
    this._instanceNodes.forEach(node => {
      const handler = (prop: string) => {
        if (
          prop === "transform" ||
          prop === "visible" ||
          prop === "parentVisible"
        ) {
          this.refresh();
        }
      };
      node.onPropertyChanged(handler);
      this._instanceHandlers.set(node, handler);
    });
    return this._instanceNodes;
  }

  private getStateSet(state: InstanceStateKey) {
    if (state === "highlight") return this._highlighted;
    if (state === "selected") return this._selected;
    return this._snapped;
  }

  private refresh() {
    this.removeMeshes();
    this.generateShape();
    this.context.onVisualShapesChanged?.();
    this.context.onNeedsUpdate?.();
  }

  private scheduleOverlaySync() {
    if (this._overlaySyncQueued || this._disposed) return;
    this._overlaySyncQueued = true;
    queueMicrotask(() => {
      this._overlaySyncQueued = false;
      if (this._disposed) return;
      this.syncStateOverlays();
      this.context.onNeedsUpdate?.();
    });
  }

  private resolveSourceNode() {
    if (this._sourceNode?.id === this.referenceNode.sourceNodeId) {
      return this._sourceNode;
    }

    this.detachSourceNode();
    const sourceNode = this.context.document.modelManager.findNodes(
      node => node.id === this.referenceNode.sourceNodeId
    )[0];
    if (!(sourceNode instanceof GeometryNode)) {
      return undefined;
    }

    sourceNode.onPropertyChanged(this.handleSourceChanged);
    this._sourceNode = sourceNode;
    return sourceNode;
  }

  private detachSourceNode() {
    this._sourceNode?.removePropertyChanged(this.handleSourceChanged);
    this._sourceNode = undefined;
  }

  private detachInstanceHandlers() {
    this._instanceHandlers.forEach((handler, node) =>
      node.removePropertyChanged(handler)
    );
    this._instanceHandlers.clear();
  }

  private removeMeshes() {
    this._overlaySyncQueued = false;
    const overlays = [
      this._highlightOverlay,
      this._selectedOverlay,
      this._snapOverlay
    ];
    overlays.forEach(mesh => {
      if (mesh) {
        this.remove(mesh);
        mesh.geometry.dispose();
      }
    });
    this._highlightOverlay =
      this._selectedOverlay =
      this._snapOverlay =
        undefined;

    if (this._faces) {
      this.remove(this._faces);
      this._faces.geometry.dispose();
      this._faces = undefined;
    }
    if (this._edges) {
      this.remove(this._edges);
      this._edges.geometry.dispose();
      this._edges = undefined;
    }
    this._faceMaterial = undefined;
    this._faceMaterialOwned = false;
  }

  private syncStateOverlays() {
    this.removeOverlay(this._highlightOverlay);
    this.removeOverlay(this._selectedOverlay);
    this.removeOverlay(this._snapOverlay);
    this._highlightOverlay = this.createEdgesMesh(
      Array.from(this._highlighted).filter(node => this.hasInstanceNode(node)),
      lineHighlightWideMaterial
    );
    this._selectedOverlay = this.createEdgesMesh(
      Array.from(this._selected).filter(node => this.hasInstanceNode(node)),
      lineSelectedWideMaterial
    );
    this._snapOverlay = this.createEdgesMesh(
      Array.from(this._snapped).filter(node => this.hasInstanceNode(node)),
      lineSnapWideMaterial
    );
    [this._highlightOverlay, this._selectedOverlay, this._snapOverlay].forEach(
      overlay => {
        if (overlay) {
          this.add(overlay);
        }
      }
    );
  }

  private createEdgesMesh(
    nodes: ReferenceInstanceNode[],
    material: Material = lineDefaultThinMaterial
  ) {
    const sourceNode = this.resolveSourceNode();
    const edges = sourceNode?.mesh.edges;
    if (!edges || edges.position.length === 0 || nodes.length === 0) {
      return undefined;
    }

    const merged = new Float32Array(edges.position.length * nodes.length);
    const point = new Vector3();
    let offset = 0;

    nodes.forEach(node => {
      const matrix = ThreeHelper.fromMatrix(node.transform);
      for (let i = 0; i < edges.position.length; i += 3) {
        point
          .set(edges.position[i], edges.position[i + 1], edges.position[i + 2])
          .applyMatrix4(matrix);
        merged[offset++] = point.x;
        merged[offset++] = point.y;
        merged[offset++] = point.z;
      }
    });

    const geometry = ThreeGeometryFactory.createEdgeBufferGeometry({
      ...edges,
      position: merged
    });
    const line = new LineSegments2(geometry, material as any);
    line.layers.set(Layers.Wireframe);
    line.frustumCulled = false;
    if (material !== lineDefaultThinMaterial) {
      line.renderOrder = 1;
    }
    return line.computeLineDistances();
  }

  private removeOverlay(mesh?: LineSegments2) {
    if (!mesh) return;
    this.remove(mesh);
    mesh.geometry.dispose();
  }
}

export class ReferenceSourceHitAssets {
  private _faces?: Mesh;
  private _edges?: LineSegments2;
  private _guides: LineSegments2[] = [];
  private _vertexs?: Points;
  private _retained = 0;

  constructor(readonly sourceNode: ShapeNode) {
    sourceNode.onPropertyChanged(this.handleSourceChanged);
  }

  retain() {
    this._retained += 1;
  }

  release() {
    this._retained -= 1;
    if (this._retained > 0) return false;
    this.sourceNode.removePropertyChanged(this.handleSourceChanged);
    this.disposeLocalObjects();
    return true;
  }

  getHitObjectsForVisual(
    shapeType: ShapeType,
    visual: ReferenceShapeVisual,
    guidePolicy: ViewShapeGuidePolicy = "default"
  ): Object3D[] {
    const matrixWorld = this.resolveVisualMatrixWorld(visual);
    const isWhole =
      ShapeTypeUtils.isWhole(shapeType) ||
      ShapeTypeUtils.hasCompound(shapeType) ||
      ShapeTypeUtils.hasSolid(shapeType);
    const guides =
      guidePolicy === "pointProxy" ? this.prepareGuides(matrixWorld) : [];

    const objects: Object3D[] = [];
    // One detect may request face/edge/vertex hit objects for the same
    // reference visual. Resolve matrixWorld once and fan it out to avoid
    // repeating the expensive world-matrix update per hidden hit object.

    if (isWhole || ShapeTypeUtils.hasVertex(shapeType)) {
      const vertexs = this.prepareVertexs(matrixWorld);
      if (vertexs) objects.push(vertexs);
    }
    if (
      isWhole ||
      ShapeTypeUtils.hasEdge(shapeType) ||
      ShapeTypeUtils.hasWire(shapeType)
    ) {
      objects.push(...guides);
      const edges = this.prepareEdges(matrixWorld);
      if (edges) objects.push(edges);
    }
    if (
      isWhole ||
      ShapeTypeUtils.hasFace(shapeType) ||
      ShapeTypeUtils.hasShell(shapeType)
    ) {
      const faces = this.prepareFaces(matrixWorld);
      if (faces) objects.push(faces);
    }
    return objects;
  }

  private readonly handleSourceChanged = (prop: string) => {
    if (prop !== "shape") return;
    this.disposeLocalObjects();
  };

  private prepareFaces(matrixWorld: ThreeMatrix4) {
    const faces = this.sourceNode.mesh.faces;
    if (!faces?.position.length) return undefined;
    if (!this._faces) {
      const geometry = ThreeGeometryFactory.createFaceBufferGeometry(faces);
      if (faces.groups.length > 1) {
        geometry.groups = faces.groups;
      }
      this._faces = new Mesh(geometry, faceLambertDefaultMaterial);
      this._faces.layers.set(Layers.Hidden);
      this._faces.matrixAutoUpdate = false;
    }
    this.syncObjectMatrix(this._faces, matrixWorld);
    return this._faces;
  }

  private prepareEdges(matrixWorld: ThreeMatrix4) {
    const edges = this.sourceNode.mesh.edges;
    if (!edges?.position.length) return undefined;
    if (!this._edges) {
      const geometry = ThreeGeometryFactory.createEdgeBufferGeometry(edges);
      const line = new LineSegments2(geometry, lineDefaultThinMaterial as any);
      line.layers.set(Layers.Hidden);
      line.matrixAutoUpdate = false;
      this._edges = line.computeLineDistances();
    }
    this.syncObjectMatrix(this._edges, matrixWorld);
    return this._edges;
  }

  private prepareGuides(matrixWorld: ThreeMatrix4) {
    if (this._guides.length === 0) {
      const descriptors = filterCenterlineGuidesByRole(
        this.sourceNode.guides,
        "pickProxy"
      );
      const meshes = buildGuideEdgeMeshesByRole(descriptors, "pickProxy");
      this._guides = meshes.map((mesh, index) => {
        const guide = ThreeGeometryFactory.createEdgeGeometry(mesh);
        const descriptor = descriptors[index];
        if (descriptor) {
          ThreeGeometry.assignGuideDescriptor(guide, descriptor);
        }
        guide.layers.set(Layers.Hidden);
        guide.matrixAutoUpdate = false;
        return guide;
      });
    }
    this._guides.forEach(guide => this.syncObjectMatrix(guide, matrixWorld));
    return this._guides;
  }

  private prepareVertexs(matrixWorld: ThreeMatrix4) {
    const vertexs = this.sourceNode.mesh.vertexs;
    if (!vertexs?.position.length) return undefined;
    if (!this._vertexs) {
      const geometry = ThreeGeometryFactory.createVertexBufferGeometry(vertexs);
      this._vertexs = new Points(geometry, pointDefaultMaterial);
      this._vertexs.layers.set(Layers.Hidden);
      this._vertexs.matrixAutoUpdate = false;
    }
    this.syncObjectMatrix(this._vertexs, matrixWorld);
    return this._vertexs;
  }

  private resolveVisualMatrixWorld(visual: ReferenceShapeVisual) {
    const visualObject = visual as unknown as Object3D;
    visualObject.updateWorldMatrix(true, false);
    return visualObject.matrixWorld;
  }

  private syncObjectMatrix(object: Object3D, matrixWorld: ThreeMatrix4) {
    object.matrix.copy(matrixWorld);
    object.matrixWorld.copy(matrixWorld);
    object.matrixWorldNeedsUpdate = false;
  }

  private disposeLocalObjects() {
    [...this._guides, this._faces, this._edges, this._vertexs].forEach(
      object => {
        object?.geometry?.dispose?.();
      }
    );
    this._faces = undefined;
    this._edges = undefined;
    this._guides = [];
    this._vertexs = undefined;
  }
}

export class ReferenceShapeVisual
  extends ThreeGeometry
  implements IWholeStateVisual
{
  constructor(
    readonly referenceNode: ShapeNode,
    context: ThreeVisualContext,
    readonly batch: ReferenceShapeBatchVisual,
    readonly sourceAssets: ReferenceSourceHitAssets
  ) {
    super(
      referenceNode,
      context,
      new ReferenceShapeGeometryBackend(batch, sourceAssets)
    );
  }
}

class ReferenceShapeGeometryBackend implements GeometryVisualBackend {
  private _visual?: ReferenceShapeVisual;

  constructor(
    private readonly batch: ReferenceShapeBatchVisual,
    private readonly sourceAssets: ReferenceSourceHitAssets
  ) {}

  attach(visual: ThreeGeometry) {
    this._visual = visual as ReferenceShapeVisual;
    this.batch.registerVisual(this._visual);
  }

  detach() {
    if (!this._visual) return;
    this.batch.unregisterVisual(this._visual);
    this._visual = undefined;
  }

  refresh() {}

  boundingBox(): BoundingBox | undefined {
    return this._visual?.geometryNode.boundingBox();
  }

  getRenderChannels(): GeometryRenderChannels {
    return {
      guides: []
    };
  }

  getShapeHitObjects(
    shapeType: ShapeType,
    guidePolicy: ViewShapeGuidePolicy = "default"
  ): Object3D[] | undefined {
    if (!this._visual) return [];
    return this.sourceAssets.getHitObjectsForVisual(
      shapeType,
      this._visual,
      guidePolicy
    );
  }

  wholeVisualEnabled(): boolean {
    return false;
  }

  applyWholeVisualState(state: VisualState): boolean {
    if (this._visual) {
      this.batch.setWholeState(this._visual, state);
    }
    return true;
  }

  clearWholeVisualState(): boolean {
    if (this._visual) {
      this.batch.clearWholeState(this._visual);
    }
    return true;
  }
}

export class ReferenceShapeBatchVisual
  extends Group
  implements IVisualObject, IVisualHitTarget
{
  private _faces?: InstancedMesh;
  private _edges?: LineSegments2;
  private _guides: LineSegments2[] = [];
  private _detachGuideOcclusionOverlays: Array<() => void> = [];
  private _faceMaterial?: Material | Material[];
  private _faceMaterialOwned = false;
  private _highlightOverlay?: LineSegments2;
  private _selectedOverlay?: LineSegments2;
  private _snapOverlay?: LineSegments2;
  private _transparentOverlay?: InstancedMesh;
  private _dragGhostOverlay?: InstancedMesh;
  private _coloredOverlay?: InstancedMesh;
  private readonly _visuals = new Map<ShapeNode, ReferenceShapeVisual>();
  private _visibleVisuals: ReferenceShapeVisual[] = [];
  private readonly _handlers = new Map<ShapeNode, (prop: string) => void>();
  private readonly _wholeStates = new Map<ReferenceShapeVisual, VisualState>();
  private _overlaySyncQueued = false;
  private _refreshQueued = false;
  private _disposed = false;

  declare visible: boolean;
  declare matrixAutoUpdate: boolean;
  declare matrixWorld: ThreeMatrix4;

  constructor(
    readonly sourceNode: ShapeNode,
    readonly context: ThreeVisualContext
  ) {
    super();
    this.visible = true;
    this.matrixAutoUpdate = false;
    sourceNode.onPropertyChanged(this.handleSourceChanged);
  }

  get transform(): Matrix4 {
    return Matrix4.identity();
  }
  set transform(_: Matrix4) {}

  worldTransform(): Matrix4 {
    return Matrix4.identity();
  }

  boundingBox(): BoundingBox | undefined {
    const box = new Box3().setFromObject(this);
    if (box.isEmpty()) return undefined;
    return { min: ThreeHelper.toXYZ(box.min), max: ThreeHelper.toXYZ(box.max) };
  }

  registerVisual(visual: ReferenceShapeVisual) {
    const node = visual.geometryNode as ShapeNode;
    if (this._visuals.has(node)) return;
    this._visuals.set(node, visual);
    const handler = (prop: string) => {
      if (prop === "shape") {
        if (node.resolvedShapeSource !== this.sourceNode) {
          this.context.redrawNode([node]);
          return;
        }
        this.scheduleRefresh();
        return;
      }
      if (
        prop === "transform" ||
        prop === "visible" ||
        prop === "parentVisible"
      ) {
        this.scheduleRefresh();
      }
    };
    node.onPropertyChanged(handler);
    this._handlers.set(node, handler);
    this.scheduleRefresh();
  }

  unregisterVisual(visual: ReferenceShapeVisual) {
    const node = visual.geometryNode as ShapeNode;
    const handler = this._handlers.get(node);
    if (handler) {
      node.removePropertyChanged(handler);
      this._handlers.delete(node);
    }
    this._visuals.delete(node);
    this._wholeStates.delete(visual);
    this.scheduleRefresh();
  }

  isEmpty() {
    return this._visuals.size === 0;
  }

  setWholeState(visual: ReferenceShapeVisual, state: VisualState) {
    if (state === VisualState.normal) {
      this.clearWholeState(visual);
      return;
    }
    this._wholeStates.set(visual, state);
    this.scheduleOverlaySync();
  }

  clearWholeState(visual: ReferenceShapeVisual) {
    if (this._wholeStates.delete(visual)) {
      this.scheduleOverlaySync();
    }
  }

  hitTestPoint(ctx: VisualPointHitContext): VisualPointHit[] {
    if (!this.visible || (!this._faces && !this._edges)) return [];
    const hitsByTarget = new Map<
      ReferenceShapeVisual,
      { distance: number; point?: ReturnType<typeof ThreeHelper.toXYZ> }
    >();
    const hitTargets = this._faces
      ? [this._faces]
      : this._edges
        ? [this._edges]
        : [];
    ctx.raycaster.intersectObjects(hitTargets, false).forEach(hit => {
      if (this._faces && Number.isInteger(hit.instanceId)) {
        const visual = this.getVisibleVisualAt(hit.instanceId!);
        if (!visual) return;
        const previous = hitsByTarget.get(visual);
        if (previous === undefined || hit.distance < previous.distance) {
          hitsByTarget.set(visual, {
            distance: hit.distance,
            point: ThreeHelper.toXYZ(hit.pointOnLine ?? hit.point)
          });
        }
        return;
      }
      const visual = this._visibleVisuals[0];
      if (!visual) return;
      const previous = hitsByTarget.get(visual);
      if (previous === undefined || hit.distance < previous.distance) {
        hitsByTarget.set(visual, {
          distance: hit.distance,
          point: ThreeHelper.toXYZ(hit.pointOnLine ?? hit.point)
        });
      }
    });
    return Array.from(hitsByTarget, ([target, hit]) => ({
      target,
      distance: hit.distance,
      point: hit.point
    }));
  }

  hitTestRect(ctx: VisualRectHitContext): IVisualObject[] {
    if (!this.visible || (!this._faces && !this._edges)) return [];
    if (this._faces) {
      const ids = ctx.selectedInstances.get(this._faces.uuid);
      if (!ids || ids.size === 0) return [];
      return Array.from(ids)
        .map(id => this.getVisibleVisualAt(id))
        .filter(
          (visual): visual is ReferenceShapeVisual => visual !== undefined
        );
    }
    return this._edges && ctx.selectedObjects.has(this._edges)
      ? [...this._visibleVisuals]
      : [];
  }

  dispose() {
    this._disposed = true;
    this.sourceNode.removePropertyChanged(this.handleSourceChanged);
    this._handlers.forEach((handler, node) =>
      node.removePropertyChanged(handler)
    );
    this._handlers.clear();
    this._visuals.clear();
    this._wholeStates.clear();
    this.removeMeshes();
  }

  private readonly handleSourceChanged = (prop: string) => {
    if (prop !== "shape") return;
    this.scheduleRefresh();
  };

  private getVisibleVisualAt(index: number) {
    return this._visibleVisuals[index];
  }

  private scheduleRefresh() {
    if (this._refreshQueued || this._disposed) return;
    this._refreshQueued = true;
    queueMicrotask(() => {
      this._refreshQueued = false;
      if (this._disposed) return;
      this.refresh();
    });
  }

  private refresh() {
    this.removeMeshes();
    this.generateShape();
    this.context.onVisualShapesChanged?.();
    this.context.onNeedsUpdate?.();
  }

  private scheduleOverlaySync() {
    if (this._overlaySyncQueued || this._disposed) return;
    this._overlaySyncQueued = true;
    queueMicrotask(() => {
      this._overlaySyncQueued = false;
      if (this._disposed) return;
      this.syncStateOverlays();
      this.context.onNeedsUpdate?.();
    });
  }

  private generateShape() {
    const visibleVisuals = Array.from(this._visuals.values()).filter(
      visual => visual.visible
    );
    this._visibleVisuals = visibleVisuals;
    if (visibleVisuals.length === 0) return;

    const mesh = this.sourceNode.mesh;
    const faces = mesh.faces;
    const edges = mesh.edges;

    if (faces?.position.length) {
      const geometry = ThreeGeometryFactory.createFaceBufferGeometry(faces);
      if (faces.groups.length > 1) {
        geometry.groups = faces.groups;
      }

      const { material, owned } =
        ThreeGeometryFactory.createFaceDisplayMaterial(faces);
      if (Array.isArray(faces.color) && faces.color.length > 0) {
        ThreeGeometryFactory.setColor(geometry, faces, material);
      }
      this._faceMaterial = material;
      this._faceMaterialOwned = owned;
      this._faces = new InstancedMesh(
        geometry,
        material,
        visibleVisuals.length
      );
      this._faces.layers.set(Layers.Solid);
      this._faces.frustumCulled = false;
      visibleVisuals.forEach((visual, index) => {
        const object = visual as unknown as Object3D;
        object.parent?.updateMatrixWorld(true);
        object.updateMatrixWorld(true);
        this._faces!.setMatrixAt(index, object.matrixWorld);
      });
      this._faces.instanceMatrix.needsUpdate = true;
      super.add(this._faces);
    }

    if (edges?.position.length) {
      this._edges = this.createEdgesMesh(visibleVisuals);
      if (this._edges) {
        super.add(this._edges);
      }
    }

    this._guides = this.buildGuideObjects(visibleVisuals);
    this._guides.forEach(guide => super.add(guide));

    this.syncStateOverlays();
  }

  private syncStateOverlays() {
    this.removeOverlay(this._highlightOverlay);
    this.removeOverlay(this._selectedOverlay);
    this.removeOverlay(this._snapOverlay);
    this.removeFaceOverlay(this._transparentOverlay);
    this.removeFaceOverlay(this._dragGhostOverlay);
    this.removeFaceOverlay(this._coloredOverlay);
    this._highlightOverlay =
      this._selectedOverlay =
      this._snapOverlay =
        undefined;
    this._transparentOverlay =
      this._dragGhostOverlay =
      this._coloredOverlay =
        undefined;

    const highlighted: ReferenceShapeVisual[] = [];
    const selected: ReferenceShapeVisual[] = [];
    const snapped: ReferenceShapeVisual[] = [];
    const transparent: ReferenceShapeVisual[] = [];
    const dragGhost: ReferenceShapeVisual[] = [];
    const colored: ReferenceShapeVisual[] = [];

    this._wholeStates.forEach((state, visual) => {
      const node = visual.geometryNode as ShapeNode;
      if (!visual.visible || !this._visuals.has(node)) return;
      if (VisualStateUtils.hasState(state, VisualState.snapHighlight)) {
        snapped.push(visual);
      } else if (VisualStateUtils.hasState(state, VisualState.edgeHighlight)) {
        highlighted.push(visual);
      } else if (VisualStateUtils.hasState(state, VisualState.edgeSelected)) {
        selected.push(visual);
      } else if (VisualStateUtils.hasState(state, VisualState.faceDragGhost)) {
        dragGhost.push(visual);
      } else if (
        VisualStateUtils.hasState(state, VisualState.faceTransparent)
      ) {
        transparent.push(visual);
      } else if (VisualStateUtils.hasState(state, VisualState.faceColored)) {
        colored.push(visual);
      }
    });

    this._highlightOverlay = this.createEdgesMesh(
      highlighted,
      lineHighlightWideMaterial
    );
    this._selectedOverlay = this.createEdgesMesh(
      selected,
      lineSelectedWideMaterial
    );
    this._snapOverlay = this.createEdgesMesh(snapped, lineSnapWideMaterial);
    this._transparentOverlay = this.createFaceOverlay(
      transparent,
      faceLambertSelectedTransparentMaterial
    );
    this._dragGhostOverlay = this.createFaceOverlay(
      dragGhost,
      faceBasicDragGhostMaterial
    );
    this._coloredOverlay = this.createFaceOverlay(
      colored,
      faceLambertHighlightSolidMaterial
    );

    [
      this._highlightOverlay,
      this._selectedOverlay,
      this._snapOverlay,
      this._transparentOverlay,
      this._dragGhostOverlay,
      this._coloredOverlay
    ].forEach(overlay => {
      if (overlay) {
        super.add(overlay);
      }
    });
  }

  private createFaceOverlay(
    visuals: ReferenceShapeVisual[],
    material: Material
  ) {
    const faces = this.sourceNode.mesh.faces;
    if (!faces?.position.length || visuals.length === 0) {
      return undefined;
    }
    const geometry = ThreeGeometryFactory.createFaceBufferGeometry(faces);
    if (faces.groups.length > 1) {
      geometry.groups = faces.groups;
    }
    const mesh = new InstancedMesh(geometry, material, visuals.length);
    mesh.layers.set(Layers.Solid);
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    visuals.forEach((visual, index) => {
      const object = visual as unknown as Object3D;
      object.parent?.updateMatrixWorld(true);
      object.updateMatrixWorld(true);
      mesh.setMatrixAt(index, object.matrixWorld);
    });
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }

  private createEdgesMesh(
    visuals: ReferenceShapeVisual[],
    material: Material = lineDefaultThinMaterial
  ) {
    const edges = this.sourceNode.mesh.edges;
    if (!edges?.position.length || visuals.length === 0) {
      return undefined;
    }

    const merged = new Float32Array(edges.position.length * visuals.length);
    const point = new Vector3();
    const matrix = new ThreeMatrix4();
    let offset = 0;

    visuals.forEach(visual => {
      const object = visual as unknown as Object3D;
      object.parent?.updateMatrixWorld(true);
      object.updateMatrixWorld(true);
      matrix.copy(object.matrixWorld);
      for (let i = 0; i < edges.position.length; i += 3) {
        point
          .set(edges.position[i], edges.position[i + 1], edges.position[i + 2])
          .applyMatrix4(matrix);
        merged[offset++] = point.x;
        merged[offset++] = point.y;
        merged[offset++] = point.z;
      }
    });

    const geometry = ThreeGeometryFactory.createEdgeBufferGeometry({
      ...edges,
      position: merged
    });
    const line = new LineSegments2(geometry, material as any);
    line.layers.set(Layers.Wireframe);
    line.frustumCulled = false;
    if (material !== lineDefaultThinMaterial) {
      line.renderOrder = 2;
    }
    return line.computeLineDistances();
  }

  private createGuideMeshes(visuals: ReferenceShapeVisual[]) {
    const displayGuides = filterGuidesByRole(this.sourceNode.guides, "display");
    const guides = buildGuideEdgeMeshes(displayGuides, {
      advancedOcclusion: true
    });
    if (guides.length === 0 || visuals.length === 0) {
      return {
        descriptors: displayGuides,
        meshes: []
      };
    }

    return {
      descriptors: displayGuides,
      meshes: guides.flatMap(guide => {
        if (guide.position.length === 0) return [];

        const merged = new Float32Array(guide.position.length * visuals.length);
        const point = new Vector3();
        const matrix = new ThreeMatrix4();
        let offset = 0;

        visuals.forEach(visual => {
          const object = visual as unknown as Object3D;
          object.parent?.updateMatrixWorld(true);
          object.updateMatrixWorld(true);
          matrix.copy(object.matrixWorld);
          for (let i = 0; i < guide.position.length; i += 3) {
            point
              .set(
                guide.position[i],
                guide.position[i + 1],
                guide.position[i + 2]
              )
              .applyMatrix4(matrix);
            merged[offset++] = point.x;
            merged[offset++] = point.y;
            merged[offset++] = point.z;
          }
        });

        return [
          {
            ...guide,
            position: merged,
            range: []
          }
        ];
      })
    };
  }

  private buildGuideObjects(visuals: ReferenceShapeVisual[]) {
    const { descriptors, meshes } = this.createGuideMeshes(visuals);
    if (meshes.length === 0) {
      this._detachGuideOcclusionOverlays = [];
      return [];
    }
    const created = ThreeGeometry.createGuideObjects(
      meshes,
      this.context,
      Layers.Wireframe,
      descriptors
    );
    this._detachGuideOcclusionOverlays = created.detachOcclusionOverlays;
    return created.guides.map(guide => {
      guide.frustumCulled = false;
      return guide;
    });
  }

  private removeMeshes() {
    this._overlaySyncQueued = false;
    this._visibleVisuals = [];
    this.removeOverlay(this._highlightOverlay);
    this.removeOverlay(this._selectedOverlay);
    this.removeOverlay(this._snapOverlay);
    this.removeFaceOverlay(this._transparentOverlay);
    this.removeFaceOverlay(this._dragGhostOverlay);
    this.removeFaceOverlay(this._coloredOverlay);
    this._highlightOverlay =
      this._selectedOverlay =
      this._snapOverlay =
        undefined;
    this._transparentOverlay =
      this._dragGhostOverlay =
      this._coloredOverlay =
        undefined;

    if (this._faces) {
      super.remove(this._faces);
      this._faces.geometry.dispose();
      this._faces = undefined;
    }
    if (this._edges) {
      super.remove(this._edges);
      this._edges.geometry.dispose();
      this._edges = undefined;
    }
    ThreeGeometry.detachGuideOcclusionOverlays(this._guides);
    this._detachGuideOcclusionOverlays = [];
    this._guides.forEach(guide => {
      super.remove(guide);
      guide.geometry.dispose();
    });
    this._guides = [];
    this._faceMaterial = undefined;
    this._faceMaterialOwned = false;
  }

  private removeOverlay(mesh?: LineSegments2) {
    if (!mesh) return;
    super.remove(mesh);
    mesh.geometry.dispose();
  }

  private removeFaceOverlay(mesh?: InstancedMesh) {
    if (!mesh) return;
    super.remove(mesh);
    mesh.geometry.dispose();
  }
}
