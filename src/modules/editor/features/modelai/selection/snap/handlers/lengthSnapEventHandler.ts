// @ts-nocheck
import type { AsyncController } from "@modelai/core";
import type { IDocument, IView } from "@modelai/core/types";
import type { XYZ } from "@modelai/core/math";
import { type Plane, Precision } from "@modelai/core/math";
import type { SnapData, SnapResult } from "../snap";
import { AxisSnap, ObjectSnap, PlaneSnap } from "../snaps";
import { TrackingSnap } from "@modelai/selection/tracking/trackingSnap";
import { SnapEventHandler, type SnapCommandUI } from "./snapEventHandler";
import type { SnapConfig } from "@modelai/selection/snapConfig";

export interface LengthAtAxisSnapData extends SnapData {
  point: XYZ;
  direction: XYZ;
}

export interface SnapLengthAtPlaneData extends SnapData {
  point: () => XYZ;
  plane: (point: XYZ | undefined) => Plane;
}

export class SnapLengthAtAxisHandler extends SnapEventHandler<LengthAtAxisSnapData> {
  constructor(
    document: IDocument,
    controller: AsyncController,
    lengthData: LengthAtAxisSnapData,
    snapConfig: SnapConfig,
    ui?: SnapCommandUI
  ) {
    const objectSnap = new ObjectSnap(snapConfig, () => lengthData.point);
    const axisSnap = new AxisSnap(lengthData.point, lengthData.direction);
    super(
      document,
      controller,
      [objectSnap, axisSnap],
      lengthData,
      ui,
      () => snapConfig.enableSnap
    );
  }

  protected getPointFromInput(view: IView, text: string): SnapResult {
    const dist = this.calculateDistance(Number(text));
    const point = this.calculatePoint(dist);
    return { view, point, distance: dist, shapes: [] };
  }

  private calculateDistance(inputValue: number): number {
    return this.shouldReverse() ? -inputValue : inputValue;
  }

  private calculatePoint(distance: number): XYZ {
    return this.data.point.add(this.data.direction.multiply(distance));
  }

  private shouldReverse() {
    return (
      this.snaped?.point &&
      this.snaped.point.sub(this.data.point).dot(this.data.direction) <
        -Precision.Distance
    );
  }

  protected inputError(text: string): string | undefined {
    return Number.isNaN(Number(text)) ? "Invalid number." : undefined;
  }
}

export class SnapLengthAtPlaneHandler extends SnapEventHandler<SnapLengthAtPlaneData> {
  private workplane: Plane | undefined;

  constructor(
    document: IDocument,
    controller: AsyncController,
    readonly lengthData: SnapLengthAtPlaneData,
    snapConfig: SnapConfig,
    ui?: SnapCommandUI
  ) {
    const objectSnap = new ObjectSnap(snapConfig, lengthData.point);
    const trackingSnap = new TrackingSnap(snapConfig, lengthData.point, false);
    const planeSnap = new PlaneSnap(lengthData.plane, lengthData.point);
    super(
      document,
      controller,
      [objectSnap, trackingSnap, planeSnap],
      lengthData,
      ui,
      () => snapConfig.enableSnap
    );
  }

  protected override setSnaped(view: IView, event: PointerEvent): void {
    super.setSnaped(view, event);
    this.updateWorkplane();
  }

  private updateWorkplane() {
    if (this.snaped) {
      this.workplane = this.lengthData.plane(this.snaped.point);
      this.snaped.plane = this.workplane;
    }
  }

  protected getPointFromInput(view: IView, text: string): SnapResult {
    const plane = this.workplane ?? view.workplane;
    const point = this.calculatePoint(text, plane);
    return { point, view, shapes: [], plane };
  }

  private calculatePoint(text: string, plane: Plane): XYZ {
    const numbers = text.split(",").map(Number);
    return numbers.length === 1
      ? this.calculatePointFromDistance(numbers[0])
      : this.calculatePointFromCoordinates(numbers, plane);
  }

  private calculatePointFromDistance(distance: number): XYZ {
    const vector = this.snaped?.point!.sub(this.data.point()).normalize();
    return this.data.point().add(vector!.multiply(distance));
  }

  private calculatePointFromCoordinates(coords: number[], plane: Plane): XYZ {
    return this.data
      .point()
      .add(plane.xvec.multiply(coords[0]))
      .add(plane.yvec.multiply(coords[1]));
  }

  protected inputError(text: string): string | undefined {
    const numbers = text.split(",").map(Number);
    if (
      numbers.some(Number.isNaN) ||
      (numbers.length !== 1 && numbers.length !== 2)
    ) {
      return "Invalid number.";
    }
    return undefined;
  }
}
