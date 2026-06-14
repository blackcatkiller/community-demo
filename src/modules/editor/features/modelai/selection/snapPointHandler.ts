// @ts-nocheck
import type {
  IDocument,
  IEventHandler,
  IView,
  VisualShapeData
} from "@modelai/core/types";
import { ShapeType, VisualState } from "@modelai/core/types";
import type { Matrix4, XYZ } from "@modelai/core/math";
import { gc, type Deletable, type IDisposable } from "@modelai/core/gc";
import { OccEdge, OccFace, OccVertex } from "@modelai/occ";
import { toXYZ } from "@modelai/occ/helper";
import { RaycasterThreshold } from "@modelai/viewer/constants";
import { Vector3 } from "three";
import {
  ObjectSnapType,
  ObjectSnapTypeUtils,
  createDefaultSnapConfig,
  type SnapConfig
} from "./snapConfig";
import {
  preciseSnapPointForRay,
  selectPrimarySnapHit,
  shouldFaceOverrideSnapPoint
} from "./snapHitPolicy";
import { TrackingSnap } from "./tracking/trackingSnap";

type SnapType = string;

type SnapCandidate = {
  point: XYZ;
  type: SnapType;
  distance: number;
};

export interface SnapPointInfo {
  meshPoint: XYZ;
  precisePoint?: XYZ;
  snapType?: SnapType;
  nodeType: string;
  shapeType: string;
  subShapeType?: string;
  shapeIndex?: number;
}

export class SnapPointHandler implements IEventHandler {
  isEnabled = true;
  private _highlight?: VisualShapeData;
  private _currentRay?: { origin: XYZ; direction: XYZ };
  private _snapCandidate?: { point: XYZ; type: SnapType };
  private _referencePoint?: XYZ;
  private _isInteracting = false;
  private _trackingEnabled = true;
  private readonly trackingSnap: TrackingSnap;

  onSnapUpdate?: (info: SnapPointInfo | null) => void;
  onSnapConfirm?: (info: SnapPointInfo | null) => void;

  constructor(
    private readonly document: IDocument,
    private readonly candidateTypes: ShapeType = ShapeType.Edge |
      ShapeType.Face,
    private readonly config: SnapConfig = createDefaultSnapConfig()
  ) {
    this.trackingSnap = new TrackingSnap(
      this.config,
      () => this._referencePoint,
      true
    );
    this._trackingEnabled = this.config.enableTracking;
  }

  /**
   * Handle pointer movement and update both mesh snapping and tracking snaps.
   * @param view The active view.
   * @param event The pointer event.
   */
  pointerMove(view: IView, event: PointerEvent): void {
    if (!this.isEnabled || !this.config.enableSnap) {
      if (this._highlight) {
        this.clearHighlight();
        this.onSnapUpdate?.(null);
        view.update();
      }
      this._currentRay = undefined;
      this._snapCandidate = undefined;
      this.trackingSnap.handleSnaped(this.document, undefined);
      if (this._trackingEnabled) {
        this.trackingSnap.removeDynamicObject();
      }
      return;
    }

    if (event.buttons === 4) {
      if (!this._isInteracting) {
        this._isInteracting = true;
        this.clearHighlight();
        this.onSnapUpdate?.(null);
        this._currentRay = undefined;
        this._snapCandidate = undefined;
        view.update();
      }
      return;
    }

    if (this._isInteracting) {
      this._isInteracting = false;
    }

    if (this._trackingEnabled && !this.config.enableTracking) {
      this.trackingSnap.clear();
      this._trackingEnabled = false;
    } else if (!this._trackingEnabled && this.config.enableTracking) {
      this._trackingEnabled = true;
    }

    this.performMeshSnap(view, event);
  }

  /**
   * Run mesh-level snap detection, including edge feature points and edge-edge
   * intersections when enabled.
   * @param view The active view.
   * @param event The pointer event.
   */
  private performMeshSnap(view: IView, event: PointerEvent): void {
    this.clearHighlight();
    this.trackingSnap.removeDynamicObject();

    const detected = view.detectShapes(
      this.getActiveCandidateTypes(),
      event.offsetX,
      event.offsetY,
      { guidePolicy: "pointProxy" }
    );

    const hit = selectPrimarySnapHit(
      view,
      event.offsetX,
      event.offsetY,
      detected
    );
    if (hit) {
      this._highlight = hit;
      if (!hit.guide) {
        view.document.visual.highlighter.addState(
          hit.owner,
          VisualState.snapHighlight,
          hit.shape.shapeType,
          ...hit.indexes
        );
      }
      view.update();
    } else {
      this._highlight = undefined;
    }

    const ray = view.rayAt(event.offsetX, event.offsetY);
    this._currentRay = { origin: ray.origin, direction: ray.direction };

    let snapCandidate: SnapCandidate | undefined;
    if (hit) {
      snapCandidate = this.findSnapCandidate(
        view,
        hit,
        detected,
        event.offsetX,
        event.offsetY
      );
      this.trackingSnap.handleSnaped(
        this.document,
        snapCandidate
          ? {
              view,
              point: snapCandidate.point,
              info: snapCandidate.type,
              shapes: [hit]
            }
          : undefined
      );
    } else {
      this.trackingSnap.handleSnaped(this.document, undefined);
    }

    // If the ray hits a face, keep the result on that surface. Avoid tracking
    // fallback snapping to edges/points that may be behind the face.
    const hitIsFace = hit?.shape?.shapeType === ShapeType.Face;
    if (!snapCandidate && !hitIsFace) {
      const trackingResult = this.trackingSnap.snap({
        view,
        mx: event.offsetX,
        my: event.offsetY,
        shapes: detected
      });
      if (trackingResult?.point) {
        snapCandidate = {
          point: trackingResult.point,
          type: trackingResult.info ?? "tracking",
          distance: this.screenDistance(
            view,
            event.offsetX,
            event.offsetY,
            trackingResult.point
          )
        };
      }
    }

    this._snapCandidate = snapCandidate
      ? { point: snapCandidate.point, type: snapCandidate.type }
      : undefined;

    if (hit) {
      const info = this.buildSnapInfo(
        hit,
        hit.point!,
        snapCandidate?.point,
        snapCandidate?.type
      );
      this.onSnapUpdate?.(info);
      return;
    }

    if (snapCandidate) {
      this.onSnapUpdate?.(
        this.buildTrackingInfo(snapCandidate.point, snapCandidate.type)
      );
      return;
    }

    this.onSnapUpdate?.(null);
  }

  private getActiveCandidateTypes(): ShapeType {
    if (this.config.enableFaceSnap) {
      return this.candidateTypes;
    }
    return this.candidateTypes & ~ShapeType.Face;
  }

  /**
   * Resolve the precise snap point by raycasting against the underlying
   * geometry. Edges use `raycastEdge`, faces use `raycastFace`.
   * @param view The active view.
   */
  private performPreciseSnap(view: IView): void {
    // Keep visible surfaces sticky by default, but let an explicit center snap
    // win when hover already resolved one from the same face pass.
    const preferFacePrecise =
      this._highlight?.shape instanceof OccFace &&
      this._snapCandidate?.type !== "center";
    if (!preferFacePrecise && this._snapCandidate) {
      if (this._highlight) {
        const info = this.buildSnapInfo(
          this._highlight,
          this._highlight.point!,
          this._snapCandidate.point,
          this._snapCandidate.type
        );
        this.onSnapUpdate?.(info);
        this.onSnapConfirm?.(info);
      } else {
        const info = this.buildTrackingInfo(
          this._snapCandidate.point,
          this._snapCandidate.type
        );
        this.onSnapUpdate?.(info);
        this.onSnapConfirm?.(info);
      }
      this._referencePoint = this._snapCandidate.point;
      view.update();
      return;
    }

    if (!this._highlight || !this._highlight.point || !this._currentRay) return;

    const shape = this._highlight.shape;
    let precisePoint: XYZ | undefined;

    if (shape instanceof OccEdge || shape instanceof OccFace) {
      precisePoint = preciseSnapPointForRay(this._highlight, this._currentRay);
    }

    const info = this.buildSnapInfo(
      this._highlight,
      this._highlight.point,
      precisePoint
    );
    this.onSnapUpdate?.(info);
    this.onSnapConfirm?.(info);
    this._referencePoint = precisePoint ?? this._highlight.point;
    view.update();
  }

  /**
   * Build a snap info payload for a detected shape.
   * @param hit The detected shape.
   * @param meshPoint The mesh-space hit point.
   * @param precisePoint The optional precise point.
   * @param snapType The snap type label.
   * @returns A snap info object.
   */
  private buildSnapInfo(
    hit: VisualShapeData,
    meshPoint: XYZ,
    precisePoint?: XYZ,
    snapType?: SnapType
  ): SnapPointInfo {
    return {
      meshPoint,
      precisePoint,
      snapType,
      nodeType: this.getNodeType(hit),
      shapeType: hit.guide
        ? "Guide"
        : this.getShapeTypeName(hit.shape.shapeType),
      subShapeType: hit.guide
        ? hit.guide.kind === "centerline"
          ? hit.guide.path.kind
          : hit.guide.kind
        : hit.shape.shapeType !== ShapeType.Shape
          ? this.getShapeTypeName(hit.shape.shapeType)
          : undefined,
      shapeIndex: hit.indexes[0]
    };
  }

  /**
   * Build a snap info payload for a tracking snap.
   * @param point The snapped point.
   * @param snapType The snap type label.
   * @returns A tracking snap info object.
   */
  private buildTrackingInfo(point: XYZ, snapType?: SnapType): SnapPointInfo {
    return {
      meshPoint: point,
      precisePoint: point,
      snapType,
      nodeType: "Tracking",
      shapeType: "Tracking"
    };
  }

  /**
   * Clear the current highlight state.
   */
  private clearHighlight(): void {
    if (this._highlight) {
      if (!this._highlight.guide) {
        this.document.visual.highlighter.removeState(
          this._highlight.owner,
          VisualState.snapHighlight,
          this._highlight.shape.shapeType,
          ...this._highlight.indexes
        );
      }
      this._highlight = undefined;
    }
  }

  /**
   * Get the constructor name of the hit node.
   * @param hit The detected shape.
   * @returns The node type name.
   */
  private getNodeType(hit: VisualShapeData): string {
    const node = (hit.owner as any).node;
    return node?.constructor?.name || "Unknown";
  }

  /**
   * Map a shape type enum to a readable name.
   * @param type The shape type enum value.
   * @returns A readable shape type name.
   */
  private getShapeTypeName(type: ShapeType): string {
    const names: Record<number, string> = {
      [ShapeType.Shape]: "Shape",
      [ShapeType.Compound]: "Compound",
      [ShapeType.CompoundSolid]: "CompoundSolid",
      [ShapeType.Solid]: "Solid",
      [ShapeType.Shell]: "Shell",
      [ShapeType.Face]: "Face",
      [ShapeType.Wire]: "Wire",
      [ShapeType.Edge]: "Edge",
      [ShapeType.Vertex]: "Vertex"
    };
    return names[type] || `Type(${type})`;
  }

  /**
   * Find the best snap candidate near the cursor from edge feature points and
   * optional edge-edge intersections.
   * @param view The active view.
   * @param hit The primary hit.
   * @param detected All detected shapes.
   * @param mx Cursor x.
   * @param my Cursor y.
   * @returns The best snap candidate, if any.
   */
  private findSnapCandidate(
    view: IView,
    hit: VisualShapeData,
    detected: VisualShapeData[],
    mx: number,
    my: number
  ): SnapCandidate | undefined {
    const requiresIntersections = ObjectSnapTypeUtils.hasType(
      this.config.snapTypes,
      ObjectSnapType.intersection
    );
    const edgeCandidates = requiresIntersections
      ? view.detectShapes(ShapeType.Edge, mx, my, { guidePolicy: "pointProxy" })
      : detected.filter(item => item.shape.shapeType === ShapeType.Edge);

    const candidates = this.collectSnapCandidates(
      view,
      mx,
      my,
      hit,
      edgeCandidates
    );
    if (candidates.length === 0) return undefined;

    let best: SnapCandidate | undefined;
    if (hit.guide && hit.point) {
      for (const candidate of candidates) {
        const distance = this.worldScreenDistance(
          view,
          hit.point,
          candidate.point
        );
        if (!best || distance < best.distance) {
          best = { ...candidate, distance };
        }
      }
    } else {
      for (const candidate of candidates) {
        const distance = this.screenDistance(view, mx, my, candidate.point);
        if (!best || distance < best.distance) {
          best = { ...candidate, distance };
        }
      }
    }

    if (best && best.distance <= RaycasterThreshold) {
      return best;
    }

    if (hit.guide && hit.point) {
      return {
        point: hit.point,
        type: "guide",
        distance: 0
      };
    }

    return undefined;
  }

  /**
   * Collect all possible snap candidates for the current hit.
   * @param view The active view.
   * @param mx Cursor x.
   * @param my Cursor y.
   * @param hit The primary hit shape.
   * @param nearbyEdges Nearby edge candidates.
   * @returns The collected snap candidates.
   */
  private collectSnapCandidates(
    view: IView,
    mx: number,
    my: number,
    hit: VisualShapeData,
    nearbyEdges: VisualShapeData[]
  ): Array<{ point: XYZ; type: SnapType }> {
    const candidates: Array<{ point: XYZ; type: SnapType }> = [];
    const snapTypes = this.config.snapTypes;

    if (hit.shape instanceof OccVertex) {
      if (ObjectSnapTypeUtils.hasType(snapTypes, ObjectSnapType.vertex)) {
        const point = this.applyTransform(hit.shape.point(), hit.transform);
        candidates.push({ point, type: "vertex" });
      }
      return candidates;
    }

    if (hit.shape instanceof OccEdge) {
      candidates.push(...this.getEdgeFeaturePoints(hit.shape, hit.transform));

      if (ObjectSnapTypeUtils.hasType(snapTypes, ObjectSnapType.intersection)) {
        candidates.push(
          ...this.getEdgeIntersections(hit.shape, hit.transform, nearbyEdges)
        );
      }
    }

    if (hit.shape instanceof OccFace) {
      candidates.push(
        ...this.getFaceCenterCandidates(view, mx, my, hit, nearbyEdges)
      );
    }

    return candidates;
  }

  private getFaceCenterCandidates(
    view: IView,
    mx: number,
    my: number,
    faceHit: VisualShapeData,
    nearbyEdges: VisualShapeData[]
  ): Array<{ point: XYZ; type: SnapType }> {
    if (
      !ObjectSnapTypeUtils.hasType(this.config.snapTypes, ObjectSnapType.center)
    ) {
      return [];
    }

    return nearbyEdges
      .filter(
        edgeHit =>
          edgeHit.shape instanceof OccEdge &&
          edgeHit.owner === faceHit.owner &&
          edgeHit.point !== undefined &&
          !shouldFaceOverrideSnapPoint(view, mx, my, faceHit, {
            point: edgeHit.point,
            shapes: [edgeHit]
          })
      )
      .flatMap(edgeHit =>
        this.getEdgeFeaturePoints(
          edgeHit.shape as OccEdge,
          edgeHit.transform
        ).filter(candidate => candidate.type === "center")
      );
  }

  /**
   * Collect feature points for an edge, including endpoints, midpoint, center,
   * and perpendicular projections when enabled.
   * @param edge The edge.
   * @param transform The world transform.
   * @returns The collected feature points.
   */
  private getEdgeFeaturePoints(
    edge: OccEdge,
    transform?: Matrix4
  ): Array<{ point: XYZ; type: SnapType }> {
    return gc(collect => {
      const handle = collect(wasm.Edge.curve(edge.shape));
      const curve = handle.get();
      if (!curve) return [];

      const snapTypes = this.config.snapTypes;
      const points: Array<{ point: XYZ; type: SnapType }> = [];

      const startParam = curve.firstParameter();
      const endParam = curve.lastParameter();
      const midParam = (startParam + endParam) * 0.5;

      if (ObjectSnapTypeUtils.hasType(snapTypes, ObjectSnapType.endPoint)) {
        const startPoint = collect(curve.value(startParam));
        const endPoint = collect(curve.value(endParam));
        points.push({
          point: this.applyTransform(toXYZ(startPoint), transform),
          type: "end"
        });
        points.push({
          point: this.applyTransform(toXYZ(endPoint), transform),
          type: "end"
        });
      }

      if (ObjectSnapTypeUtils.hasType(snapTypes, ObjectSnapType.midPoint)) {
        const midPoint = collect(curve.value(midParam));
        points.push({
          point: this.applyTransform(toXYZ(midPoint), transform),
          type: "mid"
        });
      }

      if (ObjectSnapTypeUtils.hasType(snapTypes, ObjectSnapType.center)) {
        const center = this.getCircleCenter(curve, collect, transform);
        if (center) points.push({ point: center, type: "center" });
      }

      if (
        this._referencePoint &&
        ObjectSnapTypeUtils.hasType(snapTypes, ObjectSnapType.perpendicular)
      ) {
        const localRef = this.toLocalPoint(this._referencePoint, transform);
        const projection = wasm.Curve.projectOrNearest(curve, {
          x: localRef.x,
          y: localRef.y,
          z: localRef.z
        });
        if (projection?.point) {
          const projected = this.applyTransform(
            toXYZ(projection.point),
            transform
          );
          points.push({ point: projected, type: "perpendicular" });
        }
      }

      return points;
    });
  }

  /**
   * Compute intersections between the current edge and nearby edges.
   * @param edge The source edge.
   * @param transform The source transform.
   * @param nearbyEdges Candidate edges.
   * @returns Intersection candidates.
   */
  private getEdgeIntersections(
    edge: OccEdge,
    transform: Matrix4 | undefined,
    nearbyEdges: VisualShapeData[]
  ): Array<{ point: XYZ; type: SnapType }> {
    const results: Array<{ point: XYZ; type: SnapType }> = [];
    const seen = new Set<string>();
    const edgeId = (edge as any).id;

    for (const other of nearbyEdges) {
      if (!(other.shape instanceof OccEdge)) continue;
      if ((other.shape as any).id === edgeId) continue;
      if (transform && other.transform && !transform.equals(other.transform))
        continue;

      let intersections: Array<{ point: { x: number; y: number; z: number } }> =
        [];
      try {
        intersections = wasm.Edge.intersect(
          edge.shape,
          (other.shape as OccEdge).shape
        );
      } catch {
        continue;
      }

      intersections.forEach(intersection => {
        const worldPoint = this.applyTransform(
          toXYZ(intersection.point),
          transform
        );
        const key = `${worldPoint.x.toFixed(6)}|${worldPoint.y.toFixed(6)}|${worldPoint.z.toFixed(6)}`;
        if (seen.has(key)) return;
        seen.add(key);
        results.push({ point: worldPoint, type: "intersection" });
      });
    }

    return results;
  }

  /**
   * Extract the center point of a circular curve when available.
   * @param curve The curve object.
   * @param collect The resource collector callback.
   * @param transform The world transform.
   * @returns The center point, if available.
   */
  private getCircleCenter(
    curve: any,
    collect: <T extends Deletable | IDisposable>(resource: T) => T,
    transform?: Matrix4
  ): XYZ | undefined {
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
    return this.applyTransform(toXYZ(center), transform);
  }

  /**
   * Apply a transform to a point.
   * @param point The source point.
   * @param transform The optional transform.
   * @returns The transformed point.
   */
  private applyTransform(point: XYZ, transform?: Matrix4): XYZ {
    return transform ? transform.ofPoint(point) : point;
  }

  /**
   * Convert a world-space point into local space.
   * @param point The world-space point.
   * @param transform The optional transform.
   * @returns The local-space point.
   */
  private toLocalPoint(point: XYZ, transform?: Matrix4): XYZ {
    if (!transform) return point;
    const inv = transform.invert();
    return inv ? inv.ofPoint(point) : point;
  }

  /**
   * Measure screen-space distance from the cursor to a world-space point.
   * @param view The active view.
   * @param mx Cursor x.
   * @param my Cursor y.
   * @param point The world-space point.
   * @returns The screen-space distance.
   */
  private screenDistance(
    view: IView,
    mx: number,
    my: number,
    point: XYZ
  ): number {
    const camera = (view as any).camera;
    if (!camera) return Number.POSITIVE_INFINITY;
    const projected = new Vector3(point.x, point.y, point.z).project(camera);
    if (projected.z < -1 || projected.z > 1) return Number.POSITIVE_INFINITY;
    const sx = (projected.x + 1) * 0.5 * view.width;
    const sy = (1 - projected.y) * 0.5 * view.height;
    const dx = sx - mx;
    const dy = sy - my;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private worldScreenDistance(view: IView, source: XYZ, target: XYZ): number {
    const camera = (view as any).camera;
    if (!camera) return Number.POSITIVE_INFINITY;
    const sourceProjected = new Vector3(source.x, source.y, source.z).project(
      camera
    );
    const targetProjected = new Vector3(target.x, target.y, target.z).project(
      camera
    );
    if (
      sourceProjected.z < -1 ||
      sourceProjected.z > 1 ||
      targetProjected.z < -1 ||
      targetProjected.z > 1
    )
      return Number.POSITIVE_INFINITY;
    const sx = (sourceProjected.x + 1) * 0.5 * view.width;
    const sy = (1 - sourceProjected.y) * 0.5 * view.height;
    const tx = (targetProjected.x + 1) * 0.5 * view.width;
    const ty = (1 - targetProjected.y) * 0.5 * view.height;
    const dx = sx - tx;
    const dy = sy - ty;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Handle pointer down.
   * @param _view The active view.
   * @param event The pointer event.
   */
  pointerDown(_view: IView, event: PointerEvent): void {
    if (event.button === 1) {
      this._isInteracting = true;
      return;
    }
    event.stopPropagation();
  }

  /**
   * Handle pointer up and trigger precise snapping when appropriate.
   * @param view The active view.
   * @param event The pointer event.
   */
  pointerUp(view: IView, event: PointerEvent): void {
    if (event.button === 1) {
      this._isInteracting = false;
      return;
    }
    if (event.button === 0 && this._highlight && !this._isInteracting) {
      event.stopPropagation();
      this.performPreciseSnap(view);
    }
  }

  /**
   * Handle pointer leave.
   * @param view The active view.
   * @param _event The pointer event.
   */
  pointerOut(view: IView, _event: PointerEvent): void {
    this.clearHighlight();
    this.onSnapUpdate?.(null);
    this._currentRay = undefined;
    this._snapCandidate = undefined;
    this.trackingSnap.handleSnaped(this.document, undefined);
    this.trackingSnap.removeDynamicObject();
    view.update();
  }

  /**
   * Release internal resources.
   */
  dispose(): void {
    this.clearHighlight();
    this._currentRay = undefined;
    this._snapCandidate = undefined;
    this.trackingSnap.clear();
  }
}
