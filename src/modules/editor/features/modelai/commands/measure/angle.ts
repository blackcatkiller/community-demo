// @ts-nocheck
import { transformI18n } from "@/plugins/i18n";
import { Precision, PubSub, type MeasurementRow } from "@modelai/core";
import type { XYZ } from "@modelai/core/math";
import { VisualConfig, type EdgeMeshData } from "@modelai/core/types";
import { command } from "@modelai/command";
import {
  Dimension,
  type PointSnapData,
  type SnapResult
} from "@modelai/selection/snap";
import { type IStep, PointStep } from "@modelai/step";
import { MultistepCommand } from "../multistepCommand";

const ARC_POSITION = 0.5;
const ARC_SEGMENTS = 24;

function createArcEdgeMesh(
  center: XYZ,
  normal: XYZ,
  start: XYZ,
  angle: number,
  color: number = VisualConfig.measurementGuideColor,
  lineWidth: number = 3
): EdgeMeshData {
  const offset = start.sub(center);
  const radius = offset.length();
  if (radius <= Precision.Distance) {
    return {
      position: new Float32Array(),
      range: [],
      color,
      lineType: "solid",
      lineWidth
    };
  }

  const axisX = offset.normalize();
  const axisY = normal.cross(axisX).normalize();
  if (axisY.lengthSq() <= Precision.Distance) {
    return {
      position: new Float32Array(),
      range: [],
      color,
      lineType: "solid",
      lineWidth
    };
  }

  const segments = Math.max(
    8,
    Math.ceil((Math.abs(angle) / (Math.PI * 2)) * ARC_SEGMENTS)
  );
  const positions: number[] = [];
  const step = angle / segments;

  for (let i = 0; i < segments; i += 1) {
    const a0 = step * i;
    const a1 = step * (i + 1);
    const p0 = center
      .add(axisX.multiply(Math.cos(a0) * radius))
      .add(axisY.multiply(Math.sin(a0) * radius));
    const p1 = center
      .add(axisX.multiply(Math.cos(a1) * radius))
      .add(axisY.multiply(Math.sin(a1) * radius));
    positions.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
  }

  return {
    position: new Float32Array(positions),
    range: [],
    color,
    lineType: "solid",
    lineWidth
  };
}

@command({
  key: "measure.angle",
  icon: "icon-measure-angle"
})
export class AngleMeasure extends MultistepCommand {
  protected override getSteps(): IStep[] {
    const firstStep = new PointStep(
      transformI18n("modelai.command.prompt.pickAngleVertexPoint")
    );
    const secondStep = new PointStep(
      transformI18n("modelai.command.prompt.pickAngleFirstSidePoint"),
      this.getSecondPointData
    );
    const thirdStep = new PointStep(
      transformI18n("modelai.command.prompt.pickAngleSecondSidePoint"),
      this.getThirdPointData
    );
    return [firstStep, secondStep, thirdStep];
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

  private readonly linePreview = (point: XYZ | undefined) => {
    if (!point) {
      return [this.meshPoint(this.stepDatas[0].point!)];
    }
    return [
      this.meshPoint(this.stepDatas[0].point!),
      this.meshLine(this.stepDatas[0].point!, point)
    ];
  };

  private readonly getThirdPointData = (): PointSnapData => {
    return {
      refPoint: () => this.stepDatas[0].point!,
      dimension: Dimension.D1D2D3,
      prompt: (result: SnapResult) => this.formatAngle(result.point),
      validator: point => {
        return (
          this.stepDatas[0].point!.distanceTo(point) > Precision.Distance &&
          this.stepDatas[1].point!.distanceTo(point) > Precision.Distance
        );
      },
      preview: this.arcPreview
    };
  };

  private readonly arcPreview = (point: XYZ | undefined) => {
    const vertex = this.stepDatas[0].point!;
    const firstSidePoint = this.stepDatas[1].point!;
    const meshes = [
      this.meshPoint(vertex),
      this.meshPoint(firstSidePoint),
      this.meshLine(
        vertex,
        firstSidePoint,
        VisualConfig.measurementGuideColor,
        3
      )
    ];
    if (!point) return meshes;

    const info = this.arcInfo(point);
    if (!info || this.toDegrees(info.rad) < Precision.Angle) {
      return meshes;
    }

    const line2 = this.meshLine(
      vertex,
      point,
      VisualConfig.measurementGuideColor,
      3
    );
    const arc = createArcEdgeMesh(
      vertex,
      info.normal,
      vertex.add(info.v1.multiply(this.lineLength(point) * ARC_POSITION)),
      info.rad,
      VisualConfig.measurementGuideColor,
      3
    );
    return [line2, arc, ...meshes];
  };

  protected override executeMainTask(): void {
    const thirdPoint = this.stepDatas[2].point!;
    const info = this.arcInfo(thirdPoint);
    if (!info) return;

    const rotated = info.v1.rotate(info.normal, info.rad * 0.5);
    if (!rotated) return;

    const arcMid = rotated
      .multiply(this.lineLength(thirdPoint) * ARC_POSITION)
      .add(this.stepDatas[0].point!);

    const meshId = this.document.visual.context.displayMesh([
      this.meshPoint(thirdPoint),
      ...this.arcPreview(thirdPoint)
    ]);

    PubSub.default.pub("showMeasurementResult", {
      rows: this.getMeasurementRows(info.rad),
      point: arcMid,
      meshId
    });
  }

  private getMeasurementRows(rad: number): MeasurementRow[] {
    return [
      {
        label: transformI18n("modelai.measurement.angle"),
        value: this.formatAngleValue(rad)
      }
    ];
  }

  private formatAngle(point: XYZ | undefined) {
    if (!point) return "";
    const info = this.arcInfo(point);
    if (!info) return "";
    return this.formatAngleValue(info.rad);
  }

  private formatAngleValue(rad: number) {
    return `${this.toDegrees(rad).toFixed(2)}\u00B0`;
  }

  private toDegrees(rad: number) {
    return (rad * 180) / Math.PI;
  }

  private lineLength(point: XYZ | undefined) {
    const d1 = this.stepDatas[0].point!.distanceTo(this.stepDatas[1].point!);
    if (!point) {
      return d1;
    }
    const d2 = this.stepDatas[0].point!.distanceTo(point);
    return Math.min(d1, d2);
  }

  private arcInfo(point: XYZ) {
    const v1 = this.stepDatas[1]
      .point!.sub(this.stepDatas[0].point!)
      .normalize();
    const v2 = point.sub(this.stepDatas[0].point!).normalize();
    if (!v1 || !v2) return undefined;

    const rad = v1.angleTo(v2);
    const normal = v1.cross(v2).normalize();
    if (rad === undefined || !normal) return undefined;

    return {
      v1,
      rad,
      normal
    };
  }
}
