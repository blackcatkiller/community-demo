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
import { SubGateNode } from "./subGateNode";
export { SubGateNode } from "./subGateNode";

export type SubGateTemplate = "D3" | "D4" | "D5";

export type SubGateParams = {
  gateDiameter: number;
  gateSpreadingAngle: number;
  gateDipDepth: number;
  gateAngle: number;
  template: SubGateTemplate;
};

export const SUB_GATE_ANGLE_MIN = 1;
export const SUB_GATE_ANGLE_MAX = 179;

type SubGateTemplateValues = Pick<
  SubGateParams,
  "gateDiameter" | "gateSpreadingAngle" | "gateAngle" | "gateDipDepth"
>;

const HANDLE_ANGLE_COLOR = 0xf3eadb;
const HANDLE_DIP_DEPTH_COLOR = 0xff6600;

const SUB_GATE_TEMPLATE_VALUES: Record<SubGateTemplate, SubGateTemplateValues> =
  {
    D3: {
      gateDiameter: 0.6,
      gateSpreadingAngle: 24,
      gateAngle: 45,
      gateDipDepth: 7
    },
    D4: {
      gateDiameter: 0.8,
      gateSpreadingAngle: 24,
      gateAngle: 45,
      gateDipDepth: 7
    },
    D5: {
      gateDiameter: 1,
      gateSpreadingAngle: 24,
      gateAngle: 45,
      gateDipDepth: 7
    }
  };

function clampSubGateAngle(value: number): number {
  return Math.max(
    SUB_GATE_ANGLE_MIN,
    Math.min(
      SUB_GATE_ANGLE_MAX,
      Number.isFinite(value) ? value : SUB_GATE_ANGLE_MAX
    )
  );
}

export function getSubGateTemplateValues(
  template: SubGateTemplate
): SubGateTemplateValues {
  return normalizeSubGateParams({
    template,
    ...SUB_GATE_TEMPLATE_VALUES[template]
  });
}

export function createSubGateParams(
  template: SubGateTemplate = "D3"
): SubGateParams {
  return normalizeSubGateParams({
    template,
    ...getSubGateTemplateValues(template)
  });
}

export function normalizeSubGateParams(params: SubGateParams): SubGateParams {
  return {
    ...params,
    gateAngle: clampSubGateAngle(params.gateAngle)
  };
}

export const subGateNodeAdapter: GateNodeAdapter<SubGateParams, SubGateNode> = {
  isNode(node: INode): node is SubGateNode {
    return node instanceof SubGateNode;
  },
  createNode(name: string, plane: Plane, params: SubGateParams): SubGateNode {
    return new SubGateNode(name, plane, params);
  },
  fromNode(node: SubGateNode): SubGateParams {
    return node.exportParams();
  },
  getPlane(node: SubGateNode): Plane {
    return node.plane;
  },
  applyToNode(
    node: SubGateNode,
    params: SubGateParams,
    options?: GateNodeApplyOptions
  ): void {
    node.applyParams(params, options);
  },
  applyPlacement(
    node: SubGateNode,
    plane: Plane,
    options?: GateNodeApplyOptions
  ): void {
    node.applyPlacement(plane, options);
  }
};

export function buildSubGateFormSections(options: {
  getParams: () => SubGateParams;
  updateParams: (patch: Partial<SubGateParams>) => void;
}): GateFormSection[] {
  void options.getParams;
  void options.updateParams;

  return [
    {
      key: "subGate",
      fields: [
        {
          key: "template",
          prop: "template",
          labelKey: "modelai.subGate.templateLabel",
          kind: "select",
          options: [
            { value: "D3", labelKey: "modelai.subGate.template.D3" },
            { value: "D4", labelKey: "modelai.subGate.template.D4" },
            { value: "D5", labelKey: "modelai.subGate.template.D5" }
          ]
        },
        {
          key: "gateDiameter",
          prop: "gateDiameter",
          labelKey: "modelai.subGate.diameter",
          kind: "number",
          min: 0.1,
          max: 50,
          step: 0.1
        },
        {
          key: "gateSpreadingAngle",
          prop: "gateSpreadingAngle",
          labelKey: "modelai.subGate.spreadingAngle",
          kind: "number",
          min: 1,
          max: 89,
          step: 0.1
        },
        {
          key: "gateDipDepth",
          prop: "gateDipDepth",
          labelKey: "modelai.subGate.dipDepth",
          kind: "number",
          min: 0.1,
          max: 50,
          step: 0.1
        },
        {
          key: "gateAngle",
          prop: "gateAngle",
          labelKey: "modelai.subGate.angle",
          kind: "number",
          min: SUB_GATE_ANGLE_MIN,
          max: SUB_GATE_ANGLE_MAX,
          step: 0.1
        }
      ]
    }
  ];
}

function isSubSemanticHandleEnabled(): boolean {
  const value = (globalThis as Record<string, unknown>)[
    "__MODELAI_SUB_HANDLE_TOOL__"
  ];
  return value !== false && value !== "0";
}

function subGateDirection(plane: Plane, params: SubGateParams): XYZ {
  const angleRad = MathUtils.degToRad(params.gateAngle);
  return plane.xvec
    .multiply(Math.sin(angleRad))
    .add(plane.normal.multiply(Math.cos(angleRad)));
}

function subGateDipDepthEnd(
  origin: XYZ,
  plane: Plane,
  params: SubGateParams
): XYZ {
  return origin.add(
    subGateDirection(plane, params).multiply(params.gateDipDepth)
  );
}

function setSubParams(
  ctx: SemanticHandleContext,
  patch: Partial<SubGateParams>
): void {
  const target = ctx.target as SubSemanticHandleTarget;
  target.updateParams(
    normalizeSubGateParams({ ...target.getParams(), ...patch })
  );
}

function subAxisDirection(axis: "X" | "Y" | "Z", plane: Plane): XYZ {
  if (axis === "X") return plane.xvec;
  if (axis === "Y") return plane.yvec;
  return plane.normal;
}

type SubSemanticHandleContext = SemanticHandleTarget & {
  getParams(): SubGateParams;
  updateParams(params: SubGateParams): void;
};

type SubSemanticHandleTarget = SubSemanticHandleContext;

const subDebugObjectIds = new WeakMap<object, string>();
const subDebugObjectCounters: Record<string, number> = {};

function subDebugObjectId(prefix: string, value: object | undefined): string {
  if (!value) return `${prefix}#none`;
  const current = subDebugObjectIds.get(value);
  if (current) return current;
  const nextNumber = (subDebugObjectCounters[prefix] ?? 0) + 1;
  subDebugObjectCounters[prefix] = nextNumber;
  const next = `${prefix}#${nextNumber}`;
  subDebugObjectIds.set(value, next);
  return next;
}

function subDebugPoint(point: XYZ): { x: number; y: number; z: number } {
  return {
    x: point.x,
    y: point.y,
    z: point.z
  };
}

type SubSemanticHandleConfig = {
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

export type SubSemanticHandleToolOptions = {
  document: IDocument;
  controller: AsyncController;
  origin: XYZ;
  plane: Plane;
  config: SubSemanticHandleConfig;
  view?: ThreeView;
  nodeBinding: NodeEditBinding<SubGateParams, SubGateNode>;
};

export class SubSemanticHandleTool implements SemanticHandlePlacementHandler {
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
    config: SubSemanticHandleConfig,
    nodeBinding: NodeEditBinding<SubGateParams, SubGateNode>,
    view?: ThreeView
  ) {
    void origin;
    void plane;
    const initialPlane = nodeBinding.getPlane();
    const initialParams = normalizeSubGateParams(nodeBinding.getParams());
    nodeBinding.setParams(initialParams);
    let axisDragStartOrigin = initialPlane.origin;
    let planeDragStartOrigin = initialPlane.origin;
    let startDipDepth = initialParams.gateDipDepth;
    const getCurrentPlane = () => nodeBinding.getPlane();
    const getCurrentOrigin = () => getCurrentPlane().origin;
    const getCurrentParams = () =>
      normalizeSubGateParams(nodeBinding.getParams());
    const applyPlacement = (nextOrigin: XYZ, nextPlane: Plane) => {
      let currentPlane = nextPlane;
      const constrained = config.onOriginDrag?.(nextOrigin, nextPlane);
      if (constrained) {
        currentPlane = nextPlane.translateTo(constrained);
      }
      debugSubGateEditorEvent("semantic-drag:plane", {
        source: "semantic-handle",
        write: "binding:plane",
        node: subDebugObjectId("node", nodeBinding.getNode()),
        binding: subDebugObjectId("binding", nodeBinding),
        nextOrigin: subDebugPoint(nextOrigin),
        appliedOrigin: subDebugPoint(currentPlane.origin),
        nodeObject: nodeBinding.getNode(),
        bindingObject: nodeBinding
      });
      nodeBinding.setPlane(currentPlane);
    };
    const applyParams = (params: SubGateParams) => {
      const nextParams = normalizeSubGateParams(params);
      debugSubGateEditorEvent("semantic-drag:params", {
        source: "semantic-handle",
        write: "binding:params",
        node: subDebugObjectId("node", nodeBinding.getNode()),
        binding: subDebugObjectId("binding", nodeBinding),
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
    const target: SubSemanticHandleTarget = {
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
              applyAxisPlacement("X", subAxisDirection("X", ctx.plane), delta);
            }
          },
          {
            axis: "Y",
            onDragStart: ctx => {
              axisDragStartOrigin = ctx.origin;
              config.onAxisDragStart?.("Y", ctx.plane.yvec, ctx.origin);
            },
            onDrag: (delta, ctx) => {
              applyAxisPlacement("Y", subAxisDirection("Y", ctx.plane), delta);
            }
          },
          {
            axis: "Z",
            onDragStart: ctx => {
              axisDragStartOrigin = ctx.origin;
              config.onAxisDragStart?.("Z", ctx.plane.normal, ctx.origin);
            },
            onDrag: (delta, ctx) => {
              applyAxisPlacement("Z", subAxisDirection("Z", ctx.plane), delta);
            }
          },
          {
            direction: ctx =>
              subGateDirection(
                ctx.plane,
                (ctx.target as SubSemanticHandleTarget).getParams()
              ),
            getHandlePosition: ctx =>
              subGateDipDepthEnd(
                ctx.origin,
                ctx.plane,
                (ctx.target as SubSemanticHandleTarget).getParams()
              ),
            onDragStart: ctx => {
              startDipDepth = (
                ctx.target as SubSemanticHandleTarget
              ).getParams().gateDipDepth;
            },
            onDrag: (delta, ctx) => {
              setSubParams(ctx, {
                gateDipDepth: Math.max(0.1, startDipDepth + delta)
              });
            },
            onClick: (showInput, ctx) => {
              const target = ctx.target as SubSemanticHandleTarget;
              showInput(target.getParams().gateDipDepth.toFixed(2), value => {
                if (value > 0) setSubParams(ctx, { gateDipDepth: value });
              });
            },
            formatLabel: delta =>
              Math.max(0.1, startDipDepth + delta).toFixed(2),
            visual: {
              arrow: false,
              guideFromOrigin: true,
              color: HANDLE_DIP_DEPTH_COLOR
            }
          }
        ],
        angleValues: [
          {
            getValue: ctx =>
              (ctx.target as SubSemanticHandleTarget).getParams().gateAngle,
            setValue: (value, ctx) =>
              setSubParams(ctx, {
                gateAngle: value
              }),
            getPlaneNormal: ctx => ctx.plane.yvec,
            getReferenceDir: ctx => ctx.plane.normal,
            getHandleDirection: ctx =>
              subGateDirection(
                ctx.plane,
                (ctx.target as SubSemanticHandleTarget).getParams()
              ),
            min: SUB_GATE_ANGLE_MIN,
            max: SUB_GATE_ANGLE_MAX,
            startDeg: SUB_GATE_ANGLE_MIN,
            endDeg: SUB_GATE_ANGLE_MAX,
            color: HANDLE_ANGLE_COLOR
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

export function shouldUseSubSemanticHandleTool(): boolean {
  return isSubSemanticHandleEnabled();
}

export function createSubSemanticHandleTool(
  options: SubSemanticHandleToolOptions
): SemanticHandlePlacementHandler {
  if (!shouldUseSubSemanticHandleTool()) {
    throw new Error("Sub semantic handle tool is disabled");
  }
  return new SubSemanticHandleTool(
    options.document,
    options.controller,
    options.origin,
    options.plane,
    options.config,
    options.nodeBinding,
    options.view
  );
}

type SubGateEditorLifecycle = {
  kind: "create" | "edit";
  debugLabel: string;
  confirm(runtime: SubGateEditorRuntime): void;
  cancel(runtime: SubGateEditorRuntime): void;
};

type RunSubGateEditorOptions = {
  document: IDocument;
  controller: AsyncController;
  node: SubGateNode;
  lifecycle: SubGateEditorLifecycle;
};

export type SubGateEditorHandle = {
  readonly document: IDocument;
  readonly node: SubGateNode;
  readonly controller: AsyncController;
  readonly runtime: SubGateEditorRuntime;
  wait(): Promise<boolean>;
  confirm(): void;
  cancel(): void;
  dispose(): void;
};

function isSubEditorDebugEnabled(): boolean {
  const value = (globalThis as Record<string, unknown>)[
    "__MODELAI_SUB_EDITOR_DEBUG__"
  ];
  return value === true || value === "1";
}

export function debugSubGateEditorEvent(
  event: string,
  payload: Record<string, unknown>
): void {
  if (!isSubEditorDebugEnabled()) return;
  console.info("[SubGateEditorRuntime]", event, payload);
}

function debugSubEditor(
  event: string,
  runtime: SubGateEditorRuntime,
  extra?: Record<string, unknown>
): void {
  const state = runtime.getDebugState();
  debugSubGateEditorEvent(event, {
    shell: state.shell,
    runtime: subDebugObjectId("runtime", runtime),
    node: subDebugObjectId("node", state.node),
    binding: subDebugObjectId("binding", state.binding),
    nodeObject: state.node,
    bindingObject: state.binding,
    ...extra
  });
}

export function createSubGateEditorRuntime(options: {
  document: IDocument;
  node: SubGateNode;
  lifecycle: SubGateEditorLifecycle;
}): SubGateEditorRuntime {
  return new SubGateEditorRuntime(
    options.document,
    options.node,
    options.lifecycle
  );
}

export function startSubGateEditor(options: {
  document: IDocument;
  controller?: AsyncController;
  node: SubGateNode;
  lifecycle: SubGateEditorLifecycle;
}): SubGateEditorHandle {
  const controller = options.controller ?? new AsyncController();
  options.document.selection.clearSelection();
  options.document.visual.highlighter.clear();
  options.document.visual.update();
  const runtime = createSubGateEditorRuntime({
    document: options.document,
    node: options.node,
    lifecycle: options.lifecycle
  });
  const registration = runtime.createFormKitRegistration(controller);
  const unmount = mountFormKit(registration);
  const handler = runtime.attachHandle(controller);
  let disposed = false;

  debugSubEditor("start", runtime, {
    controller: subDebugObjectId("controller", controller),
    handler: subDebugObjectId("handler", handler),
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
    debugSubEditor("dispose:start", runtime);
    unmount();
    runtime.dispose();
    if (!options.controller) controller.dispose();
    debugSubEditor("dispose:done", runtime);
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

export async function runSubGateEditor(
  options: RunSubGateEditorOptions
): Promise<boolean> {
  return startSubGateEditor({
    document: options.document,
    node: options.node,
    controller: options.controller,
    lifecycle: options.lifecycle
  }).wait();
}

export function createSubGateCreateLifecycle(options: {
  parent: INodeLinkedList;
}): SubGateEditorLifecycle {
  void options;
  return {
    kind: "create",
    debugLabel: "create sub gate",
    confirm(runtime) {
      debugSubEditor("confirm:create", runtime, {
        action: "keep-existing-node-for-command-commit"
      });
    },
    cancel(runtime) {
      const { document, node } = runtime;
      debugSubEditor("cancel:create", runtime, {
        action: "remove-visual-and-dispose-node"
      });
      document.visual.context.removeNode([node]);
      node.parent = undefined;
      node.dispose();
      document.visual.update();
    }
  };
}

export function commitCreatedSubGateNode(options: {
  document: IDocument;
  node: SubGateNode;
  parent: INodeLinkedList;
}): void {
  debugSubGateEditorEvent("commit:create", {
    shell: "create",
    node: subDebugObjectId("node", options.node),
    parent: subDebugObjectId("parent", options.parent),
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

export function createSubGateEditLifecycle(): SubGateEditorLifecycle {
  return {
    kind: "edit",
    debugLabel: "edit sub gate params",
    confirm(runtime) {
      debugSubEditor("confirm:edit", runtime);
      runtime.pushEditHistory();
    },
    cancel(runtime) {
      debugSubEditor("cancel:edit", runtime, {
        action: "restore-initial-snapshot"
      });
      runtime.restoreInitialState();
    }
  };
}

export class SubGateEditorRuntime extends Observable {
  readonly nodeBinding: NodeEditBinding<SubGateParams, SubGateNode>;
  readonly initialParams: SubGateParams;
  readonly initialPlane: Plane;
  private params: SubGateParams;
  private handler?: SemanticHandlePlacementHandler;
  private releaseBinding?: () => void;
  private applyingToBinding = false;
  private completed = false;

  constructor(
    readonly document: IDocument,
    readonly node: SubGateNode,
    private readonly lifecycle: SubGateEditorLifecycle
  ) {
    super();
    this.nodeBinding = bindNodeForEdit(node, subGateNodeAdapter);
    const initialParams = normalizeSubGateParams(this.nodeBinding.getParams());
    this.initialParams = cloneGateParams(initialParams);
    this.initialPlane = cloneGatePlane(this.nodeBinding.getPlane());
    this.params = cloneGateParams(initialParams);
    this.nodeBinding.setParams(initialParams);
    this.releaseBinding = this.nodeBinding.subscribe(() => {
      if (this.applyingToBinding) return;
      this.syncFromBinding();
    });
    debugSubEditor("runtime:create", this);
  }

  getParams(): SubGateParams {
    return cloneGateParams(this.params);
  }

  setParams(next: SubGateParams): void {
    let nextParams = cloneGateParams(next);
    this.applyingToBinding = true;
    try {
      this.nodeBinding.setParams(nextParams);
      nextParams = this.nodeBinding.getParams();
    } finally {
      this.applyingToBinding = false;
    }
    const changed = hasGateParamsChanged(this.params, nextParams);
    debugSubEditor("form:write-params", this, {
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
    debugSubEditor("form:mount", this, {
      controller: subDebugObjectId("controller", controller),
      controllerObject: controller
    });
    const sections = buildSubGateFormSections({
      getParams: () => this.getParams(),
      updateParams: patch => {
        this.setParams(
          normalizeSubGateParams({
            ...this.params,
            ...patch
          })
        );
      }
    });
    return createGateFormKitRegistration({
      formKitId: "subGate",
      titleKey: "modelai.subGate.group",
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
    const handler = createSubSemanticHandleTool({
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
    debugSubEditor("handle:attach", this, {
      handler: subDebugObjectId("handler", handler),
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
    debugSubEditor("runtime:confirm", this);
    this.lifecycle.confirm(this);
  }

  cancel(): void {
    if (this.completed) return;
    this.completed = true;
    debugSubEditor("runtime:cancel", this);
    this.lifecycle.cancel(this);
  }

  pushEditHistory(): void {
    const afterParams = this.getParams();
    const afterPlane = cloneGatePlane(this.nodeBinding.getPlane());
    const paramsChanged = hasGateParamsChanged(this.initialParams, afterParams);
    const planeChanged = hasGatePlaneChanged(this.initialPlane, afterPlane);
    debugSubEditor("history:check", this, {
      paramsChanged,
      planeChanged,
      action: paramsChanged || planeChanged ? "push" : "skip"
    });
    if (!paramsChanged && !planeChanged) return;
    Transaction.addToHistory(
      this.document,
      new GateParamsHistoryRecord({
        name: "edit sub gate params",
        node: this.node,
        adapter: subGateNodeAdapter,
        before: this.initialParams,
        after: afterParams,
        beforePlane: planeChanged ? this.initialPlane : undefined,
        afterPlane: planeChanged ? afterPlane : undefined
      })
    );
  }

  restoreInitialState(): void {
    debugSubEditor("snapshot:restore", this, {
      params: this.initialParams,
      origin: subDebugPoint(this.initialPlane.origin)
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
    return this.params[prop as keyof SubGateParams];
  }

  private setFieldValue(prop: string, value: unknown): void {
    if (prop === "template") {
      const template = value as SubGateTemplate;
      this.setParams(
        normalizeSubGateParams({
          template,
          ...getSubGateTemplateValues(template)
        })
      );
      return;
    }
    this.setParams(
      normalizeSubGateParams({
        ...this.params,
        [prop]: value
      })
    );
  }

  private syncFromBinding(): void {
    const nextParams = normalizeSubGateParams(this.nodeBinding.getParams());
    const paramsChanged = hasGateParamsChanged(this.params, nextParams);
    debugSubEditor("binding:changed", this, {
      paramsChanged,
      params: nextParams,
      origin: subDebugPoint(this.nodeBinding.getPlane().origin)
    });
    if (paramsChanged) {
      this.params = cloneGateParams(nextParams);
      this.emitPropertyChanged("params", undefined);
    }
    this.handler?.refreshPreview();
  }
}

export function createSubGateNode(
  plane: Plane,
  params: SubGateParams = createSubGateParams()
): SubGateNode {
  return subGateNodeAdapter.createNode(
    transformI18n("modelai.body.subGate"),
    plane,
    params
  );
}
