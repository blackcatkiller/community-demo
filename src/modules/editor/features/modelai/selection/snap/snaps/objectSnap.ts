// @ts-nocheck
import type {
  IDocument,
  IView,
  IVisualContext,
  VisualShapeData
} from "@modelai/core/types";
import { MeshDataUtils, ShapeType, VisualConfig } from "@modelai/core/types";
import type { Matrix4, XYZ } from "@modelai/core/math";
import { gc } from "@modelai/core/gc";
import { getGuideCarrierFeaturePoints } from "@modelai/geometry/featureGeometry";
import type { OccEdge } from "@modelai/occ";
import { toXYZ } from "@modelai/occ/helper";
import { RaycasterThreshold } from "@modelai/viewer/constants";
import { Vector3 } from "three";
import { MAX_INVISIBLE_SNAPS } from "../../tracking/trackingPointConfig";
import {
  ObjectSnapType,
  ObjectSnapTypeUtils,
  type SnapConfig
} from "../../snapConfig";
import {
  DEFAULT_SNAP_PROFILE,
  type ISnapCandidateProvider,
  type MouseAndDetected,
  type SnapCandidate,
  type SnapCandidateType,
  type SnapHitContext,
  type SnapResult
} from "../snap";
import { screenDistance } from "../utils";
import { BaseSnap } from "./baseSnap";
import { FeaturePointStrategy } from "./featurePointStrategy";

interface InvisibleSnapInfo {
  view: IView;
  snaps: SnapResult[];
  displays: number[];
}

interface RankedObjectCandidate {
  candidate: SnapCandidate;
  distance: number;
}

export class ObjectSnap extends BaseSnap implements ISnapCandidateProvider {
  private readonly featureStrategy: FeaturePointStrategy;
  private readonly intersectionInfos: Map<string, SnapResult[]>;
  private readonly invisibleInfos: Map<string, InvisibleSnapInfo>;
  private lastDetected?: [IView, SnapResult];
  private hintVertex?: [IVisualContext, number];
  private lastSnapTypes: ObjectSnapType;

  constructor(
    private readonly config: SnapConfig,
    referencePoint?: () => XYZ
  ) {
    super(referencePoint);
    this.featureStrategy = new FeaturePointStrategy(config.snapTypes);
    this.lastSnapTypes = config.snapTypes;
    this.intersectionInfos = new Map();
    this.invisibleInfos = new Map();
  }

  override clear() {
    super.clear();
    for (const key of [...this.invisibleInfos.keys()]) {
      this.removeInvisibleInfo(key);
    }
    this.removeHint();
    this.featureStrategy.clear();
  }

  readonly handleSnaped = (
    _document: IDocument,
    snaped?: SnapResult | undefined
  ) => {
    if (snaped?.shapes.length === 0 && this.lastDetected) {
      this.displayHint(this.lastDetected[0], this.lastDetected[1]);
      this.lastDetected = undefined;
    }
  };

  override removeDynamicObject(): void {
    super.removeDynamicObject();
    this.removeHint();
  }

  private removeHint() {
    if (this.hintVertex !== undefined) {
      this.hintVertex[0].removeMesh(this.hintVertex[1]);
      this.hintVertex = undefined;
    }
  }

  snap(data: MouseAndDetected): SnapResult | undefined {
    if (!this.config.enableSnap) return undefined;
    const context: SnapHitContext = {
      view: data.view,
      mx: data.mx,
      my: data.my,
      ray: data.view.rayAt(data.mx, data.my),
      shapes: data.shapes,
      profile: DEFAULT_SNAP_PROFILE
    };
    const candidates = this.collectCandidates(context);
    const best = this.getBestCandidate(data.view, data.mx, data.my, candidates);
    if (!best) return undefined;

    if (best.distance < RaycasterThreshold) {
      this.hilighted(data.view, best.candidate.shapes);
      return this.toSnapResult(best.candidate, data.view);
    }

    const guideHit = data.shapes[0];
    if (guideHit?.guide && guideHit.point) {
      this.lastDetected = [
        data.view,
        this.toSnapResult(best.candidate, data.view)
      ];
      return {
        view: data.view,
        point: guideHit.point,
        shapes: [guideHit]
      };
    }

    this.lastDetected = [
      data.view,
      this.toSnapResult(best.candidate, data.view)
    ];
    return undefined;
  }

  collectCandidates(context: SnapHitContext): SnapCandidate[] {
    if (!this.config.enableSnap) return [];
    this.syncSnapTypes();

    if (context.shapes.length > 0) {
      if (context.profile.enableInvisibleSnaps) {
        this.showInvisibleSnaps(context.view, context.shapes[0]);
      }

      const current = context.shapes[0];
      const candidates = [
        ...this.collectFeatureCandidates(context.view, current),
        ...(context.profile.enableDerivedSnaps.perpendicular
          ? this.collectPerpendicularCandidates(context.view, current)
          : []),
        ...(context.profile.enableDerivedSnaps.intersection
          ? this.collectIntersectionCandidates(
              context.view,
              current,
              context.shapes
            )
          : [])
      ];
      if (current.guide && current.point) {
        candidates.push(
          ...this.collectGuideFeatureCandidates(context.view, current)
        );
        candidates.push({
          key: this.getGuidePointCandidateKey(current),
          type: "guidePoint",
          point: current.point,
          shapes: [current],
          source: "feature"
        });
      }
      return candidates;
    }

    if (!context.profile.enableInvisibleSnaps) return [];
    return this.collectInvisibleCandidates(
      context.view,
      context.mx,
      context.my
    );
  }

  private displayHint(view: IView, shape: SnapResult) {
    this.hilighted(view, shape.shapes);
    const data = MeshDataUtils.createVertexMesh(
      shape.point!,
      VisualConfig.hintVertexSize,
      VisualConfig.snapHintVertexColor
    );
    this.hintVertex = [
      view.document.visual.context,
      view.document.visual.context.displayMesh([data])
    ];
  }

  private collectInvisibleCandidates(view: IView, x: number, y: number) {
    const { minDistance, snap } = this.getNearestInvisibleSnap(view, x, y);
    if (!snap) return [];
    const candidate = this.toCandidate(snap, "center", "derived");
    candidate.score = minDistance;
    return [candidate];
  }

  private snapInvisible(
    view: IView,
    x: number,
    y: number
  ): SnapResult | undefined {
    const { minDistance, snap } = this.getNearestInvisibleSnap(view, x, y);
    if (minDistance < RaycasterThreshold) {
      this.hilighted(view, snap!.shapes);
      return snap;
    }
    return undefined;
  }

  private getNearestInvisibleSnap(
    view: IView,
    x: number,
    y: number
  ): { minDistance: number; snap?: SnapResult } {
    let snap: SnapResult | undefined;
    let minDistance = Number.MAX_VALUE;

    this.invisibleInfos.forEach(info => {
      info.snaps.forEach(s => {
        const dist = screenDistance(view, x, y, s.point!);
        if (dist < minDistance) {
          minDistance = dist;
          snap = s;
        }
      });
    });
    return { minDistance, snap };
  }

  private showInvisibleSnaps(view: IView, shape: VisualShapeData) {
    if (
      !ObjectSnapTypeUtils.hasType(this.config.snapTypes, ObjectSnapType.center)
    ) {
      return;
    }

    if (shape.shape.shapeType === ShapeType.Edge) {
      const key = this.getInvisibleKey(shape);
      if (this.invisibleInfos.has(key)) return;
      const edge = shape.shape as OccEdge;
      this.showCircleCenter(key, edge, view, shape);
    }
  }

  private showCircleCenter(
    key: string,
    edge: OccEdge,
    view: IView,
    shape: VisualShapeData
  ) {
    const center = this.getCircleCenter(edge, shape.transform);
    if (!center) return;

    this.ensureInvisibleCapacity();

    const temporary = MeshDataUtils.createVertexMesh(
      center,
      VisualConfig.hintVertexSize,
      VisualConfig.snapHintVertexColor
    );
    const id = view.document.visual.context.displayMesh([temporary]);
    this.invisibleInfos.set(key, {
      view,
      snaps: [
        {
          view,
          point: center,
          info: "center",
          shapes: [shape]
        }
      ],
      displays: [id]
    });
  }

  private getInvisibleKey(shape: VisualShapeData): string {
    // `VisualShapeData` objects are recreated every hit-test; use stable identifiers instead.
    if (shape.guide) {
      return `guide:${shape.guide.id}`;
    }
    return `${shape.shape.id}|${shape.indexes.join(",")}`;
  }

  private ensureInvisibleCapacity(): void {
    while (this.invisibleInfos.size >= MAX_INVISIBLE_SNAPS) {
      const oldestKey = this.invisibleInfos.keys().next().value as
        | string
        | undefined;
      if (!oldestKey) break;
      this.removeInvisibleInfo(oldestKey);
    }
  }

  private removeInvisibleInfo(key: string): void {
    const info = this.invisibleInfos.get(key);
    if (!info) return;
    info.displays.forEach(id =>
      info.view.document.visual.context.removeMesh(id)
    );
    this.invisibleInfos.delete(key);
  }

  private clearInvisibleInfos(): void {
    for (const key of [...this.invisibleInfos.keys()]) {
      this.removeInvisibleInfo(key);
    }
  }

  private getCircleCenter(edge: OccEdge, transform: Matrix4): XYZ | undefined {
    return gc(collect => {
      const handle = collect(wasm.Edge.curve(edge.shape));
      const curve = handle.get();
      if (!curve) return undefined;

      let baseCurve: any = curve;
      if (typeof curve.basisCurve === "function") {
        const baseHandle = collect(curve.basisCurve());
        const base = baseHandle.get();
        if (base) {
          baseCurve = base;
        }
      }

      if (!baseCurve || !wasm?.Transient?.isKind?.(baseCurve, "Geom_Circle")) {
        return undefined;
      }

      const center = collect(baseCurve.location());
      return transform.ofPoint(toXYZ(center));
    });
  }

  private hilighted(view: IView, shapes: VisualShapeData[]) {
    this.highlight(view, shapes);
  }

  private collectFeatureCandidates(view: IView, shape: VisualShapeData) {
    return this.featureStrategy
      .getFeaturePoints(view, shape)
      .map(result =>
        this.toCandidate(result, this.inferCandidateType(result), "feature")
      );
  }

  private collectPerpendicularCandidates(view: IView, shape: VisualShapeData) {
    return this.findPerpendicular(view, shape).map(result =>
      this.toCandidate(result, "perpendicular", "derived")
    );
  }

  private collectIntersectionCandidates(
    view: IView,
    current: VisualShapeData,
    shapes: VisualShapeData[]
  ) {
    return this.getIntersections(view, current, shapes).map(result =>
      this.toCandidate(result, "intersection", "derived")
    );
  }

  private collectGuideFeatureCandidates(
    view: IView,
    shape: VisualShapeData
  ): SnapCandidate[] {
    if (!shape.guide) return [];
    const existing = new Set<string>();
    return getGuideCarrierFeaturePoints(shape.guide).flatMap(feature => {
      const point = shape.transform.ofPoint(feature.point);
      const type = this.inferGuideFeatureCandidateType(feature.type);
      const key = `${type}|${point.x.toFixed(6)},${point.y.toFixed(
        6
      )},${point.z.toFixed(6)}`;
      if (existing.has(key)) return [];
      existing.add(key);
      return [
        {
          key: `guideFeature:${shape.guide!.id}:${key}`,
          type,
          point,
          info: feature.type,
          shapes: [shape],
          source: "feature" as const
        }
      ];
    });
  }

  private inferGuideFeatureCandidateType(
    type: "center" | "end" | "mid"
  ): SnapCandidateType {
    switch (type) {
      case "end":
        return "endPoint";
      case "mid":
        return "midPoint";
      case "center":
        return "center";
    }
  }

  private sortSnaps(
    view: IView,
    x: number,
    y: number,
    a: SnapResult,
    b: SnapResult
  ): number {
    return (
      screenDistance(view, x, y, a.point!) -
      screenDistance(view, x, y, b.point!)
    );
  }

  private findPerpendicular(view: IView, shape: VisualShapeData): SnapResult[] {
    const result: SnapResult[] = [];
    if (
      !ObjectSnapTypeUtils.hasType(
        this.config.snapTypes,
        ObjectSnapType.perpendicular
      ) ||
      this.referencePoint === undefined ||
      shape.shape.shapeType !== ShapeType.Edge
    ) {
      return result;
    }

    const edge = shape.shape as OccEdge;
    const transform = shape.transform;
    const point = this.projectPointToEdge(
      edge,
      transform,
      this.referencePoint()
    );
    if (point === undefined) return result;
    result.push({
      view,
      point,
      info: "perpendicular",
      shapes: [shape]
    });

    return result;
  }

  private projectPointToEdge(
    edge: OccEdge,
    transform: Matrix4,
    ref: XYZ
  ): XYZ | undefined {
    return gc(collect => {
      const handle = collect(wasm.Edge.curve(edge.shape));
      const curve = handle.get();
      if (!curve) return undefined;

      const inv = transform.invert();
      const localRef = inv ? inv.ofPoint(ref) : ref;
      const projection = wasm.Curve.projectOrNearest(curve, {
        x: localRef.x,
        y: localRef.y,
        z: localRef.z
      });
      if (projection?.point) {
        return transform.ofPoint(toXYZ(projection.point));
      }
      return undefined;
    });
  }

  private getIntersections(
    view: IView,
    current: VisualShapeData,
    shapes: VisualShapeData[]
  ) {
    const result: SnapResult[] = [];
    if (
      !ObjectSnapTypeUtils.hasType(
        this.config.snapTypes,
        ObjectSnapType.intersection
      ) ||
      current.shape.shapeType !== ShapeType.Edge
    ) {
      return result;
    }
    shapes.forEach(x => {
      if (x === current || x.shape.shapeType !== ShapeType.Edge) return;
      const key = this.getIntersectionKey(current, x);
      let arr = this.intersectionInfos.get(key);
      if (arr === undefined) {
        arr = this.findIntersections(view, current, x);
        this.intersectionInfos.set(key, arr);
      }
      result.push(...arr);
    });
    return result;
  }

  private getIntersectionKey(s1: VisualShapeData, s2: VisualShapeData) {
    return s1.shape.id < s2.shape.id
      ? `${s1.shape.id}:${s2.shape.id}`
      : `${s2.shape.id}:${s1.shape.id}`;
  }

  private findIntersections(
    view: IView,
    s1: VisualShapeData,
    s2: VisualShapeData
  ): SnapResult[] {
    const e1 = s1.shape as OccEdge;
    const e2 = s2.shape as OccEdge;
    if (s1.transform && s2.transform && !s1.transform.equals(s2.transform)) {
      return [];
    }
    let intersections: Array<{ point: { x: number; y: number; z: number } }> =
      [];
    try {
      intersections = wasm.Edge.intersect(e1.shape, e2.shape);
    } catch {
      return [];
    }
    return intersections.map(point => {
      return {
        view,
        point: s1.transform.ofPoint(toXYZ(point.point)),
        info: "intersection",
        shapes: [s1, s2]
      };
    });
  }

  private syncSnapTypes() {
    if (this.lastSnapTypes !== this.config.snapTypes) {
      this.lastSnapTypes = this.config.snapTypes;
      this.featureStrategy.updateSnapType(this.lastSnapTypes);
      this.intersectionInfos.clear();
      this.clearInvisibleInfos();
    }
  }

  private toCandidate(
    result: SnapResult,
    type: SnapCandidateType,
    source: SnapCandidate["source"]
  ): SnapCandidate {
    return {
      key: this.getCandidateKey(result, type),
      type,
      point: result.point!,
      shapes: result.shapes,
      refPoint: result.refPoint,
      info: result.info,
      distance: result.distance,
      source
    };
  }

  private toSnapResult(candidate: SnapCandidate, view: IView): SnapResult {
    return {
      view,
      point: candidate.point,
      info: candidate.info,
      shapes: candidate.shapes,
      refPoint: candidate.refPoint,
      distance: candidate.distance
    };
  }

  private getCandidateKey(result: SnapResult, type: SnapCandidateType) {
    const shapePart =
      result.shapes.length > 0
        ? result.shapes
            .map(shape =>
              shape.guide
                ? `guide:${shape.guide.id}`
                : `${shape.shape.id}:${shape.indexes.join(",")}`
            )
            .join("|")
        : "none";
    const point = result.point!;
    return `${type}|${shapePart}|${point.x.toFixed(6)},${point.y.toFixed(
      6
    )},${point.z.toFixed(6)}`;
  }

  private inferCandidateType(result: SnapResult): SnapCandidateType {
    switch (result.info) {
      case "vertex":
        return "vertex";
      case "end":
        return "endPoint";
      case "mid":
        return "midPoint";
      case "center":
        return "center";
      case "perpendicular":
        return "perpendicular";
      case "intersection":
        return "intersection";
      default:
        return "vertex";
    }
  }

  private getGuidePointCandidateKey(shape: VisualShapeData) {
    const point = shape.point;
    const pointKey = point
      ? `${point.x.toFixed(6)},${point.y.toFixed(6)},${point.z.toFixed(6)}`
      : "none";
    return `guidePoint:${shape.guide?.id ?? "unknown"}:${pointKey}`;
  }

  private getBestCandidate(
    view: IView,
    x: number,
    y: number,
    candidates: SnapCandidate[]
  ): RankedObjectCandidate | undefined {
    if (candidates.length === 0) return undefined;
    const guidePoint = candidates.find(candidate => candidate.shapes[0]?.guide)
      ?.shapes[0]?.point;
    if (guidePoint) {
      const guidePointCandidate = candidates.find(
        candidate => candidate.type === "guidePoint"
      );
      const featureCandidate = this.getNearestCandidate(
        candidates.filter(candidate => candidate.type !== "guidePoint"),
        candidate => this.worldScreenDistance(view, guidePoint, candidate.point)
      );
      if (featureCandidate && featureCandidate.distance < RaycasterThreshold) {
        return featureCandidate;
      }
      return guidePointCandidate
        ? {
            candidate: guidePointCandidate,
            distance: 0
          }
        : undefined;
    }

    return this.getNearestCandidate(candidates, candidate =>
      this.candidateScreenDistance(view, x, y, candidate)
    );
  }

  private getNearestCandidate(
    candidates: SnapCandidate[],
    getDistance: (candidate: SnapCandidate) => number
  ): RankedObjectCandidate | undefined {
    let nearest: RankedObjectCandidate | undefined;
    for (const candidate of candidates) {
      const distance = getDistance(candidate);
      if (!nearest || distance < nearest.distance) {
        nearest = {
          candidate,
          distance
        };
      }
    }
    return nearest;
  }

  private candidateScreenDistance(
    view: IView,
    x: number,
    y: number,
    candidate: SnapCandidate
  ) {
    const guidePoint = candidate.shapes[0]?.point;
    if (candidate.shapes[0]?.guide && guidePoint) {
      return candidate.type === "guidePoint"
        ? 0
        : this.worldScreenDistance(view, guidePoint, candidate.point);
    }
    return screenDistance(view, x, y, candidate.point);
  }

  private worldScreenDistance(view: IView, source: XYZ, target: XYZ) {
    const camera = (view as any).camera;
    if (!camera) return Number.POSITIVE_INFINITY;
    const sourceScreen = new Vector3(source.x, source.y, source.z).project(
      camera
    );
    const targetScreen = new Vector3(target.x, target.y, target.z).project(
      camera
    );
    if (
      sourceScreen.z < -1 ||
      sourceScreen.z > 1 ||
      targetScreen.z < -1 ||
      targetScreen.z > 1
    ) {
      return Number.POSITIVE_INFINITY;
    }
    const sx = (sourceScreen.x + 1) * 0.5 * view.width;
    const sy = (1 - sourceScreen.y) * 0.5 * view.height;
    const tx = (targetScreen.x + 1) * 0.5 * view.width;
    const ty = (1 - targetScreen.y) * 0.5 * view.height;
    return Math.sqrt((sx - tx) ** 2 + (sy - ty) ** 2);
  }
}
