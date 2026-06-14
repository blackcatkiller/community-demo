// @ts-nocheck
import type { IEventHandler, IView } from "@modelai/core/types";
import type { AsyncController } from "@modelai/core";

const MOUSE_MIDDLE = 4;

type RectState = {
  element: HTMLElement;
  startClientX: number;
  startClientY: number;
};

export abstract class SelectionHandler implements IEventHandler {
  protected rect?: RectState;
  protected mouse = { isDown: false, x: 0, y: 0 };
  protected showRect = true;
  protected readonly pointerEventMap = new Map<number, PointerEvent>();
  isEnabled = true;

  constructor(
    readonly container?: HTMLElement,
    readonly multiMode: boolean = false,
    readonly controller?: AsyncController
  ) {
    controller?.onCancelled(() => {
      this.clearSelected();
      this.cleanHighlights();
    });
  }

  dispose() {
    this.pointerEventMap.clear();
  }

  pointerMove(view: IView, event: PointerEvent) {
    if (event.defaultPrevented) return;
    if (event.buttons === MOUSE_MIDDLE) return;
    if (this.rect) this.updateRect(this.rect, event);
    this.setHighlight(view, event);
  }

  protected abstract setHighlight(view: IView, event: PointerEvent): void;
  protected abstract cleanHighlights(): void;
  protected abstract select(view: IView, event: PointerEvent): number;
  protected abstract clearSelected(): void;
  protected abstract highlightNext(view: IView): void;

  pointerDown(_view: IView, event: PointerEvent) {
    if (event.defaultPrevented) return;
    event.preventDefault();
    if (event.button === 0 && event.isPrimary) {
      this.mouse = { isDown: true, x: event.offsetX, y: event.offsetY };
      if (this.multiMode && this.showRect) {
        this.rect = this.initRect(event);
      }
    }
    this.pointerEventMap.set(event.pointerId, event);
  }

  private initRect(event: PointerEvent): RectState {
    const el = document.createElement("div");
    el.style.cssText = [
      "border: 1px solid #4a9eff",
      "background-color: rgba(74, 158, 255, 0.15)",
      "position: absolute",
      "pointer-events: none",
      "display: none",
      "left: 0",
      "top: 0",
      "width: 0",
      "height: 0",
      "z-index: 100"
    ].join(";");
    this.container?.appendChild(el);
    return {
      element: el,
      startClientX: event.clientX,
      startClientY: event.clientY
    };
  }

  protected updateRect(rect: RectState, event: PointerEvent) {
    if (!this.container || this.pointerEventMap.size !== 1) return;
    const bounds = this.container.getBoundingClientRect();
    const toLocal = (cx: number, cy: number) => ({
      x: cx - bounds.left,
      y: cy - bounds.top
    });
    const start = toLocal(rect.startClientX, rect.startClientY);
    const cur = toLocal(event.clientX, event.clientY);

    const x1 = Math.min(start.x, cur.x);
    const y1 = Math.min(start.y, cur.y);
    const x2 = Math.max(start.x, cur.x);
    const y2 = Math.max(start.y, cur.y);

    rect.element.style.display = "block";
    Object.assign(rect.element.style, {
      left: `${x1}px`,
      top: `${y1}px`,
      width: `${x2 - x1}px`,
      height: `${y2 - y1}px`
    });
  }

  pointerOut(_view: IView, event: PointerEvent) {
    if (event.defaultPrevented) return;
    if (event.isPrimary) {
      this.mouse.isDown = false;
      this.removeRect();
      this.cleanHighlights();
    }
    this.pointerEventMap.delete(event.pointerId);
  }

  pointerUp(view: IView, event: PointerEvent) {
    event.preventDefault();
    if (this.mouse.isDown && event.button === 0 && event.isPrimary) {
      this.mouse.isDown = false;
      this.removeRect();
      const count = this.select(view, event);
      this.cleanHighlights();
      view.update();
      if (count > 0 && !this.multiMode) {
        this.controller?.success();
      }
    }
    this.pointerEventMap.delete(event.pointerId);
  }

  dblClick(_view: IView, _event: MouseEvent) {}

  keyDown(view: IView, event: KeyboardEvent) {
    if (event.key === "Escape") {
      this.clearSelected();
      this.cleanHighlights();
      this.controller?.cancel();
    } else if (event.key === "Enter") {
      this.cleanHighlights();
      this.controller?.success();
    } else if (event.key === "Tab") {
      event.preventDefault();
      this.highlightNext(view);
    }
  }

  private removeRect() {
    this.rect?.element.remove();
    this.rect = undefined;
  }
}
