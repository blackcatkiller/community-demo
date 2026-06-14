// @ts-nocheck
import type { AsyncController } from "@modelai/core";
import type {
  CursorType,
  IDocument,
  IEventHandler,
  INode,
  ISelection,
  VisualShapeData
} from "@modelai/core/types";
import { ShapeType, VisualState } from "@modelai/core/types";
import { PubSub } from "@modelai/core";
import { NodeSelectionHandler } from "./nodeSelectionHandler";
import { SubShapeSelectionHandler } from "./subShapeSelectionHandler";

export type ShapeFilter = (shape: VisualShapeData) => boolean;
export type NodeFilter = (node: INode) => boolean;

export class Selection implements ISelection {
  private selectedNodes: INode[] = [];
  private selectionChanged: Array<
    (selected: INode[], deselected: INode[]) => void
  > = [];

  shapeType: ShapeType = ShapeType.Shape;
  shapeFilter?: ShapeFilter;
  nodeFilter?: NodeFilter;

  constructor(
    readonly document: IDocument,
    private container?: HTMLElement
  ) {}

  setContainer(container?: HTMLElement) {
    this.container = container;
  }

  onSelectionChanged(cb: (selected: INode[], deselected: INode[]) => void) {
    this.selectionChanged.push(cb);
  }

  getSelectedNodes(): INode[] {
    return this.selectedNodes;
  }

  async pickShape(
    prompt: string,
    controller: AsyncController,
    multiMode: boolean,
    selectedState: VisualState = VisualState.edgeSelected,
    highlightState: VisualState = VisualState.edgeHighlight
  ) {
    const handler = new SubShapeSelectionHandler(
      this.document,
      this.shapeType,
      this.container,
      controller,
      this.shapeFilter,
      multiMode
    );
    handler.selectedState = selectedState;
    handler.highlightState = highlightState;
    await this.pickAsync(handler, prompt, controller, multiMode);
    if (
      controller.result?.status === "cancel" ||
      controller.result?.status === "fail"
    ) {
      return [];
    }
    return handler.getSelectedShapes();
  }

  async pickNode(
    prompt: string,
    controller: AsyncController,
    multiMode: boolean
  ) {
    const handler = new NodeSelectionHandler(
      this.document,
      this.container,
      controller,
      this.nodeFilter,
      multiMode
    );
    await this.pickAsync(handler, prompt, controller, multiMode);
    if (
      controller.result?.status === "cancel" ||
      controller.result?.status === "fail"
    ) {
      return [];
    }
    return handler.nodes();
  }

  async pickAsync(
    handler: IEventHandler,
    prompt: string,
    controller: AsyncController,
    showControl: boolean,
    cursor: CursorType = "select"
  ) {
    const oldHandler = this.document.visual.eventHandler;
    const canConfirm = () => this.selectedNodes.length > 0;
    const removeMiddleConfirm = this.bindMiddleConfirm(
      controller,
      showControl,
      canConfirm
    );
    this.document.visual.eventHandler = handler;
    PubSub.default.pub("viewCursor", cursor);
    PubSub.default.pub("statusBarTip", prompt);
    if (showControl) {
      PubSub.default.pub("showSelectionControl", {
        controller,
        canConfirm,
        invalidConfirmMessageKey:
          "modelai.selection.control.validation.emptySelection"
      });
    }

    try {
      await new Promise((resolve, reject) => {
        controller.onCompleted(resolve);
        controller.onCancelled(reject);
      });
    } catch {
      // ignore cancel
    } finally {
      removeMiddleConfirm();
      if (showControl) PubSub.default.pub("clearSelectionControl");
      PubSub.default.pub("clearStatusBarTip");
      PubSub.default.pub("viewCursor", "default");
      this.document.visual.eventHandler = oldHandler;
    }
  }

  private bindMiddleConfirm(
    controller: AsyncController,
    enabled: boolean,
    canConfirm: () => boolean
  ): () => void {
    if (!enabled) return () => {};

    const onPointerUp = (event: PointerEvent) => {
      if (event.button !== 1) return;
      if (controller.result) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      if (!canConfirm()) {
        return;
      }
      controller.success();
    };

    window.addEventListener("pointerup", onPointerUp, true);
    return () => {
      window.removeEventListener("pointerup", onPointerUp, true);
    };
  }

  setSelection(nodes: INode[], toggle: boolean) {
    const oldSelected = [...this.selectedNodes];
    if (toggle) {
      const already = nodes.filter(node => this.selectedNodes.includes(node));
      const fresh = nodes.filter(node => !this.selectedNodes.includes(node));
      this.removeHighlights(already);
      this.selectedNodes = this.selectedNodes.filter(
        node => !already.includes(node)
      );
      this.addHighlights(fresh);
      this.selectedNodes.push(...fresh);
    } else {
      this.removeHighlights(this.selectedNodes);
      this.selectedNodes = [...nodes];
      this.addHighlights(nodes);
    }
    this.document.visual.update();
    this.selectionChanged.forEach(cb => cb(this.selectedNodes, oldSelected));
    const deselected = oldSelected.filter(
      node => !this.selectedNodes.includes(node)
    );
    PubSub.default.pub(
      "selectionChanged",
      this.document,
      this.selectedNodes,
      deselected
    );
    PubSub.default.pub("showProperties", this.document, this.selectedNodes);
  }

  clearSelection() {
    const oldSelected = [...this.selectedNodes];
    this.removeHighlights(this.selectedNodes);
    this.selectedNodes = [];
    this.document.visual.update();
    this.selectionChanged.forEach(cb => cb([], oldSelected));
    PubSub.default.pub("selectionChanged", this.document, [], oldSelected);
    PubSub.default.pub("showProperties", this.document, []);
  }

  private addHighlights(nodes: INode[]) {
    nodes.forEach(node => {
      const visual = this.document.visual.context.getVisual(node);
      if (visual) {
        this.document.visual.highlighter.addState(
          visual,
          VisualState.edgeSelected,
          ShapeType.Shape
        );
      }
    });
  }

  private removeHighlights(nodes: INode[]) {
    nodes.forEach(node => {
      const visual = this.document.visual.context.getVisual(node);
      if (visual) {
        this.document.visual.highlighter.removeState(
          visual,
          VisualState.edgeSelected,
          ShapeType.Shape
        );
      }
    });
  }
}
