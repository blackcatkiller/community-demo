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
import { transformI18n } from "@/plugins/i18n";
import {
  createSemanticHandleToolConfig,
  SemanticHandleTool,
  type SemanticHandlePlacementHandler,
  type SemanticHandleTarget
} from "@/features/modelai/commands/create/shared/semanticHandleTool";
import {
  bindNodeForEdit,
  type NodeEditBinding
} from "@/features/modelai/editing/nodeEditBinding";
import type { ThreeView } from "@/features/modelai/viewer/view";
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
import { PinPointGateNode } from "./pinPointGateNode";
export { PinPointGateNode } from "./pinPointGateNode";

export type PinPointGateTemplate =
  | "P0.6"
  | "P0.8"
  | "P1.0"
  | "P1.2"
  | "P1.4"
  | "P1.6";

export type PinPointGateParams = {
  template: PinPointGateTemplate;
  gateDiameter: number;
  gateAngle: number;
  gateLength: number;
};

type PinPointGateTemplateValues = Omit<PinPointGateParams, "template">;

const PIN_POINT_GATE_TEMPLATE_DIAMETERS: Record<PinPointGateTemplate, number> =
  {
    "P0.6": 0.6,
    "P0.8": 0.8,
    "P1.0": 1,
    "P1.2": 1.2,
    "P1.4": 1.4,
    "P1.6": 1.6
  };

export function getPinPointGateTemplateValues(
  template: PinPointGateTemplate
): PinPointGateTemplateValues {
  return {
    gateDiameter: PIN_POINT_GATE_TEMPLATE_DIAMETERS[template],
    gateAngle: 24,
    gateLength: 1.2
  };
}

export function createPinPointGateParams(
  template: PinPointGateTemplate = "P0.6"
): PinPointGateParams {
  return normalizePinPointGateParams({
    template,
    ...getPinPointGateTemplateValues(template)
  });
}

export function normalizePinPointGateParams(
  params: PinPointGateParams
): PinPointGateParams {
  return {
    ...params,
    gateDiameter: Math.max(0.1, params.gateDiameter),
    gateAngle: Math.max(
      1,
      Math.min(89, Number.isFinite(params.gateAngle) ? params.gateAngle : 24)
    ),
    gateLength: Math.max(0.1, params.gateLength)
  };
}

export const pinPointGateNodeAdapter: GateNodeAdapter<
  PinPointGateParams,
  PinPointGateNode
> = {
  isNode(node: INode): node is PinPointGateNode {
    return node instanceof PinPointGateNode;
  },
  createNode(
    name: string,
    plane: Plane,
    params: PinPointGateParams
  ): PinPointGateNode {
    return new PinPointGateNode(name, plane, params);
  },
  fromNode(node: PinPointGateNode): PinPointGateParams {
    return node.exportParams();
  },
  getPlane(node: PinPointGateNode): Plane {
    return node.plane;
  },
  applyToNode(
    node: PinPointGateNode,
    params: PinPointGateParams,
    options?: GateNodeApplyOptions
  ): void {
    node.applyParams(params, options);
  },
  applyPlacement(
    node: PinPointGateNode,
    plane: Plane,
    options?: GateNodeApplyOptions
  ): void {
    node.applyPlacement(plane, options);
  }
};

export function buildPinPointGateFormSections(options: {
  getParams: () => PinPointGateParams;
  updateParams: (patch: Partial<PinPointGateParams>) => void;
}): GateFormSection[] {
  void options.getParams;
  void options.updateParams;

  return [
    {
      key: "pinPointGate",
      fields: [
        {
          key: "template",
          prop: "template",
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

function isPinPointSemanticHandleEnabled(): boolean {
  const value = (globalThis as Record<string, unknown>)[
    "__MODELAI_PIN_POINT_HANDLE_TOOL__"
  ];
  return value !== false && value !== "0";
}

function pinPointAxisDirection(axis: "X" | "Y" | "Z", plane: Plane): XYZ {
  if (axis === "X") return plane.xvec;
  if (axis === "Y") return plane.yvec;
  return plane.normal;
}

type PinPointSemanticHandleContext = SemanticHandleTarget & {
  getParams(): PinPointGateParams;
  updateParams(params: PinPointGateParams): void;
};

type PinPointSemanticHandleTarget = PinPointSemanticHandleContext;

const pinPointDebugObjectIds = new WeakMap<object, string>();
const pinPointDebugObjectCounters: Record<string, number> = {};

function pinPointDebugObjectId(
  prefix: string,
  value: object | undefined
): string {
  if (!value) return `${prefix}#none`;
  const current = pinPointDebugObjectIds.get(value);
  if (current) return current;
  const nextNumber = (pinPointDebugObjectCounters[prefix] ?? 0) + 1;
  pinPointDebugObjectCounters[prefix] = nextNumber;
  const next = `${prefix}#${nextNumber}`;
  pinPointDebugObjectIds.set(value, next);
  return next;
}

function pinPointDebugPoint(point: XYZ): { x: number; y: number; z: number } {
  return {
    x: point.x,
    y: point.y,
    z: point.z
  };
}

type PinPointSemanticHandleConfig = {
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

export type PinPointSemanticHandleToolOptions = {
  document: IDocument;
  controller: AsyncController;
  origin: XYZ;
  plane: Plane;
  config: PinPointSemanticHandleConfig;
  view?: ThreeView;
  nodeBinding: NodeEditBinding<PinPointGateParams, PinPointGateNode>;
};

export class PinPointSemanticHandleTool
  implements SemanticHandlePlacementHandler
{
  private readonly startTool: SemanticHandleTool;

  get isEnabled() {
    return this.startTool.isEnabled;
  }

  set isEnabled(value: boolean) {
    this.startTool.isEnabled = value;
  }

  get lastView() {
    return this.startTool.lastView;
  }

  constructor(
    document: IDocument,
    controller: AsyncController,
    origin: XYZ,
    plane: Plane,
    config: PinPointSemanticHandleConfig,
    nodeBinding: NodeEditBinding<PinPointGateParams, PinPointGateNode>,
    view?: ThreeView
  ) {
    void origin;
    void plane;
    const initialPlane = nodeBinding.getPlane();
    const initialParams = normalizePinPointGateParams(nodeBinding.getParams());
    nodeBinding.setParams(initialParams);
    let axisDragStartOrigin = initialPlane.origin;
    let planeDragStartOrigin = initialPlane.origin;
    const getCurrentPlane = () => nodeBinding.getPlane();
    const getCurrentOrigin = () => getCurrentPlane().origin;
    const getCurrentParams = () =>
      normalizePinPointGateParams(nodeBinding.getParams());
    const applyPlacement = (nextOrigin: XYZ, nextPlane: Plane) => {
      let currentPlane = nextPlane;
      const constrained = config.onOriginDrag?.(nextOrigin, nextPlane);
      if (constrained) {
        currentPlane = nextPlane.translateTo(constrained);
      }
      debugPinPointGateEditorEvent("semantic-drag:plane", {
        source: "semantic-handle",
        write: "binding:plane",
        node: pinPointDebugObjectId("node", nodeBinding.getNode()),
        binding: pinPointDebugObjectId("binding", nodeBinding),
        nextOrigin: pinPointDebugPoint(nextOrigin),
        appliedOrigin: pinPointDebugPoint(currentPlane.origin),
        nodeObject: nodeBinding.getNode(),
        bindingObject: nodeBinding
      });
      nodeBinding.setPlane(currentPlane);
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
    const target: PinPointSemanticHandleTarget = {
      getOrigin: getCurrentOrigin,
      getPlane: getCurrentPlane,
      getDragGhostNode: () => nodeBinding.getNode(),
      getParams: getCurrentParams,
      updateParams: params => {
        nodeBinding.setParams(normalizePinPointGateParams(params));
      }
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
        rotation: false,
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
                pinPointAxisDirection("X", ctx.plane),
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
                pinPointAxisDirection("Y", ctx.plane),
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
                pinPointAxisDirection("Z", ctx.plane),
                delta
              );
            }
          }
        ],
        onDragFrame: () => this.refreshPreview()
      }),
      view
    );
    this.startTool.attach(target);
  }

  dispose(): void {
    this.startTool.dispose();
  }

  refreshPreview(): void {
    this.startTool.refreshPreview();
  }

  pointerMove(view: import("@modelai/core").IView, event: PointerEvent): void {
    this.startTool.pointerMove(view, event);
  }

  pointerDown(view: import("@modelai/core").IView, event: PointerEvent): void {
    this.startTool.pointerDown(view, event);
  }

  pointerUp(view: import("@modelai/core").IView, event: PointerEvent): void {
    this.startTool.pointerUp(view, event);
  }

  pointerOut(view: import("@modelai/core").IView, event: PointerEvent): void {
    this.startTool.pointerOut(view, event);
  }

  mouseWheel(view: import("@modelai/core").IView, event: WheelEvent): void {
    this.startTool.mouseWheel(view, event);
  }

  keyDown(view: import("@modelai/core").IView, event: KeyboardEvent): void {
    this.startTool.keyDown(view, event);
  }
}

export function shouldUsePinPointSemanticHandleTool(): boolean {
  return isPinPointSemanticHandleEnabled();
}

export function createPinPointSemanticHandleTool(
  options: PinPointSemanticHandleToolOptions
): SemanticHandlePlacementHandler {
  if (!shouldUsePinPointSemanticHandleTool()) {
    throw new Error("Pin-point semantic handle tool is disabled");
  }
  return new PinPointSemanticHandleTool(
    options.document,
    options.controller,
    options.origin,
    options.plane,
    options.config,
    options.nodeBinding,
    options.view
  );
}

type PinPointGateEditorLifecycle = {
  kind: "create" | "edit";
  debugLabel: string;
  confirm(runtime: PinPointGateEditorRuntime): void;
  cancel(runtime: PinPointGateEditorRuntime): void;
};

type RunPinPointGateEditorOptions = {
  document: IDocument;
  controller: AsyncController;
  node: PinPointGateNode;
  lifecycle: PinPointGateEditorLifecycle;
};

export type PinPointGateEditorHandle = {
  readonly document: IDocument;
  readonly node: PinPointGateNode;
  readonly controller: AsyncController;
  readonly runtime: PinPointGateEditorRuntime;
  wait(): Promise<boolean>;
  confirm(): void;
  cancel(): void;
  dispose(): void;
};

function isPinPointEditorDebugEnabled(): boolean {
  const value = (globalThis as Record<string, unknown>)[
    "__MODELAI_PIN_POINT_EDITOR_DEBUG__"
  ];
  return value === true || value === "1";
}

export function debugPinPointGateEditorEvent(
  event: string,
  payload: Record<string, unknown>
): void {
  if (!isPinPointEditorDebugEnabled()) return;
  console.info("[PinPointGateEditorRuntime]", event, payload);
}

function debugPinPointEditor(
  event: string,
  runtime: PinPointGateEditorRuntime,
  extra?: Record<string, unknown>
): void {
  const state = runtime.getDebugState();
  debugPinPointGateEditorEvent(event, {
    shell: state.shell,
    runtime: pinPointDebugObjectId("runtime", runtime),
    node: pinPointDebugObjectId("node", state.node),
    binding: pinPointDebugObjectId("binding", state.binding),
    nodeObject: state.node,
    bindingObject: state.binding,
    ...extra
  });
}

export function createPinPointGateEditorRuntime(options: {
  document: IDocument;
  node: PinPointGateNode;
  lifecycle: PinPointGateEditorLifecycle;
}): PinPointGateEditorRuntime {
  return new PinPointGateEditorRuntime(
    options.document,
    options.node,
    options.lifecycle
  );
}

export function startPinPointGateEditor(options: {
  document: IDocument;
  controller?: AsyncController;
  node: PinPointGateNode;
  lifecycle: PinPointGateEditorLifecycle;
}): PinPointGateEditorHandle {
  const controller = options.controller ?? new AsyncController();
  options.document.selection.clearSelection();
  options.document.visual.highlighter.clear();
  options.document.visual.update();
  const runtime = createPinPointGateEditorRuntime({
    document: options.document,
    node: options.node,
    lifecycle: options.lifecycle
  });
  const registration = runtime.createFormKitRegistration(controller);
  const unmount = mountFormKit(registration);
  const handler = runtime.attachHandle(controller);
  let disposed = false;

  debugPinPointEditor("start", runtime, {
    controller: pinPointDebugObjectId("controller", controller),
    handler: pinPointDebugObjectId("handler", handler),
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
    debugPinPointEditor("dispose:start", runtime);
    unmount();
    runtime.dispose();
    if (!options.controller) controller.dispose();
    debugPinPointEditor("dispose:done", runtime);
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

export async function runPinPointGateEditor(
  options: RunPinPointGateEditorOptions
): Promise<boolean> {
  return startPinPointGateEditor({
    document: options.document,
    node: options.node,
    controller: options.controller,
    lifecycle: options.lifecycle
  }).wait();
}

export function createPinPointGateCreateLifecycle(options: {
  parent: INodeLinkedList;
}): PinPointGateEditorLifecycle {
  void options;
  return {
    kind: "create",
    debugLabel: "create pin-point gate",
    confirm(runtime) {
      debugPinPointEditor("confirm:create", runtime, {
        action: "keep-existing-node-for-command-commit"
      });
    },
    cancel(runtime) {
      const { document, node } = runtime;
      debugPinPointEditor("cancel:create", runtime, {
        action: "remove-visual-and-dispose-node"
      });
      document.visual.context.removeNode([node]);
      node.parent = undefined;
      node.dispose();
      document.visual.update();
    }
  };
}

export function commitCreatedPinPointGateNode(options: {
  document: IDocument;
  node: PinPointGateNode;
  parent: INodeLinkedList;
}): void {
  debugPinPointGateEditorEvent("commit:create", {
    shell: "create",
    node: pinPointDebugObjectId("node", options.node),
    parent: pinPointDebugObjectId("parent", options.parent),
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

export function createPinPointGateEditLifecycle(): PinPointGateEditorLifecycle {
  return {
    kind: "edit",
    debugLabel: "edit pin-point gate params",
    confirm(runtime) {
      debugPinPointEditor("confirm:edit", runtime);
      runtime.pushEditHistory();
    },
    cancel(runtime) {
      debugPinPointEditor("cancel:edit", runtime, {
        action: "restore-initial-snapshot"
      });
      runtime.restoreInitialState();
    }
  };
}

export class PinPointGateEditorRuntime extends Observable {
  readonly nodeBinding: NodeEditBinding<PinPointGateParams, PinPointGateNode>;
  readonly initialParams: PinPointGateParams;
  readonly initialPlane: Plane;
  private params: PinPointGateParams;
  private handler?: SemanticHandlePlacementHandler;
  private releaseBinding?: () => void;
  private applyingToBinding = false;
  private completed = false;

  constructor(
    readonly document: IDocument,
    readonly node: PinPointGateNode,
    private readonly lifecycle: PinPointGateEditorLifecycle
  ) {
    super();
    this.nodeBinding = bindNodeForEdit(node, pinPointGateNodeAdapter);
    const initialParams = normalizePinPointGateParams(
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
    debugPinPointEditor("runtime:create", this);
  }

  getParams(): PinPointGateParams {
    return cloneGateParams(this.params);
  }

  setParams(next: PinPointGateParams): void {
    let nextParams = cloneGateParams(next);
    this.applyingToBinding = true;
    try {
      this.nodeBinding.setParams(nextParams);
      nextParams = this.nodeBinding.getParams();
    } finally {
      this.applyingToBinding = false;
    }
    const changed = hasGateParamsChanged(this.params, nextParams);
    debugPinPointEditor("form:write-params", this, {
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
    debugPinPointEditor("form:mount", this, {
      controller: pinPointDebugObjectId("controller", controller),
      controllerObject: controller
    });
    const sections = buildPinPointGateFormSections({
      getParams: () => this.getParams(),
      updateParams: patch => {
        this.setParams(
          normalizePinPointGateParams({
            ...this.params,
            ...patch
          })
        );
      }
    });
    return createGateFormKitRegistration({
      formKitId: "pinPointGate",
      titleKey: "modelai.pinPointGate.group",
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
    const handler = createPinPointSemanticHandleTool({
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
    debugPinPointEditor("handle:attach", this, {
      handler: pinPointDebugObjectId("handler", handler),
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
    debugPinPointEditor("runtime:confirm", this);
    this.lifecycle.confirm(this);
  }

  cancel(): void {
    if (this.completed) return;
    this.completed = true;
    debugPinPointEditor("runtime:cancel", this);
    this.lifecycle.cancel(this);
  }

  pushEditHistory(): void {
    const afterParams = this.getParams();
    const afterPlane = cloneGatePlane(this.nodeBinding.getPlane());
    const paramsChanged = hasGateParamsChanged(this.initialParams, afterParams);
    const planeChanged = hasGatePlaneChanged(this.initialPlane, afterPlane);
    debugPinPointEditor("history:check", this, {
      paramsChanged,
      planeChanged,
      action: paramsChanged || planeChanged ? "push" : "skip"
    });
    if (!paramsChanged && !planeChanged) return;
    Transaction.addToHistory(
      this.document,
      new GateParamsHistoryRecord({
        name: "edit pin-point gate params",
        node: this.node,
        adapter: pinPointGateNodeAdapter,
        before: this.initialParams,
        after: afterParams,
        beforePlane: planeChanged ? this.initialPlane : undefined,
        afterPlane: planeChanged ? afterPlane : undefined
      })
    );
  }

  restoreInitialState(): void {
    debugPinPointEditor("snapshot:restore", this, {
      params: this.initialParams,
      origin: pinPointDebugPoint(this.initialPlane.origin)
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
    return this.params[prop as keyof PinPointGateParams];
  }

  private setFieldValue(prop: string, value: unknown): void {
    if (prop === "template") {
      const template = value as PinPointGateTemplate;
      this.setParams(
        normalizePinPointGateParams({
          template,
          ...getPinPointGateTemplateValues(template)
        })
      );
      return;
    }
    this.setParams(
      normalizePinPointGateParams({
        ...this.params,
        [prop]: value
      })
    );
  }

  private syncFromBinding(): void {
    const nextParams = normalizePinPointGateParams(
      this.nodeBinding.getParams()
    );
    const paramsChanged = hasGateParamsChanged(this.params, nextParams);
    debugPinPointEditor("binding:changed", this, {
      paramsChanged,
      params: nextParams,
      origin: pinPointDebugPoint(this.nodeBinding.getPlane().origin)
    });
    if (paramsChanged) {
      this.params = cloneGateParams(nextParams);
      this.emitPropertyChanged("params", undefined);
    }
    this.handler?.refreshPreview();
  }
}

export function createPinPointGateNode(
  plane: Plane,
  params: PinPointGateParams = createPinPointGateParams()
): PinPointGateNode {
  return pinPointGateNodeAdapter.createNode(
    transformI18n("modelai.body.pinPointGate"),
    plane,
    params
  );
}
