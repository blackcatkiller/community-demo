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
import { LargeGateNode } from "./largeGateNode";
export { LargeGateNode } from "./largeGateNode";

export type LargeGateTemplate = "D3" | "D4" | "D5";

export type LargeGateParams = {
  template: LargeGateTemplate;
  gateDiameter: number;
  gateSpreadingAngle: number;
  gateDipDepth: number;
};

type LargeGateTemplateValues = Omit<LargeGateParams, "template">;

const LARGE_GATE_TEMPLATE_VALUES: Record<
  LargeGateTemplate,
  LargeGateTemplateValues
> = {
  D3: {
    gateDiameter: 0.6,
    gateSpreadingAngle: 24,
    gateDipDepth: 7
  },
  D4: {
    gateDiameter: 0.8,
    gateSpreadingAngle: 24,
    gateDipDepth: 7
  },
  D5: {
    gateDiameter: 1,
    gateSpreadingAngle: 24,
    gateDipDepth: 7
  }
};

export function getLargeGateTemplateValues(
  template: LargeGateTemplate
): LargeGateTemplateValues {
  return { ...LARGE_GATE_TEMPLATE_VALUES[template] };
}

export function createLargeGateParams(
  template: LargeGateTemplate = "D3"
): LargeGateParams {
  return normalizeLargeGateParams({
    template,
    ...getLargeGateTemplateValues(template)
  });
}

export function normalizeLargeGateParams(
  params: LargeGateParams
): LargeGateParams {
  const gateDiameter = Math.max(0.1, params.gateDiameter);
  const gateSpreadingAngle = Math.max(
    1,
    Math.min(
      89,
      Number.isFinite(params.gateSpreadingAngle)
        ? params.gateSpreadingAngle
        : 24
    )
  );
  const gateDipDepth = Math.max(0.1, params.gateDipDepth);
  return {
    ...params,
    gateDiameter,
    gateSpreadingAngle,
    gateDipDepth
  };
}

export const largeGateNodeAdapter: GateNodeAdapter<
  LargeGateParams,
  LargeGateNode
> = {
  isNode(node: INode): node is LargeGateNode {
    return node instanceof LargeGateNode;
  },
  createNode(
    name: string,
    plane: Plane,
    params: LargeGateParams
  ): LargeGateNode {
    return new LargeGateNode(name, plane, params);
  },
  fromNode(node: LargeGateNode): LargeGateParams {
    return node.exportParams();
  },
  getPlane(node: LargeGateNode): Plane {
    return node.plane;
  },
  applyToNode(
    node: LargeGateNode,
    params: LargeGateParams,
    options?: GateNodeApplyOptions
  ): void {
    node.applyParams(params, options);
  },
  applyPlacement(
    node: LargeGateNode,
    plane: Plane,
    options?: GateNodeApplyOptions
  ): void {
    node.applyPlacement(plane, options);
  }
};

export function buildLargeGateFormSections(options: {
  getParams: () => LargeGateParams;
  updateParams: (patch: Partial<LargeGateParams>) => void;
}): GateFormSection[] {
  void options.getParams;
  void options.updateParams;

  return [
    {
      key: "largeGate",
      fields: [
        {
          key: "template",
          prop: "template",
          labelKey: "modelai.largeGate.templateLabel",
          kind: "select",
          options: [
            { value: "D3", labelKey: "modelai.largeGate.template.D3" },
            { value: "D4", labelKey: "modelai.largeGate.template.D4" },
            { value: "D5", labelKey: "modelai.largeGate.template.D5" }
          ]
        },
        {
          key: "gateDiameter",
          prop: "gateDiameter",
          labelKey: "modelai.largeGate.diameter",
          kind: "number",
          min: 0.1,
          max: 50,
          step: 0.1
        },
        {
          key: "gateSpreadingAngle",
          prop: "gateSpreadingAngle",
          labelKey: "modelai.largeGate.spreadingAngle",
          kind: "number",
          min: 1,
          max: 89,
          step: 0.1
        },
        {
          key: "gateDipDepth",
          prop: "gateDipDepth",
          labelKey: "modelai.largeGate.dipDepth",
          kind: "number",
          min: 0.1,
          max: 50,
          step: 0.1
        }
      ]
    }
  ];
}

function isLargeSemanticHandleEnabled(): boolean {
  const value = (globalThis as Record<string, unknown>)[
    "__MODELAI_LARGE_HANDLE_TOOL__"
  ];
  return value !== false && value !== "0";
}

function largeGateDirection(plane: Plane): XYZ {
  return plane.normal;
}

function largeGateDipDepthEnd(
  origin: XYZ,
  plane: Plane,
  params: LargeGateParams
): XYZ {
  return origin.add(largeGateDirection(plane).multiply(params.gateDipDepth));
}

function setLargeParams(
  ctx: SemanticHandleContext,
  patch: Partial<LargeGateParams>
): void {
  const target = ctx.target as LargeSemanticHandleTarget;
  target.updateParams(
    normalizeLargeGateParams({ ...target.getParams(), ...patch })
  );
}

function largeAxisDirection(axis: "X" | "Y" | "Z", plane: Plane): XYZ {
  if (axis === "X") return plane.xvec;
  if (axis === "Y") return plane.yvec;
  return plane.normal;
}

type LargeSemanticHandleContext = SemanticHandleTarget & {
  getParams(): LargeGateParams;
  updateParams(params: LargeGateParams): void;
};

type LargeSemanticHandleTarget = LargeSemanticHandleContext;

const largeDebugObjectIds = new WeakMap<object, string>();
const largeDebugObjectCounters: Record<string, number> = {};

function largeDebugObjectId(prefix: string, value: object | undefined): string {
  if (!value) return `${prefix}#none`;
  const current = largeDebugObjectIds.get(value);
  if (current) return current;
  const nextNumber = (largeDebugObjectCounters[prefix] ?? 0) + 1;
  largeDebugObjectCounters[prefix] = nextNumber;
  const next = `${prefix}#${nextNumber}`;
  largeDebugObjectIds.set(value, next);
  return next;
}

function largeDebugPoint(point: XYZ): { x: number; y: number; z: number } {
  return {
    x: point.x,
    y: point.y,
    z: point.z
  };
}

type LargeSemanticHandleConfig = {
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

export type LargeSemanticHandleToolOptions = {
  document: IDocument;
  controller: AsyncController;
  origin: XYZ;
  plane: Plane;
  config: LargeSemanticHandleConfig;
  view?: ThreeView;
  nodeBinding: NodeEditBinding<LargeGateParams, LargeGateNode>;
};

export class LargeSemanticHandleTool implements SemanticHandlePlacementHandler {
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
    config: LargeSemanticHandleConfig,
    nodeBinding: NodeEditBinding<LargeGateParams, LargeGateNode>,
    view?: ThreeView
  ) {
    void origin;
    void plane;
    const initialPlane = nodeBinding.getPlane();
    const initialParams = normalizeLargeGateParams(nodeBinding.getParams());
    nodeBinding.setParams(initialParams);
    let axisDragStartOrigin = initialPlane.origin;
    let planeDragStartOrigin = initialPlane.origin;
    let startDipDepth = initialParams.gateDipDepth;
    const getCurrentPlane = () => nodeBinding.getPlane();
    const getCurrentOrigin = () => getCurrentPlane().origin;
    const getCurrentParams = () =>
      normalizeLargeGateParams(nodeBinding.getParams());
    const applyPlacement = (nextOrigin: XYZ, nextPlane: Plane) => {
      let currentPlane = nextPlane;
      const constrained = config.onOriginDrag?.(nextOrigin, nextPlane);
      if (constrained) {
        currentPlane = nextPlane.translateTo(constrained);
      }
      debugLargeGateEditorEvent("semantic-drag:plane", {
        source: "semantic-handle",
        write: "binding:plane",
        node: largeDebugObjectId("node", nodeBinding.getNode()),
        binding: largeDebugObjectId("binding", nodeBinding),
        nextOrigin: largeDebugPoint(nextOrigin),
        appliedOrigin: largeDebugPoint(currentPlane.origin),
        nodeObject: nodeBinding.getNode(),
        bindingObject: nodeBinding
      });
      nodeBinding.setPlane(currentPlane);
    };
    const applyParams = (params: LargeGateParams) => {
      const nextParams = normalizeLargeGateParams(params);
      debugLargeGateEditorEvent("semantic-drag:params", {
        source: "semantic-handle",
        write: "binding:params",
        node: largeDebugObjectId("node", nodeBinding.getNode()),
        binding: largeDebugObjectId("binding", nodeBinding),
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
    const target: LargeSemanticHandleTarget = {
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
                largeAxisDirection("X", ctx.plane),
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
                largeAxisDirection("Y", ctx.plane),
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
                largeAxisDirection("Z", ctx.plane),
                delta
              );
            }
          },
          {
            direction: ctx => largeGateDirection(ctx.plane),
            getHandlePosition: ctx =>
              largeGateDipDepthEnd(
                ctx.origin,
                ctx.plane,
                (ctx.target as LargeSemanticHandleTarget).getParams()
              ),
            onDragStart: ctx => {
              startDipDepth = (
                ctx.target as LargeSemanticHandleTarget
              ).getParams().gateDipDepth;
            },
            onDrag: (delta, ctx) => {
              setLargeParams(ctx, {
                gateDipDepth: Math.max(0.1, startDipDepth + delta)
              });
            },
            onClick: (showInput, ctx) => {
              const target = ctx.target as LargeSemanticHandleTarget;
              showInput(target.getParams().gateDipDepth.toFixed(2), value => {
                if (value > 0) setLargeParams(ctx, { gateDipDepth: value });
              });
            },
            formatLabel: delta =>
              Math.max(0.1, startDipDepth + delta).toFixed(2)
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

export function shouldUseLargeSemanticHandleTool(): boolean {
  return isLargeSemanticHandleEnabled();
}

export function createLargeSemanticHandleTool(
  options: LargeSemanticHandleToolOptions
): SemanticHandlePlacementHandler {
  if (!shouldUseLargeSemanticHandleTool()) {
    throw new Error("Large semantic handle tool is disabled");
  }
  return new LargeSemanticHandleTool(
    options.document,
    options.controller,
    options.origin,
    options.plane,
    options.config,
    options.nodeBinding,
    options.view
  );
}

type LargeGateEditorLifecycle = {
  kind: "create" | "edit";
  debugLabel: string;
  confirm(runtime: LargeGateEditorRuntime): void;
  cancel(runtime: LargeGateEditorRuntime): void;
};

type RunLargeGateEditorOptions = {
  document: IDocument;
  controller: AsyncController;
  node: LargeGateNode;
  lifecycle: LargeGateEditorLifecycle;
};

export type LargeGateEditorHandle = {
  readonly document: IDocument;
  readonly node: LargeGateNode;
  readonly controller: AsyncController;
  readonly runtime: LargeGateEditorRuntime;
  wait(): Promise<boolean>;
  confirm(): void;
  cancel(): void;
  dispose(): void;
};

function isLargeEditorDebugEnabled(): boolean {
  const value = (globalThis as Record<string, unknown>)[
    "__MODELAI_LARGE_EDITOR_DEBUG__"
  ];
  return value === true || value === "1";
}

export function debugLargeGateEditorEvent(
  event: string,
  payload: Record<string, unknown>
): void {
  if (!isLargeEditorDebugEnabled()) return;
  console.info("[LargeGateEditorRuntime]", event, payload);
}

function debugLargeEditor(
  event: string,
  runtime: LargeGateEditorRuntime,
  extra?: Record<string, unknown>
): void {
  const state = runtime.getDebugState();
  debugLargeGateEditorEvent(event, {
    shell: state.shell,
    runtime: largeDebugObjectId("runtime", runtime),
    node: largeDebugObjectId("node", state.node),
    binding: largeDebugObjectId("binding", state.binding),
    nodeObject: state.node,
    bindingObject: state.binding,
    ...extra
  });
}

export function createLargeGateEditorRuntime(options: {
  document: IDocument;
  node: LargeGateNode;
  lifecycle: LargeGateEditorLifecycle;
}): LargeGateEditorRuntime {
  return new LargeGateEditorRuntime(
    options.document,
    options.node,
    options.lifecycle
  );
}

export function startLargeGateEditor(options: {
  document: IDocument;
  controller?: AsyncController;
  node: LargeGateNode;
  lifecycle: LargeGateEditorLifecycle;
}): LargeGateEditorHandle {
  const controller = options.controller ?? new AsyncController();
  options.document.selection.clearSelection();
  options.document.visual.highlighter.clear();
  options.document.visual.update();
  const runtime = createLargeGateEditorRuntime({
    document: options.document,
    node: options.node,
    lifecycle: options.lifecycle
  });
  const registration = runtime.createFormKitRegistration(controller);
  const unmount = mountFormKit(registration);
  const handler = runtime.attachHandle(controller);
  let disposed = false;

  debugLargeEditor("start", runtime, {
    controller: largeDebugObjectId("controller", controller),
    handler: largeDebugObjectId("handler", handler),
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
    debugLargeEditor("dispose:start", runtime);
    unmount();
    runtime.dispose();
    if (!options.controller) controller.dispose();
    debugLargeEditor("dispose:done", runtime);
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

export async function runLargeGateEditor(
  options: RunLargeGateEditorOptions
): Promise<boolean> {
  return startLargeGateEditor({
    document: options.document,
    node: options.node,
    controller: options.controller,
    lifecycle: options.lifecycle
  }).wait();
}

export function createLargeGateCreateLifecycle(options: {
  parent: INodeLinkedList;
}): LargeGateEditorLifecycle {
  void options;
  return {
    kind: "create",
    debugLabel: "create large gate",
    confirm(runtime) {
      debugLargeEditor("confirm:create", runtime, {
        action: "keep-existing-node-for-command-commit"
      });
    },
    cancel(runtime) {
      const { document, node } = runtime;
      debugLargeEditor("cancel:create", runtime, {
        action: "remove-visual-and-dispose-node"
      });
      document.visual.context.removeNode([node]);
      node.parent = undefined;
      node.dispose();
      document.visual.update();
    }
  };
}

export function commitCreatedLargeGateNode(options: {
  document: IDocument;
  node: LargeGateNode;
  parent: INodeLinkedList;
}): void {
  debugLargeGateEditorEvent("commit:create", {
    shell: "create",
    node: largeDebugObjectId("node", options.node),
    parent: largeDebugObjectId("parent", options.parent),
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

export function createLargeGateEditLifecycle(): LargeGateEditorLifecycle {
  return {
    kind: "edit",
    debugLabel: "edit large gate params",
    confirm(runtime) {
      debugLargeEditor("confirm:edit", runtime);
      runtime.pushEditHistory();
    },
    cancel(runtime) {
      debugLargeEditor("cancel:edit", runtime, {
        action: "restore-initial-snapshot"
      });
      runtime.restoreInitialState();
    }
  };
}

export class LargeGateEditorRuntime extends Observable {
  readonly nodeBinding: NodeEditBinding<LargeGateParams, LargeGateNode>;
  readonly initialParams: LargeGateParams;
  readonly initialPlane: Plane;
  private params: LargeGateParams;
  private handler?: SemanticHandlePlacementHandler;
  private releaseBinding?: () => void;
  private applyingToBinding = false;
  private completed = false;

  constructor(
    readonly document: IDocument,
    readonly node: LargeGateNode,
    private readonly lifecycle: LargeGateEditorLifecycle
  ) {
    super();
    this.nodeBinding = bindNodeForEdit(node, largeGateNodeAdapter);
    const initialParams = normalizeLargeGateParams(
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
    debugLargeEditor("runtime:create", this);
  }

  getParams(): LargeGateParams {
    return cloneGateParams(this.params);
  }

  setParams(next: LargeGateParams): void {
    let nextParams = cloneGateParams(next);
    this.applyingToBinding = true;
    try {
      this.nodeBinding.setParams(nextParams);
      nextParams = this.nodeBinding.getParams();
    } finally {
      this.applyingToBinding = false;
    }
    const changed = hasGateParamsChanged(this.params, nextParams);
    debugLargeEditor("form:write-params", this, {
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
    debugLargeEditor("form:mount", this, {
      controller: largeDebugObjectId("controller", controller),
      controllerObject: controller
    });
    const sections = buildLargeGateFormSections({
      getParams: () => this.getParams(),
      updateParams: patch => {
        this.setParams(
          normalizeLargeGateParams({
            ...this.params,
            ...patch
          })
        );
      }
    });
    return createGateFormKitRegistration({
      formKitId: "largeGate",
      titleKey: "modelai.largeGate.group",
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
    const handler = createLargeSemanticHandleTool({
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
    debugLargeEditor("handle:attach", this, {
      handler: largeDebugObjectId("handler", handler),
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
    debugLargeEditor("runtime:confirm", this);
    this.lifecycle.confirm(this);
  }

  cancel(): void {
    if (this.completed) return;
    this.completed = true;
    debugLargeEditor("runtime:cancel", this);
    this.lifecycle.cancel(this);
  }

  pushEditHistory(): void {
    const afterParams = this.getParams();
    const afterPlane = cloneGatePlane(this.nodeBinding.getPlane());
    const paramsChanged = hasGateParamsChanged(this.initialParams, afterParams);
    const planeChanged = hasGatePlaneChanged(this.initialPlane, afterPlane);
    debugLargeEditor("history:check", this, {
      paramsChanged,
      planeChanged,
      action: paramsChanged || planeChanged ? "push" : "skip"
    });
    if (!paramsChanged && !planeChanged) return;
    Transaction.addToHistory(
      this.document,
      new GateParamsHistoryRecord({
        name: "edit large gate params",
        node: this.node,
        adapter: largeGateNodeAdapter,
        before: this.initialParams,
        after: afterParams,
        beforePlane: planeChanged ? this.initialPlane : undefined,
        afterPlane: planeChanged ? afterPlane : undefined
      })
    );
  }

  restoreInitialState(): void {
    debugLargeEditor("snapshot:restore", this, {
      params: this.initialParams,
      origin: largeDebugPoint(this.initialPlane.origin)
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
    return this.params[prop as keyof LargeGateParams];
  }

  private setFieldValue(prop: string, value: unknown): void {
    if (prop === "template") {
      const template = value as LargeGateTemplate;
      this.setParams(
        normalizeLargeGateParams({
          template,
          ...getLargeGateTemplateValues(template)
        })
      );
      return;
    }
    this.setParams(
      normalizeLargeGateParams({
        ...this.params,
        [prop]: value
      } as LargeGateParams)
    );
  }

  private syncFromBinding(): void {
    const nextParams = normalizeLargeGateParams(this.nodeBinding.getParams());
    const paramsChanged = hasGateParamsChanged(this.params, nextParams);
    debugLargeEditor("binding:changed", this, {
      paramsChanged,
      params: nextParams,
      origin: largeDebugPoint(this.nodeBinding.getPlane().origin)
    });
    if (paramsChanged) {
      this.params = cloneGateParams(nextParams);
      this.emitPropertyChanged("params", undefined);
    }
    this.handler?.refreshPreview();
  }
}

export function createLargeGateNode(
  plane: Plane,
  params: LargeGateParams = createLargeGateParams()
): LargeGateNode {
  return largeGateNodeAdapter.createNode(
    transformI18n("modelai.body.largeGate"),
    plane,
    params
  );
}
