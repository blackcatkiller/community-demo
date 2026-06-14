// @ts-nocheck
import type { XYZ } from "@modelai/core/math";
import { Plane } from "@modelai/core/math";
import type { IView } from "@modelai/core/types";
import type { ISnap, MouseAndDetected, SnapResult } from "../snap";

function ensurePlane(view: IView, plane: Plane): Plane {
  const direction = view.direction();
  if (Math.abs(direction.dot(plane.normal)) < 1e-6) {
    const left = direction.cross(view.up());
    return new Plane(plane.origin, direction, left);
  }
  return plane;
}

export abstract class PlaneSnapBase implements ISnap {
  removeDynamicObject(): void {}
  clear(): void {}
  abstract snap(data: MouseAndDetected): SnapResult | undefined;

  constructor(readonly refPoint?: () => XYZ) {}

  protected snapAtPlane(
    plane: Plane,
    data: MouseAndDetected
  ): SnapResult | undefined {
    plane = ensurePlane(data.view, plane);
    const ray = data.view.rayAt(data.mx, data.my);
    const point = plane.intersectRay(ray);
    if (!point) return undefined;

    const distance = this.refPoint
      ? this.refPoint().distanceTo(point)
      : undefined;

    return {
      view: data.view,
      point,
      distance,
      shapes: []
    };
  }
}

export class WorkplaneSnap extends PlaneSnapBase {
  snap(data: MouseAndDetected): SnapResult | undefined {
    return this.snapAtPlane(data.view.workplane, data);
  }
}

export class ViewPlaneSnap extends PlaneSnapBase {
  snap(data: MouseAndDetected): SnapResult | undefined {
    const viewDirection = data.view.direction();
    const normal = viewDirection.reverse();
    const xvec = viewDirection.cross(data.view.up()).normalize();
    const anchor = this.refPoint?.();
    if (!anchor) return undefined;
    const plane = new Plane(anchor, normal, xvec);
    const result = this.snapAtPlane(plane, data);
    if (result) {
      result.plane = plane;
    }
    return result;
  }
}

export class PlaneSnap extends PlaneSnapBase {
  constructor(
    readonly plane: (point: XYZ) => Plane,
    refPoint?: () => XYZ
  ) {
    super(refPoint);
  }

  snap(data: MouseAndDetected): SnapResult | undefined {
    const point = data.view.screenToWorld(data.mx, data.my);
    const plane = this.plane(point);
    const result = this.snapAtPlane(plane, data);
    if (result) {
      result.plane = plane;
    }
    return result;
  }
}
