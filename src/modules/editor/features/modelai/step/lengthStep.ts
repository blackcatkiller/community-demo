// @ts-nocheck
import type { AsyncController } from "@modelai/core";
import { Precision } from "@modelai/core/math";
import type { IDocument } from "@modelai/core/types";
import {
  SnapLengthAtAxisHandler,
  SnapLengthAtPlaneHandler,
  type LengthAtAxisSnapData,
  type SnapLengthAtPlaneData
} from "@modelai/selection/snap";
import { createDefaultSnapConfig } from "@modelai/selection/snapConfig";
import { SnapStep } from "./step";

function getSnapConfig(document: IDocument) {
  const app = document.application as any;
  return app?.getSnapConfigRef?.() ?? createDefaultSnapConfig();
}

export class LengthAtAxisStep extends SnapStep<LengthAtAxisSnapData> {
  protected getEventHandler(
    document: IDocument,
    controller: AsyncController,
    data: LengthAtAxisSnapData
  ) {
    return new SnapLengthAtAxisHandler(
      document,
      controller,
      data,
      getSnapConfig(document),
      this.getSnapCommandUI(document)
    );
  }

  protected validator(
    data: LengthAtAxisSnapData,
    point: import("@modelai/core/math").XYZ
  ): boolean {
    return (
      Math.abs(point.sub(data.point).dot(data.direction)) > Precision.Distance
    );
  }
}

export class LengthAtPlaneStep extends SnapStep<SnapLengthAtPlaneData> {
  protected getEventHandler(
    document: IDocument,
    controller: AsyncController,
    data: SnapLengthAtPlaneData
  ) {
    return new SnapLengthAtPlaneHandler(
      document,
      controller,
      data,
      getSnapConfig(document),
      this.getSnapCommandUI(document)
    );
  }

  protected validator(
    data: SnapLengthAtPlaneData,
    point: import("@modelai/core/math").XYZ
  ): boolean {
    const pointAtPlane = data.plane(point).project(point);
    return pointAtPlane.distanceTo(data.point()) > Precision.Distance;
  }
}
