// @ts-nocheck
import type { IView } from "@modelai/core";
import { SemanticHandleTool } from "@/features/modelai/commands/create/shared/semanticHandleTool";

export class SemanticHandleGroup {
  private activePointerTool?: SemanticHandleTool;

  constructor(
    private readonly tools: readonly SemanticHandleTool[],
    private readonly options: {
      keyTool?: SemanticHandleTool;
    } = {}
  ) {}

  get isEnabled(): boolean {
    return this.tools.every(tool => tool.isEnabled);
  }

  set isEnabled(value: boolean) {
    this.tools.forEach(tool => {
      tool.isEnabled = value;
    });
  }

  get lastView(): IView | undefined {
    return (
      this.activePointerTool?.lastView ??
      this.tools.find(tool => tool.lastView)?.lastView
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
    (this.options.keyTool ?? this.tools[0])?.keyDown?.(view, event);
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
