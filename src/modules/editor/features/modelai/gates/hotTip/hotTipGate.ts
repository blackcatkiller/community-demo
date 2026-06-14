// @ts-nocheck
import {
  AsyncController,
  Observable,
  Transaction,
  type IDocument
} from "@modelai/core";
import type {
  INode,
  INodeLinkedList,
  VisualShapeData
} from "@modelai/core/types";
import { MathUtils, type Plane, type XYZ } from "@modelai/core/math";
import { mountFormKit } from "@modelai/ui/formKit/mount";
import type { FormKitRegistration } from "@modelai/ui/formKit/runtime";
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
import type { ThreeView } from "@/features/modelai/viewer/view";
import {
  type PinPointGateTemplate,
  getPinPointGateTemplateValues
} from "../pinPoint/pinPointGate";
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
import { HotTipGateNode } from "./hotTipGateNode";
export { HotTipGateNode } from "./hotTipGateNode";

export type HotTipGateTemplate = PinPointGateTemplate;

export type HotTipGateParams = {
  template: HotTipGateTemplate;
  gateDiameter: number;
  gateAngle: number;
  gateLength: number;
  tiltAngle: number;
};

export const HOT_TIP_TILT_ANGLE_MIN = 0;
export const HOT_TIP_TILT_ANGLE_MAX = 45;

type HotTipGateTemplateValues = Omit<HotTipGateParams, "template">;

const HANDLE_TILT_ANGLE_COLOR = 0xf3eadb;
const HANDLE_LENGTH_COLOR = 0xff6600;

function clampHotTipTiltAngle(value: number): number {
  return Math.max(
    HOT_TIP_TILT_ANGLE_MIN,
    Math.min(
      HOT_TIP_TILT_ANGLE_MAX,
      Number.isFinite(value) ? value : HOT_TIP_TILT_ANGLE_MAX
    )
  );
}

export function getHotTipGateTemplateValues(
  template: HotTipGateTemplate
): HotTipGateTemplateValues {
  const values = getPinPointGateTemplateValues(template);
  return {
    gateDiameter: values.gateDiameter,
    gateAngle: values.gateAngle,
    gateLength: values.gateLength,
    tiltAngle: HOT_TIP_TILT_ANGLE_MAX
  };
}

export function createHotTipGateParams(
  template: HotTipGateTemplate = "P0.6"
): HotTipGateParams {
  return normalizeHotTipGateParams({
    template,
    ...getHotTipGateTemplateValues(template)
  });
}

export function normalizeHotTipGateParams(
  params: HotTipGateParams
): HotTipGateParams {
  return {
    ...params,
    tiltAngle: clampHotTipTiltAngle(params.tiltAngle)
  };
}

export const hotTipGateNodeAdapter: GateNodeAdapter<
  HotTipGateParams,
  HotTipGateNode
> = {
  isNode(node: INode): node is HotTipGateNode {
    return node instanceof HotTipGateNode;
  },
  createNode(
    name: string,
    plane: Plane,
    params: HotTipGateParams
  ): HotTipGateNode {
    return new HotTipGateNode(name, plane, params);
  },
  fromNode(node: HotTipGateNode): HotTipGateParams {
    return node.exportParams();
  },
  getPlane(node: HotTipGateNode): Plane {
    return node.plane;
  },
  applyToNode(
    node: HotTipGateNode,
    params: HotTipGateParams,
    options?: GateNodeApplyOptions
  ): void {
    node.applyParams(params, options);
  },
  applyPlacement(
    node: HotTipGateNode,
    plane: Plane,
    options?: GateNodeApplyOptions
  ): void {
    node.applyPlacement(plane, options);
  }
};

export function buildHotTipGateFormSections(options: {
  getParams: () => HotTipGateParams;
  updateParams: (patch: Partial<HotTipGateParams>) => void;
}): GateFormSection[] {
  void options.getParams;
  void options.updateParams;

  return [
    {
      key: "hotTipGate",
      fields: [
        {
          key: "template",
          prop: "template",
          labelKey: "modelai.hotTipGate.templateLabel",
          kind: "select",
          options: [
            { value: "P0.6", labelKey: "modelai.hotTipGate.template.P0_6" },
            { value: "P0.8", labelKey: "modelai.hotTipGate.template.P0_8" },
            { value: "P1.0", labelKey: "modelai.hotTipGate.template.P1_0" },
            { value: "P1.2", labelKey: "modelai.hotTipGate.template.P1_2" },
            { value: "P1.4", labelKey: "modelai.hotTipGate.template.P1_4" },
            { value: "P1.6", labelKey: "modelai.hotTipGate.template.P1_6" }
          ]
        },
        {
          key: "gateDiameter",
          prop: "gateDiameter",
          labelKey: "modelai.hotTipGate.diameter",
          kind: "number",
          min: 0.1,
          max: 50,
          step: 0.1
        },
        {
          key: "gateAngle",
          prop: "gateAngle",
          labelKey: "modelai.hotTipGate.angle",
          kind: "number",
          min: 1,
          max: 89,
          step: 0.1
        },
        {
          key: "gateLength",
          prop: "gateLength",
          labelKey: "modelai.hotTipGate.length",
          kind: "number",
          min: 0.1,
          max: 50,
          step: 0.1
        },
        {
          key: "tiltAngle",
          prop: "tiltAngle",
          labelKey: "modelai.hotTipGate.tiltAngle",
          kind: "number",
          min: HOT_TIP_TILT_ANGLE_MIN,
          max: HOT_TIP_TILT_ANGLE_MAX,
          step: 0.1
        }
      ]
    }
  ];
}

function isHotTipSemanticHandleEnabled(): boolean {
  const value = (globalThis as Record<string, unknown>)[
    "__MODELAI_HOT_TIP_HANDLE_TOOL__"
  ];
  return value !== false && value !== "0";
}

function hotTipLengthDirection(plane: Plane, params: HotTipGateParams): XYZ {
  const tiltAngleRad = MathUtils.degToRad(params.tiltAngle);
  return plane.xvec
    .multiply(Math.sin(tiltAngleRad))
    .add(plane.normal.multiply(Math.cos(tiltAngleRad)));
}

function hotTipLengthEnd(
  origin: XYZ,
  plane: Plane,
  params: HotTipGateParams
): XYZ {
  return origin.add(
    hotTipLengthDirection(plane, params).multiply(params.gateLength)
  );
}

function setHotTipParams(
  ctx: SemanticHandleContext,
  patch: Partial<HotTipGateParams>
): void {
  const target = ctx.target as HotTipSemanticHandleTarget;
  target.updateParams(
    normalizeHotTipGateParams({ ...target.getParams(), ...patch })
  );
}

function hotTipAxisDirection(axis: "X" | "Y" | "Z", plane: Plane): XYZ {
  if (axis === "X") return plane.xvec;
  if (axis === "Y") return plane.yvec;
  return plane.normal;
}

type HotTipSemanticHandleContext = SemanticHandleTarget & {
  getParams(): HotTipGateParams;
  updateParams(params: HotTipGateParams): void;
};

type HotTipSemanticHandleTarget = HotTipSemanticHandleContext;

const hotTipDebugObjectIds = new WeakMap<object, string>();
const hotTipDebugObjectCounters: Record<string, number> = {};

function hotTipDebugObjectId(
  prefix: string,
  value: object | undefined
): string {
  if (!value) return `${prefix}#none`;
  const current = hotTipDebugObjectIds.get(value);
  if (current) return current;
  const nextNumber = (hotTipDebugObjectCounters[prefix] ?? 0) + 1;
  hotTipDebugObjectCounters[prefix] = nextNumber;
  const next = `${prefix}#${nextNumber}`;
  hotTipDebugObjectIds.set(value, next);
  return next;
}

function hotTipDebugPoint(point: XYZ): { x: number; y: number; z: number } {
  return {
    x: point.x,
    y: point.y,
    z: point.z
  };
}

type HotTipSemanticHandleConfig = {
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

export type HotTipSemanticHandleToolOptions = {
  document: IDocument;
  controller: AsyncController;
  origin: XYZ;
  plane: Plane;
  config: HotTipSemanticHandleConfig;
  view?: ThreeView;
  nodeBinding: NodeEditBinding<HotTipGateParams, HotTipGateNode>;
};

export class HotTipSemanticHandleTool
  implements SemanticHandlePlacementHandler
{
  private readonly bodyTool: SemanticHandleTool;

  get isEnabled() {
    return this.bodyTool.isEnabled;
  }

  set isEnabled(value: boolean) {
    this.bodyTool.isEnabled = value;
  }

  get lastView() {
    return this.bodyTool.lastView;
  }

  constructor(
    document: IDocument,
    controller: AsyncController,
    origin: XYZ,
    plane: Plane,
    config: HotTipSemanticHandleConfig,
    nodeBinding: NodeEditBinding<HotTipGateParams, HotTipGateNode>,
    view?: ThreeView
  ) {
    void origin;
    void plane;
    const initialPlane = nodeBinding.getPlane();
    const initialParams = normalizeHotTipGateParams(nodeBinding.getParams());
    nodeBinding.setParams(initialParams);
    let axisDragStartOrigin = initialPlane.origin;
    let planeDragStartOrigin = initialPlane.origin;
    let startGateLength = initialParams.gateLength;
    const getCurrentPlane = () => nodeBinding.getPlane();
    const getCurrentOrigin = () => getCurrentPlane().origin;
    const getCurrentParams = () =>
      normalizeHotTipGateParams(nodeBinding.getParams());
    const applyPlacement = (nextOrigin: XYZ, nextPlane: Plane) => {
      let currentPlane = nextPlane;
      const constrained = config.onOriginDrag?.(nextOrigin, nextPlane);
      if (constrained) {
        currentPlane = nextPlane.translateTo(constrained);
      }
      debugHotTipGateEditorEvent("semantic-drag:plane", {
        source: "semantic-handle",
        write: "binding:plane",
        node: hotTipDebugObjectId("node", nodeBinding.getNode()),
        binding: hotTipDebugObjectId("binding", nodeBinding),
        nextOrigin: hotTipDebugPoint(nextOrigin),
        appliedOrigin: hotTipDebugPoint(currentPlane.origin),
        nodeObject: nodeBinding.getNode(),
        bindingObject: nodeBinding
      });
      nodeBinding.setPlane(currentPlane);
    };
    const applyParams = (params: HotTipGateParams) => {
      const nextParams = normalizeHotTipGateParams(params);
      debugHotTipGateEditorEvent("semantic-drag:params", {
        source: "semantic-handle",
        write: "binding:params",
        node: hotTipDebugObjectId("node", nodeBinding.getNode()),
        binding: hotTipDebugObjectId("binding", nodeBinding),
        params: nextParams,
        nodeObject: nodeBinding.getNode(),
        bindingObject: nodeBinding
      });
      nodeBinding.setParams(nextParams);
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
    const target: HotTipSemanticHandleTarget = {
      getOrigin: getCurrentOrigin,
      getPlane: getCurrentPlane,
      getDragGhostNode: () => nodeBinding.getNode(),
      getParams: getCurrentParams,
      updateParams: applyParams
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
        rotation: {
          onDrag: nextPlane => {
            applyPlacement(nextPlane.origin, nextPlane);
          }
        },
        axisMoves: [
          {
            axis: "X",
            onDragStart: ctx => {
              axisDragStartOrigin = ctx.origin;
              config.onAxisDragStart?.("X", ctx.plane.xvec, ctx.origin);
            },
            onDrag: (delta, ctx) => {
              applyAxisPlacement(
                "X",
                hotTipAxisDirection("X", ctx.plane),
                delta
              );
            }
          },
          {
            axis: "Y",
            onDragStart: ctx => {
              axisDragStartOrigin = ctx.origin;
              config.onAxisDragStart?.("Y", ctx.plane.yvec, ctx.origin);
            },
            onDrag: (delta, ctx) => {
              applyAxisPlacement(
                "Y",
                hotTipAxisDirection("Y", ctx.plane),
                delta
              );
            }
          },
          {
            axis: "Z",
            onDragStart: ctx => {
              axisDragStartOrigin = ctx.origin;
              config.onAxisDragStart?.("Z", ctx.plane.normal, ctx.origin);
            },
            onDrag: (delta, ctx) => {
              applyAxisPlacement(
                "Z",
                hotTipAxisDirection("Z", ctx.plane),
                delta
              );
            }
          },
          {
            direction: ctx =>
              hotTipLengthDirection(
                ctx.plane,
                (ctx.target as HotTipSemanticHandleTarget).getParams()
              ),
            getHandlePosition: ctx =>
              hotTipLengthEnd(
                ctx.origin,
                ctx.plane,
                (ctx.target as HotTipSemanticHandleTarget).getParams()
              ),
            onDragStart: ctx => {
              startGateLength = (
                ctx.target as HotTipSemanticHandleTarget
              ).getParams().gateLength;
            },
            onDrag: (delta, ctx) => {
              setHotTipParams(ctx, {
                gateLength: Math.max(0.1, startGateLength + delta)
              });
            },
            onClick: (showInput, ctx) => {
              const target = ctx.target as HotTipSemanticHandleTarget;
              showInput(target.getParams().gateLength.toFixed(2), value => {
                if (value > 0) setHotTipParams(ctx, { gateLength: value });
              });
            },
            formatLabel: delta =>
              Math.max(0.1, startGateLength + delta).toFixed(2),
            visual: {
              arrow: false,
              guideFromOrigin: true,
              color: HANDLE_LENGTH_COLOR
            }
          }
        ],
        angleValues: [
          {
            getValue: ctx =>
              (ctx.target as HotTipSemanticHandleTarget).getParams().tiltAngle,
            setValue: (value, ctx) =>
              setHotTipParams(ctx, {
                tiltAngle: value
              }),
            getPlaneNormal: ctx => ctx.plane.yvec,
            getReferenceDir: ctx => ctx.plane.normal,
            getHandleDirection: ctx =>
              hotTipLengthDirection(
                ctx.plane,
                (ctx.target as HotTipSemanticHandleTarget).getParams()
              ),
            min: HOT_TIP_TILT_ANGLE_MIN,
            max: HOT_TIP_TILT_ANGLE_MAX,
            startDeg: HOT_TIP_TILT_ANGLE_MIN,
            endDeg: HOT_TIP_TILT_ANGLE_MAX,
            color: HANDLE_TILT_ANGLE_COLOR
          }
        ],
        onDragFrame: () => this.refreshPreview()
      }),
      view
    );
    this.bodyTool.attach(target);
  }

  dispose(): void {
    this.bodyTool.dispose();
  }

  refreshPreview(): void {
    this.bodyTool.refreshPreview();
  }

  pointerMove(view: import("@modelai/core").IView, event: PointerEvent): void {
    this.bodyTool.pointerMove(view, event);
  }

  pointerDown(view: import("@modelai/core").IView, event: PointerEvent): void {
    this.bodyTool.pointerDown(view, event);
  }

  pointerUp(view: import("@modelai/core").IView, event: PointerEvent): void {
    this.bodyTool.pointerUp(view, event);
  }

  pointerOut(view: import("@modelai/core").IView, event: PointerEvent): void {
    this.bodyTool.pointerOut(view, event);
  }

  mouseWheel(view: import("@modelai/core").IView, event: WheelEvent): void {
    this.bodyTool.mouseWheel(view, event);
  }

  keyDown(view: import("@modelai/core").IView, event: KeyboardEvent): void {
    this.bodyTool.keyDown(view, event);
  }
}

export function shouldUseHotTipSemanticHandleTool(): boolean {
  return isHotTipSemanticHandleEnabled();
}

export function createHotTipSemanticHandleTool(
  options: HotTipSemanticHandleToolOptions
): SemanticHandlePlacementHandler {
  if (!shouldUseHotTipSemanticHandleTool()) {
    throw new Error("Hot-tip semantic handle tool is disabled");
  }
  return new HotTipSemanticHandleTool(
    options.document,
    options.controller,
    options.origin,
    options.plane,
    options.config,
    options.nodeBinding,
    options.view
  );
}

type HotTipGateEditorLifecycle = {
  kind: "create" | "edit";
  debugLabel: string;
  confirm(runtime: HotTipGateEditorRuntime): void;
  cancel(runtime: HotTipGateEditorRuntime): void;
};

type RunHotTipGateEditorOptions = {
  document: IDocument;
  controller: AsyncController;
  node: HotTipGateNode;
  lifecycle: HotTipGateEditorLifecycle;
};

export type HotTipGateEditorHandle = {
  readonly document: IDocument;
  readonly node: HotTipGateNode;
  readonly controller: AsyncController;
  readonly runtime: HotTipGateEditorRuntime;
  wait(): Promise<boolean>;
  confirm(): void;
  cancel(): void;
  dispose(): void;
};

function isHotTipEditorDebugEnabled(): boolean {
  const value = (globalThis as Record<string, unknown>)[
    "__MODELAI_HOT_TIP_EDITOR_DEBUG__"
  ];
  return value === true || value === "1";
}

export function debugHotTipGateEditorEvent(
  event: string,
  payload: Record<string, unknown>
): void {
  if (!isHotTipEditorDebugEnabled()) return;
  console.info("[HotTipGateEditorRuntime]", event, payload);
}

function debugHotTipEditor(
  event: string,
  runtime: HotTipGateEditorRuntime,
  extra?: Record<string, unknown>
): void {
  const state = runtime.getDebugState();
  debugHotTipGateEditorEvent(event, {
    shell: state.shell,
    runtime: hotTipDebugObjectId("runtime", runtime),
    node: hotTipDebugObjectId("node", state.node),
    binding: hotTipDebugObjectId("binding", state.binding),
    nodeObject: state.node,
    bindingObject: state.binding,
    ...extra
  });
}

export function createHotTipGateEditorRuntime(options: {
  document: IDocument;
  node: HotTipGateNode;
  lifecycle: HotTipGateEditorLifecycle;
}): HotTipGateEditorRuntime {
  return new HotTipGateEditorRuntime(
    options.document,
    options.node,
    options.lifecycle
  );
}

export function startHotTipGateEditor(options: {
  document: IDocument;
  controller?: AsyncController;
  node: HotTipGateNode;
  lifecycle: HotTipGateEditorLifecycle;
}): HotTipGateEditorHandle {
  const controller = options.controller ?? new AsyncController();
  options.document.selection.clearSelection();
  options.document.visual.highlighter.clear();
  options.document.visual.update();
  const runtime = createHotTipGateEditorRuntime({
    document: options.document,
    node: options.node,
    lifecycle: options.lifecycle
  });
  const registration = runtime.createFormKitRegistration(controller);
  const unmount = mountFormKit(registration);
  const handler = runtime.attachHandle(controller);
  let disposed = false;

  debugHotTipEditor("start", runtime, {
    controller: hotTipDebugObjectId("controller", controller),
    handler: hotTipDebugObjectId("handler", handler),
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
    debugHotTipEditor("dispose:start", runtime);
    unmount();
    runtime.dispose();
    if (!options.controller) controller.dispose();
    debugHotTipEditor("dispose:done", runtime);
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

export async function runHotTipGateEditor(
  options: RunHotTipGateEditorOptions
): Promise<boolean> {
  return startHotTipGateEditor({
    document: options.document,
    node: options.node,
    controller: options.controller,
    lifecycle: options.lifecycle
  }).wait();
}

export function createHotTipGateCreateLifecycle(options: {
  parent: INodeLinkedList;
}): HotTipGateEditorLifecycle {
  void options;
  return {
    kind: "create",
    debugLabel: "create hot-tip gate",
    confirm(runtime) {
      debugHotTipEditor("confirm:create", runtime, {
        action: "keep-existing-node-for-command-commit"
      });
    },
    cancel(runtime) {
      const { document, node } = runtime;
      debugHotTipEditor("cancel:create", runtime, {
        action: "remove-visual-and-dispose-node"
      });
      document.visual.context.removeNode([node]);
      node.parent = undefined;
      node.dispose();
      document.visual.update();
    }
  };
}

export function commitCreatedHotTipGateNode(options: {
  document: IDocument;
  node: HotTipGateNode;
  parent: INodeLinkedList;
}): void {
  debugHotTipGateEditorEvent("commit:create", {
    shell: "create",
    node: hotTipDebugObjectId("node", options.node),
    parent: hotTipDebugObjectId("parent", options.parent),
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

export function createHotTipGateEditLifecycle(): HotTipGateEditorLifecycle {
  return {
    kind: "edit",
    debugLabel: "edit hot-tip gate params",
    confirm(runtime) {
      debugHotTipEditor("confirm:edit", runtime);
      runtime.pushEditHistory();
    },
    cancel(runtime) {
      debugHotTipEditor("cancel:edit", runtime, {
        action: "restore-initial-snapshot"
      });
      runtime.restoreInitialState();
    }
  };
}

export class HotTipGateEditorRuntime extends Observable {
  readonly nodeBinding: NodeEditBinding<HotTipGateParams, HotTipGateNode>;
  readonly initialParams: HotTipGateParams;
  readonly initialPlane: Plane;
  private params: HotTipGateParams;
  private handler?: SemanticHandlePlacementHandler;
  private releaseBinding?: () => void;
  private applyingToBinding = false;
  private completed = false;

  constructor(
    readonly document: IDocument,
    readonly node: HotTipGateNode,
    private readonly lifecycle: HotTipGateEditorLifecycle
  ) {
    super();
    this.nodeBinding = bindNodeForEdit(node, hotTipGateNodeAdapter);
    const initialParams = normalizeHotTipGateParams(
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
    debugHotTipEditor("runtime:create", this);
  }

  getParams(): HotTipGateParams {
    return cloneGateParams(this.params);
  }

  setParams(next: HotTipGateParams): void {
    let nextParams = cloneGateParams(next);
    this.applyingToBinding = true;
    try {
      this.nodeBinding.setParams(nextParams);
      nextParams = this.nodeBinding.getParams();
    } finally {
      this.applyingToBinding = false;
    }
    const changed = hasGateParamsChanged(this.params, nextParams);
    debugHotTipEditor("form:write-params", this, {
      write: "binding:params",
      changed,
      params: nextParams
    });
    if (!changed) return;
    this.params = cloneGateParams(nextParams);
    this.handler?.refreshPreview();
    this.emitPropertyChanged("params", undefined);
  }

  createFormKitRegistration(controller: AsyncController): FormKitRegistration {
    debugHotTipEditor("form:mount", this, {
      controller: hotTipDebugObjectId("controller", controller),
      controllerObject: controller
    });
    const sections = buildHotTipGateFormSections({
      getParams: () => this.getParams(),
      updateParams: patch => {
        this.setParams(
          normalizeHotTipGateParams({
            ...this.params,
            ...patch
          })
        );
      }
    });
    return createGateFormKitRegistration({
      formKitId: "hotTipGate",
      titleKey: "modelai.hotTipGate.group",
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
    const handler = createHotTipSemanticHandleTool({
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
    debugHotTipEditor("handle:attach", this, {
      handler: hotTipDebugObjectId("handler", handler),
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
    debugHotTipEditor("runtime:confirm", this);
    this.lifecycle.confirm(this);
  }

  cancel(): void {
    if (this.completed) return;
    this.completed = true;
    debugHotTipEditor("runtime:cancel", this);
    this.lifecycle.cancel(this);
  }

  pushEditHistory(): void {
    const afterParams = this.getParams();
    const afterPlane = cloneGatePlane(this.nodeBinding.getPlane());
    const paramsChanged = hasGateParamsChanged(this.initialParams, afterParams);
    const planeChanged = hasGatePlaneChanged(this.initialPlane, afterPlane);
    debugHotTipEditor("history:check", this, {
      paramsChanged,
      planeChanged,
      action: paramsChanged || planeChanged ? "push" : "skip"
    });
    if (!paramsChanged && !planeChanged) return;
    Transaction.addToHistory(
      this.document,
      new GateParamsHistoryRecord({
        name: "edit hot-tip gate params",
        node: this.node,
        adapter: hotTipGateNodeAdapter,
        before: this.initialParams,
        after: afterParams,
        beforePlane: planeChanged ? this.initialPlane : undefined,
        afterPlane: planeChanged ? afterPlane : undefined
      })
    );
  }

  restoreInitialState(): void {
    debugHotTipEditor("snapshot:restore", this, {
      params: this.initialParams,
      origin: hotTipDebugPoint(this.initialPlane.origin)
    });
    this.nodeBinding.restore({
      params: cloneGateParams(this.initialParams),
      plane: cloneGatePlane(this.initialPlane)
    });
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
    this.handler?.dispose();
    this.handler = undefined;
    super.disposeInternal();
  }

  private getFieldValue(prop: string): unknown {
    return this.params[prop as keyof HotTipGateParams];
  }

  private setFieldValue(prop: string, value: unknown): void {
    if (prop === "template") {
      const template = value as HotTipGateTemplate;
      this.setParams(
        normalizeHotTipGateParams({
          template,
          ...getHotTipGateTemplateValues(template)
        })
      );
      return;
    }
    this.setParams(
      normalizeHotTipGateParams({
        ...this.params,
        [prop]: value
      })
    );
  }

  private syncFromBinding(): void {
    const nextParams = normalizeHotTipGateParams(this.nodeBinding.getParams());
    const paramsChanged = hasGateParamsChanged(this.params, nextParams);
    debugHotTipEditor("binding:changed", this, {
      paramsChanged,
      params: nextParams,
      origin: hotTipDebugPoint(this.nodeBinding.getPlane().origin)
    });
    if (paramsChanged) {
      this.params = cloneGateParams(nextParams);
      this.emitPropertyChanged("params", undefined);
    }
    this.handler?.refreshPreview();
  }
}

export function createHotTipGateNode(
  plane: Plane,
  params: HotTipGateParams = createHotTipGateParams()
): HotTipGateNode {
  return hotTipGateNodeAdapter.createNode(
    transformI18n("modelai.body.hotTipGate"),
    plane,
    params
  );
}
