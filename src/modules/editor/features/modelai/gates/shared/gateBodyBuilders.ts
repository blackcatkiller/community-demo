// @ts-nocheck
import { MathUtils, type Plane, type XYZ } from "@modelai/core/math";
import { Result } from "@modelai/core/result";
import type { IShape } from "@modelai/core/types";
import {
  convertShapeResult,
  createPipeShellArcRound,
  createPipeShellRound
} from "@/features/modelai/geometry/gateShapeUtils";
import {
  buildArcGuide,
  buildLineGuide,
  type FeatureGeometryResult
} from "@/features/modelai/geometry/featureGeometry";
import type { PinPointGateParams } from "@/features/modelai/gates/pinPoint/pinPointGate";
import type { HotTipGateParams } from "@/features/modelai/gates/hotTip/hotTipGate";
import type { SubGateParams } from "@/features/modelai/gates/sub/subGate";
import type { HornGateParams } from "@/features/modelai/gates/horn/hornGate";
import type { LargeGateParams } from "@/features/modelai/gates/large/largeGate";
import type { OccShape } from "@modelai/occ/shape";

const DEFAULT_VERTICAL_RUNNER_DIAMETER_START = 3;
const DEFAULT_VERTICAL_RUNNER_DIAMETER_END = 5;

type ArcParams = {
  R: number;
  C_x: number;
  C_z: number;
  sweepAngle: number;
  arcLength: number;
};

type HornGuidePathData = {
  shapeAStart: XYZ;
  shapeAEnd: XYZ;
  shapeBCenter: XYZ;
  shapeBArcNormal: XYZ;
  shapeBStart: XYZ;
  shapeBSweepAngle: number;
};

function computeHornArcCapAdjustedStart(
  circleCenter: XYZ,
  arcNormal: XYZ,
  start: XYZ,
  radius: number,
  capRadius: number
) {
  const deltaAngle = capRadius / radius;
  const startVector = start.sub(circleCenter);
  const rotatedStartVector = startVector
    .multiply(Math.cos(deltaAngle))
    .add(arcNormal.cross(startVector).multiply(Math.sin(deltaAngle)));

  return {
    adjustedStart: circleCenter.add(rotatedStartVector),
    adjustedSweepAngle: deltaAngle
  };
}

export function computeHornArcParams(
  gateAngleRad: number,
  gateLength: number,
  channelOffsetX: number,
  channelOffsetY: number
): ArcParams {
  const theta = gateAngleRad;
  const L = gateLength;
  const ox = channelOffsetX;
  const oy = channelOffsetY;

  const endA_x = -Math.sin(theta) * L;
  const endA_z = -Math.cos(theta) * L;

  const dx = ox - endA_x;
  const dz = -oy - endA_z;

  const S = dx * Math.cos(theta) - dz * Math.sin(theta);
  const D2 = dx * dx + dz * dz;
  const R = D2 / (2 * S);

  const C_x = endA_x + R * Math.cos(theta);
  const C_z = endA_z - R * Math.sin(theta);

  const phi1 = Math.PI - theta;
  const phi2 = Math.atan2(-oy - C_z, ox - C_x);
  let sweepAngle = phi2 - phi1;
  if (sweepAngle <= 0) sweepAngle += 2 * Math.PI;

  return { R, C_x, C_z, sweepAngle, arcLength: R * sweepAngle };
}

export function buildPinPointGateShapeA(
  plane: Plane,
  params: Pick<PinPointGateParams, "gateDiameter" | "gateAngle" | "gateLength">
): Result<IShape> {
  const origin = plane.origin;
  const direction = plane.normal;
  const angleRad = MathUtils.degToRad(params.gateAngle);
  const spineALength = params.gateLength;
  const endA = origin.add(direction.multiply(spineALength));
  const r1a = params.gateDiameter / 2;
  const r2a = spineALength * Math.tan(angleRad / 2) + r1a;

  return createPipeShellRound(r1a, r2a, false, false, origin, endA);
}

export function buildPinPointGateFeatureGeometry(
  plane: Plane,
  params: Pick<PinPointGateParams, "gateDiameter" | "gateAngle" | "gateLength">
): FeatureGeometryResult {
  const origin = plane.origin;
  const end = origin.add(plane.normal.multiply(params.gateLength));

  return {
    shape: buildPinPointGateShapeA(plane, params),
    guides: [
      buildLineGuide("shapeA-centerline", "shapeA", origin, end, {
        roles: ["display", "pickProxy"]
      })
    ]
  };
}

export function buildSubGateShapeA(
  plane: Plane,
  params: Pick<
    SubGateParams,
    "gateDiameter" | "gateSpreadingAngle" | "gateDipDepth" | "gateAngle"
  >
): Result<IShape> {
  const origin = plane.origin;
  const { xvec, normal } = plane;

  const gateAngleRad = MathUtils.degToRad(params.gateAngle);
  const spreadRad = MathUtils.degToRad(params.gateSpreadingAngle);
  const spineALength = params.gateDipDepth;
  const spineADir = xvec
    .multiply(Math.sin(gateAngleRad))
    .add(normal.multiply(Math.cos(gateAngleRad)));

  const endA = origin.add(spineADir.multiply(spineALength));
  const r1a = params.gateDiameter / 2;
  const r2a = params.gateDiameter / 2 + spineALength * Math.tan(spreadRad / 2);

  return createPipeShellRound(r1a, r2a, false, false, origin, endA);
}

export function buildSubGateFeatureGeometry(
  plane: Plane,
  params: Pick<
    SubGateParams,
    "gateDiameter" | "gateSpreadingAngle" | "gateDipDepth" | "gateAngle"
  >
): FeatureGeometryResult {
  const origin = plane.origin;
  const gateAngleRad = MathUtils.degToRad(params.gateAngle);
  const direction = plane.xvec
    .multiply(Math.sin(gateAngleRad))
    .add(plane.normal.multiply(Math.cos(gateAngleRad)));
  const end = origin.add(direction.multiply(params.gateDipDepth));

  return {
    shape: buildSubGateShapeA(plane, params),
    guides: [
      buildLineGuide("shapeA-centerline", "shapeA", origin, end, {
        roles: ["display", "pickProxy"]
      })
    ]
  };
}

export function buildHotTipGateShapeA(
  plane: Plane,
  params: Pick<
    HotTipGateParams,
    "gateDiameter" | "gateAngle" | "gateLength" | "tiltAngle"
  >
): Result<IShape> {
  const origin = plane.origin;
  const tiltAngleRad = MathUtils.degToRad(params.tiltAngle);
  const direction = plane.xvec
    .multiply(Math.sin(tiltAngleRad))
    .add(plane.normal.multiply(Math.cos(tiltAngleRad)))
    .normalize();
  const spineALength = params.gateLength;
  const endA = origin.add(direction.multiply(spineALength));
  const angleRad = MathUtils.degToRad(params.gateAngle);
  const r1a = params.gateDiameter / 2;
  const r2a = spineALength * Math.tan(angleRad / 2) + r1a;

  return createPipeShellRound(r1a, r2a, false, false, origin, endA);
}

export function buildHotTipGateFeatureGeometry(
  plane: Plane,
  params: Pick<
    HotTipGateParams,
    "gateDiameter" | "gateAngle" | "gateLength" | "tiltAngle"
  >
): FeatureGeometryResult {
  const origin = plane.origin;
  const tiltAngleRad = MathUtils.degToRad(params.tiltAngle);
  const direction = plane.xvec
    .multiply(Math.sin(tiltAngleRad))
    .add(plane.normal.multiply(Math.cos(tiltAngleRad)))
    .normalize();
  const end = origin.add(direction.multiply(params.gateLength));

  return {
    shape: buildHotTipGateShapeA(plane, params),
    guides: [
      buildLineGuide("shapeA-centerline", "shapeA", origin, end, {
        roles: ["display", "pickProxy"]
      })
    ]
  };
}

export function buildLargeGateShapeA(
  plane: Plane,
  params: Pick<
    LargeGateParams,
    "gateDiameter" | "gateSpreadingAngle" | "gateDipDepth"
  >
): Result<IShape> {
  const origin = plane.origin;
  const { normal } = plane;

  const spreadRad = MathUtils.degToRad(params.gateSpreadingAngle);
  const spineALength = params.gateDipDepth;
  const spineADir = normal;

  const endA = origin.add(spineADir.multiply(spineALength));
  const rEnd = params.gateDiameter / 2;
  const rStart = rEnd + spineALength * Math.tan(spreadRad / 2);

  return createPipeShellRound(rStart, rEnd, false, false, origin, endA);
}

export function buildLargeGateFeatureGeometry(
  plane: Plane,
  params: Pick<
    LargeGateParams,
    "gateDiameter" | "gateSpreadingAngle" | "gateDipDepth"
  >
): FeatureGeometryResult {
  const origin = plane.origin;
  const direction = plane.normal;
  const end = origin.add(direction.multiply(params.gateDipDepth));

  return {
    shape: buildLargeGateShapeA(plane, params),
    guides: [
      buildLineGuide("shapeA-centerline", "shapeA", origin, end, {
        roles: ["display", "pickProxy"]
      })
    ]
  };
}

export function buildVerticalRunnerShapeB(
  start: XYZ,
  end: XYZ,
  params: { diameterStart?: number; diameterEnd?: number; diameter?: number }
): Result<IShape> {
  const length = start.distanceTo(end);
  if (length <= 0) {
    return Result.err("Vertical runner length must be greater than zero");
  }

  const rawStartDiameter = Number(params.diameterStart ?? params.diameter);
  const rawEndDiameter = Number(
    params.diameterEnd ?? DEFAULT_VERTICAL_RUNNER_DIAMETER_END
  );
  const startRadius =
    (Number.isFinite(rawStartDiameter)
      ? Math.max(0.1, rawStartDiameter)
      : DEFAULT_VERTICAL_RUNNER_DIAMETER_START) / 2;
  const endRadius =
    (Number.isFinite(rawEndDiameter)
      ? Math.max(0.1, rawEndDiameter)
      : DEFAULT_VERTICAL_RUNNER_DIAMETER_END) / 2;

  return createPipeShellRound(startRadius, endRadius, true, false, start, end);
}

function buildHornGuidePathData(
  plane: Plane,
  params: Pick<
    HornGateParams,
    "gateLength" | "gateAngle" | "channelOffsetX" | "channelOffsetY"
  >
): HornGuidePathData {
  const { origin, xvec, yvec, normal } = plane;
  const gateAngleRad = MathUtils.degToRad(params.gateAngle);
  const shapeAEnd = origin
    .sub(xvec.multiply(Math.sin(gateAngleRad) * params.gateLength))
    .sub(normal.multiply(Math.cos(gateAngleRad) * params.gateLength));

  const { C_x, C_z, sweepAngle } = computeHornArcParams(
    gateAngleRad,
    params.gateLength,
    params.channelOffsetX,
    params.channelOffsetY
  );

  return {
    shapeAStart: origin,
    shapeAEnd,
    shapeBCenter: origin.add(xvec.multiply(C_x)).add(normal.multiply(C_z)),
    shapeBArcNormal: yvec.multiply(-1),
    shapeBStart: shapeAEnd,
    shapeBSweepAngle: sweepAngle
  };
}

export function buildHornGateShapeAB(
  plane: Plane,
  params: Pick<
    HornGateParams,
    | "gateDiameter"
    | "gateSpreadingAngle"
    | "gateLength"
    | "gateAngle"
    | "hornDiameterStart"
    | "hornDiameterEnd"
    | "channelOffsetX"
    | "channelOffsetY"
  >
): Result<IShape> {
  const origin = plane.origin;
  const { xvec, yvec, normal } = plane;

  const gateAngleRad = MathUtils.degToRad(params.gateAngle);
  const spreadRad = MathUtils.degToRad(params.gateSpreadingAngle);
  const ox = params.channelOffsetX;
  const oy = params.channelOffsetY;
  const Lz = Math.cos(gateAngleRad) * params.gateLength;
  const Lx = Math.sin(gateAngleRad) * params.gateLength;

  const endA = origin.sub(xvec.multiply(Lx)).sub(normal.multiply(Lz));
  const r1A = params.gateDiameter / 2;
  const r2A =
    params.gateDiameter / 2 + params.gateLength * Math.tan(spreadRad / 2);
  const extraLz = Math.cos(gateAngleRad);
  const extraLx = Math.sin(gateAngleRad);
  const extendedEndA = endA
    .sub(xvec.multiply(extraLx))
    .sub(normal.multiply(extraLz));

  const shapeA = createPipeShellRound(
    r1A,
    r2A,
    false,
    false,
    origin,
    extendedEndA
  );
  if (!shapeA.isOk) return shapeA;

  const { R, C_x, C_z, sweepAngle } = computeHornArcParams(
    gateAngleRad,
    params.gateLength,
    ox,
    oy
  );
  const circleCenter = origin.add(xvec.multiply(C_x)).add(normal.multiply(C_z));
  const arcNormal = yvec.multiply(-1);
  const capRadius = params.hornDiameterStart / 2;
  const { adjustedStart, adjustedSweepAngle } = computeHornArcCapAdjustedStart(
    circleCenter,
    arcNormal,
    endA,
    R,
    capRadius
  );
  const shapeB = createPipeShellArcRound(
    params.hornDiameterStart / 2,
    params.hornDiameterEnd / 2,
    true,
    false,
    circleCenter,
    arcNormal,
    adjustedStart,
    sweepAngle - adjustedSweepAngle
  );
  if (!shapeB.isOk) {
    shapeA.value.dispose();
    return shapeB;
  }

  const combined = convertShapeResult(
    wasm.ShapeFactory.combine([
      (shapeA.value as OccShape).shape,
      (shapeB.value as OccShape).shape
    ])
  );
  shapeA.value.dispose();
  shapeB.value.dispose();
  return combined;
}

export function buildHornGateFeatureGeometry(
  plane: Plane,
  params: Pick<
    HornGateParams,
    | "gateDiameter"
    | "gateSpreadingAngle"
    | "gateLength"
    | "gateAngle"
    | "hornDiameterStart"
    | "hornDiameterEnd"
    | "channelOffsetX"
    | "channelOffsetY"
  >
): FeatureGeometryResult {
  const guideData = buildHornGuidePathData(plane, params);

  return {
    shape: buildHornGateShapeAB(plane, params),
    guides: [
      buildLineGuide(
        "shapeA-centerline",
        "shapeA",
        guideData.shapeAStart,
        guideData.shapeAEnd,
        {
          roles: ["display", "pickProxy"]
        }
      ),
      buildArcGuide(
        "shapeB-centerline",
        "shapeB",
        guideData.shapeBCenter,
        guideData.shapeBArcNormal,
        guideData.shapeBStart,
        guideData.shapeBSweepAngle,
        {
          roles: ["display", "pickProxy", "editProxy"],
          binding: {
            kind: "horn.shapeBArc",
            fields: [
              "gateAngle",
              "gateLength",
              "channelOffsetX",
              "channelOffsetY"
            ],
            metadata: {
              owner: "shapeB"
            }
          }
        }
      )
    ]
  };
}
