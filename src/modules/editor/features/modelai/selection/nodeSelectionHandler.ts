// @ts-nocheck
import type { AsyncController } from "@modelai/core";
import type {
  IDocument,
  INode,
  IView,
  IVisualObject
} from "@modelai/core/types";
import { PubSub } from "@modelai/core";
import { ShapeType, VisualState } from "@modelai/core/types";
import { SelectionHandler } from "./selectionHandler";

export class NodeSelectionHandler extends SelectionHandler {
  private highlights: IVisualObject[] | undefined;
  private detectAtMouse: IVisualObject[] | undefined;
  private lockedDetected: IVisualObject | undefined;

  constructor(
    readonly document: IDocument,
    container?: HTMLElement,
    controller?: AsyncController,
    private readonly filter?: (node: INode) => boolean,
    multiMode: boolean = false
  ) {
    super(container, multiMode, controller);
  }

  nodes(): INode[] {
    return this.document.selection.getSelectedNodes();
  }

  protected override setHighlight(view: IView, event: PointerEvent) {
    const detecteds = this.getDetecteds(view, event);
    this.highlightDetecteds(view, detecteds);
  }

  protected override clearSelected() {
    this.document.selection.clearSelection();
  }

  protected override highlightNext(view: IView) {
    if (!this.detectAtMouse || this.detectAtMouse.length <= 1) return;

    const currentIndex = this.lockedDetected
      ? this.getDetectedIndex(this.lockedDetected)
      : 0;
    const nextIndex = (currentIndex + 1) % this.detectAtMouse.length;
    this.lockedDetected = this.detectAtMouse[nextIndex];
    this.highlightDetecteds(view, [this.detectAtMouse[nextIndex]]);
  }

  private getDetecteds(view: IView, event: PointerEvent): IVisualObject[] {
    if (
      this.rect &&
      Math.abs(this.mouse.x - event.offsetX) > 3 &&
      Math.abs(this.mouse.y - event.offsetY) > 3
    ) {
      const rectDetects = view.detectVisualRect(
        this.mouse.x,
        this.mouse.y,
        event.offsetX,
        event.offsetY
      );
      this.lockedDetected = undefined;
      return this.filterDetecteds(rectDetects);
    }

    this.detectAtMouse = this.filterDetecteds(
      view.detectVisual(event.offsetX, event.offsetY)
    );

    if (this.detectAtMouse.length === 0) {
      this.lockedDetected = undefined;
      return [];
    }

    const current = this.getCurrentDetected();
    return current ? [current] : [];
  }

  private filterDetecteds(detecteds: IVisualObject[]): IVisualObject[] {
    if (!this.filter) return detecteds;
    return detecteds.filter(obj => {
      const node = this.document.visual.context.getNode(obj);
      return node ? this.filter(node) : false;
    });
  }

  private getCurrentDetected() {
    if (!this.detectAtMouse?.length) return undefined;
    if (!this.lockedDetected) return this.detectAtMouse[0];

    const index = this.getDetectedIndex(this.lockedDetected);
    if (index >= 0) return this.detectAtMouse[index];

    this.lockedDetected = undefined;
    return this.detectAtMouse[0];
  }

  private getDetectedIndex(target: IVisualObject) {
    return this.detectAtMouse?.findIndex(item => item === target) ?? -1;
  }

  private highlightDetecteds(view: IView, detecteds: IVisualObject[]) {
    this.cleanHighlights();
    detecteds.forEach(item => {
      view.document.visual.highlighter.addState(
        item,
        VisualState.edgeHighlight,
        ShapeType.Shape
      );
    });
    this.highlights = detecteds;
    view.update();
  }

  protected override cleanHighlights() {
    this.highlights?.forEach(item => {
      this.document.visual.highlighter.removeState(
        item,
        VisualState.edgeHighlight,
        ShapeType.Shape
      );
    });
    this.highlights = undefined;
  }

  override dblClick(view: IView, event: MouseEvent) {
    if (event.button !== 0) return;

    const detecteds = this.filterDetecteds(
      view.detectVisual(event.offsetX, event.offsetY)
    );
    const target = detecteds[0];
    if (!target) return;

    const node = view.document.visual.context.getNode(target);
    if (!node) return;

    this.document.selection.setSelection([node], false);
    PubSub.default.pub("openNodeParamEditor", this.document, node);
  }

  protected override select(view: IView, event: PointerEvent): number {
    if (!this.highlights?.length) {
      this.document.selection.clearSelection();
      return 0;
    }

    const nodes = this.highlights
      .map(item => view.document.visual.context.getNode(item))
      .filter((item): item is INode => item !== undefined);
    this.document.selection.setSelection(nodes, event.shiftKey);
    return nodes.length;
  }
}
