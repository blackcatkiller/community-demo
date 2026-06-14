// @ts-nocheck
import {
  AsyncController,
  MeshDataUtils,
  Observable,
  PubSub,
  Transaction,
  type IDocument
} from "@modelai/core";
import type {
  INode,
  INodeLinkedList,
  IShape,
  ShapeMeshData,
  VisualShapeData
} from "@modelai/core/types";
import { MathUtils, Plane, Precision, XYZ } from "@modelai/core/math";
import { Result } from "@modelai/core/result";
import { Dimension, type SnapResult } from "@modelai/selection/snap";
import { mountFormKit } from "@modelai/ui/formKit/mount";
import type { FormKitRegistration } from "@modelai/ui/formKit/runtime";
import type { OccShape } from "@modelai/occ/shape";
import { transformI18n } from "@/plugins/i18n";
import {
  createSemanticHandleToolConfig,
  SemanticHandleTool,
  type SemanticHandleContext,
  type SemanticHandlePlacementHandler,
  type SemanticHandleTarget
} from "@/features/modelai/commands/create/shared/semanticHandleTool";
import {
  bindNodeForEdit,
  type NodeEditBinding
} from "@/features/modelai/editing/nodeEditBinding";
import {
  buildGuideEdgeMeshes,
  buildLineGuide,
  type FeatureGeometryResult
} from "@/features/modelai/geometry/featureGeometry";
import {
  convertShapeResult,
  pushShapeMesh
} from "@/features/modelai/geometry/gateShapeUtils";
import type { ThreeView } from "@/features/modelai/viewer/view";
import {
  getPinPointGateTemplateValues,
  type PinPointGateParams,
  type PinPointGateTemplate
} from "../pinPoint/pinPointGate";
import {
  buildPinPointGateShapeA,
  buildVerticalRunnerShapeB
} from "../shared/gateBodyBuilders";
import {
  cloneGateParams,
  cloneGatePlane,
  GateParamsHistoryRecord,
  hasGateParamsChanged,
  hasGatePlaneChanged
} from "../shared/gateParamsHistory";
import {
  createGateFormKitRegistration,
  type GateFormSection
} from "../shared/formKit";
import type {
  GateNodeAdapter,
  GateNodeApplyOptions
} from "../shared/nodeAdapter";
import { resolveNodeParentWithRunnerRootGrouping } from "../shared/runnerGroup";
import {
  getVerticalRunnerTemplateValues,
  normalizeVerticalRunnerParams,
  resolveVerticalRunnerSegment,
  resolveVerticalRunnerStartOffset,
  type VerticalRunnerParams,
  type VerticalRunnerTemplate
} from "../verticalRunner/verticalRunner";

import { PointVerticalRunnerNode } from "./pointVerticalRunnerNode";
export { PointVerticalRunnerNode } from "./pointVerticalRunnerNode";
const MIN_DIRECTION_LENGTH_SQ = 1e-12;
const WORLD_X = new XYZ(1, 0, 0);
const WORLD_Y = new XYZ(0, 1, 0);
const WORLD_Z = new XYZ(0, 0, 1);

export type PointVerticalRunnerParams = {
  gateTemplate: PinPointGateTemplate;
  gateDiameter: number;
  gateAngle: number;
  gateLength: number;
  runnerTemplate: VerticalRunnerTemplate;
  runnerDiameterStart: number;
  runnerDiameterEnd: number;
  pushPlatePlaneZ: number;
};

function isPinPointGateTemplate(value: unknown): value is PinPointGateTemplate {
  return (
    value === "P0.6" ||
    value === "P0.8" ||
    value === "P1.0" ||
    value === "P1.2" ||
    value === "P1.4" ||
    value === "P1.6"
  );
}

function isVerticalRunnerTemplate(
  value: unknown
): value is VerticalRunnerTemplate {
  return value === "D3" || value === "D4" || value === "D5";
}

export function getPointVerticalRunnerGateTemplateValues(
  template: PinPointGateTemplate
): Pick<
  PointVerticalRunnerParams,
  "gateDiameter" | "gateAngle" | "gateLength"
> {
  const values = getPinPointGateTemplateValues(template);
  return {
    gateDiameter: values.gateDiameter,
    gateAngle: values.gateAngle,
    gateLength: values.gateLength
  };
}

export function getPointVerticalRunnerRunnerTemplateValues(
  template: VerticalRunnerTemplate
): Pick<
  PointVerticalRunnerParams,
  "runnerDiameterStart" | "runnerDiameterEnd"
> {
  const values = getVerticalRunnerTemplateValues(template);
  return {
    runnerDiameterStart: values.diameterStart,
    runnerDiameterEnd: values.diameterEnd
  };
}

export function createPointVerticalRunnerParams(
  pushPlatePlaneZ = 0
): PointVerticalRunnerParams {
  return normalizePointVerticalRunnerParams({
    gateTemplate: "P0.6",
    ...getPointVerticalRunnerGateTemplateValues("P0.6"),
    runnerTemplate: "D3",
    ...getPointVerticalRunnerRunnerTemplateValues("D3"),
    pushPlatePlaneZ
  });
}

export function normalizePointVerticalRunnerParams(
  params: PointVerticalRunnerParams
): PointVerticalRunnerParams {
  const gateTemplate = isPinPointGateTemplate(params.gateTemplate)
    ? params.gateTemplate
    : "P0.6";
  const runnerTemplate = isVerticalRunnerTemplate(params.runnerTemplate)
    ? params.runnerTemplate
    : "D3";
  const parsedGateDiameter = Number(params.gateDiameter);
  const parsedGateAngle = Number(params.gateAngle);
  const parsedGateLength = Number(params.gateLength);
  const legacyRunnerDiameter = (params as { runnerDiameter?: unknown })
    .runnerDiameter;
  const parsedRunnerDiameterStart = Number(
    params.runnerDiameterStart ?? legacyRunnerDiameter
  );
  const parsedRunnerDiameterEnd = Number(params.runnerDiameterEnd);
  const parsedPushPlatePlaneZ = Number(params.pushPlatePlaneZ);

  return {
    gateTemplate,
    gateDiameter: Math.max(
      0.1,
      Number.isFinite(parsedGateDiameter)
        ? parsedGateDiameter
        : getPointVerticalRunnerGateTemplateValues(gateTemplate).gateDiameter
    ),
    gateAngle: Math.max(
      1,
      Math.min(
        89,
        Number.isFinite(parsedGateAngle)
          ? parsedGateAngle
          : getPointVerticalRunnerGateTemplateValues(gateTemplate).gateAngle
      )
    ),
    gateLength: Math.max(
      0.1,
      Number.isFinite(parsedGateLength)
        ? parsedGateLength
        : getPointVerticalRunnerGateTemplateValues(gateTemplate).gateLength
    ),
    runnerTemplate,
    runnerDiameterStart: Math.max(
      0.1,
      Number.isFinite(parsedRunnerDiameterStart)
        ? parsedRunnerDiameterStart
        : getPointVerticalRunnerRunnerTemplateValues(runnerTemplate)
            .runnerDiameterStart
    ),
    runnerDiameterEnd: Math.max(
      0.1,
      Number.isFinite(parsedRunnerDiameterEnd)
        ? parsedRunnerDiameterEnd
        : getPointVerticalRunnerRunnerTemplateValues(runnerTemplate)
            .runnerDiameterEnd
    ),
    pushPlatePlaneZ: Number.isFinite(parsedPushPlatePlaneZ)
      ? parsedPushPlatePlaneZ
      : 0
  };
}

export function toPointVerticalRunnerGateParams(
  params: PointVerticalRunnerParams
): PinPointGateParams {
  const next = normalizePointVerticalRunnerParams(params);
  return {
    template: next.gateTemplate,
    gateDiameter: next.gateDiameter,
    gateAngle: next.gateAngle,
    gateLength: next.gateLength
  };
}

export function toPointVerticalRunnerRunnerParams(
  params: PointVerticalRunnerParams
): VerticalRunnerParams {
  const next = normalizePointVerticalRunnerParams(params);
  return normalizeVerticalRunnerParams({
    template: next.runnerTemplate,
    diameterStart: next.runnerDiameterStart,
    diameterEnd: next.runnerDiameterEnd,
    pushPlatePlaneZ: next.pushPlatePlaneZ
  });
}

function isFiniteXYZ(point: XYZ | undefined): point is XYZ {
  return (
    point !== undefined &&
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    Number.isFinite(point.z)
  );
}

function safeUnit(vector: XYZ): XYZ | undefined {
  if (!isFiniteXYZ(vector) || vector.lengthSq() <= MIN_DIRECTION_LENGTH_SQ) {
    return undefined;
  }
  const unit = vector.normalize();
  return isFiniteXYZ(unit) && unit.lengthSq() > MIN_DIRECTION_LENGTH_SQ
    ? unit
    : undefined;
}

function orthogonalXvec(normal: XYZ, preferred: XYZ): XYZ {
  const unitNormal = safeUnit(normal) ?? WORLD_Z;
  const projected = safeUnit(
    preferred.sub(unitNormal.multiply(preferred.dot(unitNormal)))
  );
  if (projected) return projected;

  const x = safeUnit(WORLD_X.sub(unitNormal.multiply(WORLD_X.dot(unitNormal))));
  if (x) return x;

  return (
    safeUnit(WORLD_Y.sub(unitNormal.multiply(WORLD_Y.dot(unitNormal)))) ??
    WORLD_X
  );
}

function safePushPlatePlaneZ(params: PointVerticalRunnerParams): number {
  return Number.isFinite(params.pushPlatePlaneZ) ? params.pushPlatePlaneZ : 0;
}

function pushPlatePlane(params: PointVerticalRunnerParams): Plane {
  const z = safePushPlatePlaneZ(params);
  return new Plane(new XYZ(0, 0, z), new XYZ(0, 0, 1), new XYZ(1, 0, 0));
}

function projectPointVerticalRunnerEndPoint(
  point: XYZ,
  params: PointVerticalRunnerParams
): XYZ {
  return new XYZ(point.x, point.y, safePushPlatePlaneZ(params));
}

function buildPointVerticalRunnerProjectionHelperMeshes(
  source: XYZ | undefined,
  projected: XYZ | undefined,
  snaped?: SnapResult
): ShapeMeshData[] {
  if (!source || !projected) return [];
  if (!snaped?.shapes.length) return [];
  if (source.distanceTo(projected) <= Precision.Distance) return [];
  return [MeshDataUtils.createEdgeMesh(source, projected, 0xffffff, "dash", 1)];
}

export function resolvePointVerticalRunnerDirection(
  plane: Plane,
  params: PointVerticalRunnerParams
): XYZ {
  const angleRad = MathUtils.degToRad(
    normalizePointVerticalRunnerParams(params).gateAngle
  );
  const normal = safeUnit(plane.normal) ?? WORLD_Z;
  const xvec = orthogonalXvec(normal, plane.xvec);
  return (
    safeUnit(
      xvec.multiply(Math.sin(angleRad)).add(normal.multiply(Math.cos(angleRad)))
    ) ?? normal
  );
}

export function resolvePointVerticalRunnerPlane(
  plane: Plane,
  params: PointVerticalRunnerParams
): Plane {
  const direction = resolvePointVerticalRunnerDirection(plane, params);
  return new Plane(
    plane.origin,
    direction,
    orthogonalXvec(direction, plane.xvec)
  );
}

function resolvePointVerticalRunnerParts(
  plane: Plane,
  params: PointVerticalRunnerParams
) {
  const next = normalizePointVerticalRunnerParams(params);
  const gateParams = toPointVerticalRunnerGateParams(next);
  const runnerParams = toPointVerticalRunnerRunnerParams(next);
  const directionPlane = resolvePointVerticalRunnerPlane(plane, next);
  const direction = directionPlane.normal;
  const gateStart = directionPlane.origin;
  const gateEnd = gateStart.add(direction.multiply(next.gateLength));
  const runnerStart = gateStart.add(
    direction.multiply(
      next.gateLength + resolveVerticalRunnerStartOffset(runnerParams)
    )
  );
  const runnerSegment = resolveVerticalRunnerSegment(
    runnerStart,
    direction,
    runnerParams
  );

  return {
    gateParams,
    runnerParams,
    gateStart,
    gateEnd,
    runnerStart,
    runnerSegment,
    directionPlane
  };
}

export function resolvePointVerticalRunnerEndPoint(
  plane: Plane,
  params: PointVerticalRunnerParams
): XYZ | undefined {
  return resolvePointVerticalRunnerParts(plane, params).runnerSegment?.end;
}

export function buildPointVerticalRunnerShape(
  plane: Plane,
  params: PointVerticalRunnerParams
): Result<IShape> {
  const parts = resolvePointVerticalRunnerParts(plane, params);
  if (!parts.runnerSegment) {
    return Result.err("Point vertical runner cannot reach the target plane");
  }

  const shapeA = buildPinPointGateShapeA(
    parts.directionPlane,
    parts.gateParams
  );
  if (!shapeA.isOk) return shapeA;

  const shapeB = buildVerticalRunnerShapeB(
    parts.runnerSegment.start,
    parts.runnerSegment.end,
    parts.runnerParams
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

export function buildPointVerticalRunnerFeatureGeometry(
  plane: Plane,
  params: PointVerticalRunnerParams
): FeatureGeometryResult {
  const parts = resolvePointVerticalRunnerParts(plane, params);
  return {
    shape: buildPointVerticalRunnerShape(plane, params),
    guides: [
      buildLineGuide(
        "shapeA-centerline",
        "shapeA",
        parts.gateStart,
        parts.gateEnd,
        {
          roles: ["display", "pickProxy"]
        }
      ),
      ...(parts.runnerSegment
        ? [
            buildLineGuide(
              "shapeB-centerline",
              "shapeB",
              parts.runnerSegment.start,
              parts.runnerSegment.end,
              {
                roles: ["display", "pickProxy"]
              }
            )
          ]
        : [])
    ]
  };
}

export function buildPointVerticalRunnerPreviewMeshes(
  plane: Plane,
  params: PointVerticalRunnerParams
): ShapeMeshData[] {
  const meshes: ShapeMeshData[] = [];
  const feature = buildPointVerticalRunnerFeatureGeometry(plane, params);
  pushShapeMesh(feature.shape, meshes);
  meshes.push(
    ...buildGuideEdgeMeshes(feature.guides, { advancedOcclusion: true })
  );
  return meshes;
}

export const pointVerticalRunnerNodeAdapter: GateNodeAdapter<
  PointVerticalRunnerParams,
  PointVerticalRunnerNode
> = {
  isNode(node: INode): node is PointVerticalRunnerNode {
    return node instanceof PointVerticalRunnerNode;
  },
  createNode(
    name: string,
    plane: Plane,
    params: PointVerticalRunnerParams
  ): PointVerticalRunnerNode {
    return new PointVerticalRunnerNode(name, plane, params);
  },
  fromNode(node: PointVerticalRunnerNode): PointVerticalRunnerParams {
    return node.exportParams();
  },
  getPlane(node: PointVerticalRunnerNode): Plane {
    return node.plane;
  },
  applyToNode(
    node: PointVerticalRunnerNode,
    params: PointVerticalRunnerParams,
    options?: GateNodeApplyOptions
  ): void {
    node.applyParams(params, options);
  },
  applyPlacement(
    node: PointVerticalRunnerNode,
    plane: Plane,
    options?: GateNodeApplyOptions
  ): void {
    node.applyPlacement(plane, options);
  }
};

export function buildPointVerticalRunnerFormSections(_options: {
  getParams: () => PointVerticalRunnerParams;
  updateParams: (patch: Partial<PointVerticalRunnerParams>) => void;
}): GateFormSection[] {
  return [
    {
      key: "pointVerticalRunnerRunner",
      titleKey: "modelai.pointVerticalRunner.runnerSection",
      fields: [
        {
          key: "runnerTemplate",
          prop: "runnerTemplate",
          labelKey: "modelai.verticalRunner.templateLabel",
          kind: "select",
          options: [
            { value: "D3", labelKey: "modelai.verticalRunner.template.D3" },
            { value: "D4", labelKey: "modelai.verticalRunner.template.D4" },
            { value: "D5", labelKey: "modelai.verticalRunner.template.D5" }
          ]
        },
        {
          key: "runnerDiameterStart",
          prop: "runnerDiameterStart",
          labelKey: "modelai.verticalRunner.diameterStart",
          kind: "number",
          min: 0.1,
          max: 50,
          step: 0.5,
          controls: true
        },
        {
          key: "runnerDiameterEnd",
          prop: "runnerDiameterEnd",
          labelKey: "modelai.verticalRunner.diameterEnd",
          kind: "number",
          min: 0.1,
          max: 50,
          step: 0.5,
          controls: true
        }
      ]
    },
    {
      key: "pointVerticalRunnerGate",
      titleKey: "modelai.pointVerticalRunner.gateSection",
      fields: [
        {
          key: "gateTemplate",
          prop: "gateTemplate",
          labelKey: "modelai.pinPointGate.templateLabel",
          kind: "select",
          options: [
            { value: "P0.6", labelKey: "modelai.pinPointGate.template.P0_6" },
            { value: "P0.8", labelKey: "modelai.pinPointGate.template.P0_8" },
            { value: "P1.0", labelKey: "modelai.pinPointGate.template.P1_0" },
            { value: "P1.2", labelKey: "modelai.pinPointGate.template.P1_2" },
            { value: "P1.4", labelKey: "modelai.pinPointGate.template.P1_4" },
            { value: "P1.6", labelKey: "modelai.pinPointGate.template.P1_6" }
          ]
        },
        {
          key: "gateDiameter",
          prop: "gateDiameter",
          labelKey: "modelai.pinPointGate.diameter",
          kind: "number",
          min: 0.1,
          max: 50,
          step: 0.1
        },
        {
          key: "gateAngle",
          prop: "gateAngle",
          labelKey: "modelai.pinPointGate.angle",
          kind: "number",
          min: 1,
          max: 89,
          step: 0.1
        },
        {
          key: "gateLength",
          prop: "gateLength",
          labelKey: "modelai.pinPointGate.length",
          kind: "number",
          min: 0.1,
          max: 50,
          step: 0.1
        }
      ]
    }
  ];
}

function isPointVerticalRunnerSemanticHandleEnabled(): boolean {
  const value = (globalThis as Record<string, unknown>)[
    "__MODELAI_POINT_VERTICAL_RUNNER_HANDLE_TOOL__"
  ];
  return value !== false && value !== "0";
}

type PointVerticalRunnerSemanticHandleContext = SemanticHandleTarget & {
  getParams(): PointVerticalRunnerParams;
  updateParams(params: PointVerticalRunnerParams): void;
};

type PointVerticalRunnerSemanticHandleTarget =
  PointVerticalRunnerSemanticHandleContext;

const pointVerticalRunnerDebugObjectIds = new WeakMap<object, string>();
const pointVerticalRunnerDebugObjectCounters: Record<string, number> = {};

function pointVerticalRunnerDebugObjectId(
  prefix: string,
  value: object | undefined
): string {
  if (!value) return `${prefix}#none`;
  const current = pointVerticalRunnerDebugObjectIds.get(value);
  if (current) return current;
  const nextNumber = (pointVerticalRunnerDebugObjectCounters[prefix] ?? 0) + 1;
  pointVerticalRunnerDebugObjectCounters[prefix] = nextNumber;
  const next = `${prefix}#${nextNumber}`;
  pointVerticalRunnerDebugObjectIds.set(value, next);
  return next;
}

function pointVerticalRunnerDebugPoint(point: XYZ): {
  x: number;
  y: number;
  z: number;
} {
  return {
    x: point.x,
    y: point.y,
    z: point.z
  };
}

type PointVerticalRunnerSemanticHandleConfig = {
  debugLabel?: string;
  snapFilter?: (shape: VisualShapeData) => boolean;
  onOriginDrag?: (newOrigin: XYZ, plane: Plane) => XYZ | void;
  onAxisDragStart?: (
    axis: "X" | "Y" | "Z",
    axisDir: XYZ,
    curOrigin: XYZ
  ) => void;
  onAxisDrag?: (axis: "X" | "Y" | "Z", axisDir: XYZ, delta: number) => void;
};

export type PointVerticalRunnerSemanticHandleToolOptions = {
  document: IDocument;
  controller: AsyncController;
  origin: XYZ;
  plane: Plane;
  config: PointVerticalRunnerSemanticHandleConfig;
  view?: ThreeView;
  nodeBinding: NodeEditBinding<
    PointVerticalRunnerParams,
    PointVerticalRunnerNode
  >;
};

function runnerEndPoint(
  origin: XYZ,
  plane: Plane,
  params: PointVerticalRunnerParams
): XYZ {
  if (!isFiniteXYZ(origin)) {
    return new XYZ(0, 0, safePushPlatePlaneZ(params));
  }
  const resolved = resolvePointVerticalRunnerEndPoint(
    plane.translateTo(origin),
    params
  );
  return isFiniteXYZ(resolved)
    ? resolved
    : new XYZ(origin.x, origin.y, safePushPlatePlaneZ(params));
}

function gateAngleFromRunnerEndPoint(
  origin: XYZ,
  plane: Plane,
  point: XYZ,
  params: PointVerticalRunnerParams
): number | undefined {
  if (
    !isFiniteXYZ(origin) ||
    !isFiniteXYZ(point) ||
    !isFiniteXYZ(plane.normal)
  ) {
    return undefined;
  }

  const constrainedEnd = new XYZ(point.x, point.y, safePushPlatePlaneZ(params));
  const direction = safeUnit(constrainedEnd.sub(origin));
  if (!direction) return undefined;
  const normal = safeUnit(plane.normal);
  if (!normal) return undefined;
  const axial = direction.dot(normal);
  const radial = direction.sub(normal.multiply(axial)).length();
  const angle = MathUtils.radToDeg(Math.atan2(radial, Math.abs(axial)));
  return Number.isFinite(angle) ? angle : undefined;
}

function planeFromRunnerEndPoint(
  origin: XYZ,
  plane: Plane,
  point: XYZ,
  params: PointVerticalRunnerParams
): Plane | undefined {
  if (
    !isFiniteXYZ(origin) ||
    !isFiniteXYZ(point) ||
    !isFiniteXYZ(plane.normal)
  ) {
    return undefined;
  }

  const constrainedEnd = new XYZ(point.x, point.y, safePushPlatePlaneZ(params));
  const normal = safeUnit(plane.normal);
  if (!normal) return undefined;
  const direction = safeUnit(constrainedEnd.sub(origin));
  if (!direction) return undefined;

  const axial = direction.dot(normal);
  const radial = safeUnit(direction.sub(normal.multiply(axial)));
  if (!radial) return undefined;

  return new Plane(origin, normal, radial);
}

export class PointVerticalRunnerSemanticHandleTool
  implements SemanticHandlePlacementHandler
{
  private readonly bodyTool: SemanticHandleTool;
  private readonly endTool: SemanticHandleTool;
  private activePointerTool?: SemanticHandleTool;

  get isEnabled() {
    return this.bodyTool.isEnabled;
  }

  set isEnabled(value: boolean) {
    this.bodyTool.isEnabled = value;
    this.endTool.isEnabled = value;
  }

  get lastView() {
    return (
      this.activePointerTool?.lastView ??
      this.bodyTool.lastView ??
      this.endTool.lastView
    );
  }

  constructor(
    document: IDocument,
    controller: AsyncController,
    origin: XYZ,
    plane: Plane,
    config: PointVerticalRunnerSemanticHandleConfig,
    nodeBinding: NodeEditBinding<
      PointVerticalRunnerParams,
      PointVerticalRunnerNode
    >,
    view?: ThreeView
  ) {
    void origin;
    void plane;
    const initialPlane = nodeBinding.getPlane();
    const initialParams = normalizePointVerticalRunnerParams(
      nodeBinding.getParams()
    );
    nodeBinding.setParams(initialParams);
    let axisDragStartOrigin = initialPlane.origin;
    let endAxisDragStartPoint = runnerEndPoint(
      initialPlane.origin,
      initialPlane,
      initialParams
    );
    let planeDragStartOrigin = initialPlane.origin;
    const getCurrentPlane = () => nodeBinding.getPlane();
    const getCurrentOrigin = () => getCurrentPlane().origin;
    const getCurrentParams = () =>
      normalizePointVerticalRunnerParams(nodeBinding.getParams());
    const applyPlacement = (nextOrigin: XYZ, nextPlane: Plane) => {
      let currentPlane = nextPlane;
      const constrained = config.onOriginDrag?.(nextOrigin, nextPlane);
      if (constrained) {
        currentPlane = nextPlane.translateTo(constrained);
      }
      debugPointVerticalRunnerEditorEvent("semantic-drag:plane", {
        source: "semantic-handle",
        write: "binding:plane",
        node: pointVerticalRunnerDebugObjectId("node", nodeBinding.getNode()),
        binding: pointVerticalRunnerDebugObjectId("binding", nodeBinding),
        nextOrigin: pointVerticalRunnerDebugPoint(nextOrigin),
        appliedOrigin: pointVerticalRunnerDebugPoint(currentPlane.origin),
        nodeObject: nodeBinding.getNode(),
        bindingObject: nodeBinding
      });
      nodeBinding.setPlane(currentPlane);
    };
    const applyParams = (params: PointVerticalRunnerParams) => {
      const nextParams = normalizePointVerticalRunnerParams(params);
      debugPointVerticalRunnerEditorEvent("semantic-drag:params", {
        source: "semantic-handle",
        write: "binding:params",
        node: pointVerticalRunnerDebugObjectId("node", nodeBinding.getNode()),
        binding: pointVerticalRunnerDebugObjectId("binding", nodeBinding),
        params: nextParams,
        nodeObject: nodeBinding.getNode(),
        bindingObject: nodeBinding
      });
      nodeBinding.setParams(nextParams);
    };
    const applyState = (
      nextPlane: Plane,
      nextParams: PointVerticalRunnerParams
    ) => {
      const normalizedParams = normalizePointVerticalRunnerParams(nextParams);
      debugPointVerticalRunnerEditorEvent("semantic-drag:params", {
        source: "semantic-handle",
        write: "binding:params",
        node: pointVerticalRunnerDebugObjectId("node", nodeBinding.getNode()),
        binding: pointVerticalRunnerDebugObjectId("binding", nodeBinding),
        params: normalizedParams,
        origin: pointVerticalRunnerDebugPoint(nextPlane.origin),
        nodeObject: nodeBinding.getNode(),
        bindingObject: nodeBinding
      });
      nodeBinding.applyState({
        params: normalizedParams,
        plane: nextPlane
      });
    };
    const applyAxisPlacement = (
      axis: "X" | "Y" | "Z",
      direction: XYZ,
      delta: number
    ) => {
      config.onAxisDrag?.(axis, direction, delta);
      const nextOrigin = axisDragStartOrigin.add(direction.multiply(delta));
      applyPlacement(nextOrigin, getCurrentPlane().translateTo(nextOrigin));
    };
    const applyEndPoint = (point: XYZ) => {
      const currentPlane = getCurrentPlane();
      const currentOrigin = currentPlane.origin;
      const currentParams = getCurrentParams();
      const gateAngle = gateAngleFromRunnerEndPoint(
        currentOrigin,
        currentPlane,
        point,
        currentParams
      );
      if (gateAngle === undefined) return;
      const nextParams = normalizePointVerticalRunnerParams({
        ...currentParams,
        gateAngle
      });
      const nextPlane =
        planeFromRunnerEndPoint(
          currentOrigin,
          currentPlane,
          point,
          nextParams
        ) ?? currentPlane;
      applyState(nextPlane, nextParams);
      this.refreshPreview();
    };
    const target: PointVerticalRunnerSemanticHandleTarget = {
      getOrigin: getCurrentOrigin,
      getPlane: getCurrentPlane,
      getDragGhostNode: () => nodeBinding.getNode(),
      getParams: getCurrentParams,
      updateParams: applyParams
    };
    const endTarget: SemanticHandleTarget = {
      getOrigin: () =>
        runnerEndPoint(
          getCurrentOrigin(),
          getCurrentPlane(),
          getCurrentParams()
        ),
      getPlane: () =>
        pushPlatePlane(getCurrentParams()).translateTo(
          runnerEndPoint(
            getCurrentOrigin(),
            getCurrentPlane(),
            getCurrentParams()
          )
        ),
      getDragGhostNode: () => nodeBinding.getNode()
    };

    this.bodyTool = new SemanticHandleTool(
      document,
      controller,
      createSemanticHandleToolConfig({
        dragGhost: true,
        pointMove: {
          createPointData: () => ({
            filter: config.snapFilter
          }),
          onDrag: point => {
            applyPlacement(point, getCurrentPlane().translateTo(point));
          }
        },
        planeMoves: [
          {
            normal: "X",
            onDragStart: ctx => {
              planeDragStartOrigin = ctx.origin;
            },
            onDrag: delta => {
              const nextOrigin = planeDragStartOrigin.add(delta);
              applyPlacement(
                nextOrigin,
                getCurrentPlane().translateTo(nextOrigin)
              );
            }
          },
          {
            normal: "Y",
            onDragStart: ctx => {
              planeDragStartOrigin = ctx.origin;
            },
            onDrag: delta => {
              const nextOrigin = planeDragStartOrigin.add(delta);
              applyPlacement(
                nextOrigin,
                getCurrentPlane().translateTo(nextOrigin)
              );
            }
          },
          {
            normal: "Z",
            onDragStart: ctx => {
              planeDragStartOrigin = ctx.origin;
            },
            onDrag: delta => {
              const nextOrigin = planeDragStartOrigin.add(delta);
              applyPlacement(
                nextOrigin,
                getCurrentPlane().translateTo(nextOrigin)
              );
            }
          }
        ],
        rotation: false,
        axisMoves: [
          {
            axis: "X",
            onDragStart: ctx => {
              axisDragStartOrigin = ctx.origin;
              config.onAxisDragStart?.("X", ctx.plane.xvec, ctx.origin);
            },
            onDrag: (delta, ctx) => {
              applyAxisPlacement("X", ctx.plane.xvec, delta);
            }
          },
          {
            axis: "Y",
            onDragStart: ctx => {
              axisDragStartOrigin = ctx.origin;
              config.onAxisDragStart?.("Y", ctx.plane.yvec, ctx.origin);
            },
            onDrag: (delta, ctx) => {
              applyAxisPlacement("Y", ctx.plane.yvec, delta);
            }
          },
          {
            axis: "Z",
            onDragStart: ctx => {
              axisDragStartOrigin = ctx.origin;
              config.onAxisDragStart?.("Z", ctx.plane.normal, ctx.origin);
            },
            onDrag: (delta, ctx) => {
              applyAxisPlacement("Z", ctx.plane.normal, delta);
            }
          }
        ],
        onDragFrame: () => this.refreshPreview()
      }),
      view
    );
    this.bodyTool.attach(target);

    this.endTool = new SemanticHandleTool(
      document,
      controller,
      createSemanticHandleToolConfig({
        dragGhost: true,
        pointMove: {
          inputAxes: ["x", "y"],
          snap: {
            fallback: {
              type: "plane",
              plane: (ctx: SemanticHandleContext) =>
                pushPlatePlane(getCurrentParams()).translateTo(ctx.origin)
            },
            createPointData: () => ({
              dimension: Dimension.D1D2,
              filter: config.snapFilter,
              shapeHitFallback: true,
              preview: (point, snaped) =>
                buildPointVerticalRunnerProjectionHelperMeshes(
                  point,
                  point
                    ? projectPointVerticalRunnerEndPoint(
                        point,
                        getCurrentParams()
                      )
                    : undefined,
                  snaped
                )
            })
          },
          onDrag: point => {
            applyEndPoint(point);
          }
        },
        axisMoves: [
          {
            axis: "X",
            onDragStart: ctx => {
              endAxisDragStartPoint = ctx.origin;
            },
            onDrag: (delta, ctx) => {
              applyEndPoint(
                endAxisDragStartPoint.add(ctx.plane.xvec.multiply(delta))
              );
            },
            onClick: (showInput, ctx) => {
              showInput("0.00", value => {
                applyEndPoint(ctx.origin.add(ctx.plane.xvec.multiply(value)));
              });
            }
          },
          {
            axis: "Y",
            onDragStart: ctx => {
              endAxisDragStartPoint = ctx.origin;
            },
            onDrag: (delta, ctx) => {
              applyEndPoint(
                endAxisDragStartPoint.add(ctx.plane.yvec.multiply(delta))
              );
            },
            onClick: (showInput, ctx) => {
              showInput("0.00", value => {
                applyEndPoint(ctx.origin.add(ctx.plane.yvec.multiply(value)));
              });
            }
          }
        ],
        planeMoves: false,
        rotation: false,
        onDragFrame: () => this.refreshPreview()
      }),
      view
    );
    this.endTool.attach(endTarget);
  }

  dispose(): void {
    this.bodyTool.dispose();
    this.endTool.dispose();
    this.activePointerTool = undefined;
  }

  refreshPreview(): void {
    this.bodyTool.refreshPreview();
    this.endTool.refreshPreview();
  }

  pointerMove(view: import("@modelai/core").IView, event: PointerEvent): void {
    const tool = this.activePointerTool ?? this.resolvePointerTool(view, event);
    if (!this.activePointerTool) {
      this.clearInactiveHover(tool);
    }
    tool?.pointerMove(view, event);
  }

  pointerDown(view: import("@modelai/core").IView, event: PointerEvent): void {
    const tool = this.resolvePointerTool(view, event);
    this.activePointerTool = tool;
    tool?.pointerDown(view, event);
  }

  pointerUp(view: import("@modelai/core").IView, event: PointerEvent): void {
    this.activePointerTool?.pointerUp(view, event);
    this.activePointerTool = undefined;
  }

  pointerOut(view: import("@modelai/core").IView, event: PointerEvent): void {
    this.bodyTool.pointerOut?.(view, event);
    this.endTool.pointerOut?.(view, event);
  }

  mouseWheel(view: import("@modelai/core").IView, event: WheelEvent): void {
    this.bodyTool.mouseWheel?.(view, event);
    this.endTool.mouseWheel?.(view, event);
  }

  keyDown(view: import("@modelai/core").IView, event: KeyboardEvent): void {
    this.bodyTool.keyDown?.(view, event);
    this.endTool.keyDown?.(view, event);
  }

  private resolvePointerTool(
    view: import("@modelai/core").IView,
    event: PointerEvent
  ): SemanticHandleTool | undefined {
    return SemanticHandleTool.pickTool(
      [this.bodyTool, this.endTool],
      view,
      event
    )?.tool;
  }

  private clearInactiveHover(activeTool?: SemanticHandleTool): void {
    if (activeTool !== this.bodyTool) this.bodyTool.clearHover();
    if (activeTool !== this.endTool) this.endTool.clearHover();
  }
}

export function shouldUsePointVerticalRunnerSemanticHandleTool(): boolean {
  return isPointVerticalRunnerSemanticHandleEnabled();
}

export function createPointVerticalRunnerSemanticHandleTool(
  options: PointVerticalRunnerSemanticHandleToolOptions
): SemanticHandlePlacementHandler {
  if (!shouldUsePointVerticalRunnerSemanticHandleTool()) {
    throw new Error("Point vertical runner semantic handle tool is disabled");
  }
  return new PointVerticalRunnerSemanticHandleTool(
    options.document,
    options.controller,
    options.origin,
    options.plane,
    options.config,
    options.nodeBinding,
    options.view
  );
}

type PointVerticalRunnerEditorLifecycle = {
  kind: "create" | "edit";
  debugLabel: string;
  confirm(runtime: PointVerticalRunnerEditorRuntime): void;
  cancel(runtime: PointVerticalRunnerEditorRuntime): void;
};

type RunPointVerticalRunnerEditorOptions = {
  document: IDocument;
  controller: AsyncController;
  node: PointVerticalRunnerNode;
  lifecycle: PointVerticalRunnerEditorLifecycle;
};

export type PointVerticalRunnerEditorHandle = {
  readonly document: IDocument;
  readonly node: PointVerticalRunnerNode;
  readonly controller: AsyncController;
  readonly runtime: PointVerticalRunnerEditorRuntime;
  wait(): Promise<boolean>;
  confirm(): void;
  cancel(): void;
  dispose(): void;
};

function isPointVerticalRunnerEditorDebugEnabled(): boolean {
  const value = (globalThis as Record<string, unknown>)[
    "__MODELAI_POINT_VERTICAL_RUNNER_EDITOR_DEBUG__"
  ];
  return value === true || value === "1";
}

export function debugPointVerticalRunnerEditorEvent(
  event: string,
  payload: Record<string, unknown>
): void {
  if (!isPointVerticalRunnerEditorDebugEnabled()) return;
  console.info("[PointVerticalRunnerEditorRuntime]", event, payload);
}

function debugPointVerticalRunnerEditor(
  event: string,
  runtime: PointVerticalRunnerEditorRuntime,
  extra?: Record<string, unknown>
): void {
  const state = runtime.getDebugState();
  debugPointVerticalRunnerEditorEvent(event, {
    shell: state.shell,
    runtime: pointVerticalRunnerDebugObjectId("runtime", runtime),
    node: pointVerticalRunnerDebugObjectId("node", state.node),
    binding: pointVerticalRunnerDebugObjectId("binding", state.binding),
    nodeObject: state.node,
    bindingObject: state.binding,
    ...extra
  });
}

export function createPointVerticalRunnerEditorRuntime(options: {
  document: IDocument;
  node: PointVerticalRunnerNode;
  lifecycle: PointVerticalRunnerEditorLifecycle;
}): PointVerticalRunnerEditorRuntime {
  return new PointVerticalRunnerEditorRuntime(
    options.document,
    options.node,
    options.lifecycle
  );
}

export function startPointVerticalRunnerEditor(options: {
  document: IDocument;
  controller?: AsyncController;
  node: PointVerticalRunnerNode;
  lifecycle: PointVerticalRunnerEditorLifecycle;
}): PointVerticalRunnerEditorHandle {
  const controller = options.controller ?? new AsyncController();
  options.document.selection.clearSelection();
  options.document.visual.highlighter.clear();
  options.document.visual.update();
  const runtime = createPointVerticalRunnerEditorRuntime({
    document: options.document,
    node: options.node,
    lifecycle: options.lifecycle
  });
  const registration = runtime.createFormKitRegistration(controller);
  const unmount = mountFormKit(registration);
  const handler = runtime.attachHandle(controller);
  let disposed = false;

  debugPointVerticalRunnerEditor("start", runtime, {
    controller: pointVerticalRunnerDebugObjectId("controller", controller),
    handler: pointVerticalRunnerDebugObjectId("handler", handler),
    handlerObject: handler
  });

  controller.onCompleted(() => {
    runtime.confirm();
  });
  controller.onCancelled(() => {
    runtime.cancel();
  });

  const pickPromise = options.document.selection.pickAsync(
    handler,
    "",
    controller,
    false,
    "default"
  );

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    debugPointVerticalRunnerEditor("dispose:start", runtime);
    unmount();
    runtime.dispose();
    if (!options.controller) controller.dispose();
    debugPointVerticalRunnerEditor("dispose:done", runtime);
  };

  const wait = async () => {
    try {
      await pickPromise;
      return controller.result?.status === "success";
    } finally {
      dispose();
    }
  };

  return {
    document: options.document,
    node: options.node,
    controller,
    runtime,
    wait,
    confirm: () => controller.success(),
    cancel: () => controller.cancel(),
    dispose
  };
}

export async function runPointVerticalRunnerEditor(
  options: RunPointVerticalRunnerEditorOptions
): Promise<boolean> {
  return startPointVerticalRunnerEditor({
    document: options.document,
    node: options.node,
    controller: options.controller,
    lifecycle: options.lifecycle
  }).wait();
}

export function createPointVerticalRunnerCreateLifecycle(options: {
  parent: INodeLinkedList;
}): PointVerticalRunnerEditorLifecycle {
  void options;
  return {
    kind: "create",
    debugLabel: "create point vertical runner",
    confirm(runtime) {
      debugPointVerticalRunnerEditor("confirm:create", runtime, {
        action: "keep-existing-node-for-command-commit"
      });
    },
    cancel(runtime) {
      const { document, node } = runtime;
      debugPointVerticalRunnerEditor("cancel:create", runtime, {
        action: "remove-visual-and-dispose-node"
      });
      document.visual.context.removeNode([node]);
      node.parent = undefined;
      node.dispose();
      document.visual.update();
    }
  };
}

export function commitCreatedPointVerticalRunnerNode(options: {
  document: IDocument;
  node: PointVerticalRunnerNode;
  parent: INodeLinkedList;
}): void {
  debugPointVerticalRunnerEditorEvent("commit:create", {
    shell: "create",
    node: pointVerticalRunnerDebugObjectId("node", options.node),
    parent: pointVerticalRunnerDebugObjectId("parent", options.parent),
    nodeObject: options.node,
    parentObject: options.parent
  });
  options.document.visual.context.removeNode([options.node]);
  resolveNodeParentWithRunnerRootGrouping(
    options.document,
    options.node,
    options.parent
  ).add(options.node);
  options.document.visual.update();
}

export function createPointVerticalRunnerEditLifecycle(): PointVerticalRunnerEditorLifecycle {
  return {
    kind: "edit",
    debugLabel: "edit point vertical runner params",
    confirm(runtime) {
      debugPointVerticalRunnerEditor("confirm:edit", runtime);
      runtime.pushEditHistory();
    },
    cancel(runtime) {
      debugPointVerticalRunnerEditor("cancel:edit", runtime, {
        action: "restore-initial-snapshot"
      });
      runtime.restoreInitialState();
    }
  };
}

export class PointVerticalRunnerEditorRuntime extends Observable {
  readonly nodeBinding: NodeEditBinding<
    PointVerticalRunnerParams,
    PointVerticalRunnerNode
  >;
  readonly initialParams: PointVerticalRunnerParams;
  readonly initialPlane: Plane;
  private params: PointVerticalRunnerParams;
  private handler?: SemanticHandlePlacementHandler;
  private releaseBinding?: () => void;
  private applyingToBinding = false;
  private completed = false;
  private readonly handlePushPlatePlaneChanged = (
    document: IDocument,
    z: number
  ) => {
    if (document !== this.document) return;
    const nextParams = normalizePointVerticalRunnerParams({
      ...this.params,
      pushPlatePlaneZ: z
    });
    if (!hasGateParamsChanged(this.params, nextParams)) return;
    debugPointVerticalRunnerEditor("push-plate:changed", this, {
      z,
      write: "binding:params"
    });
    this.setParams(nextParams, { syncPushPlatePlane: false });
  };

  constructor(
    readonly document: IDocument,
    readonly node: PointVerticalRunnerNode,
    private readonly lifecycle: PointVerticalRunnerEditorLifecycle
  ) {
    super();
    this.nodeBinding = bindNodeForEdit(node, pointVerticalRunnerNodeAdapter);
    const initialParams = normalizePointVerticalRunnerParams(
      this.nodeBinding.getParams()
    );
    this.initialParams = cloneGateParams(initialParams);
    this.initialPlane = cloneGatePlane(this.nodeBinding.getPlane());
    this.params = cloneGateParams(initialParams);
    this.nodeBinding.setParams(initialParams);
    this.releaseBinding = this.nodeBinding.subscribe(() => {
      if (this.applyingToBinding) return;
      this.syncFromBinding();
    });
    PubSub.default.sub(
      "pushPlatePlaneChanged",
      this.handlePushPlatePlaneChanged
    );
    debugPointVerticalRunnerEditor("runtime:create", this);
  }

  getParams(): PointVerticalRunnerParams {
    return cloneGateParams(this.params);
  }

  setParams(
    next: PointVerticalRunnerParams,
    options?: { syncPushPlatePlane?: boolean }
  ): void {
    let nextParams = normalizePointVerticalRunnerParams(cloneGateParams(next));
    this.applyingToBinding = true;
    try {
      this.nodeBinding.setParams(nextParams);
      nextParams = normalizePointVerticalRunnerParams(
        this.nodeBinding.getParams()
      );
    } finally {
      this.applyingToBinding = false;
    }
    const changed = hasGateParamsChanged(this.params, nextParams);
    debugPointVerticalRunnerEditor("form:write-params", this, {
      write: "binding:params",
      changed,
      params: nextParams
    });
    if (!changed) return;
    this.params = cloneGateParams(nextParams);
    void options;
    this.handler?.refreshPreview();
    this.emitPropertyChanged("params", undefined);
  }

  createFormKitRegistration(controller: AsyncController): FormKitRegistration {
    debugPointVerticalRunnerEditor("form:mount", this, {
      controller: pointVerticalRunnerDebugObjectId("controller", controller),
      controllerObject: controller
    });
    const sections = buildPointVerticalRunnerFormSections({
      getParams: () => this.getParams(),
      updateParams: patch => {
        this.setParams(
          normalizePointVerticalRunnerParams({
            ...this.params,
            ...patch
          })
        );
      }
    });
    return createGateFormKitRegistration({
      formKitId: "pointVerticalRunner",
      titleKey: "modelai.pointVerticalRunner.group",
      sections,
      controller,
      owner: this,
      getValue: prop => this.getFieldValue(prop),
      setValue: (prop, value) => this.setFieldValue(prop, value)
    });
  }

  attachHandle(controller: AsyncController): SemanticHandlePlacementHandler {
    if (this.handler) return this.handler;
    const plane = cloneGatePlane(this.nodeBinding.getPlane());
    const activeView =
      (this.document.application.activeView as ThreeView | undefined) ??
      undefined;
    const handler = createPointVerticalRunnerSemanticHandleTool({
      document: this.document,
      controller,
      origin: plane.origin,
      plane,
      config: {
        debugLabel: this.lifecycle.debugLabel
      },
      view: activeView,
      nodeBinding: this.nodeBinding
    });
    this.handler = handler;
    debugPointVerticalRunnerEditor("handle:attach", this, {
      handler: pointVerticalRunnerDebugObjectId("handler", handler),
      handlerObject: handler
    });
    return handler;
  }

  attachGizmo(controller: AsyncController): void {
    const handler = this.attachHandle(controller);
    void this.document.selection.pickAsync(
      handler,
      "",
      controller,
      false,
      "default"
    );
  }

  confirm(): void {
    if (this.completed) return;
    this.completed = true;
    debugPointVerticalRunnerEditor("runtime:confirm", this);
    this.lifecycle.confirm(this);
  }

  cancel(): void {
    if (this.completed) return;
    this.completed = true;
    debugPointVerticalRunnerEditor("runtime:cancel", this);
    this.lifecycle.cancel(this);
  }

  pushEditHistory(): void {
    const afterParams = this.getParams();
    const afterPlane = cloneGatePlane(this.nodeBinding.getPlane());
    const beforeComparableParams = {
      ...this.initialParams,
      pushPlatePlaneZ: afterParams.pushPlatePlaneZ
    };
    const paramsChanged = hasGateParamsChanged(
      beforeComparableParams,
      afterParams
    );
    const planeChanged = hasGatePlaneChanged(this.initialPlane, afterPlane);
    debugPointVerticalRunnerEditor("history:check", this, {
      paramsChanged,
      planeChanged,
      action: paramsChanged || planeChanged ? "push" : "skip"
    });
    if (!paramsChanged && !planeChanged) return;
    Transaction.addToHistory(
      this.document,
      new GateParamsHistoryRecord({
        name: "edit point vertical runner params",
        node: this.node,
        adapter: pointVerticalRunnerNodeAdapter,
        before: beforeComparableParams,
        after: afterParams,
        beforePlane: planeChanged ? this.initialPlane : undefined,
        afterPlane: planeChanged ? afterPlane : undefined
      })
    );
  }

  restoreInitialState(): void {
    const currentPushPlatePlaneZ = Number(this.document.pushPlatePlane.z);
    const params = normalizePointVerticalRunnerParams({
      ...cloneGateParams(this.initialParams),
      pushPlatePlaneZ: currentPushPlatePlaneZ
    });
    debugPointVerticalRunnerEditor("snapshot:restore", this, {
      params,
      origin: pointVerticalRunnerDebugPoint(this.initialPlane.origin)
    });
    this.applyingToBinding = true;
    try {
      this.nodeBinding.restore({
        params,
        plane: cloneGatePlane(this.initialPlane)
      });
    } finally {
      this.applyingToBinding = false;
    }
    this.params = cloneGateParams(params);
    this.handler?.refreshPreview();
    this.emitPropertyChanged("params", undefined);
  }

  getDebugState() {
    return {
      shell: this.lifecycle.kind,
      node: this.node,
      binding: this.nodeBinding
    };
  }

  protected override disposeInternal(): void {
    PubSub.default.remove(
      "pushPlatePlaneChanged",
      this.handlePushPlatePlaneChanged
    );
    this.releaseBinding?.();
    this.releaseBinding = undefined;
    this.handler?.dispose();
    this.handler = undefined;
    super.disposeInternal();
  }

  private getFieldValue(prop: string): unknown {
    return this.params[prop as keyof PointVerticalRunnerParams];
  }

  private setFieldValue(prop: string, value: unknown): void {
    if (prop === "gateTemplate") {
      const gateTemplate = value as PinPointGateTemplate;
      this.setParams(
        normalizePointVerticalRunnerParams({
          ...this.params,
          gateTemplate,
          ...getPointVerticalRunnerGateTemplateValues(gateTemplate)
        })
      );
      return;
    }

    if (prop === "runnerTemplate") {
      const runnerTemplate = value as VerticalRunnerTemplate;
      this.setParams(
        normalizePointVerticalRunnerParams({
          ...this.params,
          runnerTemplate,
          ...getPointVerticalRunnerRunnerTemplateValues(runnerTemplate)
        })
      );
      return;
    }

    this.setParams(
      normalizePointVerticalRunnerParams({
        ...this.params,
        [prop]: value
      } as PointVerticalRunnerParams)
    );
  }

  private syncFromBinding(): void {
    const nextParams = normalizePointVerticalRunnerParams(
      this.nodeBinding.getParams()
    );
    const paramsChanged = hasGateParamsChanged(this.params, nextParams);
    debugPointVerticalRunnerEditor("binding:changed", this, {
      paramsChanged,
      params: nextParams,
      origin: pointVerticalRunnerDebugPoint(this.nodeBinding.getPlane().origin)
    });
    if (paramsChanged) {
      this.params = cloneGateParams(nextParams);
      this.emitPropertyChanged("params", undefined);
    }
    this.handler?.refreshPreview();
  }
}

export function createPointVerticalRunnerNode(
  plane: Plane,
  params: PointVerticalRunnerParams = createPointVerticalRunnerParams()
): PointVerticalRunnerNode {
  return pointVerticalRunnerNodeAdapter.createNode(
    transformI18n("modelai.body.pointVerticalRunner"),
    plane,
    params
  );
}
