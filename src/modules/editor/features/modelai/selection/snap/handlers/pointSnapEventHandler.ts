// @ts-nocheck
import type { AsyncController } from "@modelai/core";
import {
  ShapeType,
  VisualState,
  type IDocument,
  type IView,
  type ViewShapeGuidePolicy,
  type VisualShapeData
} from "@modelai/core/types";
import type { Line } from "@modelai/core/math";
import { type Plane, XYZ } from "@modelai/core/math";
import type { SnapConfig } from "@modelai/selection/snapConfig";
import { RaycasterThreshold } from "@modelai/viewer/constants";
import {
  findFirstFaceHit,
  isFeatureTargetOccludedByFace,
  preciseSnapPointForRay,
  selectPrimarySnapHit,
  shouldFaceOverrideSnapPoint
} from "@modelai/selection/snapHitPolicy";
import { SnapLabelKey } from "@modelai/selection/snapLabels";
import {
  resolveSnapProfile,
  type SnapCandidate,
  type ISnap,
  type SnapHitContext,
  type MouseAndDetected,
  type SnapData,
  type SnapProfile,
  type SnapResult
} from "../snap";
import { Dimension, DimensionUtils } from "../dimension";
import {
  AxisSnap,
  FaceHitSnap,
  ObjectSnap,
  PlaneSnap,
  PointOnCurveSnap,
  ViewPlaneSnap,
  WorkplaneSnap
} from "../snaps";
import { TrackingSnap } from "@modelai/selection/tracking/trackingSnap";
import { SnapEventHandler, type SnapCommandUI } from "./snapEventHandler";
import { screenDistance } from "../utils";
import { Vector3 } from "three";

interface FaceHitContext {
  view: IView;
  mx: number;
  my: number;
  hit: VisualShapeData;
}

interface RankedTransformCandidate {
  candidate: SnapCandidate;
  distance: number;
  typePriority: number;
}

interface TransformObjectCandidateCache {
  shapeKey: string;
  candidates: SnapCandidate[];
}

interface TransformSnapResolution {
  result?: SnapResult;
  edgeOrVertexDetected: MouseAndDetected;
}

export interface ICurve {
  length(): number;
  value(parameter: number): XYZ;
  nearestExtrema(line: Line): { p1: XYZ } | undefined;
}

export interface PointSnapData extends SnapData {
  dimension?: Dimension;
  refPoint?: () => XYZ;
  plane?: () => Plane;
  shapeHitFallback?: boolean;
}

export interface SnapPointOnCurveData extends PointSnapData {
  curve: ICurve;
}

export interface SnapPointOnAxisData extends PointSnapData {
  ray: Line;
}

export class PointSnapEventHandler extends SnapEventHandler<PointSnapData> {
  private readonly faceHitSnaps: readonly ISnap[];
  private readonly nonFaceSnaps: readonly ISnap[];
  private readonly objectSnaps: readonly ISnap[];
  private readonly planarSnaps: readonly ISnap[];
  private readonly trackingSnaps: readonly ISnap[];
  private lastFaceHit?: FaceHitContext;
  private lastTransformCandidateKey?: string;
  private transformObjectCandidateCache?: TransformObjectCandidateCache;
  private transformHighlightedShapes: VisualShapeData[] = [];
  private transformHighlightedView?: IView;
  private shapeHitFallbackHighlightedShapes: VisualShapeData[] = [];
  private shapeHitFallbackHighlightedView?: IView;

  constructor(
    document: IDocument,
    controller: AsyncController,
    pointData: PointSnapData,
    private readonly snapConfig: SnapConfig,
    ui?: SnapCommandUI
  ) {
    pointData.dimension ??= Dimension.D1D2D3;
    super(document, controller, [], pointData, ui, () => snapConfig.enableSnap);
    this.snaps.push(...this.getInitSnaps(pointData, snapConfig));
    this.faceHitSnaps = this.snaps.filter(snap => snap instanceof FaceHitSnap);
    this.objectSnaps = this.snaps.filter(snap => snap instanceof ObjectSnap);
    this.nonFaceSnaps = this.snaps.filter(
      snap => !(snap instanceof FaceHitSnap)
    );
    this.planarSnaps = this.snaps.filter(
      snap =>
        !(snap instanceof FaceHitSnap) &&
        !(snap instanceof ObjectSnap) &&
        !(snap instanceof TrackingSnap)
    );
    this.trackingSnaps = this.snaps.filter(
      snap => snap instanceof TrackingSnap
    );
  }

  private get profile(): SnapProfile {
    return resolveSnapProfile(this.data);
  }

  protected getInitSnaps(
    pointData: PointSnapData,
    snapConfig: SnapConfig
  ): ISnap[] {
    const objectSnap = new ObjectSnap(snapConfig, pointData.refPoint);
    const faceHitSnap = new FaceHitSnap();
    const planeSnap = pointData.plane
      ? new PlaneSnap(pointData.plane, pointData.refPoint)
      : pointData.refPoint
        ? new ViewPlaneSnap(pointData.refPoint)
        : undefined;
    const trackingSnap = new TrackingSnap(snapConfig, pointData.refPoint, true);
    // Order matters: FaceHitSnap must beat TrackingSnap for the face-only pass,
    // otherwise tracking axes can "steal" a surface pick.
    const snaps: ISnap[] = [objectSnap, faceHitSnap, trackingSnap];
    if (planeSnap) {
      snaps.push(planeSnap);
    }
    return snaps;
  }

  protected override detectShapeGuidePolicy(): ViewShapeGuidePolicy {
    return "pointProxy";
  }

  protected override setSnaped(view: IView, event: PointerEvent) {
    this.clearShapeHitFallbackHighlight();
    if (this.profile.id === "transform") {
      this.setTransformSnaped(view, event);
      return;
    }

    if (this.faceHitSnaps.length === 0 || !this.snapConfig.enableFaceSnap) {
      this.lastFaceHit = undefined;
      const detected = this.detectShapes(
        this.getPointDetectionShapeType(),
        view,
        event
      );
      this.findSnapPointFromDetected(
        this.filterDetected(
          detected,
          shape =>
            shape.shape.shapeType === ShapeType.Edge ||
            shape.shape.shapeType === ShapeType.Vertex
        ),
        event,
        this.nonFaceSnaps
      );
      this.applyShapeHitFallback(detected, view, event);
      this.snaps.forEach(snap =>
        snap.handleSnaped?.(view.document.visual.document, this.snapedValue)
      );
      return;
    }

    const combinedDetected = this.detectShapes(
      this.getPointDetectionShapeType(),
      view,
      event
    );
    const primaryHit = selectPrimarySnapHit(
      view,
      event.offsetX,
      event.offsetY,
      combinedDetected.shapes
    );
    const faceHit = findFirstFaceHit(combinedDetected.shapes);
    this.lastFaceHit = faceHit
      ? {
          view,
          mx: event.offsetX,
          my: event.offsetY,
          hit: faceHit
        }
      : undefined;
    const edgeOrVertexDetected = this.filterDetected(
      combinedDetected,
      shape =>
        shape.shape.shapeType === ShapeType.Edge ||
        shape.shape.shapeType === ShapeType.Vertex
    );
    const faceDetected = this.filterDetected(
      combinedDetected,
      shape => shape.shape.shapeType === ShapeType.Face
    );

    if (primaryHit?.shape.shapeType === ShapeType.Face) {
      if (this.objectSnaps.length > 0) {
        this.findSnapPointFromDetected(
          edgeOrVertexDetected,
          event,
          this.objectSnaps
        );
      } else {
        this.snapedValue = undefined;
      }

      if (
        !this.applyShapeHitFallback(edgeOrVertexDetected, view, event) &&
        (!this.snapedValue ||
          shouldFaceOverrideSnapPoint(
            view,
            event.offsetX,
            event.offsetY,
            faceHit,
            this.snapedValue
          ))
      ) {
        this.findSnapPointFromDetected(faceDetected, event, this.faceHitSnaps);
      }
    } else {
      this.findSnapPointFromDetected(
        edgeOrVertexDetected,
        event,
        this.nonFaceSnaps
      );
      if (this.applyShapeHitFallback(edgeOrVertexDetected, view, event)) {
        this.snaps.forEach(snap =>
          snap.handleSnaped?.(view.document.visual.document, this.snapedValue)
        );
        return;
      }
      if (
        !this.snapedValue ||
        shouldFaceOverrideSnapPoint(
          view,
          event.offsetX,
          event.offsetY,
          faceHit,
          this.snapedValue
        )
      ) {
        this.findSnapPointFromDetected(faceDetected, event, this.faceHitSnaps);
      }
    }

    this.applyShapeHitFallback(combinedDetected, view, event);
    this.snaps.forEach(snap =>
      snap.handleSnaped?.(view.document.visual.document, this.snapedValue)
    );
  }

  private getPointDetectionShapeType(): ShapeType {
    return this.data.shapeHitFallback || this.snapConfig.enableFaceSnap
      ? ShapeType.Edge | ShapeType.Face | ShapeType.Vertex
      : ShapeType.Edge | ShapeType.Vertex;
  }

  private applyShapeHitFallback(
    detected: MouseAndDetected,
    view: IView,
    event: PointerEvent
  ): boolean {
    if (!this.data.shapeHitFallback) return false;
    if (this.snapedValue?.shapes.length) return false;

    const hit = this.selectShapeHitFallbackHit(detected, view, event);
    if (!hit?.point) return false;

    const ray = view.rayAt(event.offsetX, event.offsetY);
    const point =
      preciseSnapPointForRay(hit, {
        origin: ray.origin,
        direction: ray.direction
      }) ?? hit.point;
    if (this.data.validator && !this.data.validator(point)) return false;

    this.snapedValue = {
      view,
      point,
      info: this.getShapeHitFallbackLabel(hit),
      shapes: [hit]
    };
    this.syncShapeHitFallbackHighlight(this.snapedValue);
    return true;
  }

  private selectShapeHitFallbackHit(
    detected: MouseAndDetected,
    view: IView,
    event: PointerEvent
  ): VisualShapeData | undefined {
    const hit = selectPrimarySnapHit(
      view,
      event.offsetX,
      event.offsetY,
      detected.shapes
    );
    if (!hit?.point) return undefined;
    if (hit.shape.shapeType === ShapeType.Face) return hit;

    const faceHit = this.lastFaceHit?.hit ?? findFirstFaceHit(detected.shapes);
    if (
      isFeatureTargetOccludedByFace(
        view,
        event.offsetX,
        event.offsetY,
        faceHit,
        { point: hit.point, shapes: [hit] }
      )
    ) {
      return faceHit;
    }
    return hit;
  }

  private getShapeHitFallbackLabel(hit: VisualShapeData): string | undefined {
    switch (hit.shape.shapeType) {
      case ShapeType.Edge:
        return SnapLabelKey.Edge;
      case ShapeType.Face:
        return SnapLabelKey.Face;
      case ShapeType.Vertex:
        return SnapLabelKey.Vertex;
      default:
        return undefined;
    }
  }

  private setTransformSnaped(view: IView, event: PointerEvent) {
    this.clearTransformHighlight();
    const resolved = this.resolveTransformSnap(view, event, "hover");
    this.snapedValue = resolved.result;

    if (!this.snapedValue) {
      const fallbackSnaps = this.profile.enableTracking
        ? [...this.planarSnaps, ...this.trackingSnaps]
        : this.planarSnaps;
      if (fallbackSnaps.length > 0) {
        this.findSnapPointFromDetected(
          resolved.edgeOrVertexDetected,
          event,
          fallbackSnaps
        );
      }
    }

    this.syncTransformHighlight(this.snapedValue);
    this.snaps.forEach(snap =>
      snap.handleSnaped?.(view.document.visual.document, this.snapedValue)
    );
  }

  private resolveTransformSnap(
    view: IView,
    event: PointerEvent,
    mode: "hover" | "commit"
  ): TransformSnapResolution {
    const combinedDetected = this.detectShapes(
      this.snapConfig.enableFaceSnap
        ? ShapeType.Edge | ShapeType.Face | ShapeType.Vertex
        : ShapeType.Edge | ShapeType.Vertex,
      view,
      event
    );
    const edgeOrVertexDetected = this.filterDetected(
      combinedDetected,
      shape =>
        shape.shape.shapeType === ShapeType.Edge ||
        shape.shape.shapeType === ShapeType.Vertex
    );
    const faceDetected = this.snapConfig.enableFaceSnap
      ? this.filterDetected(
          combinedDetected,
          shape => shape.shape.shapeType === ShapeType.Face
        )
      : { ...edgeOrVertexDetected, shapes: [] };
    const faceHit = this.snapConfig.enableFaceSnap
      ? findFirstFaceHit(faceDetected.shapes)
      : undefined;
    this.lastFaceHit = faceHit
      ? {
          view,
          mx: event.offsetX,
          my: event.offsetY,
          hit: faceHit
        }
      : undefined;

    const objectContext = this.buildHitContext(edgeOrVertexDetected);
    const faceContext = this.buildHitContext(faceDetected);
    const candidates = [
      ...(mode === "hover"
        ? this.collectHoverObjectCandidates(objectContext)
        : this.collectObjectCandidates(objectContext)),
      ...(this.profile.faceHover !== "off" &&
      this.profile.faceHover !== "primary"
        ? this.collectFaceCandidates(faceContext)
        : [])
    ];
    const bestCandidate = this.chooseTransformCandidate(
      this.filterTransformOccludedCandidates(candidates, faceHit, view, event),
      view,
      event
    );
    const result = bestCandidate
      ? this.candidateToSnapResult(bestCandidate, view)
      : undefined;
    this.lastTransformCandidateKey = bestCandidate?.key;
    return {
      result,
      edgeOrVertexDetected
    };
  }

  private collectHoverObjectCandidates(context: SnapHitContext) {
    const shape = context.shapes[0];
    if (!shape) {
      this.transformObjectCandidateCache = undefined;
      return this.collectObjectCandidates(context);
    }

    const shapeKey = this.getShapeCacheKey(shape);
    const cached = this.transformObjectCandidateCache;
    if (cached?.shapeKey === shapeKey) {
      return cached.candidates;
    }

    const candidates = this.collectObjectCandidates(context);
    this.transformObjectCandidateCache = {
      shapeKey,
      candidates
    };
    return candidates;
  }

  private buildHitContext(detected: MouseAndDetected): SnapHitContext {
    const ray = detected.view.rayAt(detected.mx, detected.my);
    return {
      view: detected.view,
      mx: detected.mx,
      my: detected.my,
      ray: {
        origin: ray.origin,
        direction: ray.direction
      },
      shapes: detected.shapes,
      profile: this.profile
    };
  }

  private collectObjectCandidates(context: SnapHitContext) {
    return this.objectSnaps.flatMap(snap =>
      snap instanceof ObjectSnap ? snap.collectCandidates(context) : []
    );
  }

  private collectFaceCandidates(context: SnapHitContext) {
    return this.faceHitSnaps.flatMap(snap =>
      snap instanceof FaceHitSnap ? snap.collectCandidates(context) : []
    );
  }

  private filterTransformOccludedCandidates(
    candidates: SnapCandidate[],
    faceHit: VisualShapeData | undefined,
    view: IView,
    event: PointerEvent
  ) {
    if (!faceHit?.point) return candidates;
    return candidates.filter(candidate => {
      if (candidate.type === "face") return true;
      return !isFeatureTargetOccludedByFace(
        view,
        event.offsetX,
        event.offsetY,
        faceHit,
        {
          point: candidate.point,
          info: candidate.info,
          shapes: candidate.shapes
        }
      );
    });
  }

  private chooseTransformCandidate(
    candidates: SnapCandidate[],
    view: IView,
    event: PointerEvent
  ) {
    const nonFaceCandidates = candidates.filter(
      candidate => candidate.type !== "face"
    );
    const faceCandidates = candidates.filter(
      candidate => candidate.type === "face"
    );

    return (
      this.pickBestTransformCandidate(nonFaceCandidates, view, event) ??
      this.pickBestTransformCandidate(faceCandidates, view, event)
    );
  }

  private pickBestTransformCandidate(
    candidates: SnapCandidate[],
    view: IView,
    event: PointerEvent
  ) {
    const tuning = this.profile.transformCandidateTuning;
    const ranked = this.rankTransformCandidates(candidates, view, event)
      .filter(item => item.distance < RaycasterThreshold)
      .sort((left, right) => left.distance - right.distance);
    if (ranked.length === 0) return undefined;

    const nearestDistance = ranked[0].distance;
    const windowed = ranked.filter(
      item => item.distance <= nearestDistance + tuning.priorityWindowPx
    );
    const highestPriority = Math.max(
      ...windowed.map(item => item.typePriority)
    );
    const sameTier = windowed
      .filter(item => item.typePriority === highestPriority)
      .sort((left, right) => left.distance - right.distance);

    const lockedCandidate = this.pickLockedTransformCandidate(
      ranked,
      sameTier,
      tuning
    );
    return lockedCandidate?.candidate ?? sameTier[0]?.candidate;
  }

  private rankTransformCandidates(
    candidates: SnapCandidate[],
    view: IView,
    event: PointerEvent
  ): RankedTransformCandidate[] {
    return candidates.map(candidate => ({
      candidate,
      distance: this.transformCandidateDistance(view, event, candidate),
      typePriority: this.candidateTypePriority(candidate)
    }));
  }

  private transformCandidateDistance(
    view: IView,
    event: PointerEvent,
    candidate: SnapCandidate
  ) {
    const guidePoint = candidate.shapes[0]?.guide
      ? candidate.shapes[0]?.point
      : undefined;
    if (guidePoint) {
      if (candidate.type === "guidePoint") {
        return RaycasterThreshold - 0.001;
      }
      return this.worldScreenDistance(view, guidePoint, candidate.point);
    }
    return screenDistance(view, event.offsetX, event.offsetY, candidate.point);
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

  private pickLockedTransformCandidate(
    ranked: RankedTransformCandidate[],
    sameTier: RankedTransformCandidate[],
    tuning: SnapProfile["transformCandidateTuning"]
  ) {
    if (!this.profile.stickyCandidate || sameTier.length === 0)
      return undefined;

    const locked = ranked.find(
      item => item.candidate.key === this.lastTransformCandidateKey
    );
    if (!locked) return undefined;

    const bestSameTier = sameTier[0];
    if (locked.typePriority !== bestSameTier.typePriority) return undefined;
    if (locked.distance > tuning.lockRadiusPx) return undefined;
    if (bestSameTier.candidate.key === locked.candidate.key) return locked;

    return bestSameTier.distance + tuning.switchMarginPx < locked.distance
      ? undefined
      : locked;
  }

  private candidateTypePriority(candidate: SnapCandidate) {
    switch (candidate.type) {
      case "center":
        return 4;
      case "vertex":
      case "endPoint":
      case "midPoint":
        return 3;
      case "perpendicular":
      case "intersection":
        return 2;
      case "face":
        return 1;
      default:
        return 0;
    }
  }

  private candidateToSnapResult(
    candidate: SnapCandidate,
    view: IView
  ): SnapResult {
    return {
      view,
      point: candidate.point,
      info: candidate.info,
      distance: candidate.distance,
      refPoint: candidate.refPoint,
      shapes: candidate.shapes
    };
  }

  protected override prepareSnapForCompletion(
    view: IView,
    event?: PointerEvent
  ): void {
    if (this.profile.id === "transform" && event) {
      const committedSnap = this.resolveTransformSnap(view, event, "commit");
      if (committedSnap.result) {
        this.snapedValue = committedSnap.result;
      }
    }

    if (!this.snapedValue?.point || !this.isCurrentFaceSnap()) return;
    if (!this.lastFaceHit) return;

    const currentHit = this.snapedValue.shapes[0];
    if (!currentHit || !this.isSameShape(currentHit, this.lastFaceHit.hit)) {
      return;
    }

    const ray = this.lastFaceHit.view.rayAt(
      this.lastFaceHit.mx,
      this.lastFaceHit.my
    );
    const precisePoint = preciseSnapPointForRay(this.lastFaceHit.hit, {
      origin: ray.origin,
      direction: ray.direction
    });
    if (!precisePoint) return;
    if (this.data.validator && !this.data.validator(precisePoint)) return;

    this.snapedValue = {
      ...this.snapedValue,
      point: precisePoint,
      view: this.lastFaceHit.view,
      shapes: [this.lastFaceHit.hit]
    };
  }

  override pointerOut(view: IView, event: PointerEvent) {
    this.clearShapeHitFallbackHighlight();
    this.clearTransformHighlight();
    this.lastFaceHit = undefined;
    this.lastTransformCandidateKey = undefined;
    this.transformObjectCandidateCache = undefined;
    super.pointerOut(view, event);
  }

  protected override cleanupHandlerState(): void {
    this.clearShapeHitFallbackHighlight();
    this.clearTransformHighlight();
  }

  private getShapeCacheKey(shape: VisualShapeData) {
    if (!shape.guide) {
      return `${shape.shape.id}:${shape.indexes.join(",")}`;
    }
    const point = shape.point;
    const pointKey = point
      ? `${point.x.toFixed(6)},${point.y.toFixed(6)},${point.z.toFixed(6)}`
      : "none";
    return `guide:${shape.guide.id}:${pointKey}`;
  }

  private syncTransformHighlight(snaped?: SnapResult) {
    if (!snaped?.view || snaped.shapes.length === 0) return;

    const highlighter = snaped.view.document.visual.highlighter;
    snaped.shapes.forEach(shape => {
      if (shape.guide) return;
      highlighter.addState(
        shape.owner,
        VisualState.snapHighlight,
        shape.shape.shapeType,
        ...shape.indexes
      );
    });
    this.transformHighlightedView = snaped.view;
    this.transformHighlightedShapes = [...snaped.shapes];
  }

  private clearTransformHighlight() {
    const highlighter =
      this.transformHighlightedView?.document.visual.highlighter;
    if (highlighter) {
      this.transformHighlightedShapes.forEach(shape => {
        if (shape.guide) return;
        highlighter.removeState(
          shape.owner,
          VisualState.snapHighlight,
          shape.shape.shapeType,
          ...shape.indexes
        );
      });
    }
    this.transformHighlightedShapes = [];
    this.transformHighlightedView = undefined;
  }

  private syncShapeHitFallbackHighlight(snaped?: SnapResult) {
    if (!snaped?.view || snaped.shapes.length === 0) return;

    const highlighter = snaped.view.document.visual.highlighter;
    snaped.shapes.forEach(shape => {
      if (shape.guide) return;
      highlighter.addState(
        shape.owner,
        VisualState.snapHighlight,
        shape.shape.shapeType,
        ...shape.indexes
      );
    });
    this.shapeHitFallbackHighlightedView = snaped.view;
    this.shapeHitFallbackHighlightedShapes = [...snaped.shapes];
  }

  private clearShapeHitFallbackHighlight() {
    const highlighter =
      this.shapeHitFallbackHighlightedView?.document.visual.highlighter;
    if (highlighter) {
      this.shapeHitFallbackHighlightedShapes.forEach(shape => {
        if (shape.guide) return;
        highlighter.removeState(
          shape.owner,
          VisualState.snapHighlight,
          shape.shape.shapeType,
          ...shape.indexes
        );
      });
    }
    this.shapeHitFallbackHighlightedShapes = [];
    this.shapeHitFallbackHighlightedView = undefined;
  }

  protected getPointFromInput(view: IView, text: string): SnapResult {
    const [dims, isAbsolute] = this.parseInputDimensions(text);
    const refPoint = this.getRefPoint() ?? new XYZ(0, 0, 0);
    const result = { point: refPoint, view, shapes: [] } as SnapResult;

    if (isAbsolute) {
      result.point = new XYZ(dims[0], dims[1], dims[2]);
    } else if (dims.length === 1 && this.snaped?.point) {
      result.point = this.calculatePointFromDistance(refPoint, dims[0]);
    } else if (dims.length > 1) {
      result.point = this.calculatePointFromCoordinates(refPoint, dims);
    }

    return result;
  }

  private parseInputDimensions(text: string): [number[], boolean] {
    const isAbsolute = text.startsWith("#");
    if (isAbsolute) {
      text = text.slice(1);
    }
    return [text.split(",").map(Number), isAbsolute];
  }

  private calculatePointFromDistance(refPoint: XYZ, distance: number): XYZ {
    const vector = this.snaped!.point!.sub(refPoint).normalize();
    return refPoint.add(vector.multiply(distance));
  }

  private calculatePointFromCoordinates(refPoint: XYZ, dims: number[]): XYZ {
    const plane = this.data.plane?.() ?? this.snaped!.view.workplane;
    let point = refPoint
      .add(plane.xvec.multiply(dims[0]))
      .add(plane.yvec.multiply(dims[1]));
    if (dims.length === 3) {
      point = point.add(plane.normal.multiply(dims[2]));
    }
    return point;
  }

  protected inputError(text: string): string | undefined {
    const [dims, isAbsolute] = this.parseInputDimensions(text);
    const dimension = DimensionUtils.from(dims.length);

    if (isAbsolute && dims.length !== 3) return "Input requires three numbers.";
    if (!this.isValidDimension(dimension))
      return "Input dimension is not supported.";
    if (this.hasInvalidNumbers(dims)) return "Invalid number.";
    if (this.requiresThreeNumbers(dims)) return "Input requires three numbers.";
    if (this.isInvalidSingleNumber(dims))
      return "Single distance requires a reference point.";

    return undefined;
  }

  private isValidDimension(dimension: Dimension): boolean {
    return DimensionUtils.contains(this.data.dimension!, dimension);
  }

  private hasInvalidNumbers(dims: number[]): boolean {
    return dims.some(Number.isNaN);
  }

  private requiresThreeNumbers(dims: number[]): boolean {
    const refPoint = this.getRefPoint();
    return refPoint === undefined && dims.length !== 3;
  }

  private isInvalidSingleNumber(dims: number[]): boolean {
    const refPoint = this.getRefPoint();
    return (
      dims.length === 1 &&
      refPoint! &&
      (!this.snaped || this.snaped.point!.isEqualTo(refPoint))
    );
  }

  private getRefPoint(): XYZ | undefined {
    return this.data.refPoint?.() ?? this.snaped?.refPoint;
  }

  private filterDetected(
    detected: MouseAndDetected,
    predicate: (shape: VisualShapeData) => boolean
  ) {
    return {
      ...detected,
      shapes: detected.shapes.filter(predicate)
    };
  }

  private isCurrentFaceSnap(): boolean {
    return (
      this.snapedValue?.info === SnapLabelKey.Face &&
      this.snapedValue.shapes[0]?.shape.shapeType === ShapeType.Face
    );
  }

  private isSameShape(left: VisualShapeData, right: VisualShapeData): boolean {
    return (
      left.shape.id === right.shape.id &&
      left.indexes.length === right.indexes.length &&
      left.indexes.every((value, index) => value === right.indexes[index])
    );
  }
}

export class SnapPointOnCurveEventHandler extends SnapEventHandler<SnapPointOnCurveData> {
  constructor(
    document: IDocument,
    controller: AsyncController,
    pointData: SnapPointOnCurveData,
    snapConfig: SnapConfig,
    ui?: SnapCommandUI
  ) {
    const objectSnap = new ObjectSnap(snapConfig);
    const snap = new PointOnCurveSnap(pointData);
    const workplaneSnap = new WorkplaneSnap();
    super(
      document,
      controller,
      [objectSnap, snap, workplaneSnap],
      pointData,
      ui,
      () => snapConfig.enableSnap
    );
  }

  protected override getPointFromInput(view: IView, text: string): SnapResult {
    const length = this.data.curve.length();
    const parameter = Number(text) / length;
    return { point: this.data.curve.value(parameter), view, shapes: [] };
  }

  protected override inputError(text: string) {
    return Number.isNaN(Number(text)) ? "Invalid number." : undefined;
  }
}

export class SnapPointOnAxisEventHandler extends SnapEventHandler<SnapPointOnAxisData> {
  constructor(
    document: IDocument,
    controller: AsyncController,
    pointData: SnapPointOnAxisData,
    snapConfig: SnapConfig,
    ui?: SnapCommandUI
  ) {
    const objectSnap = new ObjectSnap(snapConfig);
    const snap = new AxisSnap(pointData.ray.point, pointData.ray.direction);
    super(
      document,
      controller,
      [objectSnap, snap],
      pointData,
      ui,
      () => snapConfig.enableSnap
    );
  }

  protected override getPointFromInput(view: IView, text: string): SnapResult {
    const parameter = Number(text);
    const point = this.data.ray.point.add(
      this.data.ray.direction.multiply(parameter)
    );
    return { point, view, shapes: [] };
  }

  protected override inputError(text: string) {
    return Number.isNaN(Number(text)) ? "Invalid number." : undefined;
  }
}

export class SnapPointPlaneEventHandler extends PointSnapEventHandler {
  protected override getInitSnaps(
    pointData: PointSnapData,
    snapConfig: SnapConfig
  ): ISnap[] {
    if (!pointData.plane) throw new Error("plane is required");

    return [new ObjectSnap(snapConfig), new PlaneSnap(pointData.plane)];
  }

  protected override findSnapPoint(
    shapeType: ShapeType,
    view: IView,
    event: PointerEvent,
    snaps: readonly ISnap[] = this.snaps
  ): void {
    super.findSnapPoint(shapeType, view, event, snaps);

    if (this.snaped?.point) {
      this.snaped.point = this.data.plane!().project(this.snaped.point);
    }
  }
}
