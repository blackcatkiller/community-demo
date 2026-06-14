// @ts-nocheck
import {
  AsyncController,
  MeshDataUtils,
  Observable,
  PubSub,
  Transaction,
  type IDocument,
  type IEventHandler,
  type INode,
  type IView
} from "@modelai/core";
import { Plane, Precision, XYZ } from "@modelai/core/math";
import type { INodeLinkedList, ShapeMeshData } from "@modelai/core/types";
import {
  Dimension,
  type PointSnapData,
  type SnapResult
} from "@modelai/selection/snap";
import { mountFormKit } from "@modelai/ui/formKit/mount";
import type { FormKitRegistration } from "@modelai/ui/formKit/runtime";
import { transformI18n } from "@/plugins/i18n";
import {
  createSemanticHandleToolConfig,
  beginSemanticHandleDragGhost,
  setSemanticHandleDragGhost,
  SemanticHandleTool,
  type SemanticHandleTarget
} from "@/features/modelai/commands/create/shared/semanticHandleTool";
import {
  createPipeShellRound,
  createPipeShellU,
  pushShapeMesh
} from "@/features/modelai/geometry/gateShapeUtils";
import {
  buildGuideEdgeMeshes,
  buildLineGuide,
  type FeatureGeometryResult
} from "@/features/modelai/geometry/featureGeometry";
import type { ThreeView } from "@/features/modelai/viewer/view";
import { resolveDefaultRunnerZ } from "../shared/defaultRunnerZ";
import {
  cloneGateParams,
  hasGateParamsChanged,
  NodeParamsHistoryRecord,
  resolveNodeParamsHistoryTarget
} from "../shared/gateParamsHistory";
import {
  createGateFormKitRegistration,
  type GateFormSection
} from "../shared/formKit";
import { resolveNodeParentWithRunnerRootGrouping } from "../shared/runnerGroup";
import {
  mapEditablePlaneToNodeView,
  mapEditablePointToNodeView,
  mapNodeViewPointToEditable,
  resolveEditableShapeSource
} from "@/features/modelai/model/shapeNode";

import { HorizontalRunnerNode } from "./horizontalRunnerNode";
export { HorizontalRunnerNode } from "./horizontalRunnerNode";
export type HorizontalRunnerType = "round" | "u" | "trapezoid";
export type HorizontalRunnerTemplate = "D3" | "D4" | "D5";

export type HorizontalRunnerParams = {
  runnerType: HorizontalRunnerType;
  template: HorizontalRunnerTemplate;
  diameter: number;
  uAngle: number;
  uWidth: number;
  uHeight: number;
  pushPlatePlaneZ: number;
};

export type HorizontalRunnerEndpointState = {
  start: XYZ;
  end: XYZ;
};

type HorizontalRunnerNodeEditState = {
  params: HorizontalRunnerParams;
  endpoints: HorizontalRunnerEndpointState;
};

export type HorizontalRunnerNodeEditBinding = {
  getNode(): HorizontalRunnerNode;
  getParams(): HorizontalRunnerParams;
  getEndpoints(): HorizontalRunnerEndpointState;
  getEndpointPlane(endpoint: HorizontalRunnerEndpoint): Plane;
  getState(): HorizontalRunnerNodeEditState;
  setParams(params: HorizontalRunnerParams): void;
  setEndpoint(
    endpoint: HorizontalRunnerEndpoint,
    point: XYZ,
    options?: { rebuild?: boolean }
  ): void;
  setEndpoints(
    endpoints: HorizontalRunnerEndpointState,
    options?: { rebuild?: boolean }
  ): void;
  restore(snapshot: HorizontalRunnerNodeEditState): void;
  snapshot(): HorizontalRunnerNodeEditState;
  subscribe(listener: () => void): () => void;
};

export type HorizontalRunnerEndpointDragSession = {
  update(point: XYZ): void;
  finalize(): void;
  cancel(): void;
};

type HorizontalRunnerEditorLifecycle = {
  kind: "create" | "edit";
  debugLabel: string;
  confirm(runtime: HorizontalRunnerEditorRuntime): void;
  cancel(runtime: HorizontalRunnerEditorRuntime): void;
};

type RunHorizontalRunnerEditorOptions = {
  document: IDocument;
  controller: AsyncController;
  node: HorizontalRunnerNode;
  lifecycle: HorizontalRunnerEditorLifecycle;
};

export type HorizontalRunnerEditorHandle = {
  readonly document: IDocument;
  readonly node: HorizontalRunnerNode;
  readonly controller: AsyncController;
  readonly runtime: HorizontalRunnerEditorRuntime;
  wait(): Promise<boolean>;
  confirm(): void;
  cancel(): void;
  dispose(): void;
};

const DEFAULT_HORIZONTAL_RUNNER_PARAMS: HorizontalRunnerParams = {
  runnerType: "round",
  template: "D3",
  diameter: 3,
  uAngle: 15,
  uWidth: calculateHorizontalRunnerUWidth(3, 15),
  uHeight: 3,
  pushPlatePlaneZ: 0
};

type HorizontalRunnerTemplateValues = Pick<
  HorizontalRunnerParams,
  "diameter" | "uAngle" | "uWidth" | "uHeight"
>;

const HORIZONTAL_RUNNER_TEMPLATE_VALUES: Record<
  HorizontalRunnerTemplate,
  HorizontalRunnerTemplateValues
> = {
  D3: createHorizontalRunnerTemplateValues(3, 15),
  D4: createHorizontalRunnerTemplateValues(4, 15),
  D5: createHorizontalRunnerTemplateValues(5, 15)
};

let lastHorizontalRunnerParams: HorizontalRunnerParams = {
  ...DEFAULT_HORIZONTAL_RUNNER_PARAMS
};

export function getHorizontalRunnerTemplateValues(
  template: HorizontalRunnerTemplate
): HorizontalRunnerTemplateValues {
  return { ...HORIZONTAL_RUNNER_TEMPLATE_VALUES[template] };
}

export function calculateHorizontalRunnerUWidth(
  diameter: number,
  uAngle: number
): number {
  const halfSectionAngleDeg = (90 - uAngle / 2) / 2;
  const radians = (halfSectionAngleDeg * Math.PI) / 180;
  return Math.round((diameter / Math.tan(radians)) * 100) / 100;
}

export function calculateHorizontalRunnerUAngle(
  diameter: number,
  uWidth: number
): number {
  const halfSectionAngleDeg = (Math.atan(diameter / uWidth) * 180) / Math.PI;
  return Math.round((180 - 4 * halfSectionAngleDeg) * 100) / 100;
}

export function updateHorizontalRunnerParams(
  params: HorizontalRunnerParams,
  prop: string,
  value: unknown
): HorizontalRunnerParams {
  if (prop === "uWidth") {
    const diameter = Number(params.diameter);
    const uWidth = Number(value);
    if (Number.isFinite(diameter) && Number.isFinite(uWidth) && uWidth > 0) {
      return normalizeHorizontalRunnerParams({
        ...params,
        uAngle: calculateHorizontalRunnerUAngle(Math.max(0.1, diameter), uWidth)
      });
    }
  }

  return normalizeHorizontalRunnerParams({
    ...params,
    [prop]: value
  } as HorizontalRunnerParams);
}

function createHorizontalRunnerTemplateValues(
  diameter: number,
  uAngle: number
): HorizontalRunnerTemplateValues {
  return {
    diameter,
    uAngle,
    uWidth: calculateHorizontalRunnerUWidth(diameter, uAngle),
    uHeight: diameter
  };
}

function isHorizontalRunnerTemplate(
  value: unknown
): value is HorizontalRunnerTemplate {
  return value === "D3" || value === "D4" || value === "D5";
}

export function normalizeHorizontalRunnerParams(
  params: HorizontalRunnerParams
): HorizontalRunnerParams {
  const runnerType: HorizontalRunnerType =
    params.runnerType === "u" || params.runnerType === "trapezoid"
      ? params.runnerType
      : "round";
  const template = isHorizontalRunnerTemplate(
    (params as { template?: unknown }).template
  )
    ? params.template
    : DEFAULT_HORIZONTAL_RUNNER_PARAMS.template;
  const parsedDiameter =
    typeof params.diameter === "number"
      ? params.diameter
      : Number(params.diameter);
  const rawPushPlatePlaneZ =
    (params as { pushPlatePlaneZ?: number | string }).pushPlatePlaneZ ??
    (params as { planeZ?: number | string }).planeZ;
  const parsedPushPlatePlaneZ =
    typeof rawPushPlatePlaneZ === "number"
      ? rawPushPlatePlaneZ
      : Number(rawPushPlatePlaneZ);
  const parsedUAngle =
    typeof params.uAngle === "number" ? params.uAngle : Number(params.uAngle);
  const diameter = Number.isFinite(parsedDiameter) ? parsedDiameter : 3;
  const pushPlatePlaneZ = Number.isFinite(parsedPushPlatePlaneZ)
    ? parsedPushPlatePlaneZ
    : DEFAULT_HORIZONTAL_RUNNER_PARAMS.pushPlatePlaneZ;
  const uAngle = Number.isFinite(parsedUAngle)
    ? parsedUAngle
    : HORIZONTAL_RUNNER_TEMPLATE_VALUES[template].uAngle;
  const normalizedDiameter = Math.max(0.1, diameter);
  const normalizedUAngle = Math.min(179.9, Math.max(0.1, uAngle));
  return {
    runnerType,
    template,
    diameter: normalizedDiameter,
    uAngle: normalizedUAngle,
    uWidth: calculateHorizontalRunnerUWidth(
      normalizedDiameter,
      normalizedUAngle
    ),
    uHeight: normalizedDiameter,
    pushPlatePlaneZ
  };
}

export function createHorizontalRunnerParams(
  pushPlatePlaneZ = 0
): HorizontalRunnerParams {
  return normalizeHorizontalRunnerParams({
    ...lastHorizontalRunnerParams,
    pushPlatePlaneZ
  });
}

export function rememberHorizontalRunnerParams(
  params: HorizontalRunnerParams
): void {
  const normalized = normalizeHorizontalRunnerParams(params);
  lastHorizontalRunnerParams = {
    ...lastHorizontalRunnerParams,
    runnerType: normalized.runnerType,
    template: normalized.template,
    diameter: normalized.diameter,
    uAngle: normalized.uAngle,
    uWidth: normalized.uWidth,
    uHeight: normalized.uHeight,
    pushPlatePlaneZ: normalized.pushPlatePlaneZ
  };
}

function projectHorizontalRunnerPoint(
  point: XYZ,
  pushPlatePlaneZ: number
): XYZ {
  return new XYZ(point.x, point.y, pushPlatePlaneZ);
}

function buildHorizontalRunnerProjectionHelperMeshes(
  source: XYZ | undefined,
  projected: XYZ | undefined,
  snaped?: SnapResult
): ShapeMeshData[] {
  if (!source || !projected) return [];
  if (!snaped?.shapes.length) return [];
  if (source.distanceTo(projected) <= Precision.Distance) return [];
  return [MeshDataUtils.createEdgeMesh(source, projected, 0xffffff, "dash", 1)];
}

function createHorizontalRunnerSnapPlane(pushPlatePlaneZ: number): Plane {
  const z = Number.isFinite(pushPlatePlaneZ) ? pushPlatePlaneZ : 0;
  return new Plane(new XYZ(0, 0, z), new XYZ(0, 0, 1), new XYZ(1, 0, 0));
}

export function resolveHorizontalRunnerPoints(
  start: XYZ,
  end: XYZ,
  params: HorizontalRunnerParams
): HorizontalRunnerEndpointState {
  const next = normalizeHorizontalRunnerParams(params);
  return {
    start: new XYZ(start.x, start.y, next.pushPlatePlaneZ),
    end: new XYZ(end.x, end.y, next.pushPlatePlaneZ)
  };
}

export function buildHorizontalRunnerShape(
  start: XYZ,
  end: XYZ,
  params: HorizontalRunnerParams
) {
  const next = normalizeHorizontalRunnerParams(params);
  const radius = next.diameter / 2;
  const resolved = resolveHorizontalRunnerPoints(start, end, next);
  switch (next.runnerType) {
    case "u":
      return createPipeShellU(
        next.uWidth,
        next.uHeight,
        next.uWidth,
        next.uHeight,
        true,
        true,
        resolved.start,
        resolved.end
      );
    case "trapezoid":
    case "round":
    default:
      return createPipeShellRound(
        radius,
        radius,
        true,
        true,
        resolved.start,
        resolved.end
      );
  }
}

export function buildHorizontalRunnerFeatureGeometry(
  start: XYZ,
  end: XYZ,
  params: HorizontalRunnerParams
): FeatureGeometryResult {
  const resolved = resolveHorizontalRunnerPoints(start, end, params);
  return {
    shape: buildHorizontalRunnerShape(start, end, params),
    guides: [
      buildLineGuide(
        "runner-centerline",
        "feature",
        resolved.start,
        resolved.end,
        {
          roles: ["display", "pickProxy"]
        }
      )
    ]
  };
}

export function buildHorizontalRunnerPreviewMeshes(
  start: XYZ,
  end: XYZ,
  params: HorizontalRunnerParams
): ShapeMeshData[] {
  const meshes: ShapeMeshData[] = [];
  const feature = buildHorizontalRunnerFeatureGeometry(start, end, params);
  pushShapeMesh(feature.shape, meshes);
  meshes.push(
    ...buildGuideEdgeMeshes(feature.guides, { advancedOcclusion: true })
  );
  return meshes;
}

export function buildHorizontalRunnerGuideMeshes(
  start: XYZ,
  end: XYZ,
  params: HorizontalRunnerParams
): ShapeMeshData[] {
  const resolved = resolveHorizontalRunnerPoints(start, end, params);
  return buildGuideEdgeMeshes(
    [
      buildLineGuide(
        "runner-centerline",
        "feature",
        resolved.start,
        resolved.end,
        {
          roles: ["display", "pickProxy"]
        }
      )
    ],
    { advancedOcclusion: true }
  );
}

export function buildHorizontalRunnerFormSections(): GateFormSection[] {
  return [
    {
      key: "horizontalRunnerBase",
      fields: [
        {
          key: "runnerType",
          prop: "runnerType",
          labelKey: "modelai.horizontalRunner.runnerTypeLabel",
          kind: "radio",
          options: [
            {
              value: "round",
              labelKey: "modelai.horizontalRunner.runnerType.round"
            },
            {
              value: "u",
              labelKey: "modelai.horizontalRunner.runnerType.u"
            },
            {
              value: "trapezoid",
              labelKey: "modelai.horizontalRunner.runnerType.trapezoid",
              disabled: true
            }
          ]
        },
        {
          key: "template",
          prop: "template",
          labelKey: "modelai.horizontalRunner.templateLabel",
          kind: "select",
          options: [
            { value: "D3", labelKey: "modelai.horizontalRunner.template.D3" },
            { value: "D4", labelKey: "modelai.horizontalRunner.template.D4" },
            { value: "D5", labelKey: "modelai.horizontalRunner.template.D5" }
          ],
          hidden: getValue => getValue("runnerType") !== "u"
        },
        {
          key: "diameter",
          prop: "diameter",
          labelKey: "modelai.horizontalRunner.diameter",
          kind: "number",
          min: 0.1,
          step: 0.5,
          controls: true,
          hidden: getValue => getValue("runnerType") !== "round"
        },
        {
          key: "uDiameter",
          prop: "diameter",
          labelKey: "modelai.horizontalRunner.uDiameter",
          kind: "number",
          min: 0.1,
          step: 0.5,
          controls: true,
          hidden: getValue => getValue("runnerType") !== "u"
        },
        {
          key: "uAngle",
          prop: "uAngle",
          labelKey: "modelai.horizontalRunner.uAngle",
          kind: "number",
          min: 0.1,
          max: 179.9,
          step: 0.5,
          controls: true,
          hidden: getValue => getValue("runnerType") !== "u"
        },
        {
          key: "uWidth",
          prop: "uWidth",
          labelKey: "modelai.horizontalRunner.uWidth",
          kind: "number",
          min: 0.1,
          step: 0.01,
          controls: true,
          hidden: getValue => getValue("runnerType") !== "u"
        },
        {
          key: "uHeight",
          prop: "uHeight",
          labelKey: "modelai.horizontalRunner.uHeight",
          kind: "number",
          min: 0.1,
          step: 0.5,
          controls: false,
          disabled: true,
          hidden: true
        }
      ]
    }
  ];
}

export type HorizontalRunnerEndpoint = "start" | "end";

export type HorizontalRunnerEndpointTarget = {
  endpoint: HorizontalRunnerEndpoint;
  getPoint(): XYZ;
  getPlane?(): Plane;
  beginPoint?(): void;
  setPoint(point: XYZ): void;
  finalizePoint?(): void;
  getDragGhostNode?(): INode | undefined;
};

export class HorizontalRunnerEndpointTool implements IEventHandler {
  isEnabled = true;
  private readonly tools: SemanticHandleTool[];
  private activePointerTool?: SemanticHandleTool;

  constructor(
    document: IDocument,
    controller: AsyncController,
    private readonly targets: readonly HorizontalRunnerEndpointTarget[],
    view?: ThreeView
  ) {
    this.tools = targets.map(target =>
      this.createEndpointTool(document, controller, target, view)
    );
  }

  dispose(): void {
    this.tools.forEach(tool => tool.dispose());
    this.activePointerTool = undefined;
  }

  refreshPreview(): void {
    this.tools.forEach(tool => tool.refreshPreview());
  }

  pointerMove(view: IView, event: PointerEvent): void {
    const tool = this.activePointerTool ?? this.resolvePointerTool(view, event);
    if (!this.activePointerTool) {
      this.clearInactiveHover(tool);
    }
    tool?.pointerMove(view, event);
  }

  pointerDown(view: IView, event: PointerEvent): void {
    const tool = this.resolvePointerTool(view, event);
    this.activePointerTool = tool;
    tool?.pointerDown(view, event);
  }

  pointerUp(view: IView, event: PointerEvent): void {
    this.activePointerTool?.pointerUp(view, event);
    this.activePointerTool = undefined;
  }

  pointerOut(view: IView, event: PointerEvent): void {
    this.tools.forEach(tool => tool.pointerOut?.(view, event));
  }

  mouseWheel(view: IView, event: WheelEvent): void {
    this.tools.forEach(tool => tool.mouseWheel?.(view, event));
  }

  keyDown(view: IView, event: KeyboardEvent): void {
    this.tools.forEach(tool => tool.keyDown?.(view, event));
  }

  private createEndpointTool(
    document: IDocument,
    controller: AsyncController,
    target: HorizontalRunnerEndpointTarget,
    view?: ThreeView
  ): SemanticHandleTool {
    let axisDragStartPoint = target.getPoint();
    const tool = new SemanticHandleTool(
      document,
      controller,
      createSemanticHandleToolConfig({
        pointMove: {
          inputAxes: ["x", "y"],
          onDragStart: () => {
            target.beginPoint?.();
          },
          snap: {
            fallback: { type: "plane", plane: ctx => ctx.plane },
            createPointData: () => ({
              dimension: Dimension.D1D2,
              shapeHitFallback: true,
              preview: (point, snaped) =>
                buildHorizontalRunnerProjectionHelperMeshes(
                  point,
                  point
                    ? projectHorizontalRunnerPoint(point, target.getPoint().z)
                    : undefined,
                  snaped
                )
            })
          },
          onDrag: point => {
            target.setPoint(point);
          }
        },
        axisMoves: [
          {
            axis: "X",
            onDragStart: ctx => {
              axisDragStartPoint = ctx.origin;
            },
            onDrag: (delta, ctx) => {
              target.setPoint(
                axisDragStartPoint.add(ctx.plane.xvec.multiply(delta))
              );
            },
            onClick: (showInput, ctx) => {
              showInput("0.00", value => {
                target.beginPoint?.();
                target.setPoint(ctx.origin.add(ctx.plane.xvec.multiply(value)));
                target.finalizePoint?.();
              });
            }
          },
          {
            axis: "Y",
            onDragStart: ctx => {
              axisDragStartPoint = ctx.origin;
            },
            onDrag: (delta, ctx) => {
              target.setPoint(
                axisDragStartPoint.add(ctx.plane.yvec.multiply(delta))
              );
            },
            onClick: (showInput, ctx) => {
              showInput("0.00", value => {
                target.beginPoint?.();
                target.setPoint(ctx.origin.add(ctx.plane.yvec.multiply(value)));
                target.finalizePoint?.();
              });
            }
          }
        ],
        planeMoves: false,
        rotation: false,
        dragGhost: true,
        onDragEnd: () => target.finalizePoint?.()
      }),
      view
    );
    tool.attach(this.createEndpointTarget(target));
    return tool;
  }

  private createEndpointTarget(
    target: HorizontalRunnerEndpointTarget
  ): SemanticHandleTarget {
    return {
      getOrigin: () => target.getPoint(),
      getPlane: () => this.endpointPlane(target),
      getDragGhostNode: target.getDragGhostNode
    };
  }

  private endpointPlane(target: HorizontalRunnerEndpointTarget): Plane {
    return (
      target.getPlane?.() ??
      new Plane(target.getPoint(), new XYZ(0, 0, 1), new XYZ(1, 0, 0))
    );
  }

  private resolvePointerTool(
    view: IView,
    event: PointerEvent
  ): SemanticHandleTool | undefined {
    return SemanticHandleTool.pickTool(this.tools, view, event)?.tool;
  }

  private clearInactiveHover(activeTool?: SemanticHandleTool): void {
    this.tools.forEach(tool => {
      if (tool !== activeTool) tool.clearHover();
    });
  }
}

function isViewNavigationPointerEvent(event: PointerEvent): boolean {
  return event.button === 1 || event.buttons === 4;
}

class HorizontalRunnerConfirmHandler implements IEventHandler {
  isEnabled = true;

  constructor(
    private readonly controller: AsyncController,
    private readonly delegate?: IEventHandler,
    private readonly endpointTools?: IEventHandler & {
      dispose?(): void;
      refreshPreview?(): void;
    }
  ) {}

  dispose(): void {
    this.endpointTools?.dispose?.();
  }

  refreshPreview(): void {
    this.endpointTools?.refreshPreview?.();
  }

  pointerMove(view: IView, event: PointerEvent): void {
    this.endpointTools?.pointerMove(view, event);
    if (event.defaultPrevented) return;
    if (!isViewNavigationPointerEvent(event)) return;
    this.delegate?.pointerMove(view, event);
  }

  pointerDown(view: IView, event: PointerEvent): void {
    this.endpointTools?.pointerDown(view, event);
    if (event.defaultPrevented) return;
    if (!isViewNavigationPointerEvent(event)) return;
    this.delegate?.pointerDown(view, event);
  }

  pointerUp(view: IView, event: PointerEvent): void {
    this.endpointTools?.pointerUp(view, event);
    if (event.defaultPrevented) return;
    if (!isViewNavigationPointerEvent(event)) return;
    this.delegate?.pointerUp(view, event);
  }

  pointerOut(view: IView, event: PointerEvent): void {
    this.endpointTools?.pointerOut?.(view, event);
    if (event.defaultPrevented) return;
    if (!isViewNavigationPointerEvent(event)) return;
    this.delegate?.pointerOut?.(view, event);
  }

  dblClick(view: IView, event: MouseEvent): void {
    this.delegate?.dblClick?.(view, event);
  }

  mouseWheel(view: IView, event: WheelEvent): void {
    this.endpointTools?.mouseWheel?.(view, event);
    this.delegate?.mouseWheel?.(view, event);
  }

  keyDown(view: IView, event: KeyboardEvent): void {
    if (event.key === "Enter" && !event.repeat && !event.isComposing) {
      this.controller.success();
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    if (event.key === "Escape" && !event.repeat && !event.isComposing) {
      this.controller.cancel();
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    this.delegate?.keyDown?.(view, event);
  }
}

const horizontalRunnerDebugObjectIds = new WeakMap<object, string>();
const horizontalRunnerDebugObjectCounters: Record<string, number> = {};

function horizontalRunnerDebugObjectId(
  prefix: string,
  value: object | undefined
): string {
  if (!value) return `${prefix}#none`;
  const current = horizontalRunnerDebugObjectIds.get(value);
  if (current) return current;
  const nextNumber = (horizontalRunnerDebugObjectCounters[prefix] ?? 0) + 1;
  horizontalRunnerDebugObjectCounters[prefix] = nextNumber;
  const next = `${prefix}#${nextNumber}`;
  horizontalRunnerDebugObjectIds.set(value, next);
  return next;
}

function horizontalRunnerDebugPoint(point: XYZ): {
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

function horizontalRunnerDebugEndpoints(
  endpoints: HorizontalRunnerEndpointState
) {
  return {
    start: horizontalRunnerDebugPoint(endpoints.start),
    end: horizontalRunnerDebugPoint(endpoints.end)
  };
}

function isHorizontalRunnerEditorDebugEnabled(): boolean {
  const value = (globalThis as Record<string, unknown>)[
    "__MODELAI_HORIZONTAL_RUNNER_EDITOR_DEBUG__"
  ];
  return value === true || value === "1";
}

export function debugHorizontalRunnerEditorEvent(
  event: string,
  payload: Record<string, unknown>
): void {
  if (!isHorizontalRunnerEditorDebugEnabled()) return;
  console.info("[HorizontalRunnerEditorRuntime]", event, payload);
}

function debugHorizontalRunnerEditor(
  event: string,
  runtime: HorizontalRunnerEditorRuntime,
  extra?: Record<string, unknown>
): void {
  const state = runtime.getDebugState();
  debugHorizontalRunnerEditorEvent(event, {
    shell: state.shell,
    runtime: horizontalRunnerDebugObjectId("runtime", runtime),
    node: horizontalRunnerDebugObjectId("node", state.node),
    binding: horizontalRunnerDebugObjectId("binding", state.binding),
    nodeObject: state.node,
    bindingObject: state.binding,
    ...extra
  });
}

function cloneHorizontalRunnerEndpoints(
  endpoints: HorizontalRunnerEndpointState
): HorizontalRunnerEndpointState {
  return {
    start: new XYZ(endpoints.start.x, endpoints.start.y, endpoints.start.z),
    end: new XYZ(endpoints.end.x, endpoints.end.y, endpoints.end.z)
  };
}

export function bindHorizontalRunnerForEdit(
  node: HorizontalRunnerNode
): HorizontalRunnerNodeEditBinding {
  const listeners = new Set<() => void>();
  const editNode = resolveEditableShapeSource(node) as HorizontalRunnerNode;
  const notifyChanged = () => {
    listeners.forEach(listener => listener());
  };
  const getParams = () =>
    cloneGateParams(normalizeHorizontalRunnerParams(editNode.exportParams()));
  const getEndpoints = () => ({
    start: mapEditablePointToNodeView(
      node,
      editNode.exportEndpointState().start
    ),
    end: mapEditablePointToNodeView(node, editNode.exportEndpointState().end)
  });
  const getEndpointPlane = (endpoint: HorizontalRunnerEndpoint) =>
    mapEditablePlaneToNodeView(
      node,
      createHorizontalRunnerSnapPlane(getParams().pushPlatePlaneZ).translateTo(
        editNode.exportEndpointState()[endpoint]
      )
    );
  const applyEndpointState = (
    endpoints: HorizontalRunnerEndpointState,
    options?: { rebuild?: boolean }
  ) => {
    const params = getParams();
    const current = editNode.exportEndpointState();
    const next = resolveHorizontalRunnerPoints(
      mapNodeViewPointToEditable(node, endpoints.start),
      mapNodeViewPointToEditable(node, endpoints.end),
      params
    );
    if (!hasGateParamsChanged(current, next) && options?.rebuild !== true) {
      return;
    }
    editNode.applyEndpoints(next, {
      recordHistory: false,
      rebuild: options?.rebuild ?? true
    });
    notifyChanged();
  };

  return {
    getNode: () => node,
    getParams,
    getEndpoints,
    getEndpointPlane,
    getState: () => ({
      params: getParams(),
      endpoints: getEndpoints()
    }),
    setParams: params => {
      const current = getParams();
      const next = normalizeHorizontalRunnerParams(params);
      if (!hasGateParamsChanged(current, next)) return;
      editNode.applyParams(next, {
        recordHistory: false,
        rebuild: true
      });
      notifyChanged();
    },
    setEndpoint: (endpoint, point, options) => {
      const endpoints = getEndpoints();
      endpoints[endpoint] = new XYZ(point.x, point.y, point.z);
      applyEndpointState(endpoints, options);
    },
    setEndpoints: applyEndpointState,
    restore: snapshot => {
      editNode.applyEndpoints(
        {
          start: mapNodeViewPointToEditable(node, snapshot.endpoints.start),
          end: mapNodeViewPointToEditable(node, snapshot.endpoints.end)
        },
        {
          recordHistory: false,
          rebuild: false
        }
      );
      editNode.applyParams(cloneGateParams(snapshot.params), {
        recordHistory: false,
        rebuild: true
      });
      notifyChanged();
    },
    snapshot: () => ({
      params: getParams(),
      endpoints: getEndpoints()
    }),
    subscribe: listener => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }
  };
}

export function createHorizontalRunnerEditorRuntime(options: {
  document: IDocument;
  node: HorizontalRunnerNode;
  lifecycle: HorizontalRunnerEditorLifecycle;
}): HorizontalRunnerEditorRuntime {
  return new HorizontalRunnerEditorRuntime(
    options.document,
    options.node,
    options.lifecycle
  );
}

export function createHorizontalRunnerEndpointDragSession(options: {
  document: IDocument;
  node: HorizontalRunnerNode;
  binding: HorizontalRunnerNodeEditBinding;
  endpoint: HorizontalRunnerEndpoint;
  source: "semantic-handle" | "create-second-point";
  rebuildOnUpdate?: boolean;
  refreshPreview?: () => void;
}): HorizontalRunnerEndpointDragSession {
  let active = true;
  beginSemanticHandleDragGhost(options.document, options.node);
  const writeEndpoint = (point: XYZ, rebuild: boolean) => {
    if (!active) return;
    debugHorizontalRunnerEditorEvent("semantic-drag:endpoint", {
      source: options.source,
      write: "binding:endpoints",
      endpoint: options.endpoint,
      node: horizontalRunnerDebugObjectId("node", options.node),
      binding: horizontalRunnerDebugObjectId("binding", options.binding),
      point: horizontalRunnerDebugPoint(point),
      rebuild,
      nodeObject: options.node,
      bindingObject: options.binding
    });
    options.binding.setEndpoint(options.endpoint, point, { rebuild });
    options.refreshPreview?.();
    if (active) {
      setSemanticHandleDragGhost(options.document, options.node, true);
    }
  };
  const stop = (finalize: boolean) => {
    if (!active) return;
    active = false;
    if (finalize) {
      const point = options.binding.getEndpoints()[options.endpoint];
      debugHorizontalRunnerEditorEvent("semantic-drag:endpoint", {
        source: options.source,
        write: "binding:endpoints",
        endpoint: options.endpoint,
        node: horizontalRunnerDebugObjectId("node", options.node),
        binding: horizontalRunnerDebugObjectId("binding", options.binding),
        point: horizontalRunnerDebugPoint(point),
        rebuild: true,
        nodeObject: options.node,
        bindingObject: options.binding
      });
      options.binding.setEndpoint(options.endpoint, point, { rebuild: true });
      options.refreshPreview?.();
    }
    setSemanticHandleDragGhost(options.document, options.node, false);
  };
  return {
    update: point => writeEndpoint(point, options.rebuildOnUpdate === true),
    finalize: () => stop(true),
    cancel: () => stop(false)
  };
}

export function startHorizontalRunnerEditor(options: {
  document: IDocument;
  controller?: AsyncController;
  node: HorizontalRunnerNode;
  lifecycle: HorizontalRunnerEditorLifecycle;
}): HorizontalRunnerEditorHandle {
  const controller = options.controller ?? new AsyncController();
  options.document.selection.clearSelection();
  options.document.visual.highlighter.clear();
  options.document.visual.update();
  const runtime = createHorizontalRunnerEditorRuntime({
    document: options.document,
    node: options.node,
    lifecycle: options.lifecycle
  });
  const registration = runtime.createFormKitRegistration(controller);
  const unmount = mountFormKit(registration);
  const handler = runtime.attachHandle(controller);
  let disposed = false;

  debugHorizontalRunnerEditor("start", runtime, {
    controller: horizontalRunnerDebugObjectId("controller", controller),
    handler: horizontalRunnerDebugObjectId("handler", handler),
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
    debugHorizontalRunnerEditor("dispose:start", runtime);
    unmount();
    runtime.dispose();
    if (!options.controller) controller.dispose();
    debugHorizontalRunnerEditor("dispose:done", runtime);
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

export async function runHorizontalRunnerEditor(
  options: RunHorizontalRunnerEditorOptions
): Promise<boolean> {
  return startHorizontalRunnerEditor({
    document: options.document,
    node: options.node,
    controller: options.controller,
    lifecycle: options.lifecycle
  }).wait();
}

export function createHorizontalRunnerCreateLifecycle(): HorizontalRunnerEditorLifecycle {
  return {
    kind: "create",
    debugLabel: "create horizontal runner",
    confirm(runtime) {
      debugHorizontalRunnerEditor("confirm:create", runtime, {
        action: "keep-existing-node-for-command-commit"
      });
    },
    cancel(runtime) {
      const { document, node } = runtime;
      debugHorizontalRunnerEditor("cancel:create", runtime, {
        action: "remove-visual-and-dispose-node"
      });
      document.visual.context.removeNode([node]);
      node.parent = undefined;
      node.dispose();
      document.visual.update();
    }
  };
}

export function commitCreatedHorizontalRunnerNode(options: {
  document: IDocument;
  node: HorizontalRunnerNode;
  parent: INodeLinkedList;
}): void {
  const params = options.node.exportParams();
  debugHorizontalRunnerEditorEvent("commit:create", {
    shell: "create",
    node: horizontalRunnerDebugObjectId("node", options.node),
    parent: horizontalRunnerDebugObjectId("parent", options.parent),
    nodeObject: options.node,
    parentObject: options.parent
  });
  rememberHorizontalRunnerParams(params);
  options.document.visual.context.removeNode([options.node]);
  resolveNodeParentWithRunnerRootGrouping(
    options.document,
    options.node,
    options.parent
  ).add(options.node);
  options.document.visual.update();
}

export function createHorizontalRunnerEditLifecycle(): HorizontalRunnerEditorLifecycle {
  return {
    kind: "edit",
    debugLabel: "edit horizontal runner",
    confirm(runtime) {
      debugHorizontalRunnerEditor("confirm:edit", runtime);
      runtime.pushEditHistory();
    },
    cancel(runtime) {
      debugHorizontalRunnerEditor("cancel:edit", runtime, {
        action: "restore-initial-snapshot"
      });
      runtime.restoreInitialState();
    }
  };
}

export class HorizontalRunnerEditorRuntime extends Observable {
  readonly nodeBinding: HorizontalRunnerNodeEditBinding;
  readonly initialParams: HorizontalRunnerParams;
  readonly initialEndpoints: HorizontalRunnerEndpointState;
  private params: HorizontalRunnerParams;
  private endpoints: HorizontalRunnerEndpointState;
  private handler?: IEventHandler & { dispose(): void; refreshPreview(): void };
  private releaseBinding?: () => void;
  private activeEndpointDrag?: HorizontalRunnerEndpointDragSession;
  private applyingToBinding = false;
  private completed = false;
  private readonly handlePushPlatePlaneChanged = (
    document: IDocument,
    z: number
  ) => {
    if (document !== this.document || this.params.pushPlatePlaneZ === z) return;
    this.setParams(
      normalizeHorizontalRunnerParams({
        ...this.params,
        pushPlatePlaneZ: z
      }),
      { syncPushPlatePlane: false }
    );
  };

  constructor(
    readonly document: IDocument,
    readonly node: HorizontalRunnerNode,
    private readonly lifecycle: HorizontalRunnerEditorLifecycle
  ) {
    super();
    this.nodeBinding = bindHorizontalRunnerForEdit(node);
    const initial = this.nodeBinding.snapshot();
    this.initialParams = cloneGateParams(initial.params);
    this.initialEndpoints = cloneHorizontalRunnerEndpoints(initial.endpoints);
    this.params = cloneGateParams(initial.params);
    this.endpoints = cloneHorizontalRunnerEndpoints(initial.endpoints);
    this.releaseBinding = this.nodeBinding.subscribe(() => {
      if (this.applyingToBinding) return;
      this.syncFromBinding();
    });
    PubSub.default.sub(
      "pushPlatePlaneChanged",
      this.handlePushPlatePlaneChanged
    );
    debugHorizontalRunnerEditor("runtime:create", this);
  }

  getParams(): HorizontalRunnerParams {
    return cloneGateParams(this.params);
  }

  getEndpoints(): HorizontalRunnerEndpointState {
    return cloneHorizontalRunnerEndpoints(this.endpoints);
  }

  setParams(
    next: HorizontalRunnerParams,
    options?: { syncPushPlatePlane?: boolean }
  ): void {
    let nextParams = normalizeHorizontalRunnerParams(cloneGateParams(next));
    this.applyingToBinding = true;
    try {
      this.nodeBinding.setParams(nextParams);
      nextParams = this.nodeBinding.getParams();
    } finally {
      this.applyingToBinding = false;
    }
    const changed = hasGateParamsChanged(this.params, nextParams);
    debugHorizontalRunnerEditor("form:write-params", this, {
      write: "binding:params",
      changed,
      params: nextParams
    });
    if (!changed) return;
    this.params = cloneGateParams(nextParams);
    this.endpoints = cloneHorizontalRunnerEndpoints(
      this.nodeBinding.getEndpoints()
    );
    void options;
    this.handler?.refreshPreview();
    this.emitPropertyChanged("params", undefined);
  }

  createFormKitRegistration(controller: AsyncController): FormKitRegistration {
    debugHorizontalRunnerEditor("form:mount", this, {
      controller: horizontalRunnerDebugObjectId("controller", controller),
      controllerObject: controller
    });
    return createGateFormKitRegistration({
      formKitId: "horizontalRunner",
      titleKey: "modelai.horizontalRunner.group",
      sections: buildHorizontalRunnerFormSections(),
      controller,
      owner: this,
      getValue: prop => this.params[prop as keyof HorizontalRunnerParams],
      setValue: (prop, value) => this.setFieldValue(prop, value)
    });
  }

  attachHandle(controller: AsyncController): IEventHandler & {
    dispose(): void;
    refreshPreview(): void;
  } {
    if (this.handler) return this.handler;
    const activeView =
      (this.document.application.activeView as ThreeView | undefined) ??
      undefined;
    const endpointTool = new HorizontalRunnerEndpointTool(
      this.document,
      controller,
      [
        {
          endpoint: "start",
          getPoint: () => this.nodeBinding.getEndpoints().start,
          getPlane: () => this.nodeBinding.getEndpointPlane("start"),
          getDragGhostNode: () => this.node,
          beginPoint: () => this.beginEndpointDrag("start"),
          setPoint: point => this.updateEndpointDrag("start", point),
          finalizePoint: () => this.finalizeEndpointDrag()
        },
        {
          endpoint: "end",
          getPoint: () => this.nodeBinding.getEndpoints().end,
          getPlane: () => this.nodeBinding.getEndpointPlane("end"),
          getDragGhostNode: () => this.node,
          beginPoint: () => this.beginEndpointDrag("end"),
          setPoint: point => this.updateEndpointDrag("end", point),
          finalizePoint: () => this.finalizeEndpointDrag()
        }
      ],
      activeView
    );
    const handler = new HorizontalRunnerConfirmHandler(
      controller,
      this.document.visual.eventHandler,
      endpointTool
    );
    this.handler = handler;
    debugHorizontalRunnerEditor("handle:attach", this, {
      handler: horizontalRunnerDebugObjectId("handler", handler),
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
    debugHorizontalRunnerEditor("runtime:confirm", this);
    this.lifecycle.confirm(this);
  }

  cancel(): void {
    if (this.completed) return;
    this.completed = true;
    debugHorizontalRunnerEditor("runtime:cancel", this);
    this.lifecycle.cancel(this);
  }

  pushEditHistory(): void {
    const afterParams = this.getParams();
    const afterEndpoints = this.getEndpoints();
    const beforeSourceEndpoints = {
      start: mapNodeViewPointToEditable(this.node, this.initialEndpoints.start),
      end: mapNodeViewPointToEditable(this.node, this.initialEndpoints.end)
    };
    const afterSourceEndpoints = {
      start: mapNodeViewPointToEditable(this.node, afterEndpoints.start),
      end: mapNodeViewPointToEditable(this.node, afterEndpoints.end)
    };
    const beforeComparableParams = {
      ...this.initialParams,
      pushPlatePlaneZ: afterParams.pushPlatePlaneZ
    };
    const paramsChanged = hasGateParamsChanged(this.initialParams, afterParams);
    const editableParamsChanged = hasGateParamsChanged(
      beforeComparableParams,
      afterParams
    );
    const endpointsChanged = hasGateParamsChanged(
      this.initialEndpoints,
      afterEndpoints
    );
    debugHorizontalRunnerEditor("history:check", this, {
      paramsChanged,
      editableParamsChanged,
      endpointsChanged,
      action: editableParamsChanged || endpointsChanged ? "push" : "skip"
    });
    if (!editableParamsChanged && !endpointsChanged) return;
    if (editableParamsChanged) {
      rememberHorizontalRunnerParams(afterParams);
    }
    const historyTarget = resolveNodeParamsHistoryTarget(this.node);
    if (endpointsChanged) {
      historyTarget.applyEndpoints(afterSourceEndpoints, {
        recordHistory: false,
        rebuild: true
      });
    }
    Transaction.execute(this.document, "edit horizontal runner", () => {
      if (editableParamsChanged) {
        Transaction.add(
          this.document,
          new NodeParamsHistoryRecord({
            name: "edit horizontal runner params",
            node: historyTarget,
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
      }
      if (endpointsChanged) {
        Transaction.add(
          this.document,
          new NodeParamsHistoryRecord({
            name: "edit horizontal runner endpoints",
            node: historyTarget,
            before: beforeSourceEndpoints,
            after: afterSourceEndpoints,
            apply: (node, endpoints) => {
              node.applyEndpoints(endpoints, {
                recordHistory: false,
                rebuild: true
              });
            }
          })
        );
      }
    });
  }

  restoreInitialState(): void {
    const currentPushPlatePlaneZ = Number(this.document.pushPlatePlane.z);
    const params = normalizeHorizontalRunnerParams({
      ...cloneGateParams(this.initialParams),
      pushPlatePlaneZ: currentPushPlatePlaneZ
    });
    debugHorizontalRunnerEditor("snapshot:restore", this, {
      params,
      endpoints: horizontalRunnerDebugEndpoints(this.initialEndpoints)
    });
    this.applyingToBinding = true;
    try {
      this.nodeBinding.restore({
        params,
        endpoints: cloneHorizontalRunnerEndpoints(this.initialEndpoints)
      });
    } finally {
      this.applyingToBinding = false;
    }
    this.params = cloneGateParams(params);
    this.endpoints = cloneHorizontalRunnerEndpoints(this.initialEndpoints);
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
    this.cancelEndpointDrag();
    this.handler?.dispose();
    this.handler = undefined;
    super.disposeInternal();
  }

  private setFieldValue(prop: string, value: unknown): void {
    if (prop === "template") {
      const template = value as HorizontalRunnerTemplate;
      this.setParams({
        ...this.params,
        template,
        ...getHorizontalRunnerTemplateValues(template)
      });
      return;
    }
    this.setParams(updateHorizontalRunnerParams(this.params, prop, value));
  }

  private syncFromBinding(): void {
    const nextParams = this.nodeBinding.getParams();
    const nextEndpoints = this.nodeBinding.getEndpoints();
    const paramsChanged = hasGateParamsChanged(this.params, nextParams);
    const endpointsChanged = hasGateParamsChanged(
      this.endpoints,
      nextEndpoints
    );
    debugHorizontalRunnerEditor("binding:changed", this, {
      paramsChanged,
      endpointsChanged,
      params: nextParams,
      endpoints: horizontalRunnerDebugEndpoints(nextEndpoints)
    });
    if (paramsChanged) {
      this.params = cloneGateParams(nextParams);
      this.emitPropertyChanged("params", undefined);
    }
    if (endpointsChanged) {
      this.endpoints = cloneHorizontalRunnerEndpoints(nextEndpoints);
    }
    this.handler?.refreshPreview();
  }

  private beginEndpointDrag(endpoint: HorizontalRunnerEndpoint): void {
    this.activeEndpointDrag?.cancel();
    this.activeEndpointDrag = createHorizontalRunnerEndpointDragSession({
      document: this.document,
      node: this.node,
      binding: this.nodeBinding,
      endpoint,
      source: "semantic-handle",
      rebuildOnUpdate: true,
      refreshPreview: () => this.handler?.refreshPreview()
    });
  }

  private updateEndpointDrag(
    endpoint: HorizontalRunnerEndpoint,
    point: XYZ
  ): void {
    if (!this.activeEndpointDrag) {
      this.beginEndpointDrag(endpoint);
    }
    this.activeEndpointDrag?.update(point);
  }

  private finalizeEndpointDrag(): void {
    this.activeEndpointDrag?.finalize();
    this.activeEndpointDrag = undefined;
  }

  private cancelEndpointDrag(): void {
    this.activeEndpointDrag?.cancel();
    this.activeEndpointDrag = undefined;
  }
}

export function createHorizontalRunnerNode(
  start: XYZ,
  end: XYZ,
  params: HorizontalRunnerParams = createHorizontalRunnerParams()
): HorizontalRunnerNode {
  return new HorizontalRunnerNode(
    transformI18n("modelai.body.horizontalRunner"),
    start,
    end,
    params
  );
}

export function createHorizontalRunnerPointData(options: {
  getPushPlatePlaneZ: () => number;
  getParams: () => HorizontalRunnerParams;
  getStart?: () => XYZ;
  getDragGhostNode?: () => HorizontalRunnerNode | undefined;
}): {
  firstPointData: () => PointSnapData;
  secondPointData: () => PointSnapData;
  projectPoint: (point: XYZ) => XYZ;
  projectedPointPreview: (
    point: XYZ | undefined,
    snaped?: SnapResult
  ) => ShapeMeshData[];
  secondPointPreview: (
    point: XYZ | undefined,
    snaped?: SnapResult
  ) => ShapeMeshData[];
} {
  const projectPoint = (point: XYZ) =>
    projectHorizontalRunnerPoint(point, options.getPushPlatePlaneZ());
  const appendProjectionHelper = (
    meshes: ShapeMeshData[],
    source: XYZ,
    projected: XYZ,
    snaped?: SnapResult
  ) => {
    meshes.push(
      ...buildHorizontalRunnerProjectionHelperMeshes(source, projected, snaped)
    );
  };
  const projectedPointPreview = (
    point: XYZ | undefined,
    snaped?: SnapResult
  ) => {
    if (!point) return [];
    const projected = projectPoint(point);
    const meshes: ShapeMeshData[] = [];
    appendProjectionHelper(meshes, point, projected, snaped);
    return meshes;
  };
  const secondPointPreview = (point: XYZ | undefined, snaped?: SnapResult) => {
    const start = options.getStart?.();
    const meshes: ShapeMeshData[] = [];
    if (!point || !start) return meshes;
    const projected = projectPoint(point);
    appendProjectionHelper(meshes, point, projected, snaped);
    meshes.push(
      ...buildHorizontalRunnerGuideMeshes(start, projected, options.getParams())
    );
    return meshes;
  };
  return {
    firstPointData: () => ({
      plane: () =>
        createHorizontalRunnerSnapPlane(options.getPushPlatePlaneZ()),
      shapeHitFallback: true,
      filter: shape => shape.owner.node !== options.getDragGhostNode?.(),
      preview: projectedPointPreview
    }),
    secondPointData: () => ({
      refPoint: () => options.getStart?.(),
      plane: () =>
        createHorizontalRunnerSnapPlane(options.getPushPlatePlaneZ()),
      shapeHitFallback: true,
      filter: shape => shape.owner.node !== options.getDragGhostNode?.(),
      dimension: Dimension.D1D2D3,
      validator: point => {
        const start = options.getStart?.();
        if (!start) return false;
        const projected = projectPoint(point);
        return start.distanceTo(projected) > Precision.Distance;
      },
      preview: secondPointPreview
    }),
    projectPoint,
    projectedPointPreview,
    secondPointPreview
  };
}

export function resolveInitialHorizontalRunnerPushPlatePlaneZ(
  document: IDocument
): number {
  const z = Number(document.pushPlatePlane.z);
  return Number.isFinite(z) ? z : resolveDefaultRunnerZ(document);
}
