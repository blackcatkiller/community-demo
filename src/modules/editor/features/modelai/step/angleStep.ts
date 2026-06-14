// @ts-nocheck
import type { AsyncController } from "@modelai/core";
import { Precision } from "@modelai/core/math";
import type { IDocument } from "@modelai/core/types";
import {
  AngleSnapEventHandler,
  Dimension,
  type PointSnapData
} from "@modelai/selection/snap";
import { createDefaultSnapConfig } from "@modelai/selection/snapConfig";
import { SnapStep } from "./step";

function defaultSnapData(): PointSnapData {
  return { dimension: Dimension.D1D2D3 };
}

function getSnapConfig(document: IDocument) {
  const app = document.application as any;
  return app?.getSnapConfigRef?.() ?? createDefaultSnapConfig();
}

export class AngleStep extends SnapStep<PointSnapData> {
  constructor(
    tip: string,
    private readonly handleCenter: () => import("@modelai/core/math").XYZ,
    private readonly handleP1: () => import("@modelai/core/math").XYZ,
    handleP2Data: () => PointSnapData = defaultSnapData,
    keepSelected = false
  ) {
    super(tip, handleP2Data, keepSelected);
  }

  protected getEventHandler(
    document: IDocument,
    controller: AsyncController,
    data: PointSnapData
  ) {
    return new AngleSnapEventHandler(
      document,
      controller,
      this.handleCenter,
      this.handleP1(),
      data,
      getSnapConfig(document),
      this.getSnapCommandUI(document)
    );
  }

  protected validator(
    data: PointSnapData,
    point: import("@modelai/core/math").XYZ
  ): boolean {
    return (
      data.refPoint === undefined ||
      data.refPoint().distanceTo(point) > Precision.Distance
    );
  }
}
