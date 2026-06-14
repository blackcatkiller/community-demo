// @ts-nocheck
import type { AsyncController } from "@modelai/core";
import { Precision } from "@modelai/core/math";
import type { IDocument } from "@modelai/core/types";
import {
  Dimension,
  PointSnapEventHandler,
  SnapPointOnAxisEventHandler,
  SnapPointOnCurveEventHandler,
  SnapPointPlaneEventHandler,
  type PointSnapData,
  type SnapPointOnAxisData,
  type SnapPointOnCurveData
} from "@modelai/selection/snap";
import { createDefaultSnapConfig } from "@modelai/selection/snapConfig";
import { SnapStep } from "./step";

function defaultSnapData(): PointSnapData {
  return { dimension: Dimension.D1 | Dimension.D1D2D3 };
}

function getSnapConfig(document: IDocument) {
  const app = document.application as any;
  return app?.getSnapConfigRef?.() ?? createDefaultSnapConfig();
}

export class PointStep extends SnapStep<PointSnapData> {
  constructor(
    tip: string,
    handleData: () => PointSnapData = defaultSnapData,
    keepSelected = false
  ) {
    super(tip, handleData, keepSelected);
  }

  protected getEventHandler(
    document: IDocument,
    controller: AsyncController,
    data: PointSnapData
  ) {
    return new PointSnapEventHandler(
      document,
      controller,
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

export class PointOnCurveStep extends SnapStep<SnapPointOnCurveData> {
  constructor(
    tip: string,
    handleData: () => SnapPointOnCurveData,
    keepSelected = false
  ) {
    super(tip, handleData, keepSelected);
  }

  protected override validator(
    _data: SnapPointOnCurveData,
    _point: import("@modelai/core/math").XYZ
  ): boolean {
    return true;
  }

  protected override getEventHandler(
    document: IDocument,
    controller: AsyncController,
    data: SnapPointOnCurveData
  ) {
    return new SnapPointOnCurveEventHandler(
      document,
      controller,
      data,
      getSnapConfig(document),
      this.getSnapCommandUI(document)
    );
  }
}

export class PointOnAxisStep extends SnapStep<SnapPointOnAxisData> {
  constructor(
    tip: string,
    handleData: () => SnapPointOnAxisData,
    keepSelected = false
  ) {
    super(tip, handleData, keepSelected);
  }

  protected override validator(
    _data: SnapPointOnAxisData,
    _point: import("@modelai/core/math").XYZ
  ): boolean {
    return true;
  }

  protected override getEventHandler(
    document: IDocument,
    controller: AsyncController,
    data: SnapPointOnAxisData
  ) {
    return new SnapPointOnAxisEventHandler(
      document,
      controller,
      data,
      getSnapConfig(document),
      this.getSnapCommandUI(document)
    );
  }
}

export class PointOnPlaneStep extends SnapStep<PointSnapData> {
  constructor(
    tip: string,
    handleData: () => PointSnapData,
    keepSelected = false
  ) {
    super(tip, handleData, keepSelected);
  }

  protected override validator(
    _data: PointSnapData,
    _point: import("@modelai/core/math").XYZ
  ): boolean {
    return true;
  }

  protected override getEventHandler(
    document: IDocument,
    controller: AsyncController,
    data: PointSnapData
  ) {
    return new SnapPointPlaneEventHandler(
      document,
      controller,
      data as any,
      getSnapConfig(document),
      this.getSnapCommandUI(document)
    );
  }
}
