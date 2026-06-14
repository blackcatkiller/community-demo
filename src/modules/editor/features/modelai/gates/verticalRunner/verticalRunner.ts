// @ts-nocheck
import {
  Observable,
  Precision,
  PubSub,
  Transaction,
  type AsyncController
} from "@modelai/core";
import { MathUtils, XYZ } from "@modelai/core/math";
import { Result } from "@modelai/core/result";
import type { IDocument, INode, ShapeMeshData } from "@modelai/core/types";
import type { FormKitRegistration } from "@modelai/ui/formKit/runtime";
import {
  buildGuideEdgeMeshes,
  buildLineGuide,
  type FeatureGeometryResult
} from "@/features/modelai/geometry/featureGeometry";
import { pushShapeMesh } from "@/features/modelai/geometry/gateShapeUtils";
import { ReferenceInstanceNode } from "@modelai/model/referenceInstanceNode";
import { ShapeNode } from "@modelai/model/shapeNode";
import { HotTipGateNode } from "../hotTip/hotTipGate";
import { PinPointGateNode } from "../pinPoint/pinPointGate";
import { buildVerticalRunnerShapeB } from "../shared/gateBodyBuilders";
import {
  createGateFormKitRegistration,
  type GateFormSection
} from "../shared/formKit";
import {
  cloneGateParams,
  hasGateParamsChanged,
  NodeParamsHistoryRecord
} from "../shared/gateParamsHistory";

import type { VerticalRunnerNode } from "./verticalRunnerNode";
export { VerticalRunnerNode } from "./verticalRunnerNode";
const VERTICAL_RUNNER_GATE_OVERLAP = 0.5;

export type VerticalRunnerTemplate = "D3" | "D4" | "D5";

export type VerticalRunnerParams = {
  template: VerticalRunnerTemplate;
  diameterStart: number;
  diameterEnd: number;
  pushPlatePlaneZ: number;
};

export type VerticalRunnerTarget = {
  start: XYZ;
  direction: XYZ;
  gateNode?: VerticalRunnerGateNode;
  resolvedGateNode?: ResolvedVerticalRunnerGateNode;
};

export type VerticalRunnerGateNode = ShapeNode | ReferenceInstanceNode;
type ResolvedVerticalRunnerGateNode = PinPointGateNode | HotTipGateNode;

type VerticalRunnerTemplateValues = Pick<
  VerticalRunnerParams,
  "diameterStart" | "diameterEnd"
>;

const VERTICAL_RUNNER_TEMPLATE_VALUES: Record<
  VerticalRunnerTemplate,
  VerticalRunnerTemplateValues
> = {
  D3: { diameterStart: 3, diameterEnd: 5 },
  D4: { diameterStart: 4, diameterEnd: 5 },
  D5: { diameterStart: 5, diameterEnd: 5 }
};

const DEFAULT_VERTICAL_RUNNER_PARAMS: VerticalRunnerParams = {
  template: "D3",
  diameterStart: VERTICAL_RUNNER_TEMPLATE_VALUES.D3.diameterStart,
  diameterEnd: VERTICAL_RUNNER_TEMPLATE_VALUES.D3.diameterEnd,
  pushPlatePlaneZ: 0
};

let lastVerticalRunnerParams: VerticalRunnerParams = {
  ...DEFAULT_VERTICAL_RUNNER_PARAMS
};

export function getVerticalRunnerTemplateValues(
  template: VerticalRunnerTemplate
): VerticalRunnerTemplateValues {
  return { ...VERTICAL_RUNNER_TEMPLATE_VALUES[template] };
}

function isVerticalRunnerTemplate(
  value: unknown
): value is VerticalRunnerTemplate {
  return value === "D3" || value === "D4" || value === "D5";
}

function resolveTemplateByDiameter(
  diameterStart: number,
  diameterEnd: number
): VerticalRunnerTemplate | undefined {
  return (
    Object.keys(VERTICAL_RUNNER_TEMPLATE_VALUES) as VerticalRunnerTemplate[]
  ).find(
    template =>
      VERTICAL_RUNNER_TEMPLATE_VALUES[template].diameterStart ===
        diameterStart &&
      VERTICAL_RUNNER_TEMPLATE_VALUES[template].diameterEnd === diameterEnd
  );
}

export function normalizeVerticalRunnerParams(
  params: VerticalRunnerParams
): VerticalRunnerParams {
  const rawTemplate = (params as { template?: unknown }).template;
  const legacyDiameter = (params as { diameter?: number | string }).diameter;
  const rawDiameterStart =
    (params as { diameterStart?: number | string }).diameterStart ??
    legacyDiameter;
  const rawDiameterEnd =
    (params as { diameterEnd?: number | string }).diameterEnd ??
    DEFAULT_VERTICAL_RUNNER_PARAMS.diameterEnd;
  const parsedDiameterStart =
    typeof rawDiameterStart === "number"
      ? rawDiameterStart
      : Number(rawDiameterStart);
  const parsedDiameterEnd =
    typeof rawDiameterEnd === "number"
      ? rawDiameterEnd
      : Number(rawDiameterEnd);
  const template =
    (isVerticalRunnerTemplate(rawTemplate) ? rawTemplate : undefined) ??
    (Number.isFinite(parsedDiameterStart) && Number.isFinite(parsedDiameterEnd)
      ? resolveTemplateByDiameter(parsedDiameterStart, parsedDiameterEnd)
      : undefined) ??
    DEFAULT_VERTICAL_RUNNER_PARAMS.template;
  const rawPushPlatePlaneZ =
    (params as { pushPlatePlaneZ?: number | string }).pushPlatePlaneZ ??
    (params as { planeZ?: number | string }).planeZ;
  const parsedPushPlatePlaneZ =
    typeof rawPushPlatePlaneZ === "number"
      ? rawPushPlatePlaneZ
      : Number(rawPushPlatePlaneZ);

  return {
    template,
    diameterStart: Math.max(
      0.1,
      Number.isFinite(parsedDiameterStart)
        ? parsedDiameterStart
        : VERTICAL_RUNNER_TEMPLATE_VALUES[template].diameterStart
    ),
    diameterEnd: Math.max(
      0.1,
      Number.isFinite(parsedDiameterEnd)
        ? parsedDiameterEnd
        : VERTICAL_RUNNER_TEMPLATE_VALUES[template].diameterEnd
    ),
    pushPlatePlaneZ: Number.isFinite(parsedPushPlatePlaneZ)
      ? parsedPushPlatePlaneZ
      : DEFAULT_VERTICAL_RUNNER_PARAMS.pushPlatePlaneZ
  };
}

export function createVerticalRunnerParams(
  pushPlatePlaneZ = 0
): VerticalRunnerParams {
  return normalizeVerticalRunnerParams({
    ...lastVerticalRunnerParams,
    pushPlatePlaneZ
  });
}

export function rememberVerticalRunnerParams(params: VerticalRunnerParams) {
  const normalized = normalizeVerticalRunnerParams(params);
  lastVerticalRunnerParams = {
    template: normalized.template,
    diameterStart: normalized.diameterStart,
    diameterEnd: normalized.diameterEnd,
    pushPlatePlaneZ: normalized.pushPlatePlaneZ
  };
}

function isResolvedVerticalRunnerGateNode(
  node: INode | undefined
): node is ResolvedVerticalRunnerGateNode {
  return node instanceof PinPointGateNode || node instanceof HotTipGateNode;
}

export function resolveVerticalRunnerStartOffset(params: VerticalRunnerParams) {
  const radius = normalizeVerticalRunnerParams(params).diameterStart / 2;
  return radius - VERTICAL_RUNNER_GATE_OVERLAP;
}

function resolvePinPointVerticalRunnerTarget(
  node: PinPointGateNode,
  runnerParams: VerticalRunnerParams
) {
  const gateParams = node.exportParams();
  const direction = node.plane.normal.normalize();
  const start = node.plane.origin.add(
    direction.multiply(
      gateParams.gateLength + resolveVerticalRunnerStartOffset(runnerParams)
    )
  );

  return {
    start,
    direction
  };
}

function resolveHotTipVerticalRunnerTarget(
  node: HotTipGateNode,
  runnerParams: VerticalRunnerParams
) {
  const gateParams = node.exportParams();
  const tiltAngleRad = MathUtils.degToRad(gateParams.tiltAngle);
  const bodyLength = gateParams.gateLength;
  const direction = node.plane.xvec
    .multiply(Math.sin(tiltAngleRad))
    .add(node.plane.normal.multiply(Math.cos(tiltAngleRad)))
    .normalize();
  const start = node.plane.origin.add(
    direction.multiply(
      bodyLength + resolveVerticalRunnerStartOffset(runnerParams)
    )
  );

  return {
    start,
    direction
  };
}

function resolveVerticalRunnerGateSource(
  document: IDocument,
  gateNode: VerticalRunnerGateNode
): ResolvedVerticalRunnerGateNode | undefined {
  if (gateNode instanceof ReferenceInstanceNode) {
    const sourceNode = document.modelManager.findNodes(
      node => node.id === gateNode.sourceNodeId
    )[0];
    if (!(sourceNode instanceof ShapeNode)) {
      return undefined;
    }
    const resolvedGateNode = sourceNode.resolvedShapeSource;
    return isResolvedVerticalRunnerGateNode(resolvedGateNode)
      ? resolvedGateNode
      : undefined;
  }

  const resolvedGateNode = gateNode.resolvedShapeSource;
  return isResolvedVerticalRunnerGateNode(resolvedGateNode)
    ? resolvedGateNode
    : undefined;
}

export function collectVerticalRunnerGateNodes(
  document: IDocument,
  nodes: INode[]
): VerticalRunnerGateNode[] {
  const result: VerticalRunnerGateNode[] = [];
  const seen = new Set<string>();

  for (const node of nodes) {
    if (seen.has(node.id)) {
      continue;
    }
    if (
      !(node instanceof ShapeNode || node instanceof ReferenceInstanceNode) ||
      !resolveVerticalRunnerGateSource(document, node)
    ) {
      continue;
    }
    seen.add(node.id);
    result.push(node);
  }

  return result;
}

export function resolveVerticalRunnerTargets(
  document: IDocument,
  gateNodes: VerticalRunnerGateNode[],
  params: VerticalRunnerParams = DEFAULT_VERTICAL_RUNNER_PARAMS
): VerticalRunnerTarget[] {
  const normalized = normalizeVerticalRunnerParams(params);
  return gateNodes.flatMap(gateNode => {
    const resolvedGateNode = resolveVerticalRunnerGateSource(
      document,
      gateNode
    );
    if (!resolvedGateNode) {
      return [];
    }

    const localTarget =
      resolvedGateNode instanceof PinPointGateNode
        ? resolvePinPointVerticalRunnerTarget(resolvedGateNode, normalized)
        : resolveHotTipVerticalRunnerTarget(resolvedGateNode, normalized);

    return [
      {
        start: gateNode.transform.ofPoint(localTarget.start),
        direction: gateNode.transform
          .ofVector(localTarget.direction)
          .normalize(),
        gateNode,
        resolvedGateNode
      }
    ];
  });
}

export function createPointVerticalRunnerTarget(
  point: XYZ,
  pushPlatePlaneZ: number
): VerticalRunnerTarget {
  return {
    start: point,
    direction: pushPlatePlaneZ >= point.z ? new XYZ(0, 0, 1) : new XYZ(0, 0, -1)
  };
}

export function resolveVerticalRunnerSegment(
  start: XYZ,
  direction: XYZ,
  params: VerticalRunnerParams
) {
  const next = normalizeVerticalRunnerParams(params);
  const dir = direction.normalize();
  if (Math.abs(dir.z) <= Precision.Distance) {
    return undefined;
  }

  const length = (next.pushPlatePlaneZ - start.z) / dir.z;
  if (!Number.isFinite(length) || length <= Precision.Distance) {
    return undefined;
  }

  return {
    start,
    end: start.add(dir.multiply(length)),
    length
  };
}

export function buildVerticalRunnerShape(
  start: XYZ,
  direction: XYZ,
  params: VerticalRunnerParams
) {
  const next = normalizeVerticalRunnerParams(params);
  const segment = resolveVerticalRunnerSegment(start, direction, next);
  if (!segment) {
    return Result.err("Vertical runner cannot reach the target plane");
  }

  return buildVerticalRunnerShapeB(segment.start, segment.end, next);
}

export function buildVerticalRunnerFeatureGeometry(
  start: XYZ,
  direction: XYZ,
  params: VerticalRunnerParams
): FeatureGeometryResult {
  const segment = resolveVerticalRunnerSegment(start, direction, params);
  return {
    shape: buildVerticalRunnerShape(start, direction, params),
    guides: segment
      ? [
          buildLineGuide(
            "shapeB-centerline",
            "shapeB",
            segment.start,
            segment.end,
            {
              roles: ["display", "pickProxy"]
            }
          )
        ]
      : []
  };
}

export function buildVerticalRunnerPreviewMeshes(
  targets: VerticalRunnerTarget[],
  params: VerticalRunnerParams
): ShapeMeshData[] {
  const meshes: ShapeMeshData[] = [];
  targets.forEach(target => {
    const feature = buildVerticalRunnerFeatureGeometry(
      target.start,
      target.direction,
      params
    );
    pushShapeMesh(feature.shape, meshes);
    meshes.push(
      ...buildGuideEdgeMeshes(feature.guides, { advancedOcclusion: true })
    );
  });
  return meshes;
}

export function buildVerticalRunnerFormSections(): GateFormSection[] {
  return [
    {
      key: "verticalRunnerBase",
      fields: [
        {
          key: "template",
          prop: "template",
          labelKey: "modelai.verticalRunner.templateLabel",
          kind: "select",
          options: [
            { value: "D3", labelKey: "modelai.verticalRunner.template.D3" },
            { value: "D4", labelKey: "modelai.verticalRunner.template.D4" },
            { value: "D5", labelKey: "modelai.verticalRunner.template.D5" }
          ]
        },
        {
          key: "diameterStart",
          prop: "diameterStart",
          labelKey: "modelai.verticalRunner.diameterStart",
          kind: "number",
          min: 0.1,
          max: 50,
          step: 0.5,
          controls: true
        },
        {
          key: "diameterEnd",
          prop: "diameterEnd",
          labelKey: "modelai.verticalRunner.diameterEnd",
          kind: "number",
          min: 0.1,
          max: 50,
          step: 0.5,
          controls: true
        }
      ]
    }
  ];
}

export class VerticalRunnerCreateSession extends Observable {
  private params: VerticalRunnerParams;
  private readonly handlePushPlatePlaneChanged = (
    document: IDocument,
    z: number
  ) => {
    if (document !== this.document || this.params.pushPlatePlaneZ === z) return;
    this.params = {
      ...this.params,
      pushPlatePlaneZ: z
    };
    this.emitPropertyChanged("params", undefined);
  };

  constructor(
    private readonly document: IDocument,
    initialPushPlatePlaneZ = 0
  ) {
    super();
    this.params = createVerticalRunnerParams(initialPushPlatePlaneZ);
    PubSub.default.sub(
      "pushPlatePlaneChanged",
      this.handlePushPlatePlaneChanged
    );
  }

  getParams(): VerticalRunnerParams {
    return {
      ...this.params,
      pushPlatePlaneZ: this.getPushPlatePlaneZ()
    };
  }

  setParams(next: VerticalRunnerParams): void {
    const normalized = normalizeVerticalRunnerParams(next);
    const pushPlatePlaneZ = this.getPushPlatePlaneZ();
    if (
      this.params.template === normalized.template &&
      this.params.diameterStart === normalized.diameterStart &&
      this.params.diameterEnd === normalized.diameterEnd &&
      this.getPushPlatePlaneZ() === pushPlatePlaneZ
    ) {
      return;
    }
    this.params = {
      ...normalized,
      pushPlatePlaneZ
    };
    this.emitPropertyChanged("params", undefined);
  }

  createFormKitRegistration(controller: AsyncController) {
    return createGateFormKitRegistration({
      formKitId: "verticalRunner",
      titleKey: "modelai.verticalRunner.group",
      sections: buildVerticalRunnerFormSections(),
      controller,
      owner: this,
      getValue: prop => this.getParams()[prop as keyof VerticalRunnerParams],
      setValue: (prop, value) => {
        this.handleFieldValue(prop as keyof VerticalRunnerParams, value);
      }
    });
  }

  private handleFieldValue(
    prop: keyof VerticalRunnerParams,
    value: unknown
  ): void {
    if (prop === "template") {
      const template = value as VerticalRunnerTemplate;
      this.setParams({
        ...this.getParams(),
        template,
        ...getVerticalRunnerTemplateValues(template)
      });
      return;
    }

    this.setParams({
      ...this.getParams(),
      [prop]: value
    } as VerticalRunnerParams);
  }

  private getPushPlatePlaneZ(): number {
    return Number(this.document.pushPlatePlane.z);
  }

  protected override disposeInternal(): void {
    PubSub.default.remove(
      "pushPlatePlaneChanged",
      this.handlePushPlatePlaneChanged
    );
    super.disposeInternal();
  }
}

export class VerticalRunnerEditSession extends Observable {
  private readonly beforeParams: VerticalRunnerParams;
  private params: VerticalRunnerParams;
  private readonly handlePushPlatePlaneChanged = (
    document: IDocument,
    z: number
  ) => {
    if (document !== this.document || this.params.pushPlatePlaneZ === z) return;
    this.params = {
      ...this.params,
      pushPlatePlaneZ: z
    };
    this.emitPropertyChanged("params", undefined);
  };

  constructor(
    private readonly document: IDocument,
    private readonly node: VerticalRunnerNode
  ) {
    super();
    const initialParams = cloneGateParams(node.exportParams());
    this.beforeParams = initialParams;
    this.params = cloneGateParams(initialParams);
    PubSub.default.sub(
      "pushPlatePlaneChanged",
      this.handlePushPlatePlaneChanged
    );
  }

  createFormKitRegistration(controller: AsyncController): FormKitRegistration {
    return createGateFormKitRegistration({
      formKitId: "verticalRunner",
      titleKey: "modelai.verticalRunner.group",
      sections: buildVerticalRunnerFormSections(),
      controller,
      owner: this,
      getValue: prop => this.params[prop as keyof VerticalRunnerParams],
      setValue: (prop, value) => {
        this.handleFieldValue(prop as keyof VerticalRunnerParams, value);
      }
    });
  }

  attachGizmo(_controller: AsyncController): void {}

  confirm(): void {
    const afterParams = this.getParams();
    const beforeComparableParams = {
      ...this.beforeParams,
      pushPlatePlaneZ: afterParams.pushPlatePlaneZ
    };
    if (!hasGateParamsChanged(beforeComparableParams, afterParams)) {
      return;
    }
    rememberVerticalRunnerParams(afterParams);
    Transaction.execute(this.document, "edit vertical runner params", () => {
      Transaction.add(
        this.document,
        new NodeParamsHistoryRecord({
          name: "edit vertical runner params",
          node: this.node,
          before: beforeComparableParams,
          after: afterParams,
          apply: (node, params) => {
            node.applyParams(params, {
              recordHistory: false,
              rebuild: true
            });
          }
        })
      );
    });
  }

  cancel(): void {
    this.params = {
      ...cloneGateParams(this.beforeParams),
      pushPlatePlaneZ: Number(this.document.pushPlatePlane.z)
    };
    this.node.applyParams(this.getParams(), {
      recordHistory: false,
      rebuild: true
    });
    this.emitPropertyChanged("params", undefined);
  }

  getParams(): VerticalRunnerParams {
    return cloneGateParams(this.params);
  }

  setParams(next: VerticalRunnerParams): void {
    const normalized = normalizeVerticalRunnerParams({
      ...next,
      pushPlatePlaneZ: Number(this.document.pushPlatePlane.z)
    });
    if (!hasGateParamsChanged(this.params, normalized)) return;
    this.params = cloneGateParams(normalized);
    this.node.applyParams(this.getParams(), {
      recordHistory: false,
      rebuild: true
    });
    this.emitPropertyChanged("params", undefined);
  }

  private handleFieldValue(
    prop: keyof VerticalRunnerParams,
    value: unknown
  ): void {
    if (prop === "template") {
      const template = value as VerticalRunnerTemplate;
      this.setParams({
        ...this.params,
        template,
        ...getVerticalRunnerTemplateValues(template)
      });
      return;
    }

    this.setParams({
      ...this.params,
      [prop]: value
    } as VerticalRunnerParams);
  }

  protected override disposeInternal(): void {
    PubSub.default.remove(
      "pushPlatePlaneChanged",
      this.handlePushPlatePlaneChanged
    );
    super.disposeInternal();
  }
}
