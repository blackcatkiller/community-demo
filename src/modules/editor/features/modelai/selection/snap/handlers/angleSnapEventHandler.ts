// @ts-nocheck
import type { AsyncController } from "@modelai/core";
import type { IDocument, IView } from "@modelai/core/types";
import type { XYZ } from "@modelai/core/math";
import { Plane, PlaneAngle } from "@modelai/core/math";
import type { SnapResult } from "../snap";
import { ObjectSnap, PlaneSnap } from "../snaps";
import { TrackingSnap } from "@modelai/selection/tracking/trackingSnap";
import type { PointSnapData } from "./pointSnapEventHandler";
import { SnapEventHandler, type SnapCommandUI } from "./snapEventHandler";
import type { SnapConfig } from "@modelai/selection/snapConfig";

export class AngleSnapEventHandler extends SnapEventHandler<PointSnapData> {
  private readonly planeAngle: PlaneAngle;
  private readonly plane: Plane;

  constructor(
    document: IDocument,
    controller: AsyncController,
    private readonly center: () => XYZ,
    p1: XYZ,
    snapPointData: PointSnapData,
    snapConfig: SnapConfig,
    ui?: SnapCommandUI
  ) {
    if (!snapPointData.plane)
      throw new Error("AngleSnapEventHandler: no plane");

    const objectSnap = new ObjectSnap(snapConfig, snapPointData.refPoint);
    const workplaneSnap = new PlaneSnap(snapPointData.plane, center);
    const trackingSnap = new TrackingSnap(snapConfig, center, false);
    super(
      document,
      controller,
      [objectSnap, trackingSnap, workplaneSnap],
      snapPointData,
      ui,
      () => snapConfig.enableSnap
    );

    const xvec = p1.sub(center()).normalize();
    this.plane = new Plane(center(), snapPointData.plane().normal, xvec);
    this.planeAngle = new PlaneAngle(this.plane);
    snapPointData.prompt ??= this.formatAnglePrompt;
  }

  private readonly formatAnglePrompt = (snaped?: SnapResult) => {
    if (!snaped?.point) return "";
    this.planeAngle.movePoint(snaped.point);
    return `${this.planeAngle.angle.toFixed(2)} deg`;
  };

  protected override inputError(text: string) {
    const angle = Number.parseFloat(text);
    return isNaN(angle) ? "Invalid number." : undefined;
  }

  protected override getPointFromInput(view: IView, text: string): SnapResult {
    const angle = (Number.parseFloat(text) * Math.PI) / 180;
    const vec =
      this.plane.xvec.rotate(this.plane.normal, angle) ?? this.plane.xvec;
    const point = this.center().add(vec);
    return { point, view, shapes: [], plane: this.plane };
  }
}
