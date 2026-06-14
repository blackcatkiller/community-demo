// @ts-nocheck
import type { IEventHandler, IHistoryRecord, IView } from "@modelai/core";
import type { EdgeMeshData, IDocument } from "@modelai/core/types";
import { MeshDataUtils, PubSub, Transaction, XYZ } from "@modelai/core";
import { screenDistance } from "@modelai/selection/snap/utils";
import { HorizontalRunnerNode } from "@/features/modelai/gates/horizontalRunner/horizontalRunner";
import { VerticalRunnerNode } from "@/features/modelai/gates/verticalRunner/verticalRunner";
import { PointVerticalRunnerNode } from "@/features/modelai/gates/pointVerticalRunner/pointVerticalRunner";
import type { ThreeVisualContext } from "@/features/modelai/viewer/visualContext";
import {
  lineBasicWhiteAlpha60NoDepthMaterial,
  meshBasicWhiteAlpha10NoDepthMaterial
} from "@/features/modelai/viewer/materials";
import { ThreeGeometryFactory } from "@/features/modelai/viewer/geometryFactory";
import { createSemanticArrowMesh } from "@/features/modelai/gates/shared/semanticHandleGeometry";
import { mountFormKit } from "@modelai/ui/formKit/mount";
import { AsyncController } from "@modelai/core";
import { PushPlatePlaneEditSession } from "./pushPlatePlaneEditSession";
import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  Group,
  LineSegments,
  Matrix4 as ThreeMatrix4,
  Mesh,
  type Object3D
} from "three";
import { resolveDefaultRunnerZ } from "./defaultRunnerZ";

const DEFAULT_PUSH_PLATE_PLANE_HELPER_WIDTH = 200;
const DEFAULT_PUSH_PLATE_PLANE_HELPER_HEIGHT = 200;

type DocumentPushPlatePlaneHelperState = {
  fillId?: number;
  borderId?: number;
  handleId?: number;
  handleRoot?: Group;
  handleSlots?: PushPlatePlaneHandleSlot[];
  handleViewUpdater?: (view: IView) => void;
  activeHandleIndex?: number;
};

type PushPlatePlaneHandleSlot = {
  object: Object3D;
  anchor: XYZ;
  basePx: number;
};

type PushPlatePlaneDragState = {
  startParam: number;
  startZ: number;
  beforeZ: number;
  handleIndex: number;
  startAnchor: XYZ;
};

type PushPlatePlaneHelperRect = {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
};

const PUSH_PLATE_HANDLE_IDLE_COLOR = 0xffffff;
const PUSH_PLATE_HANDLE_ACTIVE_COLOR = 0x4488ff;
const PUSH_PLATE_HANDLE_RENDER_ORDER = 2001;
const PUSH_PLATE_HANDLE_HIT_PIXELS = 20;
const PUSH_PLATE_HANDLE_DRAG_AXIS = new XYZ(0, 0, 1);

export type PushPlatePlaneHandleSizeConfig = {
  /** Total visual span from one arrow tip to the opposite arrow tip, in screen pixels. */
  totalSpanPx: number;
  /** Arrow cone length, in screen pixels. */
  arrowConeHeightPx: number;
  /** Arrow cone base diameter, in screen pixels. */
  arrowConeDiameterPx: number;
  /** Arrow cylinder length, in screen pixels. */
  arrowStemHeightPx: number;
  /** Arrow cylinder diameter, in screen pixels. */
  arrowStemDiameterPx: number;
};

export const PUSH_PLATE_PLANE_HANDLE_SIZE: PushPlatePlaneHandleSizeConfig = {
  totalSpanPx: 48,
  arrowConeHeightPx: 10,
  arrowConeDiameterPx: 10,
  arrowStemHeightPx: 6,
  arrowStemDiameterPx: 4
};

const helperStates = new WeakMap<
  IDocument,
  DocumentPushPlatePlaneHelperState
>();

function emitDocumentPushPlatePlaneChanged(
  document: IDocument,
  z: number,
  beforeZ: number
) {
  if (z === beforeZ) return;
  PubSub.default.pub("pushPlatePlaneChanged", document, z, beforeZ);
}

function worldUnitsPerPixelAt(view: IView, anchor: XYZ): number {
  const screenPt = view.worldToScreen(anchor);
  const ray0 = view.rayAt(screenPt.x, screenPt.y);
  const ray1 = view.rayAt(screenPt.x + 1, screenPt.y);
  const t = Math.max(anchor.sub(ray0.origin).dot(ray0.direction), 0.1);
  const w0 = ray0.origin.add(ray0.direction.multiply(t));
  const w1 = ray1.origin.add(ray1.direction.multiply(t));
  const px = w0.sub(w1).length();
  return Number.isFinite(px) && px > 0 ? px : 1;
}

function rayToAxisParam(
  view: IView,
  screenX: number,
  screenY: number,
  anchor: XYZ,
  axisDir: XYZ
): number | null {
  const ray = view.rayAt(screenX, screenY);
  const axis = axisDir.normalize();
  const w = ray.origin.sub(anchor);
  const b = ray.direction.dot(axis);
  const d = w.dot(ray.direction);
  const e = w.dot(axis);
  const denom = 1 - b * b;
  if (Math.abs(denom) < 1e-6) return null;
  return (e - b * d) / denom;
}

function setScaleAroundAnchor(object: Object3D, anchor: XYZ, scale: number) {
  object.matrix
    .makeTranslation(anchor.x, anchor.y, anchor.z)
    .multiply(new ThreeMatrix4().makeScale(scale, scale, scale))
    .multiply(
      new ThreeMatrix4().makeTranslation(-anchor.x, -anchor.y, -anchor.z)
    );
  object.matrixWorldNeedsUpdate = true;
}

function canResolveDocumentPushPlatePlane(document: IDocument) {
  return document.modelManager.findNodes().some(node => {
    return "boundingBox" in node && typeof node.boundingBox === "function";
  });
}

function resolvePushPlatePlaneHelperRect(document: IDocument) {
  const context = document.visual?.context as ThreeVisualContext | undefined;
  context?.visualShapes.updateMatrixWorld(true);
  const box = context ? new Box3().setFromObject(context.visualShapes) : null;
  if (!box || box.isEmpty()) {
    return {
      centerX: 0,
      centerY: 0,
      width: document.pushPlatePlane.helperWidth,
      height: document.pushPlatePlane.helperHeight
    };
  }

  const width = Math.max(1, (box.max.x - box.min.x) * 1.1);
  const height = Math.max(1, (box.max.y - box.min.y) * 1.1);
  return {
    centerX: (box.min.x + box.max.x) / 2,
    centerY: (box.min.y + box.max.y) / 2,
    width,
    height
  };
}

function isInsidePushPlatePlaneHelper(
  document: IDocument,
  view: IView,
  event: MouseEvent
) {
  if (
    !document.pushPlatePlane.helperVisible ||
    !Number.isFinite(document.pushPlatePlane.z)
  ) {
    return false;
  }
  const ray = view.rayAt(event.offsetX, event.offsetY);
  if (Math.abs(ray.direction.z) < 1e-6) return false;
  const t = (document.pushPlatePlane.z - ray.origin.z) / ray.direction.z;
  if (!Number.isFinite(t) || t < 0) return false;
  const world = ray.origin.add(ray.direction.multiply(t));
  const rect = resolvePushPlatePlaneHelperRect(document);
  const halfWidth = document.pushPlatePlane.helperWidth / 2;
  const halfHeight = document.pushPlatePlane.helperHeight / 2;
  return (
    world.x >= rect.centerX - halfWidth &&
    world.x <= rect.centerX + halfWidth &&
    world.y >= rect.centerY - halfHeight &&
    world.y <= rect.centerY + halfHeight
  );
}

function normalizePushPlatePlane(document: IDocument) {
  if (Number.isFinite(document.pushPlatePlane.z)) {
    document.pushPlatePlane.z = Number(document.pushPlatePlane.z);
  }
  document.pushPlatePlane.helperVisible =
    document.pushPlatePlane.helperVisible !== false;
  const rect = resolvePushPlatePlaneHelperRect(document);
  document.pushPlatePlane.helperWidth = Number.isFinite(rect.width)
    ? rect.width
    : DEFAULT_PUSH_PLATE_PLANE_HELPER_WIDTH;
  document.pushPlatePlane.helperHeight = Number.isFinite(rect.height)
    ? rect.height
    : DEFAULT_PUSH_PLATE_PLANE_HELPER_HEIGHT;
}

function buildPushPlatePlaneFillPosition(document: IDocument) {
  normalizePushPlatePlane(document);
  const rect = resolvePushPlatePlaneHelperRect(document);
  const halfWidth = document.pushPlatePlane.helperWidth / 2;
  const halfHeight = document.pushPlatePlane.helperHeight / 2;
  const z = document.pushPlatePlane.z;
  return new Float32Array([
    rect.centerX - halfWidth,
    rect.centerY - halfHeight,
    z,
    rect.centerX + halfWidth,
    rect.centerY - halfHeight,
    z,
    rect.centerX + halfWidth,
    rect.centerY + halfHeight,
    z,
    rect.centerX - halfWidth,
    rect.centerY + halfHeight,
    z
  ]);
}

function buildPushPlatePlaneBorderMesh(document: IDocument): EdgeMeshData {
  normalizePushPlatePlane(document);
  const rect = resolvePushPlatePlaneHelperRect(document);
  const halfWidth = document.pushPlatePlane.helperWidth / 2;
  const halfHeight = document.pushPlatePlane.helperHeight / 2;
  const z = document.pushPlatePlane.z;
  return {
    position: new Float32Array([
      rect.centerX - halfWidth,
      rect.centerY - halfHeight,
      z,
      rect.centerX + halfWidth,
      rect.centerY - halfHeight,
      z,
      rect.centerX + halfWidth,
      rect.centerY - halfHeight,
      z,
      rect.centerX + halfWidth,
      rect.centerY + halfHeight,
      z,
      rect.centerX + halfWidth,
      rect.centerY + halfHeight,
      z,
      rect.centerX - halfWidth,
      rect.centerY + halfHeight,
      z,
      rect.centerX - halfWidth,
      rect.centerY + halfHeight,
      z,
      rect.centerX - halfWidth,
      rect.centerY - halfHeight,
      z
    ]),
    range: [],
    color: 0xffffff,
    lineType: "solid"
  };
}

function createPushPlatePlaneFillObject(document: IDocument) {
  const position = buildPushPlatePlaneFillPosition(document);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(position, 3));
  geometry.setAttribute(
    "normal",
    new BufferAttribute(
      new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
      3
    )
  );
  geometry.setAttribute(
    "uv",
    new BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2)
  );
  geometry.setIndex(
    new BufferAttribute(new Uint32Array([0, 1, 2, 0, 2, 3]), 1)
  );
  geometry.computeBoundingBox();

  const object = new Mesh(geometry, meshBasicWhiteAlpha10NoDepthMaterial);
  object.renderOrder = 998;
  return object;
}

function createPushPlatePlaneBorderObject(document: IDocument) {
  const mesh = buildPushPlatePlaneBorderMesh(document);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(mesh.position, 3));
  geometry.computeBoundingBox();

  const object = new LineSegments(
    geometry,
    lineBasicWhiteAlpha60NoDepthMaterial
  );
  object.renderOrder = 999;
  return object;
}

function pushPlatePlaneHelperCorners(
  document: IDocument,
  rect: PushPlatePlaneHelperRect
): XYZ[] {
  const halfWidth = document.pushPlatePlane.helperWidth / 2;
  const halfHeight = document.pushPlatePlane.helperHeight / 2;
  const z = document.pushPlatePlane.z;
  return [
    new XYZ(rect.centerX - halfWidth, rect.centerY - halfHeight, z),
    new XYZ(rect.centerX + halfWidth, rect.centerY - halfHeight, z),
    new XYZ(rect.centerX + halfWidth, rect.centerY + halfHeight, z),
    new XYZ(rect.centerX - halfWidth, rect.centerY + halfHeight, z)
  ];
}

function createSolidArrowObject(
  baseCenter: XYZ,
  dir: XYZ,
  sideHint: XYZ,
  px: number,
  active: boolean
) {
  const color = active
    ? PUSH_PLATE_HANDLE_ACTIVE_COLOR
    : PUSH_PLATE_HANDLE_IDLE_COLOR;
  const mesh = createSemanticArrowMesh({
    baseCenter,
    dir,
    sideHint,
    coneHeight: PUSH_PLATE_PLANE_HANDLE_SIZE.arrowConeHeightPx * px,
    coneRadius: (PUSH_PLATE_PLANE_HANDLE_SIZE.arrowConeDiameterPx * px) / 2,
    stemHeight: PUSH_PLATE_PLANE_HANDLE_SIZE.arrowStemHeightPx * px,
    stemRadius: (PUSH_PLATE_PLANE_HANDLE_SIZE.arrowStemDiameterPx * px) / 2,
    color
  });
  const object = ThreeGeometryFactory.createFaceGeometry(mesh);
  object.renderOrder = PUSH_PLATE_HANDLE_RENDER_ORDER;
  return object;
}

function pushPlatePlaneHandleGeometryPoints(anchor: XYZ, px: number) {
  const normal = PUSH_PLATE_HANDLE_DRAG_AXIS;
  const arrowLength =
    (PUSH_PLATE_PLANE_HANDLE_SIZE.arrowStemHeightPx +
      PUSH_PLATE_PLANE_HANDLE_SIZE.arrowConeHeightPx) *
    px;
  const halfSpan = (PUSH_PLATE_PLANE_HANDLE_SIZE.totalSpanPx * px) / 2;
  const halfAxis = Math.max(halfSpan - arrowLength, 0);
  const topBase = anchor.add(normal.multiply(halfAxis));
  const bottomBase = anchor.sub(normal.multiply(halfAxis));
  return {
    topBase,
    bottomBase,
    topTip: topBase.add(normal.multiply(arrowLength)),
    bottomTip: bottomBase.sub(normal.multiply(arrowLength))
  };
}

function createPushPlatePlaneHeightHandleRoot(
  document: IDocument,
  view: IView | undefined,
  activeHandleIndex?: number
) {
  normalizePushPlatePlane(document);
  const rect = resolvePushPlatePlaneHelperRect(document);
  const corners = pushPlatePlaneHelperCorners(document, rect);
  const normal = new XYZ(0, 0, 1);
  const sideHint = new XYZ(1, 0, 0);
  const root = new Group();
  const slots: PushPlatePlaneHandleSlot[] = [];
  root.matrixAutoUpdate = false;
  root.renderOrder = PUSH_PLATE_HANDLE_RENDER_ORDER;

  corners.forEach((corner, index) => {
    const group = new Group();
    group.matrixAutoUpdate = false;
    const px = view ? worldUnitsPerPixelAt(view, corner) : 1;
    const active = activeHandleIndex === index;
    const { topBase, bottomBase } = pushPlatePlaneHandleGeometryPoints(
      corner,
      px
    );
    const line = MeshDataUtils.createEdgeMesh(
      bottomBase,
      topBase,
      PUSH_PLATE_HANDLE_IDLE_COLOR,
      "solid",
      1
    );
    group.add(ThreeGeometryFactory.createEdgeGeometry(line));
    group.add(createSolidArrowObject(topBase, normal, sideHint, px, active));
    group.add(
      createSolidArrowObject(bottomBase, normal.reverse(), sideHint, px, active)
    );
    group.renderOrder = PUSH_PLATE_HANDLE_RENDER_ORDER;
    root.add(group);
    slots.push({ object: group, anchor: corner, basePx: px });
  });

  return { root, slots };
}

function refreshPushPlatePlaneHandleScale(
  document: IDocument,
  state: DocumentPushPlatePlaneHelperState,
  view: IView
) {
  if (!state.handleSlots?.length) return;
  const rect = resolvePushPlatePlaneHelperRect(document);
  const corners = pushPlatePlaneHelperCorners(document, rect);
  const scaleAnchors =
    state.handleSlots.length === corners.length
      ? state.handleSlots.map((slot, index) => ({
          object: slot.object,
          anchor: corners[index],
          basePx: slot.basePx
        }))
      : state.handleSlots;
  scaleAnchors.forEach(slot => {
    const nextPx = worldUnitsPerPixelAt(view, slot.anchor);
    if (!Number.isFinite(nextPx) || nextPx <= 0 || slot.basePx <= 0) return;
    const scale = nextPx / slot.basePx;
    setScaleAroundAnchor(slot.object, slot.anchor, scale);
  });
  document.visual?.update();
}

function findPushPlatePlaneHandleHit(
  document: IDocument,
  view: IView,
  event: MouseEvent
): { index: number; distance: number } | undefined {
  const state = helperStates.get(document);
  if (!state?.handleSlots?.length) return undefined;

  const best = state.handleSlots
    .map((slot, index) => {
      const px = worldUnitsPerPixelAt(view, slot.anchor);
      const { topTip, bottomTip } = pushPlatePlaneHandleGeometryPoints(
        slot.anchor,
        px
      );
      return {
        index,
        distance: Math.min(
          screenDistance(view, event.offsetX, event.offsetY, slot.anchor),
          screenDistance(view, event.offsetX, event.offsetY, topTip),
          screenDistance(view, event.offsetX, event.offsetY, bottomTip)
        )
      };
    })
    .filter(hit => hit.distance <= PUSH_PLATE_HANDLE_HIT_PIXELS)
    .sort((a, b) => a.distance - b.distance)[0];
  return best;
}

function setPushPlatePlaneActiveHandle(
  document: IDocument,
  index: number | undefined
) {
  const state = helperStates.get(document);
  if (!state || state.activeHandleIndex === index) return;
  state.activeHandleIndex = index;
  refreshDocumentPushPlatePlaneHelper(document);
}

export class PushPlatePlaneHeightHandleController implements IEventHandler {
  isEnabled = true;
  private _disposed = false;
  private _dragState?: PushPlatePlaneDragState;
  private _hoveredHandleIndex?: number;
  private _capturedPointerId?: number;

  constructor(
    private readonly document: IDocument,
    private readonly delegate?: IEventHandler
  ) {}

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this.delegate?.dispose?.();
  }

  pointerMove(view: IView, event: PointerEvent): void {
    if (this._disposed) return;
    if (event.defaultPrevented) return;
    if (this.isCapturedPointer(event)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (this._dragState) {
        this.applyDrag(view, event);
      }
      return;
    }
    if (this._dragState) {
      this.applyDrag(view, event);
      return;
    }

    if (event.buttons === 0) {
      const hit = findPushPlatePlaneHandleHit(this.document, view, event);
      this._hoveredHandleIndex = hit?.index;
      setPushPlatePlaneActiveHandle(this.document, hit?.index);
      if (hit) return;
    }
    this.delegate?.pointerMove(view, event);
  }

  pointerDown(view: IView, event: PointerEvent): void {
    if (event.defaultPrevented) return;
    if (this._disposed || event.button !== 0) {
      this.delegate?.pointerDown(view, event);
      return;
    }

    const hit = findPushPlatePlaneHandleHit(this.document, view, event);
    if (!hit) {
      this.delegate?.pointerDown(view, event);
      return;
    }

    this._capturedPointerId = event.pointerId;
    const state = helperStates.get(this.document);
    const slot = state?.handleSlots?.[hit.index];
    if (!slot) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    this._dragState = {
      startParam:
        rayToAxisParam(
          view,
          event.offsetX,
          event.offsetY,
          slot.anchor,
          PUSH_PLATE_HANDLE_DRAG_AXIS
        ) ?? 0,
      startZ: Number(this.document.pushPlatePlane.z),
      beforeZ: Number(this.document.pushPlatePlane.z),
      handleIndex: hit.index,
      startAnchor: slot.anchor
    };
    this._hoveredHandleIndex = hit.index;
    setPushPlatePlaneActiveHandle(this.document, hit.index);
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  pointerUp(view: IView, event: PointerEvent): void {
    if (this._disposed) return;
    const wasCaptured = this.isCapturedPointer(event);
    if (wasCaptured) {
      this._capturedPointerId = undefined;
    }
    const dragState = this._dragState;
    if (!dragState) {
      if (wasCaptured) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      this.delegate?.pointerUp(view, event);
      return;
    }

    this._dragState = undefined;
    const afterZ = Number(this.document.pushPlatePlane.z);
    if (Number.isFinite(dragState.beforeZ) && dragState.beforeZ !== afterZ) {
      Transaction.execute(
        this.document,
        "edit document push plate plane",
        () => {
          Transaction.add(
            this.document,
            new DocumentPushPlatePlaneHistoryRecord(
              this.document,
              dragState.beforeZ,
              afterZ
            )
          );
        }
      );
    }
    const hit = findPushPlatePlaneHandleHit(this.document, view, event);
    this._hoveredHandleIndex = hit?.index;
    setPushPlatePlaneActiveHandle(this.document, hit?.index);
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  pointerOut(view: IView, event: PointerEvent): void {
    if (this._disposed) return;
    if (event.defaultPrevented) return;
    if (this.isCapturedPointer(event)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (!this._dragState) {
      this._hoveredHandleIndex = undefined;
      setPushPlatePlaneActiveHandle(this.document, undefined);
      this.delegate?.pointerOut?.(view, event);
    }
  }

  dblClick(view: IView, event: MouseEvent): void {
    if (event.defaultPrevented) return;
    if (view.detectVisual(event.offsetX, event.offsetY).length > 0) {
      this.delegate?.dblClick?.(view, event);
      return;
    }
    if (
      event.button === 0 &&
      this.document.selection.getSelectedNodes().length === 0 &&
      !findPushPlatePlaneHandleHit(this.document, view, event) &&
      isInsidePushPlatePlaneHelper(this.document, view, event)
    ) {
      const session = new PushPlatePlaneEditSession(this.document);
      const controller = new AsyncController();
      const unmount = mountFormKit(
        session.createFormKitRegistration(controller)
      );
      controller.onCompleted(() => {
        try {
          session.confirm();
        } finally {
          unmount();
          controller.dispose();
          session.dispose();
        }
      });
      controller.onCancelled(() => {
        try {
          session.cancel();
        } finally {
          unmount();
          controller.dispose();
          session.dispose();
        }
      });
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    this.delegate?.dblClick?.(view, event);
  }

  mouseWheel(view: IView, event: WheelEvent): void {
    this.delegate?.mouseWheel?.(view, event);
  }

  keyDown(view: IView, event: KeyboardEvent): void {
    this.delegate?.keyDown?.(view, event);
  }

  private applyDrag(view: IView, event: PointerEvent): void {
    const dragState = this._dragState;
    if (!dragState) return;
    const current =
      rayToAxisParam(
        view,
        event.offsetX,
        event.offsetY,
        dragState.startAnchor,
        PUSH_PLATE_HANDLE_DRAG_AXIS
      ) ?? dragState.startParam;
    const nextZ = dragState.startZ + current - dragState.startParam;
    setDocumentPushPlatePlane(this.document, nextZ, {
      syncRunners: true
    });
  }

  private isCapturedPointer(event: PointerEvent): boolean {
    return this._capturedPointerId === event.pointerId;
  }
}

export function refreshDocumentPushPlatePlaneHelper(document: IDocument) {
  if (!document.visual) return;
  normalizePushPlatePlane(document);

  const state = helperStates.get(document) ?? {};
  if (
    !document.pushPlatePlane.helperVisible ||
    !Number.isFinite(document.pushPlatePlane.z)
  ) {
    if (state.fillId !== undefined) {
      document.visual.context.removeMesh(state.fillId);
    }
    if (state.borderId !== undefined) {
      document.visual.context.removeMesh(state.borderId);
    }
    if (state.handleId !== undefined) {
      document.visual.context.removeMesh(state.handleId);
    }
    if (state.handleViewUpdater) {
      (document.visual as any)?.unregisterViewUpdater?.(
        state.handleViewUpdater
      );
    }
    helperStates.delete(document);
    return;
  }

  const fill = createPushPlatePlaneFillObject(document);
  if (state.fillId !== undefined) {
    document.visual.context.removeMesh(state.fillId);
  }
  state.fillId = document.visual.context.displayObject(fill);

  const border = createPushPlatePlaneBorderObject(document);
  if (state.borderId !== undefined) {
    document.visual.context.removeMesh(state.borderId);
  }
  state.borderId = document.visual.context.displayObject(border);

  if (state.handleId !== undefined) {
    document.visual.context.removeMesh(state.handleId);
  }
  const view = document.application.activeView;
  const handles = createPushPlatePlaneHeightHandleRoot(
    document,
    view,
    state.activeHandleIndex
  );
  state.handleRoot = handles.root;
  state.handleSlots = handles.slots;
  state.handleId = document.visual.context.displayObject(handles.root);
  if (!state.handleViewUpdater) {
    state.handleViewUpdater = nextView => {
      refreshPushPlatePlaneHandleScale(document, state, nextView);
    };
    (document.visual as any)?.registerViewUpdater?.(state.handleViewUpdater);
  }
  helperStates.set(document, state);
}

export function previewDocumentPushPlatePlane(document: IDocument, z: number) {
  const beforeZ = Number(document.pushPlatePlane.z);
  document.pushPlatePlane.z = Number.isFinite(z) ? Number(z) : Number.NaN;
  refreshDocumentPushPlatePlaneHelper(document);
  document.visual?.update();
  emitDocumentPushPlatePlaneChanged(
    document,
    document.pushPlatePlane.z,
    beforeZ
  );
}

export function ensureDocumentPushPlatePlane(
  document: IDocument,
  options?: { refreshVisual?: boolean }
) {
  const beforeZ = Number(document.pushPlatePlane.z);
  if (
    !Number.isFinite(document.pushPlatePlane.z) &&
    canResolveDocumentPushPlatePlane(document)
  ) {
    const nextZ = resolveDefaultRunnerZ(document);
    document.pushPlatePlane.z = nextZ;
  }

  refreshDocumentPushPlatePlaneHelper(document);
  if (options?.refreshVisual !== false) {
    document.visual?.update();
  }
  emitDocumentPushPlatePlaneChanged(
    document,
    document.pushPlatePlane.z,
    beforeZ
  );
}

export function disposeDocumentPushPlatePlaneHelper(document: IDocument) {
  const state = helperStates.get(document);
  if (!state || !document.visual) return;
  if (state.fillId !== undefined) {
    document.visual.context.removeMesh(state.fillId);
  }
  if (state.borderId !== undefined) {
    document.visual.context.removeMesh(state.borderId);
  }
  if (state.handleId !== undefined) {
    document.visual.context.removeMesh(state.handleId);
  }
  if (state.handleViewUpdater) {
    (document.visual as any)?.unregisterViewUpdater?.(state.handleViewUpdater);
  }
  helperStates.delete(document);
}

export function setDocumentPushPlatePlane(
  document: IDocument,
  z: number,
  options?: { syncRunners?: boolean; refreshVisual?: boolean }
) {
  const beforeZ = Number(document.pushPlatePlane.z);
  document.pushPlatePlane.z = Number.isFinite(z) ? z : 0;

  if (options?.syncRunners) {
    document.modelManager.findNodes().forEach(node => {
      if (node instanceof HorizontalRunnerNode) {
        const params = node.exportParams();
        if (params.pushPlatePlaneZ !== document.pushPlatePlane.z) {
          node.applyParams(
            {
              ...params,
              pushPlatePlaneZ: document.pushPlatePlane.z
            },
            {
              recordHistory: false,
              rebuild: true
            }
          );
        }
        return;
      }

      if (node instanceof VerticalRunnerNode) {
        const params = node.exportParams();
        if (params.pushPlatePlaneZ !== document.pushPlatePlane.z) {
          node.applyParams(
            {
              ...params,
              pushPlatePlaneZ: document.pushPlatePlane.z
            },
            {
              recordHistory: false,
              rebuild: true
            }
          );
        }
        return;
      }

      if (node instanceof PointVerticalRunnerNode) {
        const params = node.exportParams();
        if (params.pushPlatePlaneZ !== document.pushPlatePlane.z) {
          node.applyParams(
            {
              ...params,
              pushPlatePlaneZ: document.pushPlatePlane.z
            },
            {
              recordHistory: false,
              rebuild: true
            }
          );
        }
      }
    });
  }

  refreshDocumentPushPlatePlaneHelper(document);
  if (options?.refreshVisual !== false) {
    document.visual?.update();
  }
  emitDocumentPushPlatePlaneChanged(
    document,
    document.pushPlatePlane.z,
    beforeZ
  );
}

export class DocumentPushPlatePlaneHistoryRecord implements IHistoryRecord {
  readonly name = "edit document push plate plane";

  constructor(
    private readonly document: IDocument,
    private readonly beforeZ: number,
    private readonly afterZ: number
  ) {}

  dispose(): void {}

  undo(): void {
    setDocumentPushPlatePlane(this.document, this.beforeZ, {
      syncRunners: true
    });
  }

  redo(): void {
    setDocumentPushPlatePlane(this.document, this.afterZ, {
      syncRunners: true
    });
  }
}
