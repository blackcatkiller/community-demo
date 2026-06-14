// @ts-nocheck
import type { IView, VisualShapeData } from "@modelai/core/types";
import { ShapeType } from "@modelai/core/types";
import type { XYZ } from "@modelai/core/math";
import { gc, type Deletable, type IDisposable } from "@modelai/core/gc";
import type { OccEdge, OccVertex } from "@modelai/occ";
import { toXYZ } from "@modelai/occ/helper";
import { ObjectSnapType, ObjectSnapTypeUtils } from "../../snapConfig";
import type { SnapResult } from "../snap";

export class FeaturePointStrategy {
  private readonly featureInfos: Map<VisualShapeData, SnapResult[]> = new Map();

  constructor(private snapType: ObjectSnapType) {}

  getFeaturePoints(view: IView, shape: VisualShapeData): SnapResult[] {
    if (this.featureInfos.has(shape)) {
      return this.featureInfos.get(shape)!;
    }

    const infos: SnapResult[] = [];
    if (shape.shape.shapeType === ShapeType.Vertex) {
      this.getVertexFeaturePoints(view, shape, infos);
    } else if (shape.shape.shapeType === ShapeType.Edge) {
      this.getEdgeFeaturePoints(view, shape, infos);
    }
    this.featureInfos.set(shape, infos);
    return infos;
  }

  private getVertexFeaturePoints(
    view: IView,
    shape: VisualShapeData,
    infos: SnapResult[]
  ) {
    if (ObjectSnapTypeUtils.hasType(this.snapType, ObjectSnapType.vertex)) {
      const point = shape.transform.ofPoint((shape.shape as OccVertex).point());
      infos.push({
        view,
        point,
        info: "vertex",
        shapes: [shape]
      });
    }
  }

  private getEdgeFeaturePoints(
    view: IView,
    shape: VisualShapeData,
    infos: SnapResult[]
  ) {
    const edge = shape.shape as OccEdge;
    const transform = shape.transform;

    gc(collect => {
      const handle = collect(wasm.Edge.curve(edge.shape));
      const curve = handle.get();
      if (!curve) return;

      const snapTypes = this.snapType;
      const addPoint = (point: XYZ, info: string) =>
        infos.push({
          view,
          point: transform.ofPoint(point),
          info,
          shapes: [shape]
        });

      const startParam = curve.firstParameter();
      const endParam = curve.lastParameter();
      const midParam = (startParam + endParam) * 0.5;

      if (ObjectSnapTypeUtils.hasType(snapTypes, ObjectSnapType.endPoint)) {
        const startPoint = collect(curve.value(startParam));
        const endPoint = collect(curve.value(endParam));
        addPoint(toXYZ(startPoint), "end");
        addPoint(toXYZ(endPoint), "end");
      }

      if (ObjectSnapTypeUtils.hasType(snapTypes, ObjectSnapType.midPoint)) {
        const midPoint = collect(curve.value(midParam));
        addPoint(toXYZ(midPoint), "mid");
      }

      if (ObjectSnapTypeUtils.hasType(snapTypes, ObjectSnapType.center)) {
        const center = this.getCircleCenter(curve, collect, transform);
        if (center) {
          infos.push({
            view,
            point: center,
            info: "center",
            shapes: [shape]
          });
        }
      }
    });
  }

  private getCircleCenter(
    curve: any,
    collect: <T extends Deletable | IDisposable>(resource: T) => T,
    transform: { ofPoint: (point: XYZ) => XYZ }
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
    return transform.ofPoint(toXYZ(center));
  }

  clear(): void {
    this.featureInfos.clear();
  }

  updateSnapType(snapType: ObjectSnapType): void {
    this.snapType = snapType;
    this.clear();
  }
}
