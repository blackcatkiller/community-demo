// @ts-nocheck
import { transformI18n } from "@/plugins/i18n";
import {
  MathUtils,
  MeshDataUtils,
  Precision,
  PubSub,
  XYZ,
  type MeasurementRow
} from "@modelai/core";
import type { EdgeMeshData } from "@modelai/core/types";
import { VisualConfig } from "@modelai/core/types";
import { command } from "@modelai/command";
import { applyOcclusionOverlay } from "@modelai/geometry/occlusionOverlay";
import { Dimension, type PointSnapData } from "@modelai/selection/snap";
import { type IStep, PointStep } from "@modelai/step";
import { ThreeGeometryFactory } from "@modelai/viewer/geometryFactory";
import type { ThreeView } from "@modelai/viewer/view";
import { Group } from "three";
import { MultistepCommand } from "../multistepCommand";

const GLOBAL_Z_AXIS = new XYZ(0, 0, 1);
const NEGATIVE_Z_AXIS = new XYZ(0, 0, -1);
const MAIN_LINE_WIDTH = 3;
const GUIDE_LINE_WIDTH = 2;
const ARC_SEGMENTS = 24;
const ARC_RADIUS_RATIO = 0.28;
const Z_AXIS_GUIDE_RATIO = 0.8;

function createArcEdgeMesh(
  center: XYZ,
  normal: XYZ,
  start: XYZ,
  angle: number,
  color: number = VisualConfig.measurementGuideColor,
  lineWidth: number = GUIDE_LINE_WIDTH
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

function withAdvancedOcclusion(edge: EdgeMeshData): EdgeMeshData {
  edge.advancedOcclusion = true;
  return edge;
}

@command({
  key: "measure.slope",
  icon: "icon-measure-length"
})
export class SlopeMeasure extends MultistepCommand {
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
      preview: this.guidePreview
    };
  };

  private readonly guidePreview = (point: XYZ | undefined) => {
    const firstPoint = this.stepDatas[0].point!;
    const meshes = [this.meshPoint(firstPoint)];
    if (!point) {
      return meshes;
    }

    const info = this.buildSlopeInfo(firstPoint, point);
    if (!info) {
      return [...meshes, this.meshPoint(point)];
    }

    return [
      ...meshes,
      this.meshPoint(point),
      this.meshPoint(info.projectedPoint),
      withAdvancedOcclusion(
        this.meshLine(
          firstPoint,
          point,
          VisualConfig.highlightEdgeColor,
          MAIN_LINE_WIDTH
        )
      ),
      withAdvancedOcclusion(
        this.meshDashLine(
          firstPoint,
          info.projectedPoint,
          VisualConfig.measurementGuideColor,
          GUIDE_LINE_WIDTH
        )
      ),
      withAdvancedOcclusion(
        this.meshDashLine(
          info.projectedPoint,
          point,
          VisualConfig.measurementGuideColor,
          GUIDE_LINE_WIDTH
        )
      ),
      withAdvancedOcclusion(
        this.meshDashLine(
          firstPoint,
          info.zAxisGuideEnd,
          VisualConfig.measurementGuideColor,
          GUIDE_LINE_WIDTH
        )
      ),
      withAdvancedOcclusion(
        createArcEdgeMesh(
          firstPoint,
          info.arcNormal,
          info.arcStart,
          info.angleRad,
          VisualConfig.measurementGuideColor,
          GUIDE_LINE_WIDTH
        )
      )
    ];
  };

  private meshDashLine(
    start: XYZ,
    end: XYZ,
    color = VisualConfig.measurementGuideColor,
    lineWidth = 2
  ) {
    return MeshDataUtils.createEdgeMesh(start, end, color, "dash", lineWidth);
  }

  protected override executeMainTask(): void {
    const firstPoint = this.stepDatas[0].point!;
    const secondPoint = this.stepDatas[1].point!;
    const info = this.buildSlopeInfo(firstPoint, secondPoint);
    if (!info) return;
    const view = this.stepDatas[1].view as ThreeView;
    const group = new Group();

    const firstPointObj = ThreeGeometryFactory.createVertexGeometry(
      this.meshPoint(firstPoint)
    );
    const secondPointObj = ThreeGeometryFactory.createVertexGeometry(
      this.meshPoint(secondPoint)
    );
    const projectedPointObj = ThreeGeometryFactory.createVertexGeometry(
      this.meshPoint(info.projectedPoint)
    );

    const edgeObjects = [
      ThreeGeometryFactory.createEdgeGeometry(
        this.meshLine(
          firstPoint,
          secondPoint,
          VisualConfig.highlightEdgeColor,
          MAIN_LINE_WIDTH
        )
      ),
      ThreeGeometryFactory.createEdgeGeometry(
        this.meshDashLine(
          firstPoint,
          info.projectedPoint,
          VisualConfig.measurementGuideColor,
          GUIDE_LINE_WIDTH
        )
      ),
      ThreeGeometryFactory.createEdgeGeometry(
        this.meshDashLine(
          info.projectedPoint,
          secondPoint,
          VisualConfig.measurementGuideColor,
          GUIDE_LINE_WIDTH
        )
      ),
      ThreeGeometryFactory.createEdgeGeometry(
        this.meshDashLine(
          firstPoint,
          info.zAxisGuideEnd,
          VisualConfig.measurementGuideColor,
          GUIDE_LINE_WIDTH
        )
      ),
      ThreeGeometryFactory.createEdgeGeometry(
        createArcEdgeMesh(
          firstPoint,
          info.arcNormal,
          info.arcStart,
          info.angleRad,
          VisualConfig.measurementGuideColor,
          GUIDE_LINE_WIDTH
        )
      )
    ];

    edgeObjects.forEach(edgeObj => {
      edgeObj.userData.detachOcclusionOverlay = applyOcclusionOverlay(
        view,
        edgeObj
      );
      group.add(edgeObj);
    });

    group.add(firstPointObj, secondPointObj, projectedPointObj);

    const meshId = this.document.visual.context.displayObject(group);

    const labelPoint = info.arcMid ?? firstPoint.add(secondPoint).multiply(0.5);
    PubSub.default.pub("showMeasurementResult", {
      rows: this.getMeasurementRows(info.distance, info.deltaZ, info.angleRad),
      point: labelPoint,
      meshId
    });
  }

  private buildSlopeInfo(firstPoint: XYZ, secondPoint: XYZ) {
    const vector = secondPoint.sub(firstPoint);
    const distance = vector.length();
    if (distance <= Precision.Distance) return undefined;

    const projectedPoint = new XYZ(secondPoint.x, secondPoint.y, firstPoint.z);
    const referenceAxis = vector.z >= 0 ? GLOBAL_Z_AXIS : NEGATIVE_Z_AXIS;
    const angleRad = vector.angleTo(referenceAxis);
    if (angleRad === undefined) return undefined;

    const zAxisGuideLength = Math.max(
      Math.abs(vector.z),
      distance * Z_AXIS_GUIDE_RATIO
    );
    const zAxisGuideEnd = firstPoint.add(
      referenceAxis.multiply(zAxisGuideLength)
    );
    const arcRadius = Math.min(distance, zAxisGuideLength) * ARC_RADIUS_RATIO;
    const arcStart = firstPoint.add(referenceAxis.multiply(arcRadius));
    const arcNormal = referenceAxis.cross(vector).normalize();
    const safeArcNormal =
      arcNormal.lengthSq() > Precision.Distance ? arcNormal : new XYZ(0, -1, 0);
    const rotated = referenceAxis.rotate(safeArcNormal, angleRad);
    const arcMid =
      rotated?.multiply(arcRadius).add(firstPoint) ??
      firstPoint.add(secondPoint).multiply(0.5);

    return {
      distance,
      deltaZ: vector.z,
      angleRad,
      referenceAxis,
      projectedPoint,
      zAxisGuideEnd,
      arcStart,
      arcNormal: safeArcNormal,
      arcMid
    };
  }

  private getMeasurementRows(
    distance: number,
    deltaZ: number,
    angleRad: number
  ): MeasurementRow[] {
    return [
      {
        label: transformI18n("modelai.measurement.shortestDistance"),
        value: this.formatValue(distance)
      },
      {
        label: transformI18n("modelai.measurement.deltaZ"),
        value: this.formatValue(deltaZ)
      },
      {
        label: transformI18n("modelai.measurement.angleToGlobalZ"),
        value: this.formatAngle(angleRad)
      }
    ];
  }

  private formatValue(value: number) {
    return value.toFixed(2);
  }

  private formatAngle(rad: number) {
    return `${MathUtils.radToDeg(rad).toFixed(2)}\u00B0`;
  }
}
