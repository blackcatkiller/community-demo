// @ts-nocheck
import { transformI18n } from "@/plugins/i18n";
import { Precision, PubSub, type MeasurementRow } from "@modelai/core";
import { VisualConfig } from "@modelai/core/types";
import { command } from "@modelai/command";
import { applyOcclusionOverlay } from "@modelai/geometry/occlusionOverlay";
import { Dimension, type PointSnapData } from "@modelai/selection/snap";
import { type IStep, PointStep } from "@modelai/step";
import { ThreeGeometryFactory } from "@modelai/viewer/geometryFactory";
import type { ThreeView } from "@modelai/viewer/view";
import { Group } from "three";
import { MultistepCommand } from "../multistepCommand";

@command({
  key: "measure.length",
  icon: "icon-measure-length"
})
export class LengthMeasure extends MultistepCommand {
  protected override getSteps(): IStep[] {
    const firstStep = new PointStep(
      transformI18n("modelai.command.prompt.pickFirstMeasurePoint")
    );
    const secondStep = new PointStep(
      transformI18n("modelai.command.prompt.pickSecondMeasurePoint"),
      this.getSecondPointData
    );
    return [firstStep, secondStep];
  }

  private readonly getSecondPointData = (): PointSnapData => {
    return {
      refPoint: () => this.stepDatas[0].point!,
      dimension: Dimension.D1D2D3,
      validator: point => {
        return this.stepDatas[0].point!.distanceTo(point) > Precision.Distance;
      },
      preview: this.linePreview
    };
  };

  private readonly linePreview = (
    point: import("@modelai/core/math").XYZ | undefined
  ) => {
    if (!point) {
      return [this.meshPoint(this.stepDatas[0].point!)];
    }
    const line = this.meshLine(this.stepDatas[0].point!, point);
    line.advancedOcclusion = true;
    return [this.meshPoint(this.stepDatas[0].point!), line];
  };

  protected override executeMainTask(): void {
    const firstPoint = this.stepDatas[0].point!;
    const secondPoint = this.stepDatas[1].point!;
    const distance = firstPoint.distanceTo(secondPoint);
    const delta = secondPoint.sub(firstPoint);
    const view = this.stepDatas[1].view as ThreeView;

    const group = new Group();
    const firstPointObj = ThreeGeometryFactory.createVertexGeometry(
      this.meshPoint(firstPoint)
    );
    const lineObj = ThreeGeometryFactory.createEdgeGeometry(
      this.meshLine(
        firstPoint,
        secondPoint,
        VisualConfig.measurementGuideColor,
        3
      )
    );
    const secondPointObj = ThreeGeometryFactory.createVertexGeometry(
      this.meshPoint(secondPoint)
    );
    lineObj.userData.detachOcclusionOverlay = applyOcclusionOverlay(
      view,
      lineObj
    );
    group.add(firstPointObj, lineObj, secondPointObj);

    const meshId = this.document.visual.context.displayObject(group);

    const midPoint = firstPoint.add(secondPoint).multiply(0.5);
    PubSub.default.pub("showMeasurementResult", {
      rows: this.getMeasurementRows(distance, delta),
      point: midPoint,
      meshId
    });
  }

  private getMeasurementRows(
    distance: number,
    delta: import("@modelai/core/math").XYZ
  ): MeasurementRow[] {
    return [
      {
        label: transformI18n("modelai.measurement.totalDistance"),
        value: this.formatValue(distance)
      },
      {
        label: transformI18n("modelai.measurement.deltaX"),
        value: this.formatValue(delta.x)
      },
      {
        label: transformI18n("modelai.measurement.deltaY"),
        value: this.formatValue(delta.y)
      },
      {
        label: transformI18n("modelai.measurement.deltaZ"),
        value: this.formatValue(delta.z)
      }
    ];
  }

  private formatValue(value: number) {
    return value.toFixed(2);
  }
}
