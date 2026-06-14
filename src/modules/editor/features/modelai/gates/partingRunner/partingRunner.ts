// @ts-nocheck
import {
  AsyncController,
  Observable,
  Transaction,
  type IDocument,
  type IEventHandler,
  type IView
} from "@modelai/core";
import type {
  INode,
  INodeLinkedList,
  ShapeMeshData
} from "@modelai/core/types";
import { Plane, Precision, XYZ } from "@modelai/core/math";
import { Dimension, type PointSnapData } from "@modelai/selection/snap";
import { mountFormKit } from "@modelai/ui/formKit/mount";
import type { FormKitRegistration } from "@modelai/ui/formKit/runtime";
import { transformI18n } from "@/plugins/i18n";
import {
  beginSemanticHandleDragGhost,
  createSemanticHandleToolConfig,
  SemanticHandleTool,
  setSemanticHandleDragGhost,
  type SemanticHandleTarget
} from "@/features/modelai/commands/create/shared/semanticHandleTool";
import type { ThreeView } from "@/features/modelai/viewer/view";
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
import {
  cloneGateParams,
  hasGateParamsChanged,
  NodeParamsHistoryRecord,
  resolveNodeParamsHistoryTarget
} from "../shared/gateParamsHistory";
import {
  mapEditablePlaneToNodeView,
  mapEditablePointToNodeView,
  mapNodeViewPointToEditable,
  resolveEditableShapeSource
} from "@/features/modelai/model/shapeNode";

import {
  createGateFormKitRegistration,
  type GateFormSection
} from "../shared/formKit";
import { resolveNodeParentWithRunnerRootGrouping } from "../shared/runnerGroup";

import { PartingRunnerNode } from "./partingRunnerNode";
export { PartingRunnerNode } from "./partingRunnerNode";
export type PartingRunnerType = "round" | "u" | "trapezoid";
export type PartingRunnerTemplate = "D3" | "D4" | "D5";
export type PartingRunnerEndpoint = "start" | "end";

export type PartingRunnerEndpointTarget = {
  endpoint: PartingRunnerEndpoint;
  getPoint(): XYZ;
  getPlane?(): Plane;
  beginPoint?(): void;
  setPoint(point: XYZ): void;
  finalizePoint?(): void;
  getDragGhostNode?(): INode | undefined;
  onDragActiveChange?(active: boolean): void;
};

export class PartingRunnerEndpointTool implements IEventHandler {
  isEnabled = true;
  private readonly tools: SemanticHandleTool[];
  private activePointerTool?: SemanticHandleTool;

  constructor(
    document: IDocument,
    controller: AsyncController,
    private readonly targets: readonly PartingRunnerEndpointTarget[],
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
    target: PartingRunnerEndpointTarget,
    view?: ThreeView
  ): SemanticHandleTool {
    let axisDragStartPoint = target.getPoint();
    const tool = new SemanticHandleTool(
      document,
      controller,
      createSemanticHandleToolConfig({
        pointMove: {
          onDragStart: () => {
            target.beginPoint?.();
          },
          snap: {
            fallback: { type: "viewPlane" },
            createPointData: () => ({
              dimension: Dimension.D1D2D3
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
          },
          {
            axis: "Z",
            onDragStart: ctx => {
              axisDragStartPoint = ctx.origin;
            },
            onDrag: (delta, ctx) => {
              target.setPoint(
                axisDragStartPoint.add(ctx.plane.normal.multiply(delta))
              );
            },
            onClick: (showInput, ctx) => {
              showInput("0.00", value => {
                target.beginPoint?.();
                target.setPoint(
                  ctx.origin.add(ctx.plane.normal.multiply(value))
                );
                target.finalizePoint?.();
              });
            }
          }
        ],
        planeMoves: false,
        rotation: false,
        dragGhost: true,
        onDragActiveChange: active => {
          target.onDragActiveChange?.(active);
        },
        onDragEnd: () => target.finalizePoint?.()
      }),
      view
    );
    tool.attach(this.createEndpointTarget(target));
    return tool;
  }

  private createEndpointTarget(
    target: PartingRunnerEndpointTarget
  ): SemanticHandleTarget {
    return {
      getOrigin: () => target.getPoint(),
      getPlane: () =>
        target.getPlane?.() ?? Plane.XY().translateTo(target.getPoint()),
      getDragGhostNode: target.getDragGhostNode
    };
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

export type PartingRunnerParams = {
  runnerType: PartingRunnerType;
  template: PartingRunnerTemplate;
  diameter: number;
  uAngle: number;
  uWidth: number;
  uHeight: number;
};

const DEFAULT_PARTING_RUNNER_PARAMS: PartingRunnerParams = {
  runnerType: "round",
  template: "D3",
  diameter: 3,
  uAngle: 15,
  uWidth: calculatePartingRunnerUWidth(3, 15),
  uHeight: 3
};

type PartingRunnerTemplateValues = Pick<
  PartingRunnerParams,
  "diameter" | "uAngle" | "uWidth" | "uHeight"
>;

const PARTING_RUNNER_TEMPLATE_VALUES: Record<
  PartingRunnerTemplate,
  PartingRunnerTemplateValues
> = {
  D3: createPartingRunnerTemplateValues(3, 15),
  D4: createPartingRunnerTemplateValues(4, 15),
  D5: createPartingRunnerTemplateValues(5, 15)
};

let lastPartingRunnerParams: PartingRunnerParams = {
  ...DEFAULT_PARTING_RUNNER_PARAMS
};

export function getPartingRunnerTemplateValues(
  template: PartingRunnerTemplate
): PartingRunnerTemplateValues {
  return { ...PARTING_RUNNER_TEMPLATE_VALUES[template] };
}

export function calculatePartingRunnerUWidth(
  diameter: number,
  uAngle: number
): number {
  const halfSectionAngleDeg = (90 - uAngle / 2) / 2;
  const radians = (halfSectionAngleDeg * Math.PI) / 180;
  return Math.round((diameter / Math.tan(radians)) * 100) / 100;
}

export function calculatePartingRunnerUAngle(
  diameter: number,
  uWidth: number
): number {
  const halfSectionAngleDeg = (Math.atan(diameter / uWidth) * 180) / Math.PI;
  return Math.round((180 - 4 * halfSectionAngleDeg) * 100) / 100;
}

export function updatePartingRunnerParams(
  params: PartingRunnerParams,
  prop: string,
  value: unknown
): PartingRunnerParams {
  if (prop === "uWidth") {
    const diameter = Number(params.diameter);
    const uWidth = Number(value);
    if (Number.isFinite(diameter) && Number.isFinite(uWidth) && uWidth > 0) {
      return normalizePartingRunnerParams({
        ...params,
        uAngle: calculatePartingRunnerUAngle(Math.max(0.1, diameter), uWidth)
      });
    }
  }

  return normalizePartingRunnerParams({
    ...params,
    [prop]: value
  } as PartingRunnerParams);
}

function createPartingRunnerTemplateValues(
  diameter: number,
  uAngle: number
): PartingRunnerTemplateValues {
  return {
    diameter,
    uAngle,
    uWidth: calculatePartingRunnerUWidth(diameter, uAngle),
    uHeight: diameter
  };
}

function isPartingRunnerTemplate(
  value: unknown
): value is PartingRunnerTemplate {
  return value === "D3" || value === "D4" || value === "D5";
}

export function normalizePartingRunnerParams(
  params: PartingRunnerParams
): PartingRunnerParams {
  const runnerType: PartingRunnerType =
    params.runnerType === "u" || params.runnerType === "trapezoid"
      ? params.runnerType
      : "round";
  const template = isPartingRunnerTemplate(
    (params as { template?: unknown }).template
  )
    ? params.template
    : DEFAULT_PARTING_RUNNER_PARAMS.template;
  const parsedDiameter =
    typeof params.diameter === "number"
      ? params.diameter
      : Number(params.diameter);
  const parsedUAngle =
    typeof params.uAngle === "number" ? params.uAngle : Number(params.uAngle);
  const diameter = Number.isFinite(parsedDiameter) ? parsedDiameter : 3;
  const uAngle = Number.isFinite(parsedUAngle)
    ? parsedUAngle
    : PARTING_RUNNER_TEMPLATE_VALUES[template].uAngle;
  const normalizedDiameter = Math.max(0.1, diameter);
  const normalizedUAngle = Math.min(179.9, Math.max(0.1, uAngle));
  return {
    runnerType,
    template,
    diameter: normalizedDiameter,
    uAngle: normalizedUAngle,
    uWidth: calculatePartingRunnerUWidth(normalizedDiameter, normalizedUAngle),
    uHeight: normalizedDiameter
  };
}

export function createPartingRunnerParams(): PartingRunnerParams {
  return normalizePartingRunnerParams(lastPartingRunnerParams);
}

export function rememberPartingRunnerParams(params: PartingRunnerParams): void {
  const normalized = normalizePartingRunnerParams(params);
  lastPartingRunnerParams = {
    ...lastPartingRunnerParams,
    runnerType: normalized.runnerType,
    template: normalized.template,
    diameter: normalized.diameter,
    uAngle: normalized.uAngle,
    uWidth: normalized.uWidth,
    uHeight: normalized.uHeight
  };
}

export function buildPartingRunnerShape(
  start: XYZ,
  end: XYZ,
  params: PartingRunnerParams
) {
  const next = normalizePartingRunnerParams(params);
  const radius = next.diameter / 2;
  switch (next.runnerType) {
    case "u":
      return createPipeShellU(
        next.uWidth,
        next.uHeight,
        next.uWidth,
        next.uHeight,
        true,
        true,
        start,
        end
      );
    case "trapezoid":
    case "round":
    default:
      return createPipeShellRound(radius, radius, true, true, start, end);
  }
}

export function buildPartingRunnerFeatureGeometry(
  start: XYZ,
  end: XYZ,
  params: PartingRunnerParams
): FeatureGeometryResult {
  return {
    shape: buildPartingRunnerShape(start, end, params),
    guides: [
      buildLineGuide("runner-centerline", "feature", start, end, {
        roles: ["display", "pickProxy"]
      })
    ]
  };
}

export function buildPartingRunnerPreviewMeshes(
  start: XYZ,
  end: XYZ,
  params: PartingRunnerParams
): ShapeMeshData[] {
  const meshes: ShapeMeshData[] = [];
  const feature = buildPartingRunnerFeatureGeometry(start, end, params);
  pushShapeMesh(feature.shape, meshes);
  meshes.push(
    ...buildGuideEdgeMeshes(feature.guides, { advancedOcclusion: true })
  );
  return meshes;
}

export function buildPartingRunnerGuideMeshes(
  start: XYZ,
  end: XYZ
): ShapeMeshData[] {
  return buildGuideEdgeMeshes(
    [
      buildLineGuide("runner-centerline", "feature", start, end, {
        roles: ["display", "pickProxy"]
      })
    ],
    { advancedOcclusion: true }
  );
}

export function buildPartingRunnerFormSections(): GateFormSection[] {
  return [
    {
      key: "partingRunnerBase",
      fields: [
        {
          key: "runnerType",
          prop: "runnerType",
          labelKey: "modelai.partingRunner.runnerTypeLabel",
          kind: "radio",
          options: [
            {
              value: "round",
              labelKey: "modelai.partingRunner.runnerType.round"
            },
            {
              value: "u",
              labelKey: "modelai.partingRunner.runnerType.u"
            },
            {
              value: "trapezoid",
              labelKey: "modelai.partingRunner.runnerType.trapezoid",
              disabled: true
            }
          ]
        },
        {
          key: "template",
          prop: "template",
          labelKey: "modelai.partingRunner.templateLabel",
          kind: "select",
          options: [
            { value: "D3", labelKey: "modelai.partingRunner.template.D3" },
            { value: "D4", labelKey: "modelai.partingRunner.template.D4" },
            { value: "D5", labelKey: "modelai.partingRunner.template.D5" }
          ],
          hidden: getValue => getValue("runnerType") !== "u"
        },
        {
          key: "diameter",
          prop: "diameter",
          labelKey: "modelai.partingRunner.diameter",
          kind: "number",
          min: 0.1,
          step: 0.5,
          controls: true,
          hidden: getValue => getValue("runnerType") !== "round"
        },
        {
          key: "uDiameter",
          prop: "diameter",
          labelKey: "modelai.partingRunner.uDiameter",
          kind: "number",
          min: 0.1,
          step: 0.5,
          controls: true,
          hidden: getValue => getValue("runnerType") !== "u"
        },
        {
          key: "uAngle",
          prop: "uAngle",
          labelKey: "modelai.partingRunner.uAngle",
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
          labelKey: "modelai.partingRunner.uWidth",
          kind: "number",
          min: 0.1,
          step: 0.01,
          controls: true,
          hidden: getValue => getValue("runnerType") !== "u"
        },
        {
          key: "uHeight",
          prop: "uHeight",
          labelKey: "modelai.partingRunner.uHeight",
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

type PartingRunnerEndpointState = {
  start: XYZ;
  end: XYZ;
};

type PartingRunnerNodeEditState = {
  params: PartingRunnerParams;
  endpoints: PartingRunnerEndpointState;
};

export type PartingRunnerNodeEditBinding = {
  getNode(): PartingRunnerNode;
  getParams(): PartingRunnerParams;
  getEndpoints(): PartingRunnerEndpointState;
  getEndpointPlane(endpoint: PartingRunnerEndpoint): Plane;
  getState(): PartingRunnerNodeEditState;
  setParams(params: PartingRunnerParams): void;
  setEndpoint(
    endpoint: PartingRunnerEndpoint,
    point: XYZ,
    options?: { rebuild?: boolean }
  ): void;
  setEndpoints(
    endpoints: PartingRunnerEndpointState,
    options?: { rebuild?: boolean }
  ): void;
  restore(snapshot: PartingRunnerNodeEditState): void;
  snapshot(): PartingRunnerNodeEditState;
  subscribe(listener: () => void): () => void;
};

export type PartingRunnerEndpointDragSession = {
  update(point: XYZ): void;
  finalize(): void;
  cancel(): void;
};

type PartingRunnerEditorLifecycle = {
  kind: "create" | "edit";
  debugLabel: string;
  confirm(runtime: PartingRunnerEditorRuntime): void;
  cancel(runtime: PartingRunnerEditorRuntime): void;
};

type RunPartingRunnerEditorOptions = {
  document: IDocument;
  controller: AsyncController;
  node: PartingRunnerNode;
  lifecycle: PartingRunnerEditorLifecycle;
};

export type PartingRunnerEditorHandle = {
  readonly document: IDocument;
  readonly node: PartingRunnerNode;
  readonly controller: AsyncController;
  readonly runtime: PartingRunnerEditorRuntime;
  wait(): Promise<boolean>;
  confirm(): void;
  cancel(): void;
  dispose(): void;
};

function isViewNavigationPointerEvent(event: PointerEvent): boolean {
  return event.button === 1 || event.buttons === 4;
}

class PartingRunnerConfirmHandler implements IEventHandler {
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

const partingRunnerDebugObjectIds = new WeakMap<object, string>();
const partingRunnerDebugObjectCounters: Record<string, number> = {};

function partingRunnerDebugObjectId(
  prefix: string,
  value: object | undefined
): string {
  if (!value) return `${prefix}#none`;
  const current = partingRunnerDebugObjectIds.get(value);
  if (current) return current;
  const nextNumber = (partingRunnerDebugObjectCounters[prefix] ?? 0) + 1;
  partingRunnerDebugObjectCounters[prefix] = nextNumber;
  const next = `${prefix}#${nextNumber}`;
  partingRunnerDebugObjectIds.set(value, next);
  return next;
}

function partingRunnerDebugPoint(point: XYZ) {
  return { x: point.x, y: point.y, z: point.z };
}

function partingRunnerDebugEndpoints(endpoints: PartingRunnerEndpointState) {
  return {
    start: partingRunnerDebugPoint(endpoints.start),
    end: partingRunnerDebugPoint(endpoints.end)
  };
}

function isPartingRunnerEditorDebugEnabled(): boolean {
  const value = (globalThis as Record<string, unknown>)[
    "__MODELAI_PARTING_RUNNER_EDITOR_DEBUG__"
  ];
  return value === true || value === "1";
}

export function debugPartingRunnerEditorEvent(
  event: string,
  payload: Record<string, unknown>
): void {
  if (!isPartingRunnerEditorDebugEnabled()) return;
  console.info("[PartingRunnerEditorRuntime]", event, payload);
}

function debugPartingRunnerEditor(
  event: string,
  runtime: PartingRunnerEditorRuntime,
  extra?: Record<string, unknown>
): void {
  const state = runtime.getDebugState();
  debugPartingRunnerEditorEvent(event, {
    shell: state.shell,
    runtime: partingRunnerDebugObjectId("runtime", runtime),
    node: partingRunnerDebugObjectId("node", state.node),
    binding: partingRunnerDebugObjectId("binding", state.binding),
    nodeObject: state.node,
    bindingObject: state.binding,
    ...extra
  });
}

function clonePartingRunnerEndpoints(
  endpoints: PartingRunnerEndpointState
): PartingRunnerEndpointState {
  return {
    start: new XYZ(endpoints.start.x, endpoints.start.y, endpoints.start.z),
    end: new XYZ(endpoints.end.x, endpoints.end.y, endpoints.end.z)
  };
}

export function bindPartingRunnerForEdit(
  node: PartingRunnerNode
): PartingRunnerNodeEditBinding {
  const listeners = new Set<() => void>();
  const editNode = resolveEditableShapeSource(node) as PartingRunnerNode;
  const notifyChanged = () => {
    listeners.forEach(listener => listener());
  };
  const getParams = () =>
    cloneGateParams(normalizePartingRunnerParams(editNode.exportParams()));
  const getEndpoints = () => ({
    start: mapEditablePointToNodeView(
      node,
      editNode.exportEndpointState().start
    ),
    end: mapEditablePointToNodeView(node, editNode.exportEndpointState().end)
  });
  const getEndpointPlane = (endpoint: PartingRunnerEndpoint) =>
    mapEditablePlaneToNodeView(
      node,
      Plane.XY().translateTo(editNode.exportEndpointState()[endpoint])
    );
  const applyEndpointState = (
    endpoints: PartingRunnerEndpointState,
    options?: { rebuild?: boolean }
  ) => {
    const current = editNode.exportEndpointState();
    const next = {
      start: mapNodeViewPointToEditable(node, endpoints.start),
      end: mapNodeViewPointToEditable(node, endpoints.end)
    };
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
      const next = normalizePartingRunnerParams(params);
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

export function createPartingRunnerEndpointDragSession(options: {
  document: IDocument;
  node: PartingRunnerNode;
  binding: PartingRunnerNodeEditBinding;
  endpoint: PartingRunnerEndpoint;
  source: "semantic-handle" | "create-second-point";
  rebuildOnUpdate?: boolean;
  refreshPreview?: () => void;
}): PartingRunnerEndpointDragSession {
  let active = true;
  beginSemanticHandleDragGhost(options.document, options.node);
  const writeEndpoint = (point: XYZ, rebuild: boolean) => {
    if (!active) return;
    debugPartingRunnerEditorEvent("semantic-drag:endpoint", {
      source: options.source,
      write: "binding:endpoints",
      endpoint: options.endpoint,
      node: partingRunnerDebugObjectId("node", options.node),
      binding: partingRunnerDebugObjectId("binding", options.binding),
      point: partingRunnerDebugPoint(point),
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
      debugPartingRunnerEditorEvent("semantic-drag:endpoint", {
        source: options.source,
        write: "binding:endpoints",
        endpoint: options.endpoint,
        node: partingRunnerDebugObjectId("node", options.node),
        binding: partingRunnerDebugObjectId("binding", options.binding),
        point: partingRunnerDebugPoint(point),
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

export function createPartingRunnerEditorRuntime(options: {
  document: IDocument;
  node: PartingRunnerNode;
  lifecycle: PartingRunnerEditorLifecycle;
}): PartingRunnerEditorRuntime {
  return new PartingRunnerEditorRuntime(
    options.document,
    options.node,
    options.lifecycle
  );
}

export function startPartingRunnerEditor(options: {
  document: IDocument;
  controller?: AsyncController;
  node: PartingRunnerNode;
  lifecycle: PartingRunnerEditorLifecycle;
}): PartingRunnerEditorHandle {
  const controller = options.controller ?? new AsyncController();
  options.document.selection.clearSelection();
  options.document.visual.highlighter.clear();
  options.document.visual.update();
  const runtime = createPartingRunnerEditorRuntime({
    document: options.document,
    node: options.node,
    lifecycle: options.lifecycle
  });
  const registration = runtime.createFormKitRegistration(controller);
  const unmount = mountFormKit(registration);
  const handler = runtime.attachHandle(controller);
  let disposed = false;

  debugPartingRunnerEditor("start", runtime, {
    controller: partingRunnerDebugObjectId("controller", controller),
    handler: partingRunnerDebugObjectId("handler", handler),
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
    debugPartingRunnerEditor("dispose:start", runtime);
    unmount();
    runtime.dispose();
    if (!options.controller) controller.dispose();
    debugPartingRunnerEditor("dispose:done", runtime);
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

export async function runPartingRunnerEditor(
  options: RunPartingRunnerEditorOptions
): Promise<boolean> {
  return startPartingRunnerEditor({
    document: options.document,
    node: options.node,
    controller: options.controller,
    lifecycle: options.lifecycle
  }).wait();
}

export function createPartingRunnerCreateLifecycle(): PartingRunnerEditorLifecycle {
  return {
    kind: "create",
    debugLabel: "create parting runner",
    confirm(runtime) {
      debugPartingRunnerEditor("confirm:create", runtime, {
        action: "keep-existing-node-for-command-commit"
      });
    },
    cancel(runtime) {
      const { document, node } = runtime;
      debugPartingRunnerEditor("cancel:create", runtime, {
        action: "remove-visual-and-dispose-node"
      });
      document.visual.context.removeNode([node]);
      node.parent = undefined;
      node.dispose();
      document.visual.update();
    }
  };
}

export function commitCreatedPartingRunnerNode(options: {
  document: IDocument;
  node: PartingRunnerNode;
  parent: INodeLinkedList;
}): void {
  const params = options.node.exportParams();
  debugPartingRunnerEditorEvent("commit:create", {
    shell: "create",
    node: partingRunnerDebugObjectId("node", options.node),
    parent: partingRunnerDebugObjectId("parent", options.parent),
    nodeObject: options.node,
    parentObject: options.parent
  });
  rememberPartingRunnerParams(params);
  options.document.visual.context.removeNode([options.node]);
  resolveNodeParentWithRunnerRootGrouping(
    options.document,
    options.node,
    options.parent
  ).add(options.node);
  options.document.visual.update();
}

export function createPartingRunnerEditLifecycle(): PartingRunnerEditorLifecycle {
  return {
    kind: "edit",
    debugLabel: "edit parting runner",
    confirm(runtime) {
      debugPartingRunnerEditor("confirm:edit", runtime);
      runtime.pushEditHistory();
    },
    cancel(runtime) {
      debugPartingRunnerEditor("cancel:edit", runtime, {
        action: "restore-initial-snapshot"
      });
      runtime.restoreInitialState();
    }
  };
}

export class PartingRunnerEditorRuntime extends Observable {
  readonly nodeBinding: PartingRunnerNodeEditBinding;
  readonly initialParams: PartingRunnerParams;
  readonly initialEndpoints: PartingRunnerEndpointState;
  private params: PartingRunnerParams;
  private endpoints: PartingRunnerEndpointState;
  private handler?: IEventHandler & { dispose(): void; refreshPreview(): void };
  private releaseBinding?: () => void;
  private activeEndpointDrag?: PartingRunnerEndpointDragSession;
  private applyingToBinding = false;
  private completed = false;

  constructor(
    readonly document: IDocument,
    readonly node: PartingRunnerNode,
    private readonly lifecycle: PartingRunnerEditorLifecycle
  ) {
    super();
    this.nodeBinding = bindPartingRunnerForEdit(node);
    const initial = this.nodeBinding.snapshot();
    this.initialParams = cloneGateParams(initial.params);
    this.initialEndpoints = clonePartingRunnerEndpoints(initial.endpoints);
    this.params = cloneGateParams(initial.params);
    this.endpoints = clonePartingRunnerEndpoints(initial.endpoints);
    this.releaseBinding = this.nodeBinding.subscribe(() => {
      if (this.applyingToBinding) return;
      this.syncFromBinding();
    });
    debugPartingRunnerEditor("runtime:create", this);
  }

  getParams(): PartingRunnerParams {
    return cloneGateParams(this.params);
  }

  getEndpoints(): PartingRunnerEndpointState {
    return clonePartingRunnerEndpoints(this.endpoints);
  }

  setParams(next: PartingRunnerParams): void {
    let nextParams = normalizePartingRunnerParams(cloneGateParams(next));
    this.applyingToBinding = true;
    try {
      this.nodeBinding.setParams(nextParams);
      nextParams = this.nodeBinding.getParams();
    } finally {
      this.applyingToBinding = false;
    }
    const changed = hasGateParamsChanged(this.params, nextParams);
    debugPartingRunnerEditor("form:write-params", this, {
      write: "binding:params",
      changed,
      params: nextParams
    });
    if (!changed) return;
    this.params = cloneGateParams(nextParams);
    this.endpoints = clonePartingRunnerEndpoints(
      this.nodeBinding.getEndpoints()
    );
    this.handler?.refreshPreview();
    this.emitPropertyChanged("params", undefined);
  }

  createFormKitRegistration(controller: AsyncController): FormKitRegistration {
    debugPartingRunnerEditor("form:mount", this, {
      controller: partingRunnerDebugObjectId("controller", controller),
      controllerObject: controller
    });
    return createGateFormKitRegistration({
      formKitId: "partingRunner",
      titleKey: "modelai.partingRunner.group",
      sections: buildPartingRunnerFormSections(),
      controller,
      owner: this,
      getValue: prop => this.params[prop as keyof PartingRunnerParams],
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
    const endpointTool = new PartingRunnerEndpointTool(
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
    const handler = new PartingRunnerConfirmHandler(
      controller,
      this.document.visual.eventHandler,
      endpointTool
    );
    this.handler = handler;
    debugPartingRunnerEditor("handle:attach", this, {
      handler: partingRunnerDebugObjectId("handler", handler),
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
    debugPartingRunnerEditor("runtime:confirm", this);
    this.lifecycle.confirm(this);
  }

  cancel(): void {
    if (this.completed) return;
    this.completed = true;
    debugPartingRunnerEditor("runtime:cancel", this);
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
    const paramsChanged = hasGateParamsChanged(this.initialParams, afterParams);
    const endpointsChanged = hasGateParamsChanged(
      this.initialEndpoints,
      afterEndpoints
    );
    debugPartingRunnerEditor("history:check", this, {
      paramsChanged,
      endpointsChanged,
      action: paramsChanged || endpointsChanged ? "push" : "skip"
    });
    if (!paramsChanged && !endpointsChanged) return;
    if (paramsChanged) {
      rememberPartingRunnerParams(afterParams);
    }
    const historyTarget = resolveNodeParamsHistoryTarget(this.node);
    if (endpointsChanged) {
      historyTarget.applyEndpoints(afterSourceEndpoints, {
        recordHistory: false,
        rebuild: true
      });
    }
    Transaction.execute(this.document, "edit parting runner", () => {
      if (paramsChanged) {
        Transaction.add(
          this.document,
          new NodeParamsHistoryRecord({
            name: "edit parting runner params",
            node: historyTarget,
            before: this.initialParams,
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
            name: "edit parting runner endpoints",
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
    debugPartingRunnerEditor("snapshot:restore", this, {
      params: this.initialParams,
      endpoints: partingRunnerDebugEndpoints(this.initialEndpoints)
    });
    this.applyingToBinding = true;
    try {
      this.nodeBinding.restore({
        params: cloneGateParams(this.initialParams),
        endpoints: clonePartingRunnerEndpoints(this.initialEndpoints)
      });
    } finally {
      this.applyingToBinding = false;
    }
    this.params = cloneGateParams(this.initialParams);
    this.endpoints = clonePartingRunnerEndpoints(this.initialEndpoints);
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
    this.releaseBinding?.();
    this.releaseBinding = undefined;
    this.cancelEndpointDrag();
    this.handler?.dispose();
    this.handler = undefined;
    super.disposeInternal();
  }

  private setFieldValue(prop: string, value: unknown): void {
    if (prop === "template") {
      const template = value as PartingRunnerTemplate;
      this.setParams({
        ...this.params,
        template,
        ...getPartingRunnerTemplateValues(template)
      });
      return;
    }
    this.setParams(updatePartingRunnerParams(this.params, prop, value));
  }

  private syncFromBinding(): void {
    const nextParams = this.nodeBinding.getParams();
    const nextEndpoints = this.nodeBinding.getEndpoints();
    const paramsChanged = hasGateParamsChanged(this.params, nextParams);
    const endpointsChanged = hasGateParamsChanged(
      this.endpoints,
      nextEndpoints
    );
    debugPartingRunnerEditor("binding:changed", this, {
      paramsChanged,
      endpointsChanged,
      params: nextParams,
      endpoints: partingRunnerDebugEndpoints(nextEndpoints)
    });
    if (paramsChanged) {
      this.params = cloneGateParams(nextParams);
      this.emitPropertyChanged("params", undefined);
    }
    if (endpointsChanged) {
      this.endpoints = clonePartingRunnerEndpoints(nextEndpoints);
    }
    this.handler?.refreshPreview();
  }

  private beginEndpointDrag(endpoint: PartingRunnerEndpoint): void {
    this.activeEndpointDrag?.cancel();
    this.activeEndpointDrag = createPartingRunnerEndpointDragSession({
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
    endpoint: PartingRunnerEndpoint,
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

export function createPartingRunnerNode(
  start: XYZ,
  end: XYZ,
  params: PartingRunnerParams = createPartingRunnerParams()
): PartingRunnerNode {
  return new PartingRunnerNode(
    transformI18n("modelai.body.partingRunner"),
    start,
    end,
    params
  );
}

export function createPartingRunnerPointData(options: {
  getStart?: () => XYZ;
  getDragGhostNode?: () => PartingRunnerNode | undefined;
}): {
  firstPointData: () => PointSnapData;
  secondPointData: () => PointSnapData;
  secondPointPreview: (point: XYZ | undefined) => ShapeMeshData[];
} {
  const secondPointPreview = (_point: XYZ | undefined): ShapeMeshData[] => [];
  return {
    firstPointData: () => ({
      filter: shape => shape.owner.node !== options.getDragGhostNode?.()
    }),
    secondPointData: () => ({
      refPoint: () => options.getStart?.(),
      filter: shape => shape.owner.node !== options.getDragGhostNode?.(),
      dimension: Dimension.D1D2D3,
      validator: point => {
        const start = options.getStart?.();
        return start ? start.distanceTo(point) > Precision.Distance : false;
      },
      preview: secondPointPreview
    }),
    secondPointPreview
  };
}
