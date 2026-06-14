// @ts-nocheck
import type { IView } from "@modelai/core/types";
import { MeshDataUtils, VisualConfig } from "@modelai/core/types";
import { Plane } from "@modelai/core/math";
import type { XYZ } from "@modelai/core/math";
import type { ISnap, MouseAndDetected, SnapResult } from "../snap";

export class AxisSnap implements ISnap {
  private tempLine?: [IView, number];

  constructor(
    readonly point: XYZ,
    readonly direction: XYZ
  ) {}

  snap(data: MouseAndDetected): SnapResult | undefined {
    const right = data.view.up().cross(data.view.direction()).normalize();
    const normal = right.cross(this.direction).normalize();
    if (normal.lengthSq() === 0) return undefined;

    const plane = new Plane(this.point, normal, right!);
    const ray = data.view.rayAt(data.mx, data.my);
    const intersect = plane.intersectRay(ray);
    if (!intersect) return undefined;

    const vector = intersect.sub(this.point);
    const dot = vector.dot(this.direction);
    const point = this.point.add(this.direction.multiply(dot));
    this.showTempLine(data.view, dot);

    return {
      view: data.view,
      point,
      distance: dot,
      shapes: []
    };
  }

  private showTempLine(view: IView, dot: number) {
    const dist = Math.abs(dot) < 0.000001 ? 1e15 : 1e15 * dot;
    const lineData = MeshDataUtils.createEdgeMesh(
      this.point,
      this.point.add(this.direction.multiply(dist)),
      VisualConfig.temporaryEdgeColor,
      "dash"
    );
    const id = view.document.visual.context.displayMesh([lineData]);
    this.tempLine = [view, id];
  }

  removeDynamicObject(): void {
    this.tempLine?.[0].document.visual.context.removeMesh(this.tempLine[1]);
  }

  clear(): void {
    this.removeDynamicObject();
  }
}
