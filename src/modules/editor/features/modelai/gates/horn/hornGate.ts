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
import type { Plane, XYZ } from "@modelai/core/math";
import { mountFormKit } from "@modelai/ui/formKit/mount";
import type { FormKitRegistration } from "@modelai/ui/formKit/runtime";
import type { ThreeView } from "@/features/modelai/viewer/view";
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
  createGateFormKitRegistration,
  type GateFormSection
} from "../shared/formKit";
import {
  cloneGateParams,
  cloneGatePlane,
  GateParamsHistoryRecord,
  hasGateParamsChanged,
  hasGatePlaneChanged
} from "../shared/gateParamsHistory";
import type {
  GateNodeAdapter,
  GateNodeApplyOptions
} from "../shared/nodeAdapter";
import { resolveNodeParentWithRunnerRootGrouping } from "../shared/runnerGroup";
import { SemanticHandleGroup } from "../shared/semanticHandleGroup";
import { HornGateNode } from "./hornGateNode";
export { HornGateNode } from "./hornGateNode";

export type HornGateTemplate = "D3" | "D4" | "D5" | "D6" | "D8";

export type HornGateParams = {
  template: HornGateTemplate;
  gateDiameter: number;
  gateSpreadingAngle: number;
  gateLength: number;
  gateAngle: number;
  hornDiameterStart: number;
  hornDiameterEnd: number;
  channelOffsetX: number;
  channelOffsetY: number;
};

export const HORN_GATE_FIXED_GATE_ANGLE = -15;

type HornGateTemplateValues = Omit<HornGateParams, "template">;

const HORN_GATE_TEMPLATE_VALUES: Record<
  HornGateTemplate,
  HornGateTemplateValues
> = {
  D3: {
    gateDiameter: 0.6,
    gateSpreadingAngle: 20,
    gateLength: 1.5,
    gateAngle: HORN_GATE_FIXED_GATE_ANGLE,
    hornDiameterStart: 1.8,
    hornDiameterEnd: 3,
    channelOffsetX: 10,
    channelOffsetY: 1.5
  },
  D4: {
    gateDiameter: 0.8,
    gateSpreadingAngle: 20,
    gateLength: 1.5,
    gateAngle: HORN_GATE_FIXED_GATE_ANGLE,
    hornDiameterStart: 2.5,
    hornDiameterEnd: 4,
    channelOffsetX: 10,
    channelOffsetY: 2
  },
  D5: {
    gateDiameter: 1,
    gateSpreadingAngle: 20,
    gateLength: 1.5,
    gateAngle: HORN_GATE_FIXED_GATE_ANGLE,
    hornDiameterStart: 3,
    hornDiameterEnd: 5,
    channelOffsetX: 10,
    channelOffsetY: 2.5
  },
  D6: {
    gateDiameter: 1.2,
    gateSpreadingAngle: 20,
    gateLength: 1.5,
    gateAngle: HORN_GATE_FIXED_GATE_ANGLE,
    hornDiameterStart: 3.5,
    hornDiameterEnd: 6,
    channelOffsetX: 12,
    channelOffsetY: 3
  },
  D8: {
    gateDiameter: 1.4,
    gateSpreadingAngle: 20,
    gateLength: 1.5,
    gateAngle: HORN_GATE_FIXED_GATE_ANGLE,
    hornDiameterStart: 5,
    hornDiameterEnd: 8,
    channelOffsetX: 16,
    channelOffsetY: 4
  }
};

export function getHornGateTemplateValues(
  template: HornGateTemplate
): HornGateTemplateValues {
  return normalizeHornGateParams({
    template,
    ...HORN_GATE_TEMPLATE_VALUES[template]
  });
}

export function createHornGateParams(
  template: HornGateTemplate = "D3"
): HornGateParams {
  return normalizeHornGateParams({
    template,
    ...getHornGateTemplateValues(template)
  });
}

export function normalizeHornGateParams(
  params: HornGateParams
): HornGateParams {
  return {
    ...params,
    gateAngle: HORN_GATE_FIXED_GATE_ANGLE
  };
}

export const hornGateNodeAdapter: GateNodeAdapter<
  HornGateParams,
  HornGateNode
> = {
  isNode(node: INode): node is HornGateNode {
    return node instanceof HornGateNode;
  },
  createNode(name: string, plane: Plane, params: HornGateParams): HornGateNode {
    return new HornGateNode(name, plane, params);
  },
  fromNode(node: HornGateNode): HornGateParams {
    return node.exportParams();
  },
  getPlane(node: HornGateNode): Plane {
    return node.plane;
  },
  applyToNode(
    node: HornGateNode,
    params: HornGateParams,
    options?: GateNodeApplyOptions
  ): void {
    node.applyParams(params, options);
  },
  applyPlacement(
    node: HornGateNode,
    plane: Plane,
    options?: GateNodeApplyOptions
  ): void {
    node.applyPlacement(plane, options);
  }
};

export function buildHornGateFormSections(options: {
  getParams: () => HornGateParams;
  updateParams: (patch: Partial<HornGateParams>) => void;
}): GateFormSection[] {
  void options.getParams;
  void options.updateParams;

  return [
    {
      key: "hornGate",
      fields: [
        {
          key: "template",
          prop: "template",
          labelKey: "modelai.hornGate.templateLabel",
          kind: "select",
          options: [
            { value: "D3", labelKey: "modelai.hornGate.template.D3" },
            { value: "D4", labelKey: "modelai.hornGate.template.D4" },
            { value: "D5", labelKey: "modelai.hornGate.template.D5" },
            { value: "D6", labelKey: "modelai.hornGate.template.D6" },
            { value: "D8", labelKey: "modelai.hornGate.template.D8" }
          ]
        },
        {
          key: "gateDiameter",
          prop: "gateDiameter",
          labelKey: "modelai.hornGate.diameter",
          kind: "number",
          min: 0.1,
          max: 50,
          step: 0.1
        },
        {
          key: "gateSpreadingAngle",
          prop: "gateSpreadingAngle",
          labelKey: "modelai.hornGate.spreadingAngle",
          kind: "number",
          min: 1,
          max: 89,
          step: 0.1
        },
        {
          key: "gateLength",
          prop: "gateLength",
          labelKey: "modelai.hornGate.length",
          kind: "number",
          min: 0.1,
          max: 50,
          step: 0.1
        },
        {
          key: "hornDiameterStart",
          prop: "hornDiameterStart",
          labelKey: "modelai.hornGate.hornDiameterStart",
          kind: "number",
          min: 0.1,
          max: 50,
          step: 0.1
        },
        {
          key: "hornDiameterEnd",
          prop: "hornDiameterEnd",
          labelKey: "modelai.hornGate.hornDiameterEnd",
          kind: "number",
          min: 0.1,
          max: 50,
          step: 0.1
        },
        {
          key: "channelOffsetX",
          prop: "channelOffsetX",
          labelKey: "modelai.hornGate.channelOffsetX",
          kind: "number",
          min: 0.1,
          max: 200,
          step: 0.1
        },
        {
          key: "channelOffsetY",
          prop: "channelOffsetY",
          labelKey: "modelai.hornGate.channelOffsetY",
          kind: "number",
          min: -50,
          max: 50,
          step: 0.1
        }
      ]
    }
  ];
}

function isHornSemanticHandleEnabled(): boolean {
  const value = (globalThis as Record<string, unknown>)[
    "__MODELAI_HORN_HANDLE_TOOL__"
  ];
  return value !== false && value !== "0";
}

function hornTailPosition(
  origin: XYZ,
  plane: Plane,
  params: HornGateParams
): XYZ {
  return origin
    .add(plane.xvec.multiply(params.channelOffsetX))
    .sub(plane.normal.multiply(params.channelOffsetY));
}

function setHornParams(
  ctx: SemanticHandleContext,
  patch: Partial<HornGateParams>
): void {
  const target = ctx.target as HornSemanticHandleTarget;
  target.updateParams(
    normalizeHornGateParams({ ...target.getParams(), ...patch })
  );
}

type HornSemanticHandleContext = SemanticHandleTarget & {
  getParams(): HornGateParams;
  updateParams(params: HornGateParams): void;
};

type HornSemanticHandleTarget = HornSemanticHandleContext;

const hornDebugObjectIds = new WeakMap<object, string>();
const hornDebugObjectCounters: Record<string, number> = {};

function hornDebugObjectId(prefix: string, value: object | undefined): string {
  if (!value) return `${prefix}#none`;
  const current = hornDebugObjectIds.get(value);
  if (current) return current;
  const nextNumber = (hornDebugObjectCounters[prefix] ?? 0) + 1;
  hornDebugObjectCounters[prefix] = nextNumber;
  const next = `${prefix}#${nextNumber}`;
  hornDebugObjectIds.set(value, next);
  return next;
}

function hornDebugPoint(point: XYZ): { x: number; y: number; z: number } {
  return {
    x: point.x,
    y: point.y,
    z: point.z
  };
}

type HornSemanticHandleConfig = {
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

export type HornSemanticHandleToolOptions = {
  document: IDocument;
  controller: AsyncController;
  origin: XYZ;
  plane: Plane;
  config: HornSemanticHandleConfig;
  view?: ThreeView;
  nodeBinding: NodeEditBinding<HornGateParams, HornGateNode>;
};

export class HornSemanticHandleTool implements SemanticHandlePlacementHandler {
  private readonly startTool: SemanticHandleTool;
  private readonly tailTool: SemanticHandleTool;
  private readonly handleGroup: SemanticHandleGroup;

  get isEnabled() {
    return this.handleGroup.isEnabled;
  }

  set isEnabled(value: boolean) {
    this.handleGroup.isEnabled = value;
  }

  get lastView() {
    return this.handleGroup.lastView;
  }

  constructor(
    document: IDocument,
    controller: AsyncController,
    origin: XYZ,
    plane: Plane,
    config: HornSemanticHandleConfig,
    nodeBinding: NodeEditBinding<HornGateParams, HornGateNode>,
    view?: ThreeView
  ) {
    void origin;
    void plane;
    const initialPlane = nodeBinding.getPlane();
    const initialParams = normalizeHornGateParams(nodeBinding.getParams());
    nodeBinding.setParams(initialParams);
    let axisDragStartOrigin = initialPlane.origin;
    let planeDragStartOrigin = initialPlane.origin;
    let startOffsetX = initialParams.channelOffsetX;
    let startOffsetY = initialParams.channelOffsetY;
    const getCurrentPlane = () => nodeBinding.getPlane();
    const getCurrentOrigin = () => getCurrentPlane().origin;
    const getCurrentParams = () =>
      normalizeHornGateParams(nodeBinding.getParams());
    const applyPlacement = (nextOrigin: XYZ, nextPlane: Plane) => {
      let currentPlane = nextPlane;
      const constrained = config.onOriginDrag?.(nextOrigin, nextPlane);
      if (constrained) {
        currentPlane = nextPlane.translateTo(constrained);
      }
      debugHornGateEditorEvent("semantic-drag:plane", {
        source: "semantic-handle",
        write: "binding:plane",
        node: hornDebugObjectId("node", nodeBinding.getNode()),
        binding: hornDebugObjectId("binding", nodeBinding),
        nextOrigin: hornDebugPoint(nextOrigin),
        appliedOrigin: hornDebugPoint(currentPlane.origin),
        nodeObject: nodeBinding.getNode(),
        bindingObject: nodeBinding
      });
      nodeBinding.setPlane(currentPlane);
    };
    const applyParams = (params: HornGateParams) => {
      const nextParams = normalizeHornGateParams(params);
      debugHornGateEditorEvent("semantic-drag:params", {
        source: "semantic-handle",
        write: "binding:params",
        node: hornDebugObjectId("node", nodeBinding.getNode()),
        binding: hornDebugObjectId("binding", nodeBinding),
        params: nextParams,
        nodeObject: nodeBinding.getNode(),
        bindingObject: nodeBinding
      });
      nodeBinding.setParams(nextParams);
    };
    const target: HornSemanticHandleTarget = {
      getOrigin: getCurrentOrigin,
      getPlane: getCurrentPlane,
      getDragGhostNode: () => nodeBinding.getNode(),
      getParams: getCurrentParams,
      updateParams: applyParams
    };

    const tailTarget: HornSemanticHandleTarget = {
      getOrigin: () =>
        hornTailPosition(
          getCurrentOrigin(),
          getCurrentPlane(),
          getCurrentParams()
        ),
      getPlane: getCurrentPlane,
      getDragGhostNode: () => nodeBinding.getNode(),
      getParams: getCurrentParams,
      updateParams: applyParams
    };

    this.startTool = new SemanticHandleTool(
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
        onAxisDragStart: (axis, direction, dragOrigin) => {
          axisDragStartOrigin = dragOrigin;
          config.onAxisDragStart?.(axis, direction, dragOrigin);
        },
        onAxisDrag: (axis, direction, delta) => {
          config.onAxisDrag?.(axis, direction, delta);
          const nextOrigin = axisDragStartOrigin.add(direction.multiply(delta));
          applyPlacement(nextOrigin, getCurrentPlane().translateTo(nextOrigin));
        },
        onDragFrame: () => this.refreshPreview()
      }),
      view
    );
    this.startTool.attach(target);

    this.tailTool = new SemanticHandleTool(
      document,
      controller,
      createSemanticHandleToolConfig({
        dragGhost: true,
        pointMove: false,
        planeMoves: false,
        rotation: false,
        axisMoves: [
          {
            direction: ctx => ctx.plane.xvec,
            onDragStart: ctx => {
              startOffsetX = (
                ctx.target as HornSemanticHandleTarget
              ).getParams().channelOffsetX;
            },
            onDrag: (delta, ctx) => {
              setHornParams(ctx, {
                channelOffsetX: Math.max(0.1, startOffsetX + delta)
              });
            },
            onClick: (showInput, ctx) => {
              const target = ctx.target as HornSemanticHandleTarget;
              showInput(target.getParams().channelOffsetX.toFixed(2), value => {
                if (value > 0) setHornParams(ctx, { channelOffsetX: value });
              });
            },
            formatLabel: delta => Math.max(0.1, startOffsetX + delta).toFixed(2)
          },
          {
            direction: ctx => ctx.plane.normal.multiply(-1),
            onDragStart: ctx => {
              startOffsetY = (
                ctx.target as HornSemanticHandleTarget
              ).getParams().channelOffsetY;
            },
            onDrag: (delta, ctx) => {
              setHornParams(ctx, { channelOffsetY: startOffsetY + delta });
            },
            onClick: (showInput, ctx) => {
              const target = ctx.target as HornSemanticHandleTarget;
              showInput(target.getParams().channelOffsetY.toFixed(2), value => {
                setHornParams(ctx, { channelOffsetY: value });
              });
            },
            formatLabel: delta => (startOffsetY + delta).toFixed(2)
          }
        ],
        onDragFrame: () => this.refreshPreview()
      }),
      view
    );
    this.tailTool.attach(tailTarget);
    this.handleGroup = new SemanticHandleGroup(
      [this.tailTool, this.startTool],
      { keyTool: this.startTool }
    );
  }

  dispose(): void {
    this.handleGroup.dispose();
  }

  refreshPreview(): void {
    this.handleGroup.refreshPreview();
  }

  pointerMove(view: import("@modelai/core").IView, event: PointerEvent): void {
    this.handleGroup.pointerMove(view, event);
  }

  pointerDown(view: import("@modelai/core").IView, event: PointerEvent): void {
    this.handleGroup.pointerDown(view, event);
  }

  pointerUp(view: import("@modelai/core").IView, event: PointerEvent): void {
    this.handleGroup.pointerUp(view, event);
  }

  pointerOut(view: import("@modelai/core").IView, event: PointerEvent): void {
    this.handleGroup.pointerOut(view, event);
  }

  mouseWheel(view: import("@modelai/core").IView, event: WheelEvent): void {
    this.handleGroup.mouseWheel(view, event);
  }

  keyDown(view: import("@modelai/core").IView, event: KeyboardEvent): void {
    this.handleGroup.keyDown(view, event);
  }
}

export function shouldUseHornSemanticHandleTool(): boolean {
  return isHornSemanticHandleEnabled();
}

export function createHornSemanticHandleTool(
  options: HornSemanticHandleToolOptions
): SemanticHandlePlacementHandler {
  if (!shouldUseHornSemanticHandleTool()) {
    throw new Error("Horn semantic handle tool is disabled");
  }
  return new HornSemanticHandleTool(
    options.document,
    options.controller,
    options.origin,
    options.plane,
    options.config,
    options.nodeBinding,
    options.view
  );
}

type HornGateEditorLifecycle = {
  kind: "create" | "edit";
  debugLabel: string;
  confirm(runtime: HornGateEditorRuntime): void;
  cancel(runtime: HornGateEditorRuntime): void;
};

type RunHornGateEditorOptions = {
  document: IDocument;
  controller: AsyncController;
  node: HornGateNode;
  lifecycle: HornGateEditorLifecycle;
};

export type HornGateEditorHandle = {
  readonly document: IDocument;
  readonly node: HornGateNode;
  readonly controller: AsyncController;
  readonly runtime: HornGateEditorRuntime;
  wait(): Promise<boolean>;
  confirm(): void;
  cancel(): void;
  dispose(): void;
};

function isHornEditorDebugEnabled(): boolean {
  const value = (globalThis as Record<string, unknown>)[
    "__MODELAI_HORN_EDITOR_DEBUG__"
  ];
  return value === true || value === "1";
}

export function debugHornGateEditorEvent(
  event: string,
  payload: Record<string, unknown>
): void {
  if (!isHornEditorDebugEnabled()) return;
  console.info("[HornGateEditorRuntime]", event, payload);
}

function debugHornEditor(
  event: string,
  runtime: HornGateEditorRuntime,
  extra?: Record<string, unknown>
): void {
  const state = runtime.getDebugState();
  debugHornGateEditorEvent(event, {
    shell: state.shell,
    runtime: hornDebugObjectId("runtime", runtime),
    node: hornDebugObjectId("node", state.node),
    binding: hornDebugObjectId("binding", state.binding),
    nodeObject: state.node,
    bindingObject: state.binding,
    ...extra
  });
}

export function createHornGateEditorRuntime(options: {
  document: IDocument;
  node: HornGateNode;
  lifecycle: HornGateEditorLifecycle;
}): HornGateEditorRuntime {
  return new HornGateEditorRuntime(
    options.document,
    options.node,
    options.lifecycle
  );
}

export function startHornGateEditor(options: {
  document: IDocument;
  controller?: AsyncController;
  node: HornGateNode;
  lifecycle: HornGateEditorLifecycle;
}): HornGateEditorHandle {
  const controller = options.controller ?? new AsyncController();
  options.document.selection.clearSelection();
  options.document.visual.highlighter.clear();
  options.document.visual.update();
  const runtime = createHornGateEditorRuntime({
    document: options.document,
    node: options.node,
    lifecycle: options.lifecycle
  });
  const registration = runtime.createFormKitRegistration(controller);
  const unmount = mountFormKit(registration);
  const handler = runtime.attachHandle(controller);
  let disposed = false;

  debugHornEditor("start", runtime, {
    controller: hornDebugObjectId("controller", controller),
    handler: hornDebugObjectId("handler", handler),
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
    debugHornEditor("dispose:start", runtime);
    unmount();
    runtime.dispose();
    if (!options.controller) controller.dispose();
    debugHornEditor("dispose:done", runtime);
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

export async function runHornGateEditor(
  options: RunHornGateEditorOptions
): Promise<boolean> {
  return startHornGateEditor({
    document: options.document,
    node: options.node,
    controller: options.controller,
    lifecycle: options.lifecycle
  }).wait();
}

export function createHornGateCreateLifecycle(options: {
  parent: INodeLinkedList;
}): HornGateEditorLifecycle {
  void options;
  return {
    kind: "create",
    debugLabel: "create horn gate",
    confirm(runtime) {
      debugHornEditor("confirm:create", runtime, {
        action: "keep-existing-node-for-command-commit"
      });
    },
    cancel(runtime) {
      const { document, node } = runtime;
      debugHornEditor("cancel:create", runtime, {
        action: "remove-visual-and-dispose-node"
      });
      document.visual.context.removeNode([node]);
      node.parent = undefined;
      node.dispose();
      document.visual.update();
    }
  };
}

export function commitCreatedHornGateNode(options: {
  document: IDocument;
  node: HornGateNode;
  parent: INodeLinkedList;
}): void {
  debugHornGateEditorEvent("commit:create", {
    shell: "create",
    node: hornDebugObjectId("node", options.node),
    parent: hornDebugObjectId("parent", options.parent),
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

export function createHornGateEditLifecycle(): HornGateEditorLifecycle {
  return {
    kind: "edit",
    debugLabel: "edit horn gate params",
    confirm(runtime) {
      debugHornEditor("confirm:edit", runtime);
      runtime.pushEditHistory();
    },
    cancel(runtime) {
      debugHornEditor("cancel:edit", runtime, {
        action: "restore-initial-snapshot"
      });
      runtime.restoreInitialState();
    }
  };
}

export class HornGateEditorRuntime extends Observable {
  readonly nodeBinding: NodeEditBinding<HornGateParams, HornGateNode>;
  readonly initialParams: HornGateParams;
  readonly initialPlane: Plane;
  private params: HornGateParams;
  private handler?: SemanticHandlePlacementHandler;
  private releaseBinding?: () => void;
  private applyingToBinding = false;
  private completed = false;

  constructor(
    readonly document: IDocument,
    readonly node: HornGateNode,
    private readonly lifecycle: HornGateEditorLifecycle
  ) {
    super();
    this.nodeBinding = bindNodeForEdit(node, hornGateNodeAdapter);
    const initialParams = normalizeHornGateParams(this.nodeBinding.getParams());
    this.initialParams = cloneGateParams(initialParams);
    this.initialPlane = cloneGatePlane(this.nodeBinding.getPlane());
    this.params = cloneGateParams(initialParams);
    this.nodeBinding.setParams(initialParams);
    this.releaseBinding = this.nodeBinding.subscribe(() => {
      if (this.applyingToBinding) return;
      this.syncFromBinding();
    });
    debugHornEditor("runtime:create", this);
  }

  getParams(): HornGateParams {
    return cloneGateParams(this.params);
  }

  setParams(next: HornGateParams): void {
    let nextParams = cloneGateParams(next);
    this.applyingToBinding = true;
    try {
      this.nodeBinding.setParams(nextParams);
      nextParams = this.nodeBinding.getParams();
    } finally {
      this.applyingToBinding = false;
    }
    const changed = hasGateParamsChanged(this.params, nextParams);
    debugHornEditor("form:write-params", this, {
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
    debugHornEditor("form:mount", this, {
      controller: hornDebugObjectId("controller", controller),
      controllerObject: controller
    });
    const sections = buildHornGateFormSections({
      getParams: () => this.getParams(),
      updateParams: patch => {
        this.setParams(
          normalizeHornGateParams({
            ...this.params,
            ...patch
          })
        );
      }
    });
    return createGateFormKitRegistration({
      formKitId: "hornGate",
      titleKey: "modelai.hornGate.group",
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
    const handler = createHornSemanticHandleTool({
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
    debugHornEditor("handle:attach", this, {
      handler: hornDebugObjectId("handler", handler),
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
    debugHornEditor("runtime:confirm", this);
    this.lifecycle.confirm(this);
  }

  cancel(): void {
    if (this.completed) return;
    this.completed = true;
    debugHornEditor("runtime:cancel", this);
    this.lifecycle.cancel(this);
  }

  pushEditHistory(): void {
    const afterParams = this.getParams();
    const afterPlane = cloneGatePlane(this.nodeBinding.getPlane());
    const paramsChanged = hasGateParamsChanged(this.initialParams, afterParams);
    const planeChanged = hasGatePlaneChanged(this.initialPlane, afterPlane);
    debugHornEditor("history:check", this, {
      paramsChanged,
      planeChanged,
      action: paramsChanged || planeChanged ? "push" : "skip"
    });
    if (!paramsChanged && !planeChanged) return;
    Transaction.addToHistory(
      this.document,
      new GateParamsHistoryRecord({
        name: "edit horn gate params",
        node: this.node,
        adapter: hornGateNodeAdapter,
        before: this.initialParams,
        after: afterParams,
        beforePlane: planeChanged ? this.initialPlane : undefined,
        afterPlane: planeChanged ? afterPlane : undefined
      })
    );
  }

  restoreInitialState(): void {
    debugHornEditor("snapshot:restore", this, {
      params: this.initialParams,
      origin: hornDebugPoint(this.initialPlane.origin)
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
    return this.params[prop as keyof HornGateParams];
  }

  private setFieldValue(prop: string, value: unknown): void {
    if (prop === "template") {
      const template = value as HornGateTemplate;
      this.setParams(
        normalizeHornGateParams({
          template,
          ...getHornGateTemplateValues(template)
        })
      );
      return;
    }
    if (prop === "gateAngle") return;
    this.setParams(
      normalizeHornGateParams({
        ...this.params,
        [prop]: value
      })
    );
  }

  private syncFromBinding(): void {
    const nextParams = normalizeHornGateParams(this.nodeBinding.getParams());
    const paramsChanged = hasGateParamsChanged(this.params, nextParams);
    debugHornEditor("binding:changed", this, {
      paramsChanged,
      params: nextParams,
      origin: hornDebugPoint(this.nodeBinding.getPlane().origin)
    });
    if (paramsChanged) {
      this.params = cloneGateParams(nextParams);
      this.emitPropertyChanged("params", undefined);
    }
    this.handler?.refreshPreview();
  }
}
