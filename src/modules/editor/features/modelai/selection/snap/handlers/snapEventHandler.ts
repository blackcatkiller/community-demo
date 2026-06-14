// @ts-nocheck
import type {
  EdgeMeshData,
  IDocument,
  IEventHandler,
  IView,
  ShapeMeshData,
  ViewShapeGuidePolicy,
  VertexMeshData
} from "@modelai/core/types";
import { MeshDataUtils, ShapeType, VisualConfig } from "@modelai/core/types";
import type { XYZ } from "@modelai/core/math";
import { type AsyncController, PubSub, Result } from "@modelai/core";
import { RaycasterThreshold } from "@modelai/viewer/constants";
import { applyOcclusionOverlay } from "@modelai/geometry/occlusionOverlay";
import { ThreeGeometryFactory } from "@modelai/viewer/geometryFactory";
import type { ThreeView } from "@modelai/viewer/view";
import type { ISnap, MouseAndDetected, SnapData, SnapResult } from "../snap";
import { screenDistance } from "../utils";
import type { Object3D } from "three";

export interface SnapCommandUI {
  showPrompt?: (message: string) => void;
  clearPrompt?: () => void;
  showToast?: (message: string) => void;
  requestInput?: (
    initial: string,
    onSubmit: (text: string) => Result<string, string | undefined>
  ) => void;
  clearInput?: () => void;
}

enum SnapState {
  Idle,
  Snapping,
  Inputing,
  Cancelled,
  Completed
}

interface PreviewMeshSlot {
  id: number;
  descriptor?: string;
}

interface PreviewObjectSlot {
  id: number;
  object: Object3D;
}

export abstract class SnapEventHandler<D extends SnapData = SnapData>
  implements IEventHandler
{
  private tempPointId?: number;
  private tempShapeSlots: PreviewMeshSlot[] = [];
  private tempObjectSlots: PreviewObjectSlot[] = [];
  private tempPoint?: XYZ;
  private pendingPointer?: { view: IView; event: PointerEvent };
  private hoverScheduled = false;
  private disposed = false;
  private lastViewCursor?: string;
  private lastPrompt?: string;
  private promptVisible = false;
  private lastVisualFeedbackKey?: string;
  protected showTempPoint = true;
  protected snapedValue?: SnapResult;
  private stateValue: SnapState = SnapState.Idle;
  private readonly snapDistance: number;
  private readonly snapEnabled?: () => boolean;

  facePreviewOpacity = 1;
  isEnabled = true;

  constructor(
    readonly document: IDocument,
    readonly controller: AsyncController,
    readonly snaps: ISnap[],
    readonly data: D,
    private readonly ui?: SnapCommandUI,
    snapEnabled?: () => boolean,
    snapDistance: number = RaycasterThreshold
  ) {
    this.snapDistance = snapDistance;
    this.snapEnabled = snapEnabled;
    this.syncTempShape(undefined);
    controller.onCancelled(() => this.handleCancel());
    controller.onCompleted(() => this.handleSuccess());
  }

  get snaped() {
    return this.snapedValue;
  }

  get state() {
    return this.stateValue;
  }

  setPreviewResult(result: SnapResult | undefined) {
    this.stateValue = SnapState.Snapping;
    this.removeTempVisuals();
    this.lastVisualFeedbackKey = undefined;
    this.snapedValue = result;
    this.syncViewCursor(result);

    if (result) {
      this.showSnapPrompt(result);
    } else {
      this.clearSnapPrompt();
    }

    this.syncTempShape(result?.point);
    this.document.visual.update();
  }

  dispose() {
    this.syncViewCursor(undefined, true);
    this.cleanupHandlerState();
    this.disposed = true;
    this.pendingPointer = undefined;
    this.hoverScheduled = false;
    this.snapedValue = undefined;
    this.lastVisualFeedbackKey = undefined;
    this.stateValue = SnapState.Completed;
  }

  private handleSuccess() {
    if (this.stateValue === SnapState.Completed) return;

    this.stateValue = SnapState.Completed;
    this.controller.success();
    this.cleanupResources();
  }

  private handleCancel() {
    if (this.stateValue === SnapState.Cancelled) return;

    this.stateValue = SnapState.Cancelled;
    this.controller.cancel();
    this.cleanupResources();
  }

  private cleanupResources() {
    this.syncViewCursor(undefined, true);
    this.clearSnapPrompt();
    this.clearInput();
    this.removeTempVisuals();
    this.lastVisualFeedbackKey = undefined;
    this.cleanupHandlerState();
    this.snaps.forEach(snap => snap.clear());
  }

  protected cleanupHandlerState(): void {}

  protected resolveCursor(snaped: SnapResult | undefined): string | undefined {
    return this.data.hoverCursor?.(snaped) ?? "pointSnap";
  }

  private syncViewCursor(snaped: SnapResult | undefined, reset = false) {
    const cursor = reset
      ? "default"
      : (this.resolveCursor(snaped) ?? "default");
    if (this.lastViewCursor === cursor) return;

    this.lastViewCursor = cursor;
    PubSub.default.pub("viewCursor", cursor);
  }

  private clearInput() {
    this.ui?.clearInput?.();
  }

  pointerMove(view: IView, event: PointerEvent): void {
    if (!this.isEnabled || (this.snapEnabled && !this.snapEnabled())) {
      this.pendingPointer = undefined;
      this.snapedValue = undefined;
      this.syncViewCursor(undefined, true);
      this.clearSnapPrompt();
      this.removeTempVisuals();
      this.lastVisualFeedbackKey = undefined;
      return;
    }
    this.pendingPointer = { view, event };
    this.scheduleHover();
  }

  processHoverFrame(view: IView, event: PointerEvent): void {
    if (!this.isEnabled || (this.snapEnabled && !this.snapEnabled())) {
      this.pendingPointer = undefined;
      this.snapedValue = undefined;
      this.syncViewCursor(undefined, true);
      this.clearSnapPrompt();
      this.removeTempVisuals();
      this.lastVisualFeedbackKey = undefined;
      return;
    }
    this.pendingPointer = undefined;
    this.hoverScheduled = false;
    this.processPointerMove(view, event);
  }

  private scheduleHover() {
    if (this.hoverScheduled || this.disposed) return;
    this.hoverScheduled = true;
    requestAnimationFrame(() => this.flushHover());
  }

  private flushHover() {
    this.hoverScheduled = false;
    if (this.disposed) return;

    const pending = this.pendingPointer;
    this.pendingPointer = undefined;
    if (!pending) return;

    this.processPointerMove(pending.view, pending.event);
  }

  private processPointerMove(view: IView, event: PointerEvent) {
    this.stateValue = SnapState.Snapping;
    this.removeSnapDynamicObjects();
    this.updateSnapPoint(view, event);
    this.updateVisualFeedback(view);
  }

  private updateSnapPoint(view: IView, event: PointerEvent) {
    this.setSnaped(view, event);
    this.syncViewCursor(this.snapedValue);
    this.showSnapPrompt(this.snapedValue);
  }

  private updateVisualFeedback(view: IView) {
    const visualFeedbackKey = this.getVisualFeedbackKey(this.snapedValue);
    if (visualFeedbackKey === this.lastVisualFeedbackKey) return;

    this.lastVisualFeedbackKey = visualFeedbackKey;
    this.syncTempShape(this.snapedValue?.point);
    view.document.visual.update();
  }

  protected prepareSnapForCompletion(
    _view: IView,
    _event?: PointerEvent
  ): void {}

  protected setSnaped(view: IView, event: PointerEvent) {
    // Prefer edges/vertices, but avoid "picking through" a visible face.
    // We do a conservative occlusion check: only when the face hit is clearly
    // closer along the mouse ray do we override the edge/vertex snap.
    const faceHitDepth = this.getFaceHitDepth(view, event);

    this.findSnapPoint(ShapeType.Edge | ShapeType.Vertex, view, event);

    if (!this.snapedValue) {
      this.findSnapPoint(ShapeType.Face, view, event);
    } else if (faceHitDepth !== undefined && this.snapedValue.point) {
      const ray = view.rayAt(event.offsetX, event.offsetY);
      const snappedDepth = this.depthAlongRay(
        ray.origin,
        ray.direction,
        this.snapedValue.point
      );
      if (snappedDepth <= 0) {
        // Ignore points behind the camera; keep the existing snap.
        return;
      }

      // Conservative: make it slightly harder for face to win so edges/vertices
      // remain easy to pick near silhouettes.
      const epsilon = Math.max(1e-4, faceHitDepth * 1e-3);
      if (faceHitDepth + epsilon < snappedDepth) {
        this.findSnapPoint(ShapeType.Face, view, event);
      }
    }

    this.snaps.forEach(snap =>
      snap.handleSnaped?.(view.document.visual.document, this.snapedValue)
    );
  }

  private getFaceHitDepth(view: IView, event: MouseEvent): number | undefined {
    const faces = view.detectShapes(
      ShapeType.Face,
      event.offsetX,
      event.offsetY
    );
    const hit = faces.find(s => s.point !== undefined);
    if (!hit?.point) return undefined;

    const ray = view.rayAt(event.offsetX, event.offsetY);
    const depth = this.depthAlongRay(ray.origin, ray.direction, hit.point);
    return depth > 0 ? depth : undefined;
  }

  private depthAlongRay(origin: XYZ, direction: XYZ, point: XYZ): number {
    // `direction` is normalized in `view.rayAt()`, so this is a distance along the ray.
    return point.sub(origin).dot(direction);
  }

  private findNearestFeaturePoint(view: IView, event: PointerEvent) {
    let minDist = Number.MAX_VALUE;
    let nearest:
      | {
          point: XYZ;
          prompt: string;
        }
      | undefined;

    for (const point of this.data.featurePoints || []) {
      if (point.when && !point.when()) continue;

      const dist = screenDistance(
        view,
        event.offsetX,
        event.offsetY,
        point.point
      );
      if (dist < minDist) {
        minDist = dist;
        nearest = point;
      }
    }

    return minDist < this.snapDistance ? nearest : undefined;
  }

  protected findSnapPoint(
    shapeType: ShapeType,
    view: IView,
    event: PointerEvent,
    snaps: readonly ISnap[] = this.snaps
  ) {
    const detected = this.detectShapes(shapeType, view, event);
    this.findSnapPointFromDetected(detected, event, snaps);
  }

  protected findSnapPointFromDetected(
    detected: MouseAndDetected,
    event: PointerEvent,
    snaps: readonly ISnap[] = this.snaps
  ) {
    const featurePoint = this.findNearestFeaturePoint(detected.view, event);
    if (featurePoint) {
      this.snapedValue = {
        view: detected.view,
        point: featurePoint.point,
        info: featurePoint.prompt,
        shapes: []
      };
    } else {
      for (const snap of snaps) {
        const snaped = snap.snap(detected);
        if (snaped && this.validateSnapPoint(snaped)) {
          this.snapedValue = snaped;
          return;
        }
      }
      this.snapedValue = undefined;
    }
  }

  private validateSnapPoint(snaped: SnapResult) {
    return !this.data.validator || this.data.validator(snaped.point!);
  }

  protected detectShapes(
    shapeType: ShapeType,
    view: IView,
    event: MouseEvent
  ): MouseAndDetected {
    let shapes = view.detectShapes(shapeType, event.offsetX, event.offsetY, {
      guidePolicy: this.detectShapeGuidePolicy()
    });
    if (this.data.filter) {
      shapes = shapes.filter(shape => this.data.filter!(shape));
    }
    return { shapes, view, mx: event.offsetX, my: event.offsetY };
  }

  protected detectShapeGuidePolicy(): ViewShapeGuidePolicy {
    return "default";
  }

  protected clearSnapPrompt() {
    if (!this.promptVisible && this.lastPrompt === undefined) return;

    this.promptVisible = false;
    this.lastPrompt = undefined;
    this.ui?.clearPrompt?.();
  }

  protected showSnapPrompt(snaped: SnapResult | undefined) {
    const prompt = this.formatSnapPrompt(snaped);
    if (!prompt) {
      this.clearSnapPrompt();
      return;
    }

    if (this.promptVisible && this.lastPrompt === prompt) return;

    this.promptVisible = true;
    this.lastPrompt = prompt;
    this.ui?.showPrompt?.(prompt);
  }

  protected formatSnapPrompt(
    snaped: SnapResult | undefined
  ): string | undefined {
    let prompt = this.data.prompt?.(snaped);
    if (!prompt && snaped) {
      const distance =
        snaped.distance ?? snaped.refPoint?.distanceTo(snaped.point!);
      if (distance !== undefined) {
        prompt = this.formatSnapDistance(distance);
      }
    }

    if (!prompt && !snaped?.info) {
      return undefined;
    }

    return [snaped?.info, prompt].filter(x => x !== undefined).join(" -> ");
  }

  protected formatSnapDistance(num: number) {
    return num.toFixed(2);
  }

  private removeTempVisuals() {
    this.removeTempShapes();
    this.removeSnapDynamicObjects();
  }

  private getVisualFeedbackKey(snaped: SnapResult | undefined): string {
    if (!snaped?.point) return "none";

    const point = snaped.point;
    return [
      this.formatKeyNumber(point.x),
      this.formatKeyNumber(point.y),
      this.formatKeyNumber(point.z),
      snaped.info ?? "",
      snaped.distance === undefined
        ? ""
        : this.formatKeyNumber(snaped.distance),
      snaped.refPoint ? this.formatPointKey(snaped.refPoint) : "",
      snaped.plane ? this.formatPlaneKey(snaped.plane) : "",
      ...snaped.shapes.map(shape => this.formatShapeKey(shape))
    ].join("|");
  }

  private formatShapeKey(shape: SnapResult["shapes"][number]): string {
    return shape.guide
      ? `guide:${shape.guide.id}`
      : `${shape.owner.node?.id ?? ""}:${shape.shape.id}:${shape.shape.shapeType}:${shape.indexes.join(",")}`;
  }

  private formatPlaneKey(plane: NonNullable<SnapResult["plane"]>): string {
    return [
      this.formatPointKey(plane.origin),
      this.formatPointKey(plane.normal),
      this.formatPointKey(plane.xvec)
    ].join("/");
  }

  private formatPointKey(point: XYZ): string {
    return [
      this.formatKeyNumber(point.x),
      this.formatKeyNumber(point.y),
      this.formatKeyNumber(point.z)
    ].join(",");
  }

  private formatKeyNumber(value: number): string {
    return value.toFixed(6);
  }

  private removeSnapDynamicObjects() {
    this.snaps.forEach(snap => snap.removeDynamicObject());
  }

  private syncTempShape(point: XYZ | undefined) {
    this.syncTempPoint(point);
    this.syncPreviewShape(point, this.snapedValue?.view);
    this.syncPreviewObjects(point);
  }

  private syncTempPoint(point: XYZ | undefined) {
    if (!point || !this.showTempPoint) {
      this.removeTempPoint();
      return;
    }

    const data = MeshDataUtils.createVertexMesh(
      point,
      VisualConfig.temporaryVertexSize,
      VisualConfig.temporaryVertexColor
    );
    data.alwaysOnTop = true;

    if (this.tempPointId === undefined) {
      this.tempPointId = this.document.visual.context.displayMesh([data]);
    } else if (!this.tempPoint?.isEqualTo(point)) {
      this.document.visual.context.setPosition(this.tempPointId, data.position);
    }

    this.tempPoint = point;
  }

  private syncPreviewShape(point: XYZ | undefined, view?: IView) {
    const nextShapes = point
      ? (this.data.preview?.(point, this.snapedValue) ?? [])
      : [];
    const nextSlots: PreviewMeshSlot[] = [];

    nextShapes.forEach((shape, index) => {
      const descriptor = this.getPreviewMeshDescriptor(shape);
      const currentSlot = this.tempShapeSlots[index];
      if (
        descriptor !== undefined &&
        currentSlot &&
        currentSlot.descriptor === descriptor
      ) {
        this.document.visual.context.setPosition(
          currentSlot.id,
          shape.position
        );
        nextSlots.push(currentSlot);
        return;
      }

      if (currentSlot) {
        this.document.visual.context.removeMesh(currentSlot.id);
      }

      if (
        MeshDataUtils.isEdgeMesh(shape) &&
        shape.advancedOcclusion &&
        view &&
        "addAfterSceneRenderHook" in (view as any)
      ) {
        const lineObj = ThreeGeometryFactory.createEdgeGeometry(shape);
        lineObj.userData.detachOcclusionOverlay = applyOcclusionOverlay(
          view as ThreeView,
          lineObj
        );
        nextSlots.push({
          id: this.document.visual.context.displayObject(lineObj),
          descriptor
        });
        return;
      }

      nextSlots.push({
        id: this.document.visual.context.displayMesh(
          [shape],
          this.facePreviewOpacity
        ),
        descriptor
      });
    });

    this.tempShapeSlots
      .slice(nextShapes.length)
      .forEach(slot => this.document.visual.context.removeMesh(slot.id));

    this.tempShapeSlots = nextSlots;
  }

  private syncPreviewObjects(point: XYZ | undefined) {
    const nextObjects = point
      ? (this.data.previewObjects?.(point, this.snapedValue) ?? [])
      : [];
    const nextSlots: PreviewObjectSlot[] = [];

    nextObjects.forEach((object, index) => {
      const currentSlot = this.tempObjectSlots[index];
      if (currentSlot && currentSlot.object === object) {
        nextSlots.push(currentSlot);
        return;
      }

      if (currentSlot) {
        this.document.visual.context.removeMesh(currentSlot.id);
      }

      nextSlots.push({
        id: this.document.visual.context.displayObject(object),
        object
      });
    });

    this.tempObjectSlots
      .slice(nextObjects.length)
      .forEach(slot => this.document.visual.context.removeMesh(slot.id));

    this.tempObjectSlots = nextSlots;
  }

  private removeTempPoint() {
    if (this.tempPointId === undefined) return;
    this.document.visual.context.removeMesh(this.tempPointId);
    this.tempPointId = undefined;
    this.tempPoint = undefined;
  }

  private removePreviewShapes() {
    this.tempShapeSlots.forEach(slot => {
      this.document.visual.context.removeMesh(slot.id);
    });
    this.tempShapeSlots = [];
    this.tempObjectSlots.forEach(slot => {
      this.document.visual.context.removeMesh(slot.id);
    });
    this.tempObjectSlots = [];
  }

  private removeTempShapes() {
    this.removeTempPoint();
    this.removePreviewShapes();
  }

  private getPreviewMeshDescriptor(mesh: ShapeMeshData): string | undefined {
    if (MeshDataUtils.isVertexMesh(mesh)) {
      return this.getVertexPreviewDescriptor(mesh);
    }
    if (MeshDataUtils.isEdgeMesh(mesh)) {
      return this.getEdgePreviewDescriptor(mesh);
    }
    return undefined;
  }

  private getVertexPreviewDescriptor(mesh: VertexMeshData): string {
    return [
      "vertex",
      mesh.size,
      mesh.position.length,
      this.serializeColor(mesh.color)
    ].join(":");
  }

  private getEdgePreviewDescriptor(mesh: EdgeMeshData): string {
    return [
      "edge",
      mesh.lineType,
      mesh.lineWidth ?? "",
      mesh.position.length,
      this.serializeColor(mesh.color)
    ].join(":");
  }

  private serializeColor(color?: number | number[]) {
    if (Array.isArray(color)) return color.join(",");
    return color ?? "";
  }

  pointerDown(_view: IView, event: PointerEvent): void {
    if (this.snapEnabled && !this.snapEnabled()) return;
    this.flushHover();
    if (event.pointerType === "mouse" && event.button === 0) {
      if (this.snapedValue) {
        this.prepareSnapForCompletion(_view, event);
        this.handleSuccess();
      } else {
        this.showSnapPrompt(undefined);
        this.ui?.showToast?.("No valid snap point");
      }
    }
  }

  pointerUp(_view: IView, event: PointerEvent): void {
    if (this.snapEnabled && !this.snapEnabled()) return;
    this.flushHover();
    if (event.pointerType !== "mouse" && event.isPrimary && this.snapedValue) {
      this.prepareSnapForCompletion(_view, event);
      this.handleSuccess();
    }
  }

  pointerOut(_view: IView, _event: PointerEvent) {
    this.pendingPointer = undefined;
    this.snapedValue = undefined;
    this.syncViewCursor(undefined, true);
  }

  mouseWheel(view: IView, _event: WheelEvent): void {
    view.update();
  }

  keyDown(view: IView, event: KeyboardEvent): void {
    if (this.snapEnabled && !this.snapEnabled()) return;
    this.flushHover();
    switch (event.key) {
      case "Escape":
        this.snapedValue = undefined;
        this.syncViewCursor(undefined, true);
        this.handleCancel();
        break;
      case "Enter":
        this.snapedValue = undefined;
        this.syncViewCursor(undefined, true);
        this.handleSuccess();
        break;
      default:
      // this.handleNumericInput(view, event);
    }
  }

  private handleNumericInput(view: IView, event: KeyboardEvent) {
    if (!this.ui?.requestInput) return;
    if (
      !["#", "-", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9"].includes(
        event.key
      )
    ) {
      return;
    }

    this.stateValue = SnapState.Inputing;
    this.ui.requestInput(event.key, (text: string) => {
      const error = this.inputError(text);
      if (error) return Result.err(error);

      this.snapedValue = this.getPointFromInput(view, text);
      this.prepareSnapForCompletion(view);
      this.handleSuccess();
      return Result.ok(text);
    });
  }

  protected abstract getPointFromInput(view: IView, text: string): SnapResult;
  protected abstract inputError(text: string): string | undefined;
}
