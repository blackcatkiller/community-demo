// @ts-nocheck
import type {
  EdgeMeshData,
  IShape,
  ISubShape,
  ShapeMeshRange,
  VisualShapeData
} from "@modelai/core/types";
import {
  type ShapeType,
  ShapeTypeUtils,
  type VisualState,
  type ViewShapeGuidePolicy
} from "@modelai/core/types";
import type { BoundingBox, Matrix4 } from "@modelai/core/math";
import { ShapeNode, type GeometryNode } from "@modelai/model/shapeNode";
import type { Intersection, Mesh, Object3D, Points, Raycaster } from "three";
import type { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { applyOcclusionOverlay } from "@modelai/geometry/occlusionOverlay";
import type {
  FeatureGuideDescriptor,
  GuideProjectionResult,
  FeatureGuideRole,
  FeatureCenterlineGuide
} from "../geometry/featureGeometry";
import {
  filterCenterlineGuidesByRole,
  getGuideCarrierEdge,
  hasGuideRole,
  isCenterlineGuideByRole,
  projectPointToGuidePath
} from "../geometry/featureGeometry";
import { Layers } from "./constants";
import type {
  GeometryRenderChannels,
  GeometryVisualBackend
} from "./geometryBackend";
import { ThreeGeometryFactory } from "./geometryFactory";
import { ThreeHelper } from "./helper";
import { LocalGeometryBackend } from "./localGeometryBackend";
import { ThreeVisualObject } from "./visualObject";
import type { ThreeVisualContext } from "./visualContext";
import type { ThreeView } from "./view";

export type GeometryPointShapeHit = {
  distance: number;
  hit: VisualShapeData;
};

type GuideObjectUserData = {
  featureGuide?: FeatureGuideDescriptor;
  detachOcclusionOverlay?: () => void;
};

export class ThreeGeometry extends ThreeVisualObject {
  readonly backend: GeometryVisualBackend;

  constructor(
    readonly geometryNode: GeometryNode,
    readonly context: ThreeVisualContext,
    backend?: GeometryVisualBackend
  ) {
    super(geometryNode);
    this.backend = backend ?? new LocalGeometryBackend(geometryNode, context);
    this.backend.attach(this);
    geometryNode.onPropertyChanged(this.handleGeometryChanged);
  }

  private readonly handleGeometryChanged = (prop: string) => {
    if (prop === "shape") {
      this.backend.refresh();
      this.context.onVisualShapesChanged?.();
      this.context.onNeedsUpdate?.();
    }
  };

  vertexLayer(): number {
    return Layers.Wireframe;
  }

  edgeLayer(): number {
    return Layers.Wireframe;
  }

  faceLayer(): number {
    return Layers.Solid;
  }

  protected wholeVisualEnabled() {
    return this.backend.wholeVisualEnabled?.() ?? true;
  }

  protected renderChannels(): GeometryRenderChannels {
    return this.backend.getRenderChannels();
  }

  override boundingBox(): BoundingBox | undefined {
    return this.backend.boundingBox();
  }

  applyWholeVisualState(state: VisualState) {
    if (this.backend.applyWholeVisualState?.(state)) return;
  }
  clearWholeVisualState() {
    if (this.backend.clearWholeVisualState?.()) return;
  }

  faces() {
    return this.renderChannels().faces;
  }
  edges() {
    return this.renderChannels().edges;
  }
  vertexs() {
    return this.renderChannels().vertexs;
  }

  protected getShapeHitObjects(
    shapeType: ShapeType,
    guidePolicy: ViewShapeGuidePolicy = "default"
  ): Object3D[] {
    const backendObjects = this.backend.getShapeHitObjects?.(
      shapeType,
      guidePolicy
    );
    if (backendObjects) return backendObjects;
    const { faces, edges, vertexs, guides } = this.renderChannels();
    const isWhole =
      ShapeTypeUtils.isWhole(shapeType) ||
      ShapeTypeUtils.hasCompound(shapeType) ||
      ShapeTypeUtils.hasSolid(shapeType);

    const objects: Object3D[] = [];
    if (isWhole || ShapeTypeUtils.hasVertex(shapeType)) {
      if (vertexs) objects.push(vertexs);
    }
    if (
      isWhole ||
      ShapeTypeUtils.hasEdge(shapeType) ||
      ShapeTypeUtils.hasWire(shapeType)
    ) {
      objects.push(
        ...guides.filter(guide =>
          ThreeGeometry.guideHasRole(guide, "pickProxy")
        )
      );
      if (edges) objects.push(edges);
    }
    if (
      isWhole ||
      ShapeTypeUtils.hasFace(shapeType) ||
      ShapeTypeUtils.hasShell(shapeType)
    ) {
      if (faces) objects.push(faces);
    }
    return objects;
  }

  pointShapeHits(
    raycaster: Raycaster,
    shapeType: ShapeType,
    guidePolicy: ViewShapeGuidePolicy = "default"
  ): GeometryPointShapeHit[] {
    const objects = this.getShapeHitObjects(shapeType, guidePolicy);
    if (objects.length === 0) return [];
    const intersections = raycaster.intersectObjects(objects, false);
    if (ShapeTypeUtils.isWhole(shapeType)) {
      return this.resolveWholeShapeHits(intersections);
    }
    return this.resolveSubShapeHits(intersections, guidePolicy);
  }

  override getSubShapeAndIndex(
    type: "face" | "edge" | "vertex",
    subVisualIndex: number
  ) {
    let subShape: ISubShape | undefined;
    let transform: Matrix4 | undefined;
    let index = -1;
    let groups: ShapeMeshRange[] | undefined;

    if (type === "vertex") groups = this.geometryNode.mesh.vertexs?.range;
    else if (type === "edge") groups = this.geometryNode.mesh.edges?.range;
    else groups = this.geometryNode.mesh.faces?.range;

    if (groups) {
      index = ThreeHelper.findGroupIndex(groups, subVisualIndex) ?? -1;
      if (index >= 0) {
        subShape = groups[index].shape;
        transform = groups[index].transform;
      }
    }

    let shape: IShape | undefined = subShape;
    if ("shape" in this.geometryNode) {
      const sn = this.geometryNode as ShapeNode;
      if (sn.shape.isOk) shape = sn.shape.value;
    }
    return { transform, shape, subShape, index, groups: groups ?? [] };
  }

  override subShapeVisual(
    shapeType: ShapeType
  ): (Mesh | LineSegments2 | Points)[] {
    const { faces, edges, vertexs, guides } = this.renderChannels();
    const shapes: (Mesh | LineSegments2 | Points | undefined)[] = [];
    const isWhole =
      ShapeTypeUtils.isWhole(shapeType) ||
      ShapeTypeUtils.hasCompound(shapeType) ||
      ShapeTypeUtils.hasSolid(shapeType);
    if (isWhole || ShapeTypeUtils.hasVertex(shapeType)) shapes.push(vertexs);
    if (
      isWhole ||
      ShapeTypeUtils.hasEdge(shapeType) ||
      ShapeTypeUtils.hasWire(shapeType)
    ) {
      shapes.push(...guides);
      shapes.push(edges);
    }
    if (
      isWhole ||
      ShapeTypeUtils.hasFace(shapeType) ||
      ShapeTypeUtils.hasShell(shapeType)
    )
      shapes.push(faces);
    return shapes.filter((x): x is NonNullable<typeof x> => x !== undefined);
  }

  override wholeVisual() {
    if (!this.wholeVisualEnabled()) return [];
    const { faces, edges, vertexs, guides } = this.renderChannels();
    return [...guides, edges, faces, vertexs].filter(
      (x): x is NonNullable<typeof x> => x !== undefined
    );
  }

  private resolveWholeShapeHits(
    intersections: Intersection[]
  ): GeometryPointShapeHit[] {
    const shapeNode = this.geometryNode as Partial<ShapeNode>;
    const shape = shapeNode.shape?.isOk ? shapeNode.shape.value : undefined;
    if (!shape) return [];
    const hit = intersections[0];
    if (!hit) return [];
    return [
      {
        distance: hit.distance,
        hit: {
          owner: this as any,
          shape,
          transform: this.worldTransform(),
          point: ThreeHelper.toXYZ(hit.pointOnLine ?? hit.point),
          indexes: []
        }
      }
    ];
  }

  private resolveSubShapeHits(
    intersections: Intersection[],
    guidePolicy: ViewShapeGuidePolicy
  ): GeometryPointShapeHit[] {
    const result: GeometryPointShapeHit[] = [];
    for (const hit of intersections) {
      const guideHit = this.resolveGuideHit(hit);
      if (guideHit) {
        result.push(guideHit);
        continue;
      }
      let type: "edge" | "face" | "vertex" = "edge";
      let subIdx = 0;
      if (hit.pointOnLine) {
        subIdx = (hit as any).faceIndex! * 2;
      } else if (Number.isInteger(hit.faceIndex)) {
        type = "face";
        subIdx = hit.faceIndex! * 3;
      } else {
        type = "vertex";
        subIdx = hit.index!;
      }

      const redirectedGuideHit =
        guidePolicy === "pointProxy"
          ? this.resolveShapeGuideProxyHit(hit)
          : undefined;
      if (redirectedGuideHit) {
        result.push(redirectedGuideHit);
        continue;
      }

      const { shape, subShape, index } = this.getSubShapeAndIndex(type, subIdx);
      if (!subShape || !shape) continue;
      result.push({
        distance: hit.distance,
        hit: {
          owner: this as any,
          shape: subShape,
          transform: this.worldTransform(),
          point: ThreeHelper.toXYZ(hit.pointOnLine ?? hit.point),
          indexes: [index]
        }
      });
    }
    return result;
  }

  protected resolveShapeGuideProxyHit(
    hit: Intersection
  ): GeometryPointShapeHit | undefined {
    if (!(this.geometryNode instanceof ShapeNode)) {
      return undefined;
    }

    const guides = filterCenterlineGuidesByRole(
      this.geometryNode.guides,
      "pickProxy"
    );
    if (guides.length === 0) {
      return undefined;
    }

    const hitPoint = ThreeHelper.toXYZ(hit.pointOnLine ?? hit.point);
    const inverse = this.worldTransform().invert();
    const localHitPoint = inverse ? inverse.ofPoint(hitPoint) : hitPoint;

    let nearest:
      | {
          guide: FeatureCenterlineGuide;
          carrierEdge: IShape;
          point: GuideProjectionResult;
        }
      | undefined;

    guides.forEach(guide => {
      const carrierEdge = getGuideCarrierEdge(guide);
      if (!carrierEdge) {
        return;
      }
      const projected = projectPointToGuidePath(guide.path, localHitPoint);
      if (!projected) {
        return;
      }
      if (!nearest || projected.distance < nearest.point.distance) {
        nearest = {
          guide,
          carrierEdge,
          point: projected
        };
      }
    });

    if (!nearest) {
      return undefined;
    }

    return {
      distance: hit.distance,
      hit: {
        owner: this as any,
        shape: nearest.carrierEdge,
        transform: this.worldTransform(),
        point: this.worldTransform().ofPoint(nearest.point.point),
        indexes: [],
        guide: nearest.guide
      }
    };
  }

  protected resolveGuideHit(
    hit: Intersection
  ): GeometryPointShapeHit | undefined {
    const guide = ThreeGeometry.getGuideDescriptor(hit.object);
    if (!guide || !isCenterlineGuideByRole(guide, "pickProxy")) {
      return undefined;
    }
    const carrierEdge = getGuideCarrierEdge(guide);
    if (!carrierEdge) {
      return undefined;
    }

    const rawPoint = ThreeHelper.toXYZ(hit.pointOnLine ?? hit.point);
    const inverse = this.worldTransform().invert();
    const localPoint = inverse ? inverse.ofPoint(rawPoint) : rawPoint;
    const projected = projectPointToGuidePath(guide.path, localPoint);

    return {
      distance: hit.distance,
      hit: {
        owner: this as any,
        shape: carrierEdge,
        transform: this.worldTransform(),
        point: projected
          ? this.worldTransform().ofPoint(projected.point)
          : rawPoint,
        indexes: [],
        guide
      }
    };
  }

  override dispose() {
    super.dispose();
    this.geometryNode.removePropertyChanged(this.handleGeometryChanged);
    this.backend.detach();
  }

  static createGuideObjects(
    meshes: readonly EdgeMeshData[],
    context: ThreeVisualContext,
    layer: number,
    descriptors?: readonly FeatureGuideDescriptor[]
  ) {
    const view = this.getActiveThreeView(context);
    const detachOcclusionOverlays: Array<() => void> = [];
    const guides = meshes.map((mesh, index) => {
      const guide = ThreeGeometryFactory.createEdgeGeometry(mesh);
      const descriptor = descriptors?.[index];
      if (descriptor) {
        ThreeGeometry.assignGuideDescriptor(guide, descriptor);
      }
      guide.layers.set(layer);
      if (view && mesh.advancedOcclusion) {
        const detach = applyOcclusionOverlay(view, guide);
        guide.userData.detachOcclusionOverlay = detach;
        detachOcclusionOverlays.push(detach);
      }
      return guide;
    });
    return { guides, detachOcclusionOverlays };
  }

  static detachGuideOcclusionOverlays(guides: readonly LineSegments2[]) {
    guides.forEach(guide => {
      const detach = (guide.userData as GuideObjectUserData | undefined)
        ?.detachOcclusionOverlay;
      if (typeof detach === "function") {
        detach();
      }
      if (guide.userData) {
        delete guide.userData.detachOcclusionOverlay;
      }
    });
  }

  private static getActiveThreeView(
    context: ThreeVisualContext
  ): ThreeView | undefined {
    const view = context.document.application.activeView;
    if (
      view &&
      typeof (view as any).addAfterSceneRenderHook === "function" &&
      typeof (view as any).removeAfterSceneRenderHook === "function"
    ) {
      return view as ThreeView;
    }
    return undefined;
  }

  static assignGuideDescriptor(
    object: Object3D,
    descriptor: FeatureGuideDescriptor
  ) {
    (object.userData as GuideObjectUserData).featureGuide = descriptor;
  }

  static getGuideDescriptor(
    object: Object3D
  ): FeatureGuideDescriptor | undefined {
    return (object.userData as GuideObjectUserData | undefined)?.featureGuide;
  }

  static guideHasRole(object: Object3D, role: FeatureGuideRole): boolean {
    const guide = ThreeGeometry.getGuideDescriptor(object);
    return guide ? hasGuideRole(guide, role) : false;
  }

  static guideOwnsSubShapeHit(object: Object3D): boolean {
    const guide = ThreeGeometry.getGuideDescriptor(object);
    return guide ? isCenterlineGuideByRole(guide, "pickProxy") : false;
  }
}
