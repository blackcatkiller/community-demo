// @ts-nocheck
import {
  type AsyncController,
  type IEventHandler,
  type IDocument,
  type IView,
  Matrix4,
  MeshDataUtils,
  type EdgeMeshData,
  type FaceMeshData,
  type ShapeMeshData,
  type VisualShapeData,
  type VertexMeshData,
  XYZ,
  Plane,
  type LineType
} from "@modelai/core";
import { screenDistance } from "@modelai/selection/snap/utils";
import { AmbientLight, Group, type Object3D } from "three";
import { ThreeGeometryFactory } from "../../../viewer/geometryFactory";
import type { ThreeView } from "../../../viewer/view";
import { applyForegroundOverlay } from "@modelai/geometry/foregroundOverlay";
import { applyOcclusionOverlay } from "@/features/modelai/geometry/occlusionOverlay";

export type AxisHandle = "axisX" | "axisY" | "axisZ";
export type ArcHandle = "arcXY" | "arcYZ" | "arcXZ";
export type OriginHandle = "origin";
export type GizmoHandleId = OriginHandle | AxisHandle | ArcHandle | string;
export type TransformGizmoPreviewMode = "final" | "interactive";
export type TransformGizmoAxis = "X" | "Y" | "Z";
export type TransformGizmoPlane = "XY" | "YZ" | "XZ";

export type TransformGizmoHandleConfig = {
  translate?:
    | false
    | {
        origin?: boolean;
        axes?: readonly TransformGizmoAxis[];
      };
  rotate?:
    | false
    | {
        planes?: readonly TransformGizmoPlane[];
      };
};

interface OriginDragState {
  type: "origin";
  viewPlaneNormal: XYZ;
  viewPlaneXvec: XYZ;
  startHit: XYZ;
  startOrigin: XYZ;
}

interface AxisDragState {
  type: "axis";
  axis: "X" | "Y" | "Z";
  axisDir: XYZ;
  startParam: number;
  startOrigin: XYZ;
}

interface ArcDragState {
  type: "arc";
  handle: ArcHandle;
  startAngle: number;
  startXvec: XYZ;
  startNormal: XYZ;
  currentRotDeg: number;
}

interface ExtraDragState {
  type: "extra";
  handleId: string;
  axisDir: XYZ;
  startParam: number;
  startBase: XYZ;
}

interface ExtraAngleDragState {
  type: "extra_angle";
  handleId: string;
  pivot: XYZ;
  planeNormal: XYZ;
  dir0: XYZ;
  dir90: XYZ;
  startAngleDeg: number;
}

type DragState =
  | OriginDragState
  | AxisDragState
  | ArcDragState
  | ExtraDragState
  | ExtraAngleDragState;

interface TransformGizmoProfileStats {
  label: string;
  handle: GizmoHandleId;
  startedAt: number;
  pointerMoves: number;
  refreshCount: number;
  handleRebuildCount: number;
  previewRebuildCount: number;
  applyDragMs: number;
  onChangeMs: number;
  refreshMs: number;
  handleRebuildMs: number;
  previewBuildMs: number;
  previewDisplayMs: number;
  dragLabelMs: number;
}

export interface GizmoExtraHandle {
  id: string;
  getBasePosition(): XYZ;
  getDragAxis(): XYZ;
  color: number;
  onDragStart?(startBase: XYZ): void;
  onDrag(delta: number): void;
  onClick?(
    showInput: (placeholder: string, onCommit: (v: number) => void) => void
  ): void;
  getDragLabel?(delta: number): string;
  getAngleDragConfig?():
    | {
        pivot: XYZ;
        planeNormal: XYZ;
        referenceDir: XYZ;
        minDegrees?: number;
        maxDegrees?: number;
      }
    | undefined;
}

export interface TransformGizmoConfig {
  showBaseHandles?: boolean;
  handles?: TransformGizmoHandleConfig;
  onAxisDragStart?: (
    axis: "X" | "Y" | "Z",
    axisDir: XYZ,
    curOrigin: XYZ
  ) => void;
  onAxisDrag?: (
    axis: "X" | "Y" | "Z",
    axisDir: XYZ,
    delta: number
  ) => XYZ | void;
  onAxisClick?: (
    axis: "X" | "Y" | "Z",
    showInput: (placeholder: string, onCommit: (v: number) => void) => void
  ) => void;
  getAxisDragLabel?: (axis: "X" | "Y" | "Z", delta: number) => string;
  onArcClick?: (
    arc: "XY" | "YZ" | "XZ",
    showInput: (placeholder: string, onCommit: (v: number) => void) => void
  ) => void;
  onOriginDrag?: (newOrigin: XYZ, plane: Plane) => XYZ | void;
  onChange: (origin: XYZ, plane: Plane) => void;
  buildPreviewMeshes?: (
    origin: XYZ,
    plane: Plane,
    mode: TransformGizmoPreviewMode
  ) => ShapeMeshData[];
  snapFilter?: (shape: VisualShapeData) => boolean;
  onDragActiveChange?: (active: boolean, handle: GizmoHandleId) => void;
  debugLabel?: string;
  /**
   * Opacity for preview meshes rendered by `buildPreviewMeshes`.
   * Default keeps legacy behavior (0.5). Set to 1 for fully opaque previews.
   */
  previewOpacity?: number;
  extraHandles?: readonly GizmoExtraHandle[];
}

const ORIGIN_COLOR = 0xaaaaaa;
const X_COLOR = 0xff4444;
const Y_COLOR = 0x44cc44;
const Z_COLOR = 0x4488ff;
const XY_ARC_COLOR = 0xdddd00;
const YZ_ARC_COLOR = 0x00dddd;
const XZ_ARC_COLOR = 0xdd44dd;
const HOVER_COLOR = 0xffffff;
const ANGLE_HANDLE_COLOR = 0xf3eadb;
const TARGET_PIXELS = 80;
const AXIS_TIP_SIZE = 8;
const ARC_MID_SIZE = 6;
const ORIGIN_SIZE = 10;
const SNAP_PIXELS = 20;
const ARC_SEGMENTS = 24;
const ANGLE_RING_SEGMENTS = 48;
const ANGLE_DOT_SEGMENTS = 96;
const ANGLE_HANDLE_RADIUS_SCALE = 1.7;
const ARC_CHECK_SAMPLES = 9;
const CLICK_TOLERANCE_PX = 4;
const TransformGizmoProfileKey = "__MODELAI_GIZMO_PROFILE__";

function nowMs(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

function isTransformGizmoProfilingEnabled(): boolean {
  const value = (globalThis as Record<string, unknown>)[
    TransformGizmoProfileKey
  ];
  if (value === true || value === "1") return true;

  try {
    return globalThis.localStorage?.getItem(TransformGizmoProfileKey) === "1";
  } catch {
    return false;
  }
}

function buildArcMesh(
  center: XYZ,
  dir1: XYZ,
  dir2: XYZ,
  radius: number,
  color: number
): EdgeMeshData {
  const positions: number[] = [];
  for (let i = 0; i < ARC_SEGMENTS; i++) {
    const a0 = (i / ARC_SEGMENTS) * (Math.PI / 2);
    const a1 = ((i + 1) / ARC_SEGMENTS) * (Math.PI / 2);
    const p0 = center
      .add(dir1.multiply(Math.cos(a0) * radius))
      .add(dir2.multiply(Math.sin(a0) * radius));
    const p1 = center
      .add(dir1.multiply(Math.cos(a1) * radius))
      .add(dir2.multiply(Math.sin(a1) * radius));
    positions.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
  }
  return {
    position: new Float32Array(positions),
    color,
    lineType: "solid",
    range: []
  };
}

function buildCircleMesh(
  center: XYZ,
  dir0: XYZ,
  dir90: XYZ,
  radius: number,
  color: number,
  lineType: LineType = "solid"
): EdgeMeshData {
  const positions: number[] = [];
  for (let i = 0; i < ANGLE_RING_SEGMENTS; i++) {
    const a0 = (i / ANGLE_RING_SEGMENTS) * Math.PI * 2;
    const a1 = ((i + 1) / ANGLE_RING_SEGMENTS) * Math.PI * 2;
    const p0 = center
      .add(dir0.multiply(Math.cos(a0) * radius))
      .add(dir90.multiply(Math.sin(a0) * radius));
    const p1 = center
      .add(dir0.multiply(Math.cos(a1) * radius))
      .add(dir90.multiply(Math.sin(a1) * radius));
    positions.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
  }
  return {
    position: new Float32Array(positions),
    color,
    lineType,
    range: []
  };
}

function buildAngleSweepMesh(
  center: XYZ,
  dir0: XYZ,
  dir90: XYZ,
  radius: number,
  color: number,
  startDegrees: number,
  endDegrees: number,
  lineType: LineType = "solid"
): EdgeMeshData {
  const start = (startDegrees * Math.PI) / 180;
  const end = (endDegrees * Math.PI) / 180;
  const sweep = end - start;
  const segmentCount = Math.max(
    1,
    Math.ceil((Math.abs(sweep) / (Math.PI * 2)) * ANGLE_RING_SEGMENTS)
  );
  const positions: number[] = [];

  for (let i = 0; i < segmentCount; i++) {
    const t0 = i / segmentCount;
    const t1 = (i + 1) / segmentCount;
    const a0 = start + sweep * t0;
    const a1 = start + sweep * t1;
    const p0 = center
      .add(dir0.multiply(Math.cos(a0) * radius))
      .add(dir90.multiply(Math.sin(a0) * radius));
    const p1 = center
      .add(dir0.multiply(Math.cos(a1) * radius))
      .add(dir90.multiply(Math.sin(a1) * radius));
    positions.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
  }

  return {
    position: new Float32Array(positions),
    color,
    lineType,
    range: []
  };
}

function buildAngleDotsMesh(
  center: XYZ,
  dir0: XYZ,
  dir90: XYZ,
  radius: number,
  color: number,
  startDegrees: number,
  endDegrees: number,
  size: number
): VertexMeshData {
  const start = (startDegrees * Math.PI) / 180;
  const end = (endDegrees * Math.PI) / 180;
  const sweep = end - start;
  const dotCount = Math.max(
    2,
    Math.ceil((Math.abs(sweep) / (Math.PI * 2)) * ANGLE_DOT_SEGMENTS)
  );
  const positions: number[] = [];

  for (let i = 0; i <= dotCount; i++) {
    const t = i / dotCount;
    const angle = start + sweep * t;
    const point = center
      .add(dir0.multiply(Math.cos(angle) * radius))
      .add(dir90.multiply(Math.sin(angle) * radius));
    positions.push(point.x, point.y, point.z);
  }

  return {
    position: new Float32Array(positions),
    color,
    size,
    range: []
  };
}

function arcPoint(
  center: XYZ,
  dir1: XYZ,
  dir2: XYZ,
  radius: number,
  t: number
): XYZ {
  const angle = t * (Math.PI / 2);
  return center
    .add(dir1.multiply(Math.cos(angle) * radius))
    .add(dir2.multiply(Math.sin(angle) * radius));
}

function rayPlaneIntersect(
  rayPt: XYZ,
  rayDir: XYZ,
  planeOrigin: XYZ,
  planeNormal: XYZ
): XYZ | null {
  const denom = rayDir.dot(planeNormal);
  if (Math.abs(denom) < 1e-8) return null;
  const t = planeOrigin.sub(rayPt).dot(planeNormal) / denom;
  if (t < 0) return null;
  return rayPt.add(rayDir.multiply(t));
}

function rayToAxisParam(
  view: IView,
  screenX: number,
  screenY: number,
  anchor: XYZ,
  axisDir: XYZ
): number | null {
  const ray = view.rayAt(screenX, screenY);
  const w = ray.origin.sub(anchor);
  const b = ray.direction.dot(axisDir);
  const d = w.dot(ray.direction);
  const e = w.dot(axisDir);
  const denom = 1 - b * b;
  if (Math.abs(denom) < 1e-6) return null;
  return (e - b * d) / denom;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function screenDistanceBetween(view: IView, a: XYZ, b: XYZ): number {
  const sa = view.worldToScreen(a);
  const sb = view.worldToScreen(b);
  const dx = sa.x - sb.x;
  const dy = sa.y - sb.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function pickConePerp(dir: XYZ, plane: Plane): XYZ {
  const x = plane.xvec.normalize();
  const y = plane.yvec.normalize();
  const n = plane.normal.normalize();
  if (Math.abs(dir.dot(x)) < 0.9) return x;
  if (Math.abs(dir.dot(y)) < 0.9) return y;
  return n;
}

function buildConeMesh(
  tip: XYZ,
  dir: XYZ,
  plane: Plane,
  length: number,
  radius: number
): FaceMeshData {
  const back = tip.sub(dir.multiply(length));
  const perp = pickConePerp(dir, plane);
  let side = dir.cross(perp).normalize();
  if (side.lengthSq() < 1e-8) {
    side = dir.cross(new XYZ(0, 1, 0)).normalize();
    if (side.lengthSq() < 1e-8) side = dir.cross(new XYZ(1, 0, 0)).normalize();
  }
  const up = side.cross(dir).normalize();

  const segments = 16;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const pushTri = (a: XYZ, b: XYZ, c: XYZ) => {
    const ab = b.sub(a);
    const ac = c.sub(a);
    const n = ab.cross(ac).normalize();
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    normals.push(n.x, n.y, n.z, n.x, n.y, n.z, n.x, n.y, n.z);
    uvs.push(0, 0, 1, 0, 0, 1);
  };

  const ring: XYZ[] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const p = back
      .add(side.multiply(Math.cos(a) * radius))
      .add(up.multiply(Math.sin(a) * radius));
    ring.push(p);
  }

  for (let i = 0; i < segments; i++) {
    const p0 = ring[i];
    const p1 = ring[(i + 1) % segments];
    pushTri(tip, p0, p1);
  }

  const center = back;
  for (let i = 1; i < segments - 1; i++) {
    pushTri(center, ring[i + 1], ring[i]);
  }

  const count = positions.length / 3;
  const index = new Uint32Array(count);
  for (let i = 0; i < count; i++) index[i] = i;

  return {
    position: new Float32Array(positions),
    range: [],
    normal: new Float32Array(normals),
    uv: new Float32Array(uvs),
    index,
    groups: [{ start: 0, count }]
  };
}

function getViewDom(view: IView): HTMLElement | undefined {
  return (view as any)?._dom ?? (view as any)?.dom;
}

function cloneXYZ(value: XYZ): XYZ {
  return new XYZ(value.x, value.y, value.z);
}

function clonePlane(plane: Plane): Plane {
  return new Plane(
    cloneXYZ(plane.origin),
    cloneXYZ(plane.normal),
    cloneXYZ(plane.xvec)
  );
}

function planeMatrix(plane: Plane): Matrix4 {
  const { origin, xvec, normal } = plane;
  const yvec = plane.yvec;
  return Matrix4.fromArray([
    xvec.x,
    xvec.y,
    xvec.z,
    0,
    yvec.x,
    yvec.y,
    yvec.z,
    0,
    normal.x,
    normal.y,
    normal.z,
    0,
    origin.x,
    origin.y,
    origin.z,
    1
  ]);
}

function planeTransform(from: Plane, to: Plane): Matrix4 | undefined {
  const inverse = planeMatrix(from).invert();
  if (!inverse) return undefined;
  return planeMatrix(to).multiply(inverse);
}

export class TransformGizmo implements IEventHandler {
  isEnabled = true;
  private _disposed = false;
  private _origin: XYZ;
  private _plane: Plane;
  private _hoveredHandle: GizmoHandleId | null = null;
  private _dragHandle: GizmoHandleId | null = null;
  private _dragState: DragState | null = null;
  private _clickStart: { x: number; y: number } | null = null;
  private _isClick = false;
  private _handleObjects: Object3D[] = [];
  private _previewMeshIds: number[] = [];
  private _previewMeshBasePlane?: Plane;
  private _previewMeshMode?: TransformGizmoPreviewMode;
  private _lastView?: IView;
  private _overlayView?: ThreeView;
  private readonly _overlayRoot = new Group();
  private _overlayRootId?: number;
  private _detachForegroundOverlay?: () => void;
  private readonly _viewUpdater = (view: IView) => {
    if (this._disposed) return;
    this._lastView = view;
    this._attachOverlayToView(view);
    // Camera moved/zoomed: handles must rescale, but preview mesh geometry is unchanged.
    this._refreshView();
  };
  private _previewMeshDirty = true;
  private _inputEl: HTMLInputElement | null = null;
  private _dragLabelEl: HTMLDivElement | null = null;
  private _currentDragLabelText = "";
  private _dragProfile?: TransformGizmoProfileStats;

  constructor(
    private readonly document: IDocument,
    private readonly controller: AsyncController,
    origin: XYZ,
    plane: Plane,
    private readonly config: TransformGizmoConfig,
    view?: IView
  ) {
    this._origin = origin;
    this._plane = plane;
    this._lastView = view;
    this._overlayRoot.add(new AmbientLight(0xffffff, 4));
    this._overlayRootId = this.document.visual.context.displayObject(
      this._overlayRoot
    );
    this._attachOverlayToView(view);
    (this.document.visual as any)?.registerViewUpdater?.(this._viewUpdater);
    this.refreshPreview();
  }

  get origin() {
    return this._origin;
  }

  get plane() {
    return this._plane;
  }

  get lastView() {
    return this._lastView;
  }

  private _hasExplicitHandleConfig(): boolean {
    return this.config.handles !== undefined;
  }

  private _areLegacyBaseHandlesEnabled(): boolean {
    return this.config.showBaseHandles !== false;
  }

  private _isTranslateOriginEnabled(): boolean {
    if (!this._hasExplicitHandleConfig()) {
      return this._areLegacyBaseHandlesEnabled();
    }
    const translate = this.config.handles?.translate;
    return translate !== false && translate?.origin === true;
  }

  private _isTranslateAxisEnabled(axis: TransformGizmoAxis): boolean {
    if (!this._hasExplicitHandleConfig()) {
      return this._areLegacyBaseHandlesEnabled();
    }
    const translate = this.config.handles?.translate;
    return translate !== false && translate?.axes?.includes(axis) === true;
  }

  private _isRotatePlaneEnabled(plane: TransformGizmoPlane): boolean {
    if (!this._hasExplicitHandleConfig()) {
      return this._areLegacyBaseHandlesEnabled();
    }
    const rotate = this.config.handles?.rotate;
    return rotate !== false && rotate?.planes?.includes(plane) === true;
  }

  private _isHandleEnabled(handle: GizmoHandleId): boolean {
    switch (handle) {
      case "origin":
        return this._isTranslateOriginEnabled();
      case "axisX":
        return this._isTranslateAxisEnabled("X");
      case "axisY":
        return this._isTranslateAxisEnabled("Y");
      case "axisZ":
        return this._isTranslateAxisEnabled("Z");
      case "arcXY":
        return this._isRotatePlaneEnabled("XY");
      case "arcYZ":
        return this._isRotatePlaneEnabled("YZ");
      case "arcXZ":
        return this._isRotatePlaneEnabled("XZ");
      default:
        return true;
    }
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this._finishDragProfile("cancelled");
    (this.document.visual as any)?.unregisterViewUpdater?.(this._viewUpdater);
    this._detachOverlayFromView();
    this._clearHandleObjects();
    if (this._overlayRootId !== undefined) {
      this.document.visual.context.removeMesh(this._overlayRootId);
      this._overlayRootId = undefined;
    }
    this._clearPreviewMeshes();
    this._dismissInputOverlay();
    this._hideDragLabel();
  }

  /**
   * Mark the preview mesh as stale and trigger a full rebuild.
   * Call this whenever parameters or geometry-driving state changes.
   * Camera / hover-only changes should use the internal _refreshView().
   */
  refreshPreview(): void {
    if (this._disposed) return;
    this._previewMeshDirty = true;
    this._refreshView();
  }

  /** Rebuilds handles always (scale-dependent) and preview mesh only when dirty. */
  private _refreshView(): void {
    if (this._disposed) return;
    const refreshStartedAt = nowMs();
    this._clearHandleObjects();
    const handleRebuildStartedAt = nowMs();
    this._handleObjects = this._buildHandles();
    if (this._dragProfile) {
      this._dragProfile.handleRebuildCount += 1;
      this._dragProfile.handleRebuildMs += nowMs() - handleRebuildStartedAt;
    }
    this._attachOverlayToView(this._lastView);
    if (this._previewMeshDirty) {
      this._dragProfile && (this._dragProfile.previewRebuildCount += 1);
      this._clearPreviewMeshes();
      this._previewMeshIds = this._buildPreviewMeshes();
      this._previewMeshDirty = false;
    }
    if (this._dragProfile) {
      this._dragProfile.refreshCount += 1;
      this._dragProfile.refreshMs += nowMs() - refreshStartedAt;
    }
    this.document.visual.update();
  }

  private _clearMeshes(ids: number[]) {
    ids.forEach(id => this.document.visual.context.removeMesh(id));
    ids.length = 0;
  }

  private _clearPreviewMeshes() {
    this._clearMeshes(this._previewMeshIds);
    this._previewMeshBasePlane = undefined;
    this._previewMeshMode = undefined;
  }

  private _attachOverlayToView(view?: IView) {
    const nextView = this._asThreeView(view);
    this._overlayView = nextView;
    this._detachForegroundOverlay?.();
    this._detachForegroundOverlay = undefined;
    delete this._overlayRoot.userData.detachOcclusionOverlay;
    if (!this._overlayView) return;
    this._detachForegroundOverlay = applyForegroundOverlay(
      this._overlayView,
      this._overlayRoot
    );
    this._overlayRoot.userData.detachOcclusionOverlay =
      this._detachForegroundOverlay;
  }

  private _detachOverlayFromView() {
    this._detachForegroundOverlay?.();
    this._detachForegroundOverlay = undefined;
    delete this._overlayRoot.userData.detachOcclusionOverlay;
    this._overlayView = undefined;
  }

  private _asThreeView(view?: IView): ThreeView | undefined {
    if (
      view &&
      typeof (view as any).addAfterSceneRenderHook === "function" &&
      typeof (view as any).removeAfterSceneRenderHook === "function"
    ) {
      return view as ThreeView;
    }
    return undefined;
  }
  private _clearHandleObjects() {
    this._handleObjects.forEach(obj => {
      this._overlayRoot.remove(obj);
      this._disposeOverlayObject(obj);
    });
    this._handleObjects.length = 0;
  }

  private _disposeOverlayObject(obj: Object3D) {
    obj.traverse(child => {
      (child as any).geometry?.dispose?.();
    });
  }

  private _createOverlayGroup(
    meshes: ShapeMeshData[],
    objects: Object3D[],
    opacity?: number
  ) {
    const group = new Group();
    meshes.forEach(mesh => {
      const obj = this._createOverlayObject(mesh, opacity);
      if (obj) group.add(obj);
    });
    if (group.children.length === 0) return;
    this._overlayRoot.add(group);
    objects.push(group);
  }

  private _createOverlayObject(mesh: ShapeMeshData, opacity?: number) {
    if (MeshDataUtils.isVertexMesh(mesh)) {
      return ThreeGeometryFactory.createVertexGeometry(mesh);
    }
    if (MeshDataUtils.isEdgeMesh(mesh)) {
      return ThreeGeometryFactory.createEdgeGeometry(mesh);
    }
    if (MeshDataUtils.isFaceMesh(mesh)) {
      return ThreeGeometryFactory.createFaceGeometry(mesh, opacity);
    }
    return null;
  }

  private _buildPreviewMeshes(): number[] {
    if (!this.config.buildPreviewMeshes) return [];
    try {
      const previewBuildStartedAt = nowMs();
      const previewMode = this._getPreviewMode();
      const meshes = this.config.buildPreviewMeshes(
        this._origin,
        this._plane,
        previewMode
      );
      if (this._dragProfile) {
        this._dragProfile.previewBuildMs += nowMs() - previewBuildStartedAt;
      }
      if (!meshes || meshes.length === 0) return [];
      const opacity = this.config.previewOpacity ?? 0.5;
      const view =
        this._overlayView ??
        this._asThreeView(
          this._lastView ?? this.document.application.activeView
        );
      const regularMeshes: ShapeMeshData[] = [];
      const advancedOcclusionEdges: EdgeMeshData[] = [];

      meshes.forEach(mesh => {
        if (MeshDataUtils.isEdgeMesh(mesh) && mesh.advancedOcclusion && view) {
          advancedOcclusionEdges.push(mesh);
          return;
        }
        regularMeshes.push(mesh);
      });

      const displayStartedAt = nowMs();
      const ids: number[] = [];
      if (regularMeshes.length > 0) {
        ids.push(
          this.document.visual.context.displayMesh(regularMeshes, opacity)
        );
      }
      advancedOcclusionEdges.forEach(mesh => {
        const lineObj = ThreeGeometryFactory.createEdgeGeometry(mesh);
        lineObj.userData.detachOcclusionOverlay = applyOcclusionOverlay(
          view!,
          lineObj
        );
        ids.push(this.document.visual.context.displayObject(lineObj));
      });
      this._previewMeshBasePlane = clonePlane(this._plane);
      this._previewMeshMode = previewMode;
      if (this._dragProfile) {
        this._dragProfile.previewDisplayMs += nowMs() - displayStartedAt;
      }
      return ids;
    } catch {
      return [];
    }
  }

  private _getPreviewMode(): TransformGizmoPreviewMode {
    return this._dragHandle !== null &&
      this._dragState !== null &&
      !this._isClick
      ? "interactive"
      : "final";
  }

  private _tryTransformPreviewMesh(): boolean {
    if (this._previewMeshDirty) return false;
    if (this._previewMeshIds.length === 0) return false;
    if (this._previewMeshMode !== "interactive") return false;
    if (!this._previewMeshBasePlane) return false;

    const transform = planeTransform(this._previewMeshBasePlane, this._plane);
    if (!transform) return false;

    this._previewMeshIds.forEach(id => {
      this.document.visual.context.setTempMeshTransform(id, transform);
    });
    this._refreshView();
    return true;
  }

  private _buildHandles(): Object3D[] {
    const view = this._lastView ?? this.document.application.activeView;
    if (!view) return [];
    const {
      axisLen,
      arcRadius,
      angleHandleRadius,
      originSize,
      axisTipSize,
      arcMidSize
    } = this._scale(view);
    const arrowLength = (axisLen * axisTipSize) / TARGET_PIXELS;
    const arrowRadius = arrowLength * 0.5;
    const objects: Object3D[] = [];
    const { xvec, yvec, normal } = this._plane;
    const o = this._origin;

    const axis = (dir: XYZ, color: number, id: AxisHandle) => {
      const tip = o.add(dir.multiply(axisLen));
      const line = MeshDataUtils.createEdgeMesh(
        o,
        tip,
        this._color(id, color),
        "solid"
      );
      const arrow = buildConeMesh(
        tip,
        dir,
        this._plane,
        arrowLength,
        arrowRadius
      );
      arrow.color = this._color(id, color);
      this._createOverlayGroup([line, arrow], objects);
    };

    if (this._isTranslateAxisEnabled("X")) {
      axis(xvec, X_COLOR, "axisX");
    }
    if (this._isTranslateAxisEnabled("Y")) {
      axis(yvec, Y_COLOR, "axisY");
    }
    if (this._isTranslateAxisEnabled("Z")) {
      axis(normal, Z_COLOR, "axisZ");
    }

    if (this._isTranslateOriginEnabled()) {
      const originDot = MeshDataUtils.createVertexMesh(
        o,
        originSize,
        this._color("origin", ORIGIN_COLOR)
      );
      this._createOverlayGroup([originDot], objects);
    }

    const arc = (dir1: XYZ, dir2: XYZ, color: number, id: ArcHandle) => {
      const arcMesh = buildArcMesh(
        o,
        dir1,
        dir2,
        arcRadius,
        this._color(id, color)
      );
      const mid = arcPoint(o, dir1, dir2, arcRadius, 0.5);
      const midDot = MeshDataUtils.createVertexMesh(
        mid,
        arcMidSize,
        this._color(id, color)
      );
      this._createOverlayGroup([arcMesh, midDot], objects);
    };

    if (this._isRotatePlaneEnabled("XY")) {
      arc(xvec, yvec, XY_ARC_COLOR, "arcXY");
    }
    if (this._isRotatePlaneEnabled("YZ")) {
      arc(yvec, normal, YZ_ARC_COLOR, "arcYZ");
    }
    if (this._isRotatePlaneEnabled("XZ")) {
      arc(xvec, normal, XZ_ARC_COLOR, "arcXZ");
    }

    for (const h of this.config.extraHandles ?? []) {
      const angleVisual = this._getExtraAngleVisual(h, angleHandleRadius);
      if (angleVisual) {
        const color = this._color(h.id, ANGLE_HANDLE_COLOR);
        const ringMeshes =
          angleVisual.minDegrees !== undefined &&
          angleVisual.maxDegrees !== undefined
            ? [
                buildAngleSweepMesh(
                  angleVisual.pivot,
                  angleVisual.dir0,
                  angleVisual.dir90,
                  angleVisual.radius,
                  color,
                  angleVisual.minDegrees,
                  angleVisual.maxDegrees
                ),
                buildAngleDotsMesh(
                  angleVisual.pivot,
                  angleVisual.dir0,
                  angleVisual.dir90,
                  angleVisual.radius,
                  color,
                  angleVisual.maxDegrees,
                  angleVisual.minDegrees + 360,
                  Math.max(1.5, arcMidSize * 0.32)
                )
              ]
            : [
                buildCircleMesh(
                  angleVisual.pivot,
                  angleVisual.dir0,
                  angleVisual.dir90,
                  angleVisual.radius,
                  color
                )
              ];
        const radiusLine = MeshDataUtils.createEdgeMesh(
          angleVisual.pivot,
          angleVisual.marker,
          color,
          "solid"
        );
        const marker = MeshDataUtils.createVertexMesh(
          angleVisual.marker,
          arcMidSize,
          color
        );
        this._createOverlayGroup([...ringMeshes, radiusLine, marker], objects);
        continue;
      }

      const base = h.getBasePosition();
      const dir = h.getDragAxis();
      const tip = base.add(dir.multiply(axisLen));
      const line = MeshDataUtils.createEdgeMesh(
        base,
        tip,
        this._color(h.id, h.color),
        "solid"
      );
      const arrow = buildConeMesh(
        tip,
        dir,
        this._plane,
        arrowLength,
        arrowRadius
      );
      arrow.color = this._color(h.id, h.color);
      this._createOverlayGroup([line, arrow], objects);
    }

    return objects;
  }

  private _color(handle: GizmoHandleId, color: number) {
    return this._hoveredHandle === handle ? HOVER_COLOR : color;
  }

  private _getExtraAngleVisual(
    handle: GizmoExtraHandle,
    radius: number
  ):
    | {
        pivot: XYZ;
        marker: XYZ;
        radius: number;
        dir0: XYZ;
        dir90: XYZ;
        minDegrees?: number;
        maxDegrees?: number;
      }
    | undefined {
    const angleConfig = handle.getAngleDragConfig?.();
    if (!angleConfig) return undefined;

    const planeNormal = angleConfig.planeNormal.normalize();
    const dir0 = angleConfig.referenceDir.normalize();
    const dir90 = planeNormal.cross(dir0).normalize();
    const base = handle.getBasePosition();
    const projected = base.sub(
      planeNormal.multiply(base.sub(angleConfig.pivot).dot(planeNormal))
    );
    const radial = projected.sub(angleConfig.pivot);

    if (
      dir0.lengthSq() < 1e-8 ||
      dir90.lengthSq() < 1e-8 ||
      radial.lengthSq() < 1e-8 ||
      radius < 1e-8
    ) {
      return undefined;
    }

    const marker = angleConfig.pivot.add(radial.normalize().multiply(radius));

    return {
      pivot: angleConfig.pivot,
      marker,
      radius,
      dir0,
      dir90,
      minDegrees: angleConfig.minDegrees,
      maxDegrees: angleConfig.maxDegrees
    };
  }

  private _scale(view: IView) {
    const screenPt = view.worldToScreen(this._origin);
    const ray0 = view.rayAt(screenPt.x, screenPt.y);
    const ray1 = view.rayAt(screenPt.x + TARGET_PIXELS, screenPt.y);
    const t = Math.max(this._origin.sub(ray0.origin).dot(ray0.direction), 0.1);
    const w0 = ray0.origin.add(ray0.direction.multiply(t));
    const w1 = ray1.origin.add(ray1.direction.multiply(t));
    const axisLen = w0.sub(w1).length();
    const arcRadius = axisLen * 0.6;
    const angleHandleRadius = axisLen * ANGLE_HANDLE_RADIUS_SCALE;
    return {
      axisLen,
      arcRadius,
      angleHandleRadius,
      originSize: ORIGIN_SIZE,
      axisTipSize: AXIS_TIP_SIZE,
      arcMidSize: ARC_MID_SIZE
    };
  }

  private _findNearestHandle(
    view: IView,
    event: PointerEvent
  ): GizmoHandleId | null {
    const { axisLen, arcRadius, angleHandleRadius } = this._scale(view);
    const { xvec, yvec, normal } = this._plane;
    const o = this._origin;
    const mx = event.offsetX;
    const my = event.offsetY;

    const checkPoint = (handle: GizmoHandleId, pos: XYZ) => {
      const dist = screenDistance(view, mx, my, pos);
      if (dist <= SNAP_PIXELS) return { handle, dist };
      return null;
    };

    const candidates: { handle: GizmoHandleId; dist: number }[] = [];

    if (this._isTranslateOriginEnabled()) {
      candidates.push({
        handle: "origin",
        dist: screenDistance(view, mx, my, o)
      });
    }
    if (this._isTranslateAxisEnabled("X")) {
      candidates.push({
        handle: "axisX",
        dist: screenDistance(view, mx, my, o.add(xvec.multiply(axisLen)))
      });
    }
    if (this._isTranslateAxisEnabled("Y")) {
      candidates.push({
        handle: "axisY",
        dist: screenDistance(view, mx, my, o.add(yvec.multiply(axisLen)))
      });
    }
    if (this._isTranslateAxisEnabled("Z")) {
      candidates.push({
        handle: "axisZ",
        dist: screenDistance(view, mx, my, o.add(normal.multiply(axisLen)))
      });
    }
    const addArcSamples = (handle: ArcHandle, dir1: XYZ, dir2: XYZ) => {
      let best = Infinity;
      for (let i = 0; i < ARC_CHECK_SAMPLES; i++) {
        const t = i / (ARC_CHECK_SAMPLES - 1);
        const p = arcPoint(o, dir1, dir2, arcRadius, t);
        const d = screenDistance(view, mx, my, p);
        if (d < best) best = d;
      }
      candidates.push({ handle, dist: best });
    };
    if (this._isRotatePlaneEnabled("XY")) {
      addArcSamples("arcXY", xvec, yvec);
    }
    if (this._isRotatePlaneEnabled("YZ")) {
      addArcSamples("arcYZ", yvec, normal);
    }
    if (this._isRotatePlaneEnabled("XZ")) {
      addArcSamples("arcXZ", xvec, normal);
    }

    for (const h of this.config.extraHandles ?? []) {
      const angleVisual = this._getExtraAngleVisual(h, angleHandleRadius);
      const target = angleVisual
        ? angleVisual.marker
        : h.getBasePosition().add(h.getDragAxis().multiply(axisLen));
      const cand = checkPoint(h.id, target);
      if (cand) candidates.push(cand);
    }

    const best = candidates
      .filter(c => c.dist <= SNAP_PIXELS)
      .sort((a, b) => a.dist - b.dist)[0];
    return best?.handle ?? null;
  }

  private _buildOriginDragState(
    view: IView,
    event: PointerEvent
  ): OriginDragState {
    const ray = view.rayAt(event.offsetX, event.offsetY);
    const viewNormal = view.direction().reverse();
    const viewPlaneXvec = view.direction().cross(view.up()).normalize();
    const hit =
      rayPlaneIntersect(ray.origin, ray.direction, this._origin, viewNormal) ??
      this._origin;
    return {
      type: "origin",
      viewPlaneNormal: viewNormal,
      viewPlaneXvec:
        viewPlaneXvec.lengthSq() > 1e-12 ? viewPlaneXvec : this._plane.xvec,
      startHit: hit,
      startOrigin: this._origin
    };
  }

  private _buildAxisDragState(
    view: IView,
    event: PointerEvent,
    axis: "X" | "Y" | "Z"
  ): AxisDragState {
    const axisDir =
      axis === "X"
        ? this._plane.xvec
        : axis === "Y"
          ? this._plane.yvec
          : this._plane.normal;

    // Let the embedding logic snapshot the current origin/params at the start of a drag.
    // Without this, some steps (e.g. GateStepBase) will keep using the initial placed point
    // as the drag baseline, which looks like the origin "snaps back" to the placed point.
    this.config.onAxisDragStart?.(axis, axisDir, this._origin);

    const startParam =
      rayToAxisParam(
        view,
        event.offsetX,
        event.offsetY,
        this._origin,
        axisDir
      ) ?? 0;
    return {
      type: "axis",
      axis,
      axisDir,
      startParam,
      startOrigin: this._origin
    };
  }

  private _buildArcDragState(
    view: IView,
    event: PointerEvent,
    handle: ArcHandle
  ): ArcDragState | null {
    const { xvec, yvec, normal } = this._plane;
    const [planeNormal, dir1, dir2] = this._arcBasis(
      handle,
      xvec,
      yvec,
      normal
    );
    const ray = view.rayAt(event.offsetX, event.offsetY);
    const hit = rayPlaneIntersect(
      ray.origin,
      ray.direction,
      this._origin,
      planeNormal
    );
    if (!hit) return null;
    const vec = hit.sub(this._origin);
    const startAngle = Math.atan2(vec.dot(dir2), vec.dot(dir1));
    return {
      type: "arc",
      handle,
      startAngle,
      startXvec: xvec,
      startNormal: normal,
      currentRotDeg: 0
    };
  }

  private _buildExtraDragState(
    view: IView,
    event: PointerEvent,
    handle: GizmoExtraHandle
  ): DragState | null {
    const angleConfig = handle.getAngleDragConfig?.();
    if (angleConfig) {
      const planeNormal = angleConfig.planeNormal.normalize();
      const dir0 = angleConfig.referenceDir.normalize();
      const dir90 = planeNormal.cross(dir0).normalize();
      const ray = view.rayAt(event.offsetX, event.offsetY);
      const hit = rayPlaneIntersect(
        ray.origin,
        ray.direction,
        angleConfig.pivot,
        planeNormal
      );
      if (!hit) return null;
      const vec = hit.sub(angleConfig.pivot);
      const startAngleDeg =
        (Math.atan2(vec.dot(dir90), vec.dot(dir0)) * 180) / Math.PI;
      return {
        type: "extra_angle",
        handleId: handle.id,
        pivot: angleConfig.pivot,
        planeNormal,
        dir0,
        dir90,
        startAngleDeg
      };
    }

    const axisDir = handle.getDragAxis();
    const base = handle.getBasePosition();
    const startParam =
      rayToAxisParam(view, event.offsetX, event.offsetY, base, axisDir) ?? 0;
    handle.onDragStart?.(base);
    return {
      type: "extra",
      handleId: handle.id,
      axisDir,
      startParam,
      startBase: base
    };
  }

  private _applyOriginDrag(view: IView, event: PointerEvent): void {
    const state = this._dragState as OriginDragState;
    const ray = view.rayAt(event.offsetX, event.offsetY);
    const hit = rayPlaneIntersect(
      ray.origin,
      ray.direction,
      state.startOrigin,
      state.viewPlaneNormal
    );
    if (!hit) return;
    const newOrigin = state.startOrigin.add(hit.sub(state.startHit));
    this._origin = newOrigin;
    this._plane = this._plane.translateTo(newOrigin);
    this._currentDragLabelText = "";
    const constrainedOrigin = this.config.onOriginDrag?.(
      newOrigin,
      this._plane
    );
    if (constrainedOrigin) {
      this._origin = constrainedOrigin;
      this._plane = this._plane.translateTo(constrainedOrigin);
    }
    this._emitChange();
  }

  private _applyAxisDrag(view: IView, event: PointerEvent): void {
    const state = this._dragState as AxisDragState;
    const currentParam =
      rayToAxisParam(
        view,
        event.offsetX,
        event.offsetY,
        state.startOrigin,
        state.axisDir
      ) ?? state.startParam;
    const delta = currentParam - state.startParam;

    this._currentDragLabelText = this.config.getAxisDragLabel
      ? this.config.getAxisDragLabel(state.axis, delta)
      : `${delta >= 0 ? "+" : ""}${delta.toFixed(2)}`;

    const newOrigin = this.config.onAxisDrag?.(
      state.axis,
      state.axisDir,
      delta
    );
    if (newOrigin) {
      this._origin = newOrigin;
      this._plane = this._plane.translateTo(newOrigin);
    }
    this._emitChange();
  }

  private _applyArcDrag(view: IView, event: PointerEvent): void {
    const state = this._dragState as ArcDragState;
    const { startXvec, startNormal } = state;
    const startYvec = startNormal.cross(startXvec).normalize();
    const [planeNormal, dir1, dir2] = this._arcBasis(
      state.handle,
      startXvec,
      startYvec,
      startNormal
    );

    const ray = view.rayAt(event.offsetX, event.offsetY);
    const hit = rayPlaneIntersect(
      ray.origin,
      ray.direction,
      this._origin,
      planeNormal
    );
    if (!hit) return;

    const vec = hit.sub(this._origin);
    const currentAngle = Math.atan2(vec.dot(dir2), vec.dot(dir1));
    const delta = currentAngle - state.startAngle;

    state.currentRotDeg =
      state.handle === "arcXZ"
        ? (-delta * 180) / Math.PI
        : (delta * 180) / Math.PI;
    this._currentDragLabelText = `${state.currentRotDeg.toFixed(1)}deg`;

    try {
      switch (state.handle) {
        case "arcXY": {
          const nx = startXvec.rotate(startNormal, delta);
          if (nx) this._plane = new Plane(this._origin, startNormal, nx);
          break;
        }
        case "arcYZ": {
          const nn = startNormal.rotate(startXvec, delta);
          if (nn) this._plane = new Plane(this._origin, nn, startXvec);
          break;
        }
        case "arcXZ": {
          const nx = startXvec.rotate(startYvec, -delta);
          const nn = startNormal.rotate(startYvec, -delta);
          if (nx && nn) this._plane = new Plane(this._origin, nn, nx);
          break;
        }
      }
    } catch {
      /* ignore */
    }

    this._emitChange();
  }

  private _applyExtraDrag(view: IView, event: PointerEvent): void {
    const state = this._dragState as ExtraDragState;
    const currentParam =
      rayToAxisParam(
        view,
        event.offsetX,
        event.offsetY,
        state.startBase,
        state.axisDir
      ) ?? state.startParam;
    const delta = currentParam - state.startParam;

    const h = this.config.extraHandles?.find(e => e.id === state.handleId);
    if (h) {
      h.onDrag(delta);
      this._currentDragLabelText = h.getDragLabel
        ? h.getDragLabel(delta)
        : delta.toFixed(2);
    }
    this._emitChange();
  }

  private _applyExtraAngleDrag(view: IView, event: PointerEvent): void {
    const state = this._dragState as ExtraAngleDragState;
    const ray = view.rayAt(event.offsetX, event.offsetY);
    const hit = rayPlaneIntersect(
      ray.origin,
      ray.direction,
      state.pivot,
      state.planeNormal
    );
    if (!hit) return;

    const vec = hit.sub(state.pivot);
    const currentAngleDeg =
      (Math.atan2(vec.dot(state.dir90), vec.dot(state.dir0)) * 180) / Math.PI;
    const delta = currentAngleDeg - state.startAngleDeg;

    const h = this.config.extraHandles?.find(e => e.id === state.handleId);
    if (h) {
      h.onDrag(delta);
      this._currentDragLabelText = h.getDragLabel
        ? h.getDragLabel(delta)
        : `${delta.toFixed(1)}deg`;
    }
    this._emitChange();
  }

  private _arcBasis(
    handle: ArcHandle,
    xvec: XYZ,
    yvec: XYZ,
    normal: XYZ
  ): [XYZ, XYZ, XYZ] {
    switch (handle) {
      case "arcXY":
        return [normal, xvec, yvec];
      case "arcYZ":
        return [xvec, yvec, normal];
      case "arcXZ":
        return [yvec, xvec, normal];
    }
  }

  private _handleClick(view: IView, handle: GizmoHandleId): void {
    if (!this._isHandleEnabled(handle)) return;
    const { axisLen, arcRadius } = this._scale(view);

    if (handle === "axisX" || handle === "axisY" || handle === "axisZ") {
      if (!this.config.onAxisClick) return;
      const axis = handle.slice(-1) as "X" | "Y" | "Z";
      const tip = this._handleTipPosition(handle, axisLen, arcRadius);
      this.config.onAxisClick(axis, (placeholder, onCommit) => {
        this._showInputAt(view, tip, placeholder, v => {
          onCommit(v);
          this._emitChange();
          this.refreshPreview();
        });
      });
      return;
    }

    if (handle === "arcXY" || handle === "arcYZ" || handle === "arcXZ") {
      const arc = handle.slice(3) as "XY" | "YZ" | "XZ";
      const tip = this._handleTipPosition(handle, axisLen, arcRadius);
      const showInput = (
        placeholder: string,
        onCommit: (v: number) => void
      ) => {
        this._showInputAt(view, tip, placeholder, deg => {
          onCommit(deg);
          this._applyArcRotationDeg(handle, deg);
          this._emitChange();
          this.refreshPreview();
        });
      };

      if (this.config.onArcClick) {
        this.config.onArcClick(arc, showInput);
      } else {
        showInput("0", () => {});
      }
      return;
    }

    const h = this.config.extraHandles?.find(e => e.id === handle);
    if (h?.onClick) {
      const tip = this._handleTipPosition(handle, axisLen, arcRadius);
      h.onClick((placeholder, onCommit) => {
        this._showInputAt(view, tip, placeholder, v => {
          onCommit(v);
          this._emitChange();
          this.refreshPreview();
        });
      });
    }
  }

  private _applyArcRotationDeg(handle: ArcHandle, degrees: number): void {
    const radians = (degrees * Math.PI) / 180;
    const { xvec, yvec, normal } = this._plane;
    try {
      switch (handle) {
        case "arcXY": {
          const nx = xvec.rotate(normal, radians);
          if (nx) this._plane = new Plane(this._origin, normal, nx);
          break;
        }
        case "arcYZ": {
          const nn = normal.rotate(xvec, radians);
          if (nn) this._plane = new Plane(this._origin, nn, xvec);
          break;
        }
        case "arcXZ": {
          const nx = xvec.rotate(yvec, -radians);
          const nn = normal.rotate(yvec, -radians);
          if (nx && nn) this._plane = new Plane(this._origin, nn, nx);
          break;
        }
      }
    } catch {
      /* ignore */
    }
  }

  private _updateDragLabel(view: IView, handle: GizmoHandleId): void {
    this._hideDragLabel();
    if (!this._currentDragLabelText) return;
    const dom = getViewDom(view);
    if (!dom) return;

    const { axisLen, arcRadius } = this._scale(view);
    const pos = this._handleTipPosition(handle, axisLen, arcRadius);
    const screen = view.worldToScreen(pos);
    const rect = dom.getBoundingClientRect();

    const el = document.createElement("div");
    el.textContent = this._currentDragLabelText;
    Object.assign(el.style, {
      position: "fixed",
      left: `${rect.left + screen.x + 12}px`,
      top: `${rect.top + screen.y - 12}px`,
      padding: "2px 6px",
      background: "rgba(20,20,20,0.85)",
      color: "#fff",
      border: "1px solid #555",
      borderRadius: "4px",
      fontSize: "11px",
      fontFamily: "monospace",
      zIndex: "99998",
      pointerEvents: "none"
    });
    document.body.appendChild(el);
    this._dragLabelEl = el;
  }

  private _hideDragLabel(): void {
    this._dragLabelEl?.remove();
    this._dragLabelEl = null;
  }

  private _showInputAt(
    view: IView,
    worldPos: XYZ,
    placeholder: string,
    onCommit: (v: number) => void
  ): void {
    this._dismissInputOverlay();
    const dom = getViewDom(view);
    if (!dom) return;

    const sp = view.worldToScreen(worldPos);
    const rect = dom.getBoundingClientRect();
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = placeholder;
    Object.assign(input.style, {
      position: "fixed",
      left: `${rect.left + sp.x + 14}px`,
      top: `${rect.top + sp.y - 12}px`,
      width: "88px",
      background: "rgba(20,20,20,0.92)",
      color: "#fff",
      border: "1px solid #666",
      borderRadius: "4px",
      padding: "2px 6px",
      fontSize: "12px",
      fontFamily: "monospace",
      zIndex: "99999",
      outline: "none"
    });

    const commit = (() => {
      let done = false;
      return () => {
        if (done) return;
        done = true;
        const v = Number.parseFloat(input.value);
        if (!Number.isNaN(v)) onCommit(v);
        this._dismissInputOverlay();
      };
    })();

    input.addEventListener("keydown", e => {
      e.stopImmediatePropagation();
      if (e.key === "Enter") commit();
      else if (e.key === "Escape") this._dismissInputOverlay();
    });
    input.addEventListener("blur", () => commit());

    document.body.appendChild(input);
    this._inputEl = input;
    requestAnimationFrame(() => input.focus());
  }

  private _dismissInputOverlay(): void {
    if (this._inputEl) {
      const el = this._inputEl;
      this._inputEl = null;
      el.remove();
    }
  }

  private _handleTipPosition(
    handle: GizmoHandleId,
    axisLen: number,
    arcRadius: number
  ): XYZ {
    const { xvec, yvec, normal } = this._plane;
    const o = this._origin;
    switch (handle) {
      case "origin":
        return o;
      case "axisX":
        return o.add(xvec.multiply(axisLen));
      case "axisY":
        return o.add(yvec.multiply(axisLen));
      case "axisZ":
        return o.add(normal.multiply(axisLen));
      case "arcXY":
        return arcPoint(o, xvec, yvec, arcRadius, 0.5);
      case "arcYZ":
        return arcPoint(o, yvec, normal, arcRadius, 0.5);
      case "arcXZ":
        return arcPoint(o, xvec, normal, arcRadius, 0.5);
      default: {
        const h = this.config.extraHandles?.find(e => e.id === handle);
        if (h) {
          const angleHandleRadius = axisLen * ANGLE_HANDLE_RADIUS_SCALE;
          const angleVisual = this._getExtraAngleVisual(h, angleHandleRadius);
          if (angleVisual) return angleVisual.marker;
          return h.getBasePosition().add(h.getDragAxis().multiply(axisLen));
        }
        return o;
      }
    }
  }

  pointerMove(view: IView, event: PointerEvent): void {
    if (this._disposed) return;
    this._lastView = view;
    this._attachOverlayToView(view);

    if (this._dragHandle !== null && this._dragState !== null) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (this._isClick && this._clickStart !== null) {
        const dist = Math.hypot(
          event.offsetX - this._clickStart.x,
          event.offsetY - this._clickStart.y
        );
        if (dist > CLICK_TOLERANCE_PX) {
          this._isClick = false;
          this._clickStart = null;
        }
      }

      if (!this._isClick) {
        this._dragProfile && (this._dragProfile.pointerMoves += 1);
        const applyStartedAt = nowMs();
        let shouldRefreshPreviewLocally = true;
        switch (this._dragState.type) {
          case "origin":
            this._applyOriginDrag(view, event);
            break;
          case "axis":
            this._applyAxisDrag(view, event);
            break;
          case "arc":
            this._applyArcDrag(view, event);
            break;
          case "extra":
            this._applyExtraDrag(view, event);
            shouldRefreshPreviewLocally = false;
            break;
          case "extra_angle":
            this._applyExtraAngleDrag(view, event);
            shouldRefreshPreviewLocally = false;
            break;
        }
        if (this._dragProfile) {
          this._dragProfile.applyDragMs += nowMs() - applyStartedAt;
        }
        const dragLabelStartedAt = nowMs();
        this._updateDragLabel(view, this._dragHandle);
        if (this._dragProfile) {
          this._dragProfile.dragLabelMs += nowMs() - dragLabelStartedAt;
        }
        // Extra handles usually drive params through the outer session/update
        // loop, which already calls refreshPreview. Avoid rebuilding twice.
        if (shouldRefreshPreviewLocally) {
          const canReusePreviewTransform =
            this._dragState.type === "origin" ||
            this._dragState.type === "axis" ||
            this._dragState.type === "arc";
          if (canReusePreviewTransform) {
            if (!this._tryTransformPreviewMesh()) {
              this.refreshPreview();
            }
          } else {
            this.refreshPreview();
          }
        }
      }
    } else {
      const hovered = this._findNearestHandle(view, event);
      if (hovered !== this._hoveredHandle) {
        this._hoveredHandle = hovered;
        // Hover only changes handle colours 鈥?preview mesh is unaffected.
        this._refreshView();
      }
    }
  }

  pointerDown(view: IView, event: PointerEvent): void {
    if (this._disposed || event.button !== 0 || this._inputEl !== null) return;
    this._lastView = view;
    this._attachOverlayToView(view);

    const handle = this._findNearestHandle(view, event);
    if (handle === null) return;
    if (!this._isHandleEnabled(handle)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    this._dragHandle = handle;
    this._beginDragProfile(handle);
    this._clickStart = { x: event.offsetX, y: event.offsetY };
    this._isClick = true;
    this._currentDragLabelText = "";

    if (handle === "origin") {
      this._dragState = this._buildOriginDragState(view, event);
      this._refreshView();
    } else if (handle === "axisX" || handle === "axisY" || handle === "axisZ") {
      this._dragState = this._buildAxisDragState(
        view,
        event,
        handle.slice(-1) as "X" | "Y" | "Z"
      );
    } else if (handle === "arcXY" || handle === "arcYZ" || handle === "arcXZ") {
      this._dragState = this._buildArcDragState(view, event, handle) ?? null;
    } else {
      const h = this.config.extraHandles?.find(e => e.id === handle);
      if (h) this._dragState = this._buildExtraDragState(view, event, h);
    }
  }

  pointerUp(view: IView, event: PointerEvent): void {
    if (event.button !== 0) return;
    this._lastView = view;
    this._attachOverlayToView(view);
    const hadActiveHandle = this._dragHandle !== null;
    if (hadActiveHandle) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    const wasDragging =
      !this._isClick && this._dragHandle !== null && this._dragState !== null;
    if (this._isClick && this._dragHandle !== null) {
      this._handleClick(view, this._dragHandle);
    }
    this._hideDragLabel();
    this._currentDragLabelText = "";
    this._dragHandle = null;
    this._dragState = null;
    this._clickStart = null;
    this._isClick = false;
    this._finishDragProfile("completed");
    if (wasDragging) {
      this._previewMeshDirty = true;
      this._refreshView();
    }
  }

  pointerOut(view: IView, _event: PointerEvent): void {
    this._lastView = view;
    this._attachOverlayToView(view);
    this._hoveredHandle = null;
  }

  mouseWheel(view: IView, _event: WheelEvent): void {
    this._lastView = view;
    this._attachOverlayToView(view);
    // Zoom changes handle scale only 鈥?preview mesh geometry is unchanged.
    this._refreshView();
  }

  keyDown(_view: IView, event: KeyboardEvent): void {
    if (event.key === "Enter") {
      this.controller.success();
      event.stopImmediatePropagation();
    } else if (event.key === "Escape") {
      this._finishDragProfile("cancelled");
      this.controller.cancel();
    }
  }

  private _emitChange(): void {
    const startedAt = nowMs();
    this.config.onChange(this._origin, this._plane);
    if (this._dragProfile) {
      this._dragProfile.onChangeMs += nowMs() - startedAt;
    }
  }

  private _beginDragProfile(handle: GizmoHandleId): void {
    if (!isTransformGizmoProfilingEnabled()) {
      this._dragProfile = undefined;
      return;
    }

    this._dragProfile = {
      label: this.config.debugLabel ?? "TransformGizmo",
      handle,
      startedAt: nowMs(),
      pointerMoves: 0,
      refreshCount: 0,
      handleRebuildCount: 0,
      previewRebuildCount: 0,
      applyDragMs: 0,
      onChangeMs: 0,
      refreshMs: 0,
      handleRebuildMs: 0,
      previewBuildMs: 0,
      previewDisplayMs: 0,
      dragLabelMs: 0
    };
  }

  private _finishDragProfile(status: "completed" | "cancelled"): void {
    const profile = this._dragProfile;
    this._dragProfile = undefined;
    if (!profile) return;
    if (profile.pointerMoves === 0 && status === "completed") return;

    const totalMs = nowMs() - profile.startedAt;
    const refreshAvgMs =
      profile.refreshCount > 0 ? profile.refreshMs / profile.refreshCount : 0;
    const previewAvgMs =
      profile.previewRebuildCount > 0
        ? profile.previewBuildMs / profile.previewRebuildCount
        : 0;
    const handleAvgMs =
      profile.handleRebuildCount > 0
        ? profile.handleRebuildMs / profile.handleRebuildCount
        : 0;

    console.groupCollapsed(
      `[TransformGizmoProfile] ${profile.label} ${String(profile.handle)} ${status} ${totalMs.toFixed(1)}ms`
    );
    console.info({
      pointerMoves: profile.pointerMoves,
      refreshCount: profile.refreshCount,
      previewRebuildCount: profile.previewRebuildCount,
      handleRebuildCount: profile.handleRebuildCount,
      totalMs: Number(totalMs.toFixed(1)),
      applyDragMs: Number(profile.applyDragMs.toFixed(1)),
      onChangeMs: Number(profile.onChangeMs.toFixed(1)),
      refreshMs: Number(profile.refreshMs.toFixed(1)),
      refreshAvgMs: Number(refreshAvgMs.toFixed(2)),
      handleRebuildMs: Number(profile.handleRebuildMs.toFixed(1)),
      handleAvgMs: Number(handleAvgMs.toFixed(2)),
      previewBuildMs: Number(profile.previewBuildMs.toFixed(1)),
      previewAvgMs: Number(previewAvgMs.toFixed(2)),
      previewDisplayMs: Number(profile.previewDisplayMs.toFixed(1)),
      dragLabelMs: Number(profile.dragLabelMs.toFixed(1))
    });
    console.groupEnd();
  }
}
