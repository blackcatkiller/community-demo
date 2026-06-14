// @ts-nocheck
import type { IView } from "@modelai/core/types";
import type { Plane, XYZ } from "@modelai/core/math";
import { Axis } from "./axis";
import { TrackingBase } from "./trackingBase";

export class AxisTracking extends TrackingBase {
  private readonly axies: Map<IView, { key: string; axes: Axis[] }> = new Map();

  constructor(trackingZ: boolean) {
    super(trackingZ);
  }

  getAxes(
    view: IView,
    referencePoint: XYZ,
    angle: number | undefined = undefined,
    planeOverride?: Plane
  ) {
    const plane = planeOverride ?? view.workplane;
    const key = [
      referencePoint.x.toFixed(6),
      referencePoint.y.toFixed(6),
      referencePoint.z.toFixed(6),
      plane.normal.x.toFixed(4),
      plane.normal.y.toFixed(4),
      plane.normal.z.toFixed(4),
      plane.xvec.x.toFixed(4),
      plane.xvec.y.toFixed(4),
      plane.xvec.z.toFixed(4)
    ].join("|");
    const cached = this.axies.get(view);
    if (!cached || cached.key !== key) {
      this.axies.set(view, {
        key,
        axes: this.initAxes(plane, referencePoint, angle)
      });
    }
    return this.axies.get(view)!.axes;
  }

  private initAxes(
    plane: Plane,
    referencePoint: XYZ,
    angle: number | undefined
  ): Axis[] {
    if (angle === undefined) {
      return Axis.getAxiesAtPlane(referencePoint, plane, this.trackingZ);
    }

    const result: Axis[] = [];
    let testAngle = 0;
    while (testAngle < 360) {
      const direction = plane.xvec.rotate(
        plane.normal,
        (testAngle / 180) * Math.PI
      );
      if (direction) {
        result.push(new Axis(referencePoint, direction, `${testAngle}掳`));
      }
      testAngle += angle;
    }
    if (this.trackingZ) {
      result.push(new Axis(referencePoint, plane.normal, "Z"));
      result.push(new Axis(referencePoint, plane.normal.reverse(), "Z"));
    }

    return result;
  }

  override clear(): void {
    super.clear();
    this.axies.clear();
  }
}
