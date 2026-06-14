// @ts-nocheck
import type { IDocument, IView } from "@modelai/core/types";
import { MeshDataUtils, ShapeType, VisualConfig } from "@modelai/core/types";
import { type Line, Plane, XY, type XYZ } from "@modelai/core/math";
import { gc } from "@modelai/core/gc";
import { OccEdge } from "@modelai/occ";
import { toXYZ } from "@modelai/occ/helper";
import type { Matrix4 } from "@modelai/core/math";
import type { SnapConfig } from "../snapConfig";
import type { ISnap } from "../snap/snap";
import { RaycasterThreshold } from "@modelai/viewer/constants";
import type { Axis } from "./axis";
import { AxisTracking } from "./axisTracking";
import { ObjectTracking } from "./objectTracking";
import type { MouseAndDetected, SnapResult } from "./types";

interface TrackingData {
  axis: Axis;
  point: XYZ;
  isObjectTracking: boolean;
  distance: number;
  info: string;
}

export class TrackingSnap implements ISnap {
  private readonly axisTracking: AxisTracking;
  private readonly objectTracking: ObjectTracking;
  private readonly tempLines: Map<IView, number[]> = new Map();

  constructor(
    private readonly config: SnapConfig,
    readonly referencePoint: (() => XYZ | undefined) | undefined,
    trackingAxisZ: boolean
  ) {
    this.axisTracking = new AxisTracking(trackingAxisZ);
    this.objectTracking = new ObjectTracking(trackingAxisZ);
  }

  readonly handleSnaped = (document: IDocument, snaped?: SnapResult) => {
    if (this.config.enableTracking && this.config.enableSnap) {
      this.objectTracking.showTrackingAtTimeout(document, snaped);
    }
  };

  snap(data: MouseAndDetected): SnapResult | undefined {
    if (!this.config.enableTracking || !this.config.enableSnap)
      return undefined;

    const trackingDatas = this.detectTracking(data.view, data.mx, data.my);
    if (trackingDatas.length === 0) return undefined;
    trackingDatas.sort((x, y) => x.distance - y.distance);

    const snaped = this.shapeIntersectTracking(data, trackingDatas);
    if (snaped !== undefined) return snaped;

    if (trackingDatas.length === 1) {
      return this.getSnapedAndShowTracking(data.view, trackingDatas[0].point, [
        trackingDatas[0]
      ]);
    }

    return (
      this.trackingIntersectTracking(data.view, trackingDatas) ??
      this.getSnapedAndShowTracking(data.view, trackingDatas[0].point, [
        trackingDatas[0]
      ])
    );
  }

  removeDynamicObject(): void {
    this.tempLines.forEach((ids, view) => {
      ids.forEach(id => {
        view.document.visual.context.removeMesh(id);
      });
    });
    this.tempLines.clear();
  }

  clear(): void {
    this.removeDynamicObject();
    this.axisTracking.clear();
    this.objectTracking.clear();
  }

  private trackingIntersectTracking(
    view: IView,
    trackingDatas: TrackingData[]
  ) {
    const point = trackingDatas[0].axis.intersect(trackingDatas[1].axis);
    return point
      ? this.getSnapedAndShowTracking(view, point, [
          trackingDatas[0],
          trackingDatas[1]
        ])
      : undefined;
  }

  private getSnapedAndShowTracking(
    view: IView,
    point: XYZ,
    trackingDatas: TrackingData[]
  ): SnapResult {
    const lines: number[] = trackingDatas
      .map(x => this.showTempLine(view, x.axis.point, point))
      .filter((id): id is number => id !== undefined);
    this.tempLines.set(view, lines);

    let info: string | undefined;
    let distance: number | undefined;
    if (trackingDatas.length === 1) {
      distance = point.distanceTo(trackingDatas[0].axis.point);
      info = trackingDatas[0].axis.name;
    } else if (trackingDatas.length === 2) {
      info = "Intersection";
    }
    const refPoint = trackingDatas[0].axis.point;
    return { view, point, info, shapes: [], refPoint, distance };
  }

  private showTempLine(view: IView, start: XYZ, end: XYZ): number | undefined {
    const vector = end.sub(start);
    const normal = vector.normalize();
    if (normal.lengthSq() === 0) return undefined;
    const distance = Math.min(vector.length() * 1e10, 1e20);
    const newEnd = start.add(normal.multiply(distance));
    const lineData = MeshDataUtils.createEdgeMesh(
      start,
      newEnd,
      VisualConfig.trackingEdgeColor,
      "dash"
    );
    return view.document.visual.context.displayMesh([lineData]);
  }

  private shapeIntersectTracking(
    data: MouseAndDetected,
    trackingDatas: TrackingData[]
  ): SnapResult | undefined {
    if (data.shapes.length === 0) return undefined;
    const hit = data.shapes[0];
    if (
      hit.shape.shapeType !== ShapeType.Edge ||
      !(hit.shape instanceof OccEdge)
    )
      return undefined;

    const edge = hit.shape as OccEdge;
    const points: { intersect: XYZ; location: XYZ }[] = [];
    trackingDatas.forEach(x => {
      const point = this.findEdgeAxisIntersection(edge, hit.transform, x.axis);
      if (point) points.push({ intersect: point, location: x.axis.point });
    });
    if (points.length === 0) return undefined;
    points.sort(
      (p, q) =>
        this.screenDistance(data.view, data.mx, data.my, p.intersect) -
        this.screenDistance(data.view, data.mx, data.my, q.intersect)
    );
    const best = points[0];
    const id = this.showTempLine(data.view, best.location, best.intersect);
    if (id === undefined) return undefined;
    this.tempLines.set(data.view, [id]);
    return {
      view: data.view,
      point: best.intersect,
      info: "Intersection",
      shapes: [hit]
    };
  }

  private findEdgeAxisIntersection(
    edge: OccEdge,
    transform: Matrix4,
    axis: Axis
  ): XYZ | undefined {
    return gc(collect => {
      const handle = collect(wasm.Edge.curve(edge.shape));
      const curve = handle.get();
      if (!curve) return undefined;

      const localLine = this.toLocalAxis(axis, transform);
      const lineHandle = collect(
        wasm.Curve.makeLine(
          {
            x: localLine.origin.x,
            y: localLine.origin.y,
            z: localLine.origin.z
          },
          {
            x: localLine.target.x,
            y: localLine.target.y,
            z: localLine.target.z
          }
        )
      );
      const line = lineHandle.get();
      if (!line) return undefined;

      const extrema = wasm.Curve.nearestExtremaCC(curve, line);
      if (!extrema) return undefined;
      if (extrema.distance > 1e-4) return undefined;
      return this.applyTransform(toXYZ(extrema.p1), transform);
    });
  }

  private toLocalAxis(
    axis: Axis,
    transform: Matrix4
  ): { origin: XYZ; target: XYZ } {
    const inv = transform.invert();
    if (!inv) {
      return { origin: axis.point, target: axis.point.add(axis.direction) };
    }
    const origin = inv.ofPoint(axis.point);
    const target = inv.ofPoint(axis.point.add(axis.direction));
    return { origin, target };
  }

  private applyTransform(point: XYZ, transform?: Matrix4): XYZ {
    return transform ? transform.ofPoint(point) : point;
  }

  private detectTracking(view: IView, x: number, y: number) {
    const data: TrackingData[] = [];
    const refPoint = this.referencePoint?.();
    if (refPoint) {
      const plane = this.ensurePlane(view, view.workplane);
      const axes = this.axisTracking.getAxes(view, refPoint, undefined, plane);
      data.push(...this.getSnapedFromAxes(axes, view, x, y));
    }
    const plane = this.ensurePlane(view, view.workplane);
    const objectTrackingAxes = this.objectTracking.getTrackingAxes(view, plane);
    objectTrackingAxes.forEach(a => {
      data.push(...this.getSnapedFromAxes(a.axes, view, x, y, a.objectName));
    });
    return data;
  }

  private getSnapedFromAxes(
    axes: Axis[],
    view: IView,
    x: number,
    y: number,
    snapedName?: string
  ) {
    const result: TrackingData[] = [];
    for (const axis of axes) {
      const distance = this.rayDistanceAtScreen(view, x, y, axis);
      if (distance < this.getSnapDistance()) {
        const ray = view.rayAt(x, y);
        const point = axis.nearestTo(ray.toLine());
        if (point.sub(axis.point).dot(axis.direction) < 0) continue;
        result.push({
          axis,
          distance,
          point,
          info: snapedName ?? axis.name,
          isObjectTracking: snapedName !== undefined
        });
      }
    }
    return result;
  }

  private rayDistanceAtScreen(
    view: IView,
    x: number,
    y: number,
    axis: Line
  ): number {
    const start = view.worldToScreen(axis.point);
    const vector = new XY(x - start.x, y - start.y);
    if (vector.length() === 0) return 0;
    const end = view.worldToScreen(
      axis.point.add(axis.direction.multiply(100000))
    );
    if (start.distanceTo(end) < 1e-6) return vector.length();
    const dir = end.sub(start).normalize();
    const dot = vector.dot(dir);
    return Math.sqrt(Math.max(vector.lengthSq() - dot * dot, 0));
  }

  private screenDistance(
    view: IView,
    mx: number,
    my: number,
    point: XYZ
  ): number {
    const xy = view.worldToScreen(point);
    const dx = xy.x - mx;
    const dy = xy.y - my;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private getSnapDistance(): number {
    return RaycasterThreshold;
  }

  private ensurePlane(view: IView, plane: Plane): Plane {
    const direction = view.direction();
    if (Math.abs(direction.dot(plane.normal)) < 1e-6) {
      const left = direction.cross(view.up());
      return new Plane(plane.origin, direction, left);
    }
    return plane;
  }
}
