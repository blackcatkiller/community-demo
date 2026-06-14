// @ts-nocheck
import type { IEventHandler, IView } from "@modelai/core/types";

const MOUSE_MIDDLE = 4;

export type ViewDragMode = "auto" | "rotate" | "pan";

export class ThreeViewHandler implements IEventHandler {
  private _lastDown: { time: number; key: number } | undefined;
  private _clearDownId: number | undefined;
  private _offsetPoint: { x: number; y: number } | undefined;
  isEnabled = true;
  dragMode: ViewDragMode = "auto";

  setDragMode(mode: ViewDragMode) {
    this.dragMode = mode;
  }

  dispose() {
    this.clearTimeout();
  }

  mouseWheel(view: IView, event: WheelEvent) {
    // Ignore wheel events while middle button is pressed to avoid mis-trigger.
    if (event.buttons === MOUSE_MIDDLE) return;
    view.cameraController.zoom(event.offsetX, event.offsetY, -event.deltaY);
    view.update();
  }

  pointerMove(view: IView, event: PointerEvent) {
    if (event.buttons !== MOUSE_MIDDLE) return;
    let dx = 0,
      dy = 0;
    if (this._offsetPoint) {
      dx = event.offsetX - this._offsetPoint.x;
      dy = event.offsetY - this._offsetPoint.y;
      this._offsetPoint = { x: event.offsetX, y: event.offsetY };
    }

    const mode = this.dragMode;
    const shouldPan = mode === "pan" || event.shiftKey;
    if (shouldPan) view.cameraController.pan(dx, dy);
    else view.cameraController.rotate(dx, dy);

    if (dx !== 0 && dy !== 0) this._lastDown = undefined;
    view.update();
  }

  pointerDown(view: IView, event: PointerEvent) {
    this.clearTimeout();
    if (event.buttons !== MOUSE_MIDDLE) return;

    if (this._lastDown && this._lastDown.time + 500 > Date.now()) {
      this._lastDown = undefined;
      view.cameraController.fitContent();
      view.update();
    } else {
      // Match Chili3D: always initialize rotate center/state on middle-down.
      // This also avoids discontinuities when user toggles Shift while dragging.
      view.cameraController.startRotate(event.offsetX, event.offsetY);
      this._lastDown = { time: Date.now(), key: event.buttons };
      this._offsetPoint = { x: event.offsetX, y: event.offsetY };
      view.update();
    }
  }

  pointerUp(_view: IView, event: PointerEvent) {
    const hadDragContext = Boolean(this._offsetPoint);
    const cameraController =
      _view.cameraController as typeof _view.cameraController & {
        flushRotateDebugSummary?: (reason?: string) => void;
        endPointerGesture?: () => void;
      };
    if (
      (event.button === 1 || hadDragContext) &&
      cameraController.flushRotateDebugSummary
    ) {
      cameraController.flushRotateDebugSummary("pointerUp");
    }
    if (event.buttons === MOUSE_MIDDLE && this._lastDown) {
      this._clearDownId = window.setTimeout(() => {
        this._lastDown = undefined;
        this._clearDownId = undefined;
      }, 500);
    }
    cameraController.endPointerGesture?.();
    this._offsetPoint = undefined;
    _view.update();
  }

  pointerOut(_view: IView, _event: PointerEvent) {
    const cameraController =
      _view.cameraController as typeof _view.cameraController & {
        flushRotateDebugSummary?: (reason?: string) => void;
        endPointerGesture?: () => void;
      };
    cameraController.flushRotateDebugSummary?.("pointerOut");
    cameraController.endPointerGesture?.();
    this._lastDown = undefined;
    _view.update();
  }

  private clearTimeout() {
    if (this._clearDownId) {
      clearTimeout(this._clearDownId);
      this._clearDownId = undefined;
    }
  }
}
