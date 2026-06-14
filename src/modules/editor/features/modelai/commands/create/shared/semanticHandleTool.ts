// @ts-nocheck
import {
  type AsyncController,
  AsyncController as ModelAsyncController,
  type IDocument,
  type IEventHandler,
  type INode,
  type IView,
  MeshDataUtils,
  ShapeType,
  VisualState,
  type EdgeMeshData,
  type FaceMeshData,
  XYZ,
  Plane
} from "@modelai/core";
import {
  Dimension,
  PointSnapEventHandler,
  type PointSnapData,
  type SnapProfile
} from "@modelai/selection/snap";
import { screenDistance } from "@modelai/selection/snap/utils";
import { createDefaultSnapConfig } from "@modelai/selection/snapConfig";
import { createSnapCommandUI } from "@modelai/step";
import {
  AmbientLight,
  Group,
  Matrix4 as ThreeMatrix4,
  Mesh,
  type Object3D
} from "three";
import { applyForegroundOverlay } from "@/features/modelai/geometry/foregroundOverlay";
import { ThreeGeometryFactory } from "@/features/modelai/viewer/geometryFactory";
import {
  meshBasicBlackNoDepthMaterial,
  meshBasicBlueAlpha45NoDepthMaterial,
  meshBasicBlueNoDepthMaterial,
  meshBasicWhiteAlpha45NoDepthMaterial,
  meshBasicWhiteNoDepthMaterial
} from "@/features/modelai/viewer/materials";
import type { ThreeView } from "@/features/modelai/viewer/view";
import { createSemanticArrowMesh } from "@/features/modelai/gates/shared/semanticHandleGeometry";

export type SemanticHandlePartId = string;

export type SemanticHandleTarget = {
  getOrigin(): XYZ;
  getPlane(): Plane;
  getDragGhostNode?(): INode | undefined;
};

export type SemanticHandlePlacementHandler = IEventHandler & {
  readonly lastView?: IView;
  dispose(): void;
  refreshPreview(): void;
};

export type SemanticHandleContext = {
  target: SemanticHandleTarget;
  origin: XYZ;
  plane: Plane;
};

export type SemanticHandleShowInput = (
  placeholder: string,
  onCommit: (value: number, text: string) => void,
  initialValue?: string
) => void;

export type SemanticPointMoveSnapFallback =
  | { type: "viewPlane" }
  | { type: "plane"; plane: (ctx: SemanticHandleContext) => Plane };

export type SemanticPointMoveSnapConfig = {
  fallback?: SemanticPointMoveSnapFallback;
  createPointData?: (ctx: SemanticHandleContext) => Partial<PointSnapData>;
};

export type SemanticPointMoveFallbackConfig = {
  fallback?: SemanticPointMoveSnapFallback;
};

export type SemanticPointMovePart = {
  id: SemanticHandlePartId;
  kind: "pointMove";
  enabled?: boolean;
  getPosition?: (ctx: SemanticHandleContext) => XYZ;
  snap?: false | SemanticPointMoveSnapConfig;
  noSnapFallback?:
    | SemanticPointMoveSnapFallback
    | SemanticPointMoveFallbackConfig;
  onDragStart?: (ctx: SemanticHandleContext) => void;
  onDrag?: (point: XYZ, ctx: SemanticHandleContext) => void;
  onClick?: (
    showInput: SemanticHandleShowInput,
    ctx: SemanticHandleContext
  ) => void;
};

export type SemanticAxisMovePart = {
  id: SemanticHandlePartId;
  kind: "axisMove";
  enabled?: boolean;
  getHandlePosition: (ctx: SemanticHandleContext) => XYZ;
  getDragAnchor?: (ctx: SemanticHandleContext) => XYZ;
  getDirection: (ctx: SemanticHandleContext) => XYZ;
  onDragStart?: (ctx: SemanticHandleContext) => void;
  onDrag: (delta: number, ctx: SemanticHandleContext) => void;
  onClick?: (
    showInput: SemanticHandleShowInput,
    ctx: SemanticHandleContext
  ) => void;
  formatLabel?: (
    delta: number,
    ctx: SemanticHandleContext
  ) => string | undefined;
  visual?: {
    arrow?: boolean;
    guideFromOrigin?: boolean;
    color?: number;
  };
};

export type SemanticPlaneMovePart = {
  id: SemanticHandlePartId;
  kind: "planeMove";
  enabled?: boolean;
  getHandlePosition: (
    ctx: SemanticHandleContext,
    scale: SemanticHandleScale
  ) => XYZ;
  getNormal: (ctx: SemanticHandleContext) => XYZ;
  getBasis?: (ctx: SemanticHandleContext) => { dir0: XYZ; dir90: XYZ };
  onDragStart?: (ctx: SemanticHandleContext) => void;
  onDrag?: (delta: XYZ, ctx: SemanticHandleContext) => void;
  onClick?: (
    showInput: SemanticHandleShowInput,
    ctx: SemanticHandleContext
  ) => void;
};

export type SemanticAngleMovePart = {
  id: SemanticHandlePartId;
  kind: "angleMove";
  enabled?: boolean;
  getPivot: (ctx: SemanticHandleContext) => XYZ;
  getPlaneNormal: (ctx: SemanticHandleContext) => XYZ;
  getReferenceDir: (ctx: SemanticHandleContext) => XYZ;
  getHandlePosition: (
    ctx: SemanticHandleContext,
    scale: SemanticHandleScale
  ) => XYZ;
  onDragStart?: (ctx: SemanticHandleContext) => void;
  onDrag: (deltaDegrees: number, ctx: SemanticHandleContext) => void;
  onClick?: (
    showInput: SemanticHandleShowInput,
    ctx: SemanticHandleContext
  ) => void;
  formatLabel?: (
    deltaDegrees: number,
    ctx: SemanticHandleContext
  ) => string | undefined;
  visual?: {
    startDeg: number;
    endDeg: number;
    minDeg?: number;
    maxDeg?: number;
    color?: number;
    track?: boolean;
    guide?: boolean;
  };
};

export type SemanticHandlePart =
  | SemanticPointMovePart
  | SemanticAxisMovePart
  | SemanticPlaneMovePart
  | SemanticAngleMovePart;

export type SemanticHandleSizeConfig = {
  axisLengthPx: number;
  axisArrowConeHeightPx: number;
  axisArrowConeDiameterPx: number;
  axisArrowStemHeightPx: number;
  axisArrowStemDiameterPx: number;
  originRingDiameterPx: number;
  planeMoveCircleDiameterPx: number;
  planeMoveArcDiameterPx: number;
  valueHandleRingDiameterPx: number;
  angleArcInnerRadiusPx: number;
  angleArcOuterRadiusPx: number;
  angleArcDashLengthPx: number;
  angleArcGapLengthPx: number;
  angleTrackRadiusPx: number;
  angleTrackThicknessPx: number;
  angleGuideDashLengthPx: number;
  angleGuideGapLengthPx: number;
};

export type SemanticHandleTheme = {
  idleColor: number;
  activeColor: number;
  fillColor: number;
  trackColor: number;
  hitPixels: number;
  topRenderOrder: number;
};

export type SemanticHandleScale = ReturnType<typeof resolveScale>;

export type SemanticHandleToolConfig = {
  parts: SemanticHandlePart[];
  size?: Partial<SemanticHandleSizeConfig>;
  theme?: Partial<SemanticHandleTheme>;
  snapProfile?: SnapProfile;
  dragGhost?: boolean;
  onDragActiveChange?: (active: boolean, partId: string) => void;
  onDragEnd?: (partId: string) => void;
  onDragFrame?: (partId: string) => void;
};

export type SemanticHandleBasisAxis = "X" | "Y" | "Z";
export type SemanticPointInputAxis = Lowercase<SemanticHandleBasisAxis>;

export type SemanticConfiguredPointMove =
  | false
  | {
      snap?: boolean | SemanticPointMoveSnapConfig;
      fallback?: SemanticPointMoveSnapFallback;
      inputAxes?: readonly SemanticPointInputAxis[];
      createPointData?: (ctx: SemanticHandleContext) => Partial<PointSnapData>;
      onDragStart?: SemanticPointMovePart["onDragStart"];
      onDrag?: (point: XYZ, ctx: SemanticHandleContext) => void;
      onClick?: SemanticPointMovePart["onClick"];
    };

export type SemanticConfiguredAxisMove =
  | SemanticHandleBasisAxis
  | {
      axis?: SemanticHandleBasisAxis;
      direction?: XYZ | ((ctx: SemanticHandleContext) => XYZ);
      getHandlePosition?: (ctx: SemanticHandleContext) => XYZ;
      getDragAnchor?: (ctx: SemanticHandleContext) => XYZ;
      onDragStart?: (ctx: SemanticHandleContext) => void;
      onDrag?: (delta: number, ctx: SemanticHandleContext) => void;
      onClick?: SemanticAxisMovePart["onClick"];
      formatLabel?: SemanticAxisMovePart["formatLabel"];
      visual?: SemanticAxisMovePart["visual"];
    };

type SemanticConfiguredPlaneNormal =
  | SemanticHandleBasisAxis
  | XYZ
  | ((ctx: SemanticHandleContext) => XYZ);

type NormalizedSemanticPlaneMove = {
  normal?: SemanticConfiguredPlaneNormal;
  inputAxes?: readonly SemanticPointInputAxis[];
  getHandlePosition?: (
    ctx: SemanticHandleContext,
    scale: SemanticHandleScale
  ) => XYZ;
  getBasis?: (ctx: SemanticHandleContext) => { dir0: XYZ; dir90: XYZ };
  onDragStart?: SemanticPlaneMovePart["onDragStart"];
  onDrag?: SemanticPlaneMovePart["onDrag"];
  onClick?: SemanticPlaneMovePart["onClick"];
};

export type SemanticConfiguredPlaneMove =
  | SemanticHandleBasisAxis
  | NormalizedSemanticPlaneMove;

export type SemanticConfiguredRotation =
  | false
  | {
      getPivot?: (ctx: SemanticHandleContext) => XYZ;
      getPlaneNormal?: (ctx: SemanticHandleContext) => XYZ;
      getReferenceDir?: (ctx: SemanticHandleContext) => XYZ;
      getHandlePosition?: (
        ctx: SemanticHandleContext,
        scale: SemanticHandleScale
      ) => XYZ;
      startDeg?: number;
      endDeg?: number;
      color?: number;
      onDrag?: (plane: Plane, ctx: SemanticHandleContext) => void;
    };

export type SemanticConfiguredAngleValue = {
  getValue: (ctx: SemanticHandleContext) => number;
  setValue: (value: number, ctx: SemanticHandleContext) => void;
  getPlaneNormal: (ctx: SemanticHandleContext) => XYZ;
  getReferenceDir: (ctx: SemanticHandleContext) => XYZ;
  getHandleDirection: (ctx: SemanticHandleContext) => XYZ;
  min?: number;
  max?: number;
  startDeg?: number;
  endDeg?: number;
  color?: number;
  track?: boolean;
  guide?: boolean;
  formatLabel?: (value: number) => string;
  formatInput?: (value: number) => string;
};

export type SemanticConfiguredHandleToolConfig = Omit<
  SemanticHandleToolConfig,
  "parts"
> & {
  pointMove?: SemanticConfiguredPointMove;
  axisMoves?: false | readonly SemanticConfiguredAxisMove[];
  planeMoves?: false | readonly SemanticConfiguredPlaneMove[];
  rotation?: SemanticConfiguredRotation;
  angleValues?: readonly SemanticConfiguredAngleValue[];
  onAxisDragStart?: (
    axis: SemanticHandleBasisAxis,
    direction: XYZ,
    origin: XYZ,
    ctx: SemanticHandleContext
  ) => void;
  onAxisDrag?: (
    axis: SemanticHandleBasisAxis,
    direction: XYZ,
    delta: number,
    ctx: SemanticHandleContext
  ) => void;
};

export type SemanticHandlePick = {
  partId: SemanticHandlePartId;
  distancePx: number;
};

export type SemanticHandleToolPick = {
  tool: SemanticHandleTool;
  pick: SemanticHandlePick;
};

export function setSemanticHandleDragGhost(
  document: IDocument,
  node: INode,
  active: boolean
): void {
  const visual = document.visual.context.getVisual(node);
  if (!visual) return;
  if (active) {
    document.visual.highlighter.addState(
      visual,
      VisualState.faceDragGhost,
      ShapeType.Shape
    );
  } else {
    document.visual.highlighter.removeState(
      visual,
      VisualState.faceDragGhost,
      ShapeType.Shape
    );
  }
  document.visual.update();
}

export function beginSemanticHandleDragGhost(
  document: IDocument,
  node: INode
): void {
  document.visual.highlighter.clear();
  setSemanticHandleDragGhost(document, node, true);
}

type DragState =
  | {
      kind: "pointMove";
      part: SemanticPointMovePart;
      startPosition: XYZ;
      startHit: XYZ;
      snapController?: ModelAsyncController;
      snapHandler?: PointSnapEventHandler;
    }
  | {
      kind: "axisMove";
      part: SemanticAxisMovePart;
      startParam: number;
      axisDir: XYZ;
      anchor: XYZ;
    }
  | {
      kind: "planeMove";
      part: SemanticPlaneMovePart;
      startHit: XYZ;
      planeOrigin: XYZ;
      planeNormal: XYZ;
      dir0: XYZ;
      dir90: XYZ;
    }
  | {
      kind: "angleMove";
      part: SemanticAngleMovePart;
      startAngleDeg: number;
      planeNormal: XYZ;
      dir0: XYZ;
      dir90: XYZ;
    };

type HandleObjectSlot = {
  object: Object3D;
  anchor: XYZ;
};

const DEFAULT_SIZE: SemanticHandleSizeConfig = {
  axisLengthPx: 80,
  axisArrowConeHeightPx: 10,
  axisArrowConeDiameterPx: 10,
  axisArrowStemHeightPx: 6,
  axisArrowStemDiameterPx: 4,
  originRingDiameterPx: 8,
  planeMoveCircleDiameterPx: 20,
  planeMoveArcDiameterPx: 28,
  valueHandleRingDiameterPx: 8,
  angleArcInnerRadiusPx: 16,
  angleArcOuterRadiusPx: 32,
  angleArcDashLengthPx: 10,
  angleArcGapLengthPx: 8,
  angleTrackRadiusPx: 120,
  angleTrackThicknessPx: 16,
  angleGuideDashLengthPx: 10,
  angleGuideGapLengthPx: 8
};

const DEFAULT_THEME: SemanticHandleTheme = {
  idleColor: 0xffffff,
  activeColor: 0x4488ff,
  fillColor: 0x000000,
  trackColor: 0xf3eadb,
  hitPixels: 20,
  topRenderOrder: 2000
};

export const SEMANTIC_HANDLE_TRANSFORM_SNAP_PROFILE: SnapProfile = {
  id: "transform",
  hoverMode: "light",
  faceHover: "fallback",
  preciseOnCommit: true,
  enableTracking: false,
  enableInvisibleSnaps: true,
  enableDerivedSnaps: {
    center: true,
    intersection: false,
    perpendicular: false
  },
  stickyCandidate: true,
  transformCandidateTuning: {
    priorityWindowPx: 3,
    lockRadiusPx: 8,
    switchMarginPx: 3
  }
};

const CLICK_TOLERANCE_PX = 4;
const ARC_SEGMENTS = 32;
const CIRCLE_SEGMENTS = 40;

function getViewDom(view: IView): HTMLElement | undefined {
  return (view as any)?._dom ?? (view as any)?.dom;
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

function circleMesh(
  center: XYZ,
  dir0: XYZ,
  dir90: XYZ,
  radius: number,
  color: number,
  lineWidth = 1
): EdgeMeshData {
  const positions: number[] = [];
  for (let i = 0; i < CIRCLE_SEGMENTS; i++) {
    const a0 = (i / CIRCLE_SEGMENTS) * Math.PI * 2;
    const a1 = ((i + 1) / CIRCLE_SEGMENTS) * Math.PI * 2;
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
    lineType: "solid",
    lineWidth,
    range: []
  };
}

function circleFillMesh(
  center: XYZ,
  dir0: XYZ,
  dir90: XYZ,
  radius: number,
  color: number
): FaceMeshData {
  const positions: number[] = [center.x, center.y, center.z];
  const normals: number[] = [];
  const uvs: number[] = [0.5, 0.5];
  const indices: number[] = [];
  const normal = dir0.cross(dir90).normalize();
  normals.push(normal.x, normal.y, normal.z);
  for (let i = 0; i < CIRCLE_SEGMENTS; i++) {
    const a = (i / CIRCLE_SEGMENTS) * Math.PI * 2;
    const p = center
      .add(dir0.multiply(Math.cos(a) * radius))
      .add(dir90.multiply(Math.sin(a) * radius));
    positions.push(p.x, p.y, p.z);
    normals.push(normal.x, normal.y, normal.z);
    uvs.push((Math.cos(a) + 1) * 0.5, (Math.sin(a) + 1) * 0.5);
  }
  for (let i = 0; i < CIRCLE_SEGMENTS; i++) {
    indices.push(0, i + 1, ((i + 1) % CIRCLE_SEGMENTS) + 1);
  }
  return {
    position: new Float32Array(positions),
    normal: new Float32Array(normals),
    uv: new Float32Array(uvs),
    index: new Uint32Array(indices),
    groups: [{ start: 0, count: indices.length }],
    color,
    range: []
  };
}

function circleFillObject(
  center: XYZ,
  dir0: XYZ,
  dir90: XYZ,
  radius: number,
  theme: SemanticHandleTheme
): Mesh {
  return new Mesh(
    ThreeGeometryFactory.createFaceBufferGeometry(
      circleFillMesh(center, dir0, dir90, radius, theme.fillColor)
    ),
    meshBasicBlackNoDepthMaterial
  );
}

function solidFaceObject(
  mesh: FaceMeshData,
  color: number,
  theme: SemanticHandleTheme
): Mesh {
  return new Mesh(
    ThreeGeometryFactory.createFaceBufferGeometry(mesh),
    color === theme.activeColor
      ? meshBasicBlueNoDepthMaterial
      : meshBasicWhiteNoDepthMaterial
  );
}

function translucentFaceObject(
  mesh: FaceMeshData,
  color: number,
  theme: SemanticHandleTheme
): Mesh {
  return new Mesh(
    ThreeGeometryFactory.createFaceBufferGeometry(mesh),
    color === theme.activeColor
      ? meshBasicBlueAlpha45NoDepthMaterial
      : meshBasicWhiteAlpha45NoDepthMaterial
  );
}

function arcLineMesh(
  center: XYZ,
  dir0: XYZ,
  dir90: XYZ,
  radius: number,
  startDeg: number,
  endDeg: number,
  color: number,
  lineType: "solid" | "dash" = "solid",
  lineWidth = 1
): EdgeMeshData {
  const start = (startDeg * Math.PI) / 180;
  const end = (endDeg * Math.PI) / 180;
  const sweep = end - start;
  const count = Math.max(
    1,
    Math.ceil((Math.abs(sweep) / (Math.PI * 2)) * ARC_SEGMENTS)
  );
  const positions: number[] = [];
  for (let i = 0; i < count; i++) {
    const t0 = i / count;
    const t1 = (i + 1) / count;
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
    lineWidth,
    range: []
  };
}

function dashedArcLineMesh(
  center: XYZ,
  dir0: XYZ,
  dir90: XYZ,
  radius: number,
  startDeg: number,
  endDeg: number,
  color: number,
  dashLength: number,
  gapLength: number,
  lineWidth = 1
): EdgeMeshData {
  const start = (startDeg * Math.PI) / 180;
  const end = (endDeg * Math.PI) / 180;
  const sweep = end - start;
  const totalLength = Math.abs(sweep) * radius;
  const sign = sweep >= 0 ? 1 : -1;
  const step = Math.max(dashLength + gapLength, 1e-6);
  const positions: number[] = [];
  const pointAt = (offset: number) => {
    const a = start + sign * (offset / radius);
    return center
      .add(dir0.multiply(Math.cos(a) * radius))
      .add(dir90.multiply(Math.sin(a) * radius));
  };
  for (let offset = 0; offset < totalLength; offset += step) {
    const dashEnd = Math.min(offset + dashLength, totalLength);
    if (dashEnd <= offset) continue;
    const p0 = pointAt(offset);
    const p1 = pointAt(dashEnd);
    positions.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
  }
  return {
    position: new Float32Array(positions),
    color,
    lineType: "solid",
    lineWidth,
    range: []
  };
}

function dashedLineMesh(
  start: XYZ,
  end: XYZ,
  color: number,
  dashLength: number,
  gapLength: number,
  lineWidth = 1
): EdgeMeshData {
  const delta = end.sub(start);
  const length = delta.length();
  if (length <= 1e-8) {
    return MeshDataUtils.createEdgeMesh(start, end, color, "solid", lineWidth);
  }
  const dir = delta.normalize();
  const positions: number[] = [];
  const step = Math.max(dashLength + gapLength, 1e-6);
  for (let offset = 0; offset < length; offset += step) {
    const dashEnd = Math.min(offset + dashLength, length);
    if (dashEnd <= offset) continue;
    const p0 = start.add(dir.multiply(offset));
    const p1 = start.add(dir.multiply(dashEnd));
    positions.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
  }
  return {
    position: new Float32Array(positions),
    color,
    lineType: "solid",
    lineWidth,
    range: []
  };
}

function annularSectorMesh(
  center: XYZ,
  dir0: XYZ,
  dir90: XYZ,
  innerRadius: number,
  outerRadius: number,
  startDeg: number,
  endDeg: number,
  color: number
): FaceMeshData {
  const start = (startDeg * Math.PI) / 180;
  const end = (endDeg * Math.PI) / 180;
  const sweep = end - start;
  const count = Math.max(
    2,
    Math.ceil((Math.abs(sweep) / (Math.PI * 2)) * ARC_SEGMENTS)
  );
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const normal = dir0.cross(dir90).normalize();

  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const a = start + sweep * t;
    const radial = dir0
      .multiply(Math.cos(a))
      .add(dir90.multiply(Math.sin(a)))
      .normalize();
    const inner = center.add(radial.multiply(innerRadius));
    const outer = center.add(radial.multiply(outerRadius));
    positions.push(inner.x, inner.y, inner.z, outer.x, outer.y, outer.z);
    normals.push(normal.x, normal.y, normal.z, normal.x, normal.y, normal.z);
    uvs.push(0, t, 1, t);
  }

  for (let i = 0; i < count; i++) {
    const a = i * 2;
    indices.push(a, a + 1, a + 3, a, a + 3, a + 2);
  }

  return {
    position: new Float32Array(positions),
    normal: new Float32Array(normals),
    uv: new Float32Array(uvs),
    index: new Uint32Array(indices),
    groups: [{ start: 0, count: indices.length }],
    color,
    range: []
  };
}

function arcPoint(
  center: XYZ,
  dir0: XYZ,
  dir90: XYZ,
  radius: number,
  degrees: number
): XYZ {
  const a = (degrees * Math.PI) / 180;
  return center
    .add(dir0.multiply(Math.cos(a) * radius))
    .add(dir90.multiply(Math.sin(a) * radius));
}

function resolveScale(
  view: IView,
  origin: XYZ,
  size: SemanticHandleSizeConfig
) {
  const screenPt = view.worldToScreen(origin);
  const ray0 = view.rayAt(screenPt.x, screenPt.y);
  const ray1 = view.rayAt(screenPt.x + size.axisLengthPx, screenPt.y);
  const t = Math.max(origin.sub(ray0.origin).dot(ray0.direction), 0.1);
  const w0 = ray0.origin.add(ray0.direction.multiply(t));
  const w1 = ray1.origin.add(ray1.direction.multiply(t));
  const axisLen = w0.sub(w1).length();
  const px = axisLen / size.axisLengthPx;
  return {
    axisLen,
    px,
    arrowConeHeight: size.axisArrowConeHeightPx * px,
    arrowConeRadius: (size.axisArrowConeDiameterPx * px) / 2,
    arrowStemHeight: size.axisArrowStemHeightPx * px,
    arrowStemRadius: (size.axisArrowStemDiameterPx * px) / 2,
    originRadius: (size.originRingDiameterPx * px) / 2,
    planeMoveCircleRadius: (size.planeMoveCircleDiameterPx * px) / 2,
    planeMoveArcRadius: (size.planeMoveArcDiameterPx * px) / 2,
    valueHandleRadius: (size.valueHandleRingDiameterPx * px) / 2,
    angleInnerRadius: size.angleArcInnerRadiusPx * px,
    angleOuterRadius: size.angleArcOuterRadiusPx * px,
    angleArcDashLength: size.angleArcDashLengthPx * px,
    angleArcGapLength: size.angleArcGapLengthPx * px,
    angleTrackInnerRadius:
      (size.angleTrackRadiusPx - size.angleTrackThicknessPx / 2) * px,
    angleTrackOuterRadius:
      (size.angleTrackRadiusPx + size.angleTrackThicknessPx / 2) * px,
    angleTrackMarkerRadius: size.angleTrackRadiusPx * px,
    angleGuideDashLength: size.angleGuideDashLengthPx * px,
    angleGuideGapLength: size.angleGuideGapLengthPx * px
  };
}

function enabledParts(parts: SemanticHandlePart[]) {
  return parts.filter(part => part.enabled !== false);
}

function hasClickHandler(
  part: SemanticHandlePart
): part is
  | SemanticPointMovePart
  | SemanticAxisMovePart
  | SemanticPlaneMovePart
  | SemanticAngleMovePart {
  return part.kind !== "planeMove" || part.onClick !== undefined;
}

function isPointMoveFallbackConfig(
  fallback: SemanticPointMoveSnapFallback | SemanticPointMoveFallbackConfig
): fallback is SemanticPointMoveFallbackConfig {
  return "fallback" in fallback;
}

function resolvePointMoveFallback(
  part: SemanticPointMovePart
): SemanticPointMoveSnapFallback {
  if (part.snap !== false) return part.snap?.fallback ?? { type: "viewPlane" };
  const fallback = part.noSnapFallback;
  if (!fallback) return { type: "viewPlane" };
  return isPointMoveFallbackConfig(fallback) ? fallback.fallback : fallback;
}

function pointAxisValue(point: XYZ, axis: SemanticPointInputAxis): number {
  if (axis === "x") return point.x;
  if (axis === "y") return point.y;
  return point.z;
}

function withPointAxisValue(
  point: XYZ,
  axis: SemanticPointInputAxis,
  value: number
): XYZ {
  if (axis === "x") return new XYZ(value, point.y, point.z);
  if (axis === "y") return new XYZ(point.x, value, point.z);
  return new XYZ(point.x, point.y, value);
}

function normalizePointInputAxes(
  axes?: readonly SemanticPointInputAxis[]
): readonly SemanticPointInputAxis[] {
  if (!axes?.length) return ["x", "y", "z"];
  const normalized = axes.filter(
    (axis, index, source) => source.indexOf(axis) === index
  );
  return normalized.length ? normalized : ["x", "y", "z"];
}

function formatPointInput(
  point: XYZ,
  axes: readonly SemanticPointInputAxis[]
): string {
  return axes
    .map(axis => `${axis}=${pointAxisValue(point, axis).toFixed(2)}`)
    .join(",");
}

function parsePointInput(
  text: string,
  basePoint: XYZ,
  axes: readonly SemanticPointInputAxis[]
): XYZ | undefined {
  const tokens = text
    .trim()
    .replace(/^\[|\]$/g, "")
    .split(",");
  if (tokens.length !== axes.length) {
    return undefined;
  }
  const values = tokens.map((token, index) => {
    const trimmed = token.trim();
    const keyed = trimmed.match(/^([xyzXYZ])\s*=\s*(.+)$/);
    if (keyed && keyed[1].toLowerCase() !== axes[index]) return NaN;
    return Number.parseFloat(keyed ? keyed[2].trim() : trimmed);
  });
  if (values.some(value => !Number.isFinite(value))) return undefined;
  return axes.reduce(
    (point, axis, index) => withPointAxisValue(point, axis, values[index]),
    basePoint
  );
}

function pointInputAxesForPlaneNormal(
  normal: SemanticConfiguredPlaneNormal | undefined,
  ctx: SemanticHandleContext
): readonly SemanticPointInputAxis[] {
  if (normal === "X") return ["y", "z"];
  if (normal === "Y") return ["x", "z"];
  if (normal === "Z" || normal === undefined) return ["x", "y"];
  const resolved = resolveSemanticPlaneNormal(normal, ctx).normalize();
  const components = [
    { axis: "x" as const, value: Math.abs(resolved.x) },
    { axis: "y" as const, value: Math.abs(resolved.y) },
    { axis: "z" as const, value: Math.abs(resolved.z) }
  ].sort((left, right) => right.value - left.value);
  const fixedAxis = components[0].axis;
  return (["x", "y", "z"] as const).filter(axis => axis !== fixedAxis);
}

function normalizeSemanticInputText(
  text: string,
  coordinateInput: boolean
): string {
  const normalized = text
    .replace(/[\uFF10-\uFF19]/g, char =>
      String.fromCharCode(char.charCodeAt(0) - 0xfee0)
    )
    .replace(/\uFF0C/g, ",")
    .replace(/\uFF0E/g, ".")
    .replace(/\uFF1D/g, "=")
    .replace(/\uFF0D/g, "-")
    .replace(/\uFF0B/g, "+")
    .replace(/\uFF3B/g, "[")
    .replace(/\uFF3D/g, "]");

  return coordinateInput
    ? normalized.replace(/[^\dxyzXYZ,=.\-+\[\]]/g, "").replace(/,+/g, ",")
    : normalized.replace(/[^\d.\-+]/g, "");
}

function clampSemanticValue(value: number, min?: number, max?: number): number {
  if (min !== undefined && value < min) return min;
  if (max !== undefined && value > max) return max;
  return value;
}

function semanticBasisDirection(
  axis: SemanticHandleBasisAxis,
  ctx: SemanticHandleContext
): XYZ {
  if (axis === "X") return ctx.plane.xvec;
  if (axis === "Y") return ctx.plane.yvec;
  return ctx.plane.normal;
}

function resolveSemanticDirection(
  direction: XYZ | ((ctx: SemanticHandleContext) => XYZ) | undefined,
  axis: SemanticHandleBasisAxis,
  ctx: SemanticHandleContext
): XYZ {
  if (typeof direction === "function") return direction(ctx);
  return direction ?? semanticBasisDirection(axis, ctx);
}

function semanticPlaneBasis(
  axis: SemanticHandleBasisAxis
): NormalizedSemanticPlaneMove {
  if (axis === "X") {
    return {
      normal: "X" as const,
      getHandlePosition: (
        ctx: SemanticHandleContext,
        scale: SemanticHandleScale
      ) =>
        ctx.origin
          .add(ctx.plane.yvec.multiply(scale.axisLen * 0.5))
          .add(ctx.plane.normal.multiply(scale.axisLen * 0.5)),
      getBasis: (ctx: SemanticHandleContext) => ({
        dir0: ctx.plane.yvec,
        dir90: ctx.plane.normal
      })
    };
  }
  if (axis === "Y") {
    return {
      normal: "Y" as const,
      getHandlePosition: (
        ctx: SemanticHandleContext,
        scale: SemanticHandleScale
      ) =>
        ctx.origin
          .add(ctx.plane.xvec.multiply(scale.axisLen * 0.5))
          .add(ctx.plane.normal.multiply(scale.axisLen * 0.5)),
      getBasis: (ctx: SemanticHandleContext) => ({
        dir0: ctx.plane.xvec,
        dir90: ctx.plane.normal
      })
    };
  }
  return {
    normal: "Z" as const,
    getHandlePosition: (
      ctx: SemanticHandleContext,
      scale: SemanticHandleScale
    ) =>
      ctx.origin
        .add(ctx.plane.xvec.multiply(scale.axisLen * 0.5))
        .add(ctx.plane.yvec.multiply(scale.axisLen * 0.5)),
    getBasis: (ctx: SemanticHandleContext) => ({
      dir0: ctx.plane.xvec,
      dir90: ctx.plane.yvec
    })
  };
}

function createConfiguredPointMove(
  config: Exclude<SemanticConfiguredPointMove, false | undefined>,
  toolConfig: SemanticConfiguredHandleToolConfig
): SemanticPointMovePart {
  const snapConfig =
    config.snap === false
      ? false
      : {
          ...(typeof config.snap === "object" ? config.snap : {}),
          fallback:
            (typeof config.snap === "object"
              ? config.snap.fallback
              : undefined) ?? config.fallback,
          createPointData: (ctx: SemanticHandleContext) => ({
            ...config.createPointData?.(ctx),
            ...(typeof config.snap === "object"
              ? config.snap.createPointData?.(ctx)
              : undefined)
          })
        };
  const onDrag = config.onDrag;
  const inputAxes = normalizePointInputAxes(config.inputAxes);
  return {
    id: "pointMove",
    kind: "pointMove",
    snap: snapConfig,
    noSnapFallback: config.fallback,
    onDragStart: config.onDragStart,
    onDrag,
    onClick:
      config.onClick ??
      (onDrag
        ? (showInput, ctx) => {
            const inputValue = formatPointInput(ctx.origin, inputAxes);
            showInput(
              inputValue,
              (_value, text) => {
                const point = parsePointInput(text, ctx.origin, inputAxes);
                if (!point) return;
                config.onDragStart?.(ctx);
                onDrag(point, ctx);
                toolConfig.onDragEnd?.("pointMove");
              },
              inputValue
            );
          }
        : undefined)
  };
}

function createConfiguredAxisMove(
  config: SemanticConfiguredAxisMove,
  index: number,
  toolConfig: SemanticConfiguredHandleToolConfig
): SemanticAxisMovePart {
  const axisConfig = typeof config === "string" ? { axis: config } : config;
  const axis = axisConfig.axis ?? "X";
  let dragStartOrigin: XYZ | undefined;
  const getDirection = (ctx: SemanticHandleContext) =>
    resolveSemanticDirection(axisConfig.direction, axis, ctx);
  const onDrag = (delta: number, ctx: SemanticHandleContext) => {
    const direction = getDirection(ctx);
    if (axisConfig.onDrag) {
      axisConfig.onDrag(delta, ctx);
      return;
    }
    toolConfig.onAxisDrag?.(axis, direction, delta, ctx);
  };
  const onDragStart = (ctx: SemanticHandleContext) => {
    const direction = getDirection(ctx);
    dragStartOrigin =
      axisConfig.getDragAnchor?.(ctx) ??
      axisConfig.getHandlePosition?.(ctx) ??
      ctx.origin;
    axisConfig.onDragStart?.(ctx);
    toolConfig.onAxisDragStart?.(axis, direction, dragStartOrigin, ctx);
  };
  return {
    id: `axisMove:${index}`,
    kind: "axisMove",
    getHandlePosition: ctx => axisConfig.getHandlePosition?.(ctx) ?? ctx.origin,
    getDragAnchor: ctx =>
      axisConfig.getDragAnchor?.(ctx) ??
      axisConfig.getHandlePosition?.(ctx) ??
      ctx.origin,
    getDirection,
    onDragStart,
    onDrag,
    onClick:
      axisConfig.onClick ??
      (toolConfig.onAxisDrag || axisConfig.onDrag
        ? (showInput, ctx) => {
            showInput("0.00", value => {
              onDragStart(ctx);
              onDrag(value, ctx);
            });
          }
        : undefined),
    formatLabel: axisConfig.formatLabel,
    visual: axisConfig.visual
  };
}

function resolveSemanticPlaneNormal(
  normal: SemanticConfiguredPlaneNormal | undefined,
  ctx: SemanticHandleContext
): XYZ {
  if (typeof normal === "function") return normal(ctx);
  if (normal === "X" || normal === "Y" || normal === "Z") {
    return semanticBasisDirection(normal, ctx);
  }
  return normal ?? ctx.plane.normal;
}

function createConfiguredPlaneMove(
  config: SemanticConfiguredPlaneMove,
  index: number
): SemanticPlaneMovePart {
  const planeConfig =
    typeof config === "string"
      ? semanticPlaneBasis(config)
      : {
          ...(typeof config.normal === "string"
            ? semanticPlaneBasis(config.normal)
            : {}),
          ...config
        };
  return {
    id: `planeMove:${index}`,
    kind: "planeMove",
    getHandlePosition:
      planeConfig.getHandlePosition ??
      ((ctx, scale) =>
        ctx.origin
          .add(ctx.plane.xvec.multiply(scale.axisLen * 0.5))
          .add(ctx.plane.yvec.multiply(scale.axisLen * 0.5))),
    getNormal: ctx => resolveSemanticPlaneNormal(planeConfig.normal, ctx),
    getBasis: planeConfig.getBasis,
    onDragStart: planeConfig.onDragStart,
    onDrag: planeConfig.onDrag,
    onClick:
      planeConfig.onClick ??
      (planeConfig.onDrag
        ? (showInput, ctx) => {
            const inputAxes =
              planeConfig.inputAxes ??
              pointInputAxesForPlaneNormal(planeConfig.normal, ctx);
            const normalizedInputAxes = normalizePointInputAxes(inputAxes);
            const inputValue = formatPointInput(
              ctx.origin,
              normalizedInputAxes
            );
            showInput(
              inputValue,
              (_value, text) => {
                const point = parsePointInput(
                  text,
                  ctx.origin,
                  normalizedInputAxes
                );
                if (!point) return;
                planeConfig.onDragStart?.(ctx);
                planeConfig.onDrag?.(point.sub(ctx.origin), ctx);
              },
              inputValue
            );
          }
        : undefined)
  };
}

function createConfiguredRotation(
  config: Exclude<SemanticConfiguredRotation, false | undefined>
): SemanticAngleMovePart {
  let startReferenceDir: XYZ | undefined;
  let startNormal: XYZ | undefined;
  const applyRotation = (delta: number, ctx: SemanticHandleContext) => {
    const normal =
      startNormal ?? config.getPlaneNormal?.(ctx) ?? ctx.plane.normal;
    const nextReferenceDir = (
      startReferenceDir ??
      config.getReferenceDir?.(ctx) ??
      ctx.plane.xvec
    ).rotate(normal, (delta * Math.PI) / 180);
    if (nextReferenceDir) {
      config.onDrag?.(new Plane(ctx.origin, normal, nextReferenceDir), ctx);
    }
  };
  const onDragStart = (ctx: SemanticHandleContext) => {
    startReferenceDir = config.getReferenceDir?.(ctx) ?? ctx.plane.xvec;
    startNormal = config.getPlaneNormal?.(ctx) ?? ctx.plane.normal;
  };
  return {
    id: "rotation",
    kind: "angleMove",
    getPivot: ctx => config.getPivot?.(ctx) ?? ctx.origin,
    getPlaneNormal: ctx => config.getPlaneNormal?.(ctx) ?? ctx.plane.normal,
    getReferenceDir: ctx => config.getReferenceDir?.(ctx) ?? ctx.plane.xvec,
    getHandlePosition:
      config.getHandlePosition ??
      ((ctx, scale) =>
        ctx.origin
          .add(ctx.plane.xvec.multiply(scale.angleOuterRadius))
          .add(ctx.plane.yvec.multiply(scale.angleOuterRadius))),
    onDragStart,
    onDrag: applyRotation,
    onClick: config.onDrag
      ? (showInput, ctx) => {
          showInput("0.0", value => {
            onDragStart(ctx);
            applyRotation(value, ctx);
          });
        }
      : undefined,
    visual: {
      startDeg: config.startDeg ?? 0,
      endDeg: config.endDeg ?? 90,
      color: config.color,
      track: false
    }
  };
}

function createConfiguredAngleValue(
  config: SemanticConfiguredAngleValue,
  index: number
): SemanticAngleMovePart {
  let startValue = 0;
  const formatInput = config.formatInput ?? (value => value.toFixed(1));
  const formatLabel = config.formatLabel ?? (value => `${value.toFixed(1)}deg`);
  return {
    id: `angleValue:${index}`,
    kind: "angleMove",
    getPivot: ctx => ctx.origin,
    getPlaneNormal: config.getPlaneNormal,
    getReferenceDir: config.getReferenceDir,
    getHandlePosition: (ctx, scale) =>
      ctx.origin.add(
        config
          .getHandleDirection(ctx)
          .normalize()
          .multiply(scale.angleTrackOuterRadius)
      ),
    onDragStart: ctx => {
      startValue = config.getValue(ctx);
    },
    onDrag: (delta, ctx) => {
      config.setValue(
        clampSemanticValue(startValue + delta, config.min, config.max),
        ctx
      );
    },
    onClick: (showInput, ctx) => {
      showInput(formatInput(config.getValue(ctx)), value => {
        config.setValue(clampSemanticValue(value, config.min, config.max), ctx);
      });
    },
    formatLabel: delta =>
      formatLabel(
        clampSemanticValue(startValue + delta, config.min, config.max)
      ),
    visual: {
      startDeg: config.startDeg ?? config.min ?? 0,
      endDeg: config.endDeg ?? config.max ?? 90,
      color: config.color,
      track: config.track ?? true,
      guide: config.guide ?? true
    }
  };
}

export function createSemanticHandleToolConfig(
  config: SemanticConfiguredHandleToolConfig = {}
): SemanticHandleToolConfig {
  const parts: SemanticHandlePart[] = [];
  const pointMove = config.pointMove ?? {};
  const axisMoves = config.axisMoves ?? ["X", "Y", "Z"];
  const planeMoves = config.planeMoves ?? ["X", "Y", "Z"];
  const rotation = config.rotation ?? {};

  if (pointMove !== false) {
    parts.push(createConfiguredPointMove(pointMove, config));
  }
  if (axisMoves !== false) {
    parts.push(
      ...axisMoves.map((axisMove, index) =>
        createConfiguredAxisMove(axisMove, index, config)
      )
    );
  }
  if (planeMoves !== false) {
    parts.push(
      ...planeMoves.map((planeMove, index) =>
        createConfiguredPlaneMove(planeMove, index)
      )
    );
  }
  if (rotation !== false) parts.push(createConfiguredRotation(rotation));
  parts.push(
    ...(config.angleValues ?? []).map((angleValue, index) =>
      createConfiguredAngleValue(angleValue, index)
    )
  );

  return {
    parts,
    size: config.size,
    theme: config.theme,
    snapProfile: config.snapProfile,
    dragGhost: config.dragGhost,
    onDragActiveChange: config.onDragActiveChange,
    onDragEnd: config.onDragEnd,
    onDragFrame: config.onDragFrame
  };
}

export class SemanticHandleTool implements IEventHandler {
  isEnabled = true;
  lastView?: ThreeView;

  private _disposed = false;
  private _target?: SemanticHandleTarget;
  private _overlayView?: ThreeView;
  private readonly _overlayRoot = new Group();
  private _overlayRootId?: number;
  private _detachForegroundOverlay?: () => void;
  private _handleObjects: HandleObjectSlot[] = [];
  private _hoveredPartId: string | null = null;
  private _dragPartId: string | null = null;
  private _dragState: DragState | null = null;
  private _clickStart: { x: number; y: number } | null = null;
  private _isClick = false;
  private _inputEl: HTMLInputElement | null = null;
  private _inputPartId: string | null = null;
  private _pendingDrag?: { view: IView; event: PointerEvent };
  private _dragFrameScheduled = false;
  private _dragActiveNotified = false;
  private _handleScaleBaseAxisLen?: number;
  private readonly _size: SemanticHandleSizeConfig;
  private readonly _theme: SemanticHandleTheme;
  private readonly _scaleOnlyTranslateToAnchorMatrix = new ThreeMatrix4();
  private readonly _scaleOnlyScaleMatrix = new ThreeMatrix4();
  private readonly _scaleOnlyTranslateBackMatrix = new ThreeMatrix4();
  private readonly _viewUpdater = (view: IView) => {
    if (this._disposed) return;
    this.lastView = this._asThreeView(view);
    this._refreshHandleScaleOnly(view);
  };

  constructor(
    private readonly document: IDocument,
    private readonly controller: AsyncController,
    private readonly config: SemanticHandleToolConfig,
    view?: ThreeView
  ) {
    this._size = { ...DEFAULT_SIZE, ...config.size };
    this._theme = { ...DEFAULT_THEME, ...config.theme };
    this.lastView = view;
    this._overlayRoot.add(new AmbientLight(0xffffff, 4));
    this._overlayRoot.matrixAutoUpdate = false;
    this._overlayRootId = this.document.visual.context.displayObject(
      this._overlayRoot
    );
    (this.document.visual as any)?.registerViewUpdater?.(this._viewUpdater);
  }

  attach(target: SemanticHandleTarget): void {
    this._target = target;
    this.refreshPreview();
  }

  detach(): void {
    this._notifyDragActiveChange(false);
    this._disposePointSnap();
    this._target = undefined;
    this._dragState = null;
    this._dragPartId = null;
    this._hoveredPartId = null;
    this._clearHandleObjects();
    this.document.visual.update();
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this._notifyDragActiveChange(false);
    this._disposePointSnap();
    this._detachOverlayFromView();
    (this.document.visual as any)?.unregisterViewUpdater?.(this._viewUpdater);
    this._clearHandleObjects();
    if (this._overlayRootId !== undefined) {
      this.document.visual.context.removeMesh(this._overlayRootId);
      this._overlayRootId = undefined;
    }
    this._dismissInputOverlay();
    this.document.visual.update();
  }

  refreshPreview(): void {
    if (this._disposed) return;
    this._refreshView();
  }

  static pickTool(
    tools: readonly SemanticHandleTool[],
    view: IView,
    event: PointerEvent
  ): SemanticHandleToolPick | undefined {
    return tools
      .map(tool => {
        const pick = tool.pick(view, event);
        return pick ? { tool, pick } : undefined;
      })
      .filter((item): item is SemanticHandleToolPick => item !== undefined)
      .sort((left, right) => left.pick.distancePx - right.pick.distancePx)[0];
  }

  hitTest(view: IView, event: PointerEvent): boolean {
    return this.pick(view, event) !== undefined;
  }

  pick(view: IView, event: PointerEvent): SemanticHandlePick | undefined {
    if (this._disposed || !this._target || !this.isEnabled) return undefined;
    return this._findNearestPart(view, event) ?? undefined;
  }

  clearHover(): void {
    if (!this._hoveredPartId) return;
    this._hoveredPartId = null;
    this._refreshView();
  }

  pointerMove(view: IView, event: PointerEvent): void {
    if (this._disposed || !this._target || !this.isEnabled) return;
    this._setLastView(view);

    if (this._dragPartId && this._dragState) {
      event.preventDefault();
      if (this._isClick && this._clickStart) {
        const dist = Math.hypot(
          event.offsetX - this._clickStart.x,
          event.offsetY - this._clickStart.y
        );
        if (dist > CLICK_TOLERANCE_PX) {
          this._isClick = false;
          this._clickStart = null;
          if (this._dragState.kind === "pointMove") {
            const ctx = this._ctx();
            if (ctx) this._dragState.part.onDragStart?.(ctx);
          }
          this._notifyDragActiveChange(true);
        }
      }

      if (!this._isClick) {
        this._queueDragFrame(view, event);
      }
      return;
    }

    const hovered = this.pick(view, event)?.partId ?? null;
    if (hovered !== this._hoveredPartId) {
      this._hoveredPartId = hovered;
      this._refreshView();
    }
  }

  pointerDown(view: IView, event: PointerEvent): void {
    if (this._inputEl) {
      this._dismissInputOverlay();
    }
    if (
      this._disposed ||
      !this._target ||
      !this.isEnabled ||
      event.button !== 0
    )
      return;
    this._setLastView(view);
    const partId = this.pick(view, event)?.partId;
    if (!partId) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    this._dragPartId = partId;
    this._clickStart = { x: event.offsetX, y: event.offsetY };
    this._isClick = true;
    this._dragState = this._buildDragState(view, event, partId);
    if (!this._dragState) {
      this._dragPartId = null;
      this._clickStart = null;
      this._isClick = false;
      return;
    }
    this._refreshView();
  }

  pointerUp(view: IView, event: PointerEvent): void {
    if (event.button !== 0) return;
    this._setLastView(view);
    const hadActiveHandle = Boolean(this._dragPartId);
    if (hadActiveHandle) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    if (this._isClick && this._dragPartId) {
      this._handleClick(view, this._dragPartId);
    }
    this._pendingDrag = undefined;
    this._dragFrameScheduled = false;
    if (this._dragPartId && !this._isClick) {
      this.config.onDragEnd?.(this._dragPartId);
    }
    this._notifyDragActiveChange(false);
    this._disposePointSnap();
    this._dragPartId = null;
    this._dragState = null;
    this._clickStart = null;
    this._isClick = false;
    this._refreshView();
  }

  pointerOut(view: IView, _event: PointerEvent): void {
    this._setLastView(view);
    this._hoveredPartId = null;
    this._refreshView();
  }

  mouseWheel(view: IView, _event: WheelEvent): void {
    this._setLastView(view);
    this._refreshHandleScaleOnly(view);
  }

  keyDown(_view: IView, event: KeyboardEvent): void {
    if (event.key === "Enter") {
      this.controller.success();
      event.stopImmediatePropagation();
    } else if (event.key === "Escape") {
      this.controller.cancel();
    }
  }

  private _ctx(): SemanticHandleContext | undefined {
    if (!this._target) return undefined;
    return {
      target: this._target,
      origin: this._target.getOrigin(),
      plane: this._target.getPlane()
    };
  }

  private _queueDragFrame(view: IView, event: PointerEvent): void {
    this._pendingDrag = { view, event };
    if (this._dragFrameScheduled) return;
    this._dragFrameScheduled = true;
    requestAnimationFrame(() => this._processDragFrame());
  }

  private _processDragFrame(): void {
    this._dragFrameScheduled = false;
    if (this._disposed) return;
    const pending = this._pendingDrag;
    this._pendingDrag = undefined;
    if (!pending || !this._dragPartId || !this._dragState) return;

    this._applyDrag(pending.view, pending.event);
    this._ensureTargetDragGhost();
    this.config.onDragFrame?.(this._dragPartId);
    this._ensureTargetDragGhost();
    this._refreshView();
  }

  private _disposePointSnap(): void {
    if (this._dragState?.kind !== "pointMove") return;
    this._dragState.snapController?.cancel();
  }

  private _notifyDragActiveChange(active: boolean): void {
    if (!this._dragPartId) return;
    if (this._dragActiveNotified === active) return;
    this._dragActiveNotified = active;
    if (active) this._beginTargetDragGhost();
    else this._setTargetDragGhost(false);
    this.config.onDragActiveChange?.(active, this._dragPartId);
  }

  private _setTargetDragGhost(active: boolean): void {
    if (!this.config.dragGhost) return;
    const node = this._target?.getDragGhostNode?.();
    if (!node) return;
    setSemanticHandleDragGhost(this.document, node, active);
  }

  private _beginTargetDragGhost(): void {
    if (!this.config.dragGhost) return;
    const node = this._target?.getDragGhostNode?.();
    if (!node) return;
    beginSemanticHandleDragGhost(this.document, node);
  }

  private _ensureTargetDragGhost(): void {
    if (!this._dragActiveNotified) return;
    this._setTargetDragGhost(true);
  }

  private _setLastView(view: IView): void {
    const nextView = this._asThreeView(view);
    this.lastView = nextView;
    this._attachOverlayToView(nextView);
  }

  private _refreshView(): void {
    this._resetOverlayScale();
    this._clearHandleObjects();
    this._handleObjects = this._buildHandles();
    const ctx = this._ctx();
    const view = this.lastView ?? this.document.application.activeView;
    this._handleScaleBaseAxisLen =
      ctx && view ? this._scale(view, ctx.origin).axisLen : undefined;
    this._attachOverlayToView(this.lastView, true);
    this.document.visual.update();
  }

  private _refreshHandleScaleOnly(view: IView): void {
    const ctx = this._ctx();
    const baseAxisLen = this._handleScaleBaseAxisLen;
    if (!ctx || !baseAxisLen || baseAxisLen <= 0) {
      this._refreshView();
      return;
    }

    const nextAxisLen = this._scale(view, ctx.origin).axisLen;
    if (!Number.isFinite(nextAxisLen) || nextAxisLen <= 0) return;

    const scale = nextAxisLen / baseAxisLen;
    this._handleObjects.forEach(slot => {
      const anchor = slot.anchor;
      slot.object.matrix
        .copy(
          this._scaleOnlyTranslateToAnchorMatrix.makeTranslation(
            anchor.x,
            anchor.y,
            anchor.z
          )
        )
        .multiply(this._scaleOnlyScaleMatrix.makeScale(scale, scale, scale))
        .multiply(
          this._scaleOnlyTranslateBackMatrix.makeTranslation(
            -anchor.x,
            -anchor.y,
            -anchor.z
          )
        );
      slot.object.matrixWorldNeedsUpdate = true;
    });
    this.document.visual.update();
  }

  private _resetOverlayScale(): void {
    this._overlayRoot.matrix.identity();
    this._overlayRoot.matrixWorldNeedsUpdate = true;
    this._handleObjects.forEach(slot => {
      slot.object.matrix.identity();
      slot.object.matrixWorldNeedsUpdate = true;
    });
  }

  private _attachOverlayToView(view?: ThreeView, force = false): void {
    if (!force && this._overlayView === view) return;
    this._detachOverlayFromView();
    this._overlayView = view;
    if (!view) return;
    this._detachForegroundOverlay = applyForegroundOverlay(
      view,
      this._overlayRoot
    );
    this._overlayRoot.userData.detachOcclusionOverlay =
      this._detachForegroundOverlay;
  }

  private _detachOverlayFromView(): void {
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

  private _clearHandleObjects(): void {
    this._handleObjects.forEach(slot => {
      this._overlayRoot.remove(slot.object);
      slot.object.traverse(child => {
        (child as any).geometry?.dispose?.();
      });
    });
    this._handleObjects.length = 0;
  }

  private _createOverlayGroup(
    meshes: Array<EdgeMeshData | FaceMeshData>,
    anchor: XYZ
  ): HandleObjectSlot {
    const group = new Group();
    group.matrixAutoUpdate = false;
    meshes.forEach(mesh => {
      const object = MeshDataUtils.isEdgeMesh(mesh)
        ? ThreeGeometryFactory.createEdgeGeometry(mesh)
        : ThreeGeometryFactory.createFaceGeometry(mesh, 1, false);
      group.add(object);
    });
    this._overlayRoot.add(group);
    return { object: group, anchor };
  }

  private _createOverlayObjectGroup(
    objects: Object3D[],
    anchor: XYZ
  ): HandleObjectSlot {
    const group = new Group();
    group.matrixAutoUpdate = false;
    objects.forEach(object => group.add(object));
    this._overlayRoot.add(group);
    return { object: group, anchor };
  }

  private _scale(view: IView, origin: XYZ) {
    return resolveScale(view, origin, this._size);
  }

  private _buildHandles(): HandleObjectSlot[] {
    const ctx = this._ctx();
    const view = this.lastView ?? this.document.application.activeView;
    if (!ctx || !view) return [];
    const scale = this._scale(view, ctx.origin);
    const objects: HandleObjectSlot[] = [];
    const viewBasis = this._viewBasis(view, ctx);

    for (const part of enabledParts(this.config.parts)) {
      const color = this._partColor(part);
      let partSlots: HandleObjectSlot[] = [];
      if (part.kind === "pointMove") {
        const position = part.getPosition?.(ctx) ?? ctx.origin;
        const fill = circleFillObject(
          position,
          viewBasis.x,
          viewBasis.y,
          scale.originRadius * 0.7,
          this._theme
        );
        fill.renderOrder = this._theme.topRenderOrder;
        const ring = ThreeGeometryFactory.createEdgeGeometry(
          circleMesh(
            position,
            viewBasis.x,
            viewBasis.y,
            scale.originRadius,
            color,
            1
          )
        );
        ring.renderOrder = this._theme.topRenderOrder + 1;
        partSlots = [this._createOverlayObjectGroup([fill, ring], position)];
      } else if (part.kind === "axisMove") {
        partSlots = this._buildAxisPart(part, ctx, scale, color);
      } else if (part.kind === "planeMove") {
        partSlots = this._buildPlanePart(part, ctx, scale, color);
      } else if (part.kind === "angleMove") {
        partSlots = this._buildAnglePart(part, ctx, viewBasis, scale, color);
      }

      objects.push(...partSlots);
    }

    return objects;
  }

  private _partColor(part: SemanticHandlePart): number {
    if (this._isPartActive(part.id)) return this._theme.activeColor;
    if (part.kind === "axisMove" || part.kind === "angleMove") {
      return part.visual?.color ?? this._theme.idleColor;
    }
    return this._theme.idleColor;
  }

  private _buildAxisPart(
    part: SemanticAxisMovePart,
    ctx: SemanticHandleContext,
    scale: SemanticHandleScale,
    color: number
  ): HandleObjectSlot[] {
    const base = part.getHandlePosition(ctx);
    const dir = part.getDirection(ctx).normalize();
    if (dir.lengthSq() < 1e-8) return [];
    const arrow = part.visual?.arrow ?? true;
    const guideFromOrigin = part.visual?.guideFromOrigin ?? false;
    const result: HandleObjectSlot[] = [];
    if (arrow) {
      const tip = base.add(dir.multiply(scale.axisLen));
      const line = MeshDataUtils.createEdgeMesh(base, tip, color, "solid", 1);
      const arrowMesh = createSemanticArrowMesh({
        baseCenter: tip,
        dir,
        sideHint: ctx.plane.normal,
        coneHeight: scale.arrowConeHeight,
        coneRadius: scale.arrowConeRadius,
        stemHeight: scale.arrowStemHeight,
        stemRadius: scale.arrowStemRadius,
        color
      });
      result.push(
        this._createOverlayObjectGroup(
          [
            ThreeGeometryFactory.createEdgeGeometry(line),
            solidFaceObject(arrowMesh, color, this._theme)
          ],
          base
        )
      );
    } else {
      const guide = MeshDataUtils.createEdgeMesh(
        guideFromOrigin ? ctx.origin : base,
        base,
        color,
        "dash",
        1
      );
      result.push(
        this._createOverlayGroup(
          [
            guide,
            circleMesh(
              base,
              ctx.plane.xvec,
              ctx.plane.yvec,
              scale.valueHandleRadius,
              color
            )
          ],
          base
        )
      );
    }
    return result;
  }

  private _buildPlanePart(
    part: SemanticPlaneMovePart,
    ctx: SemanticHandleContext,
    scale: SemanticHandleScale,
    color: number
  ): HandleObjectSlot[] {
    const center = part.getHandlePosition(ctx, scale);
    const basis = part.getBasis?.(ctx) ?? {
      dir0: ctx.plane.xvec,
      dir90: ctx.plane.yvec
    };
    return [
      this._createOverlayGroup(
        [
          circleMesh(
            center,
            basis.dir0,
            basis.dir90,
            scale.planeMoveCircleRadius,
            color,
            1
          ),
          ...this._planeMoveArcMeshes(
            center,
            basis.dir0,
            basis.dir90,
            scale.planeMoveArcRadius,
            color
          )
        ],
        ctx.origin
      )
    ];
  }

  private _buildAnglePart(
    part: SemanticAngleMovePart,
    ctx: SemanticHandleContext,
    viewBasis: { x: XYZ; y: XYZ },
    scale: SemanticHandleScale,
    color: number
  ): HandleObjectSlot[] {
    const pivot = part.getPivot(ctx);
    const normal = part.getPlaneNormal(ctx).normalize();
    const dir0 = part.getReferenceDir(ctx).normalize();
    const dir90 = normal.cross(dir0).normalize();
    if (
      normal.lengthSq() < 1e-8 ||
      dir0.lengthSq() < 1e-8 ||
      dir90.lengthSq() < 1e-8
    )
      return [];
    const visual = part.visual ?? { startDeg: 0, endDeg: 90 };
    const isTrack = visual.track ?? false;
    const startDeg = visual.startDeg;
    const endDeg = visual.endDeg;
    const innerRadius = isTrack
      ? scale.angleTrackInnerRadius
      : scale.angleInnerRadius;
    const outerRadius = isTrack
      ? scale.angleTrackOuterRadius
      : scale.angleOuterRadius;
    const trackColor =
      this._isPartActive(part.id) && isTrack
        ? this._theme.activeColor
        : (visual.color ?? color);
    const fill = annularSectorMesh(
      pivot,
      dir0,
      dir90,
      innerRadius,
      outerRadius,
      startDeg,
      endDeg,
      trackColor
    );
    const objects: Object3D[] = [
      translucentFaceObject(fill, trackColor, this._theme),
      ThreeGeometryFactory.createEdgeGeometry(
        arcLineMesh(
          pivot,
          dir0,
          dir90,
          innerRadius,
          startDeg,
          endDeg,
          trackColor
        )
      ),
      ThreeGeometryFactory.createEdgeGeometry(
        arcLineMesh(
          pivot,
          dir0,
          dir90,
          outerRadius,
          startDeg,
          endDeg,
          trackColor
        )
      )
    ];
    if (!isTrack && this._isPartActive(part.id)) {
      objects.push(
        ThreeGeometryFactory.createEdgeGeometry(
          dashedArcLineMesh(
            pivot,
            dir0,
            dir90,
            outerRadius,
            endDeg,
            360,
            trackColor,
            scale.angleArcDashLength,
            scale.angleArcGapLength,
            1
          )
        )
      );
    }
    const result: HandleObjectSlot[] = [
      this._createOverlayObjectGroup(objects, pivot)
    ];

    const marker = part.getHandlePosition(ctx, scale);
    if (visual.guide ?? isTrack) {
      result.push(
        this._createOverlayGroup(
          [
            dashedLineMesh(
              pivot,
              marker,
              this._isPartActive(part.id)
                ? this._theme.activeColor
                : this._theme.idleColor,
              scale.angleGuideDashLength,
              scale.angleGuideGapLength,
              1
            )
          ],
          pivot
        )
      );
    }
    if (isTrack) {
      const fill = circleFillObject(
        marker,
        viewBasis.x,
        viewBasis.y,
        scale.valueHandleRadius * 0.7,
        this._theme
      );
      fill.renderOrder = this._theme.topRenderOrder;
      const ring = ThreeGeometryFactory.createEdgeGeometry(
        circleMesh(
          marker,
          viewBasis.x,
          viewBasis.y,
          scale.valueHandleRadius,
          color
        )
      );
      ring.renderOrder = this._theme.topRenderOrder + 1;
      result.push(this._createOverlayObjectGroup([fill, ring], pivot));
    }
    return result;
  }

  private _planeMoveArcMeshes(
    center: XYZ,
    dir0: XYZ,
    dir90: XYZ,
    radius: number,
    color: number
  ): EdgeMeshData[] {
    const half = 52 / 2;
    return [0, 90, 180, 270].map(degrees =>
      arcLineMesh(
        center,
        dir0,
        dir90,
        radius,
        degrees - half,
        degrees + half,
        color,
        "solid",
        2
      )
    );
  }

  private _viewBasis(view: IView, ctx: SemanticHandleContext) {
    const normal = view.direction().reverse();
    let x = view.direction().cross(view.up()).normalize();
    if (x.lengthSq() < 1e-8) x = ctx.plane.xvec;
    return { x, y: normal.cross(x).normalize() };
  }

  private _findNearestPart(
    view: IView,
    event: PointerEvent
  ): SemanticHandlePick | null {
    const ctx = this._ctx();
    if (!ctx) return null;
    const scale = this._scale(view, ctx.origin);
    const candidates: Array<{ id: string; distancePx: number }> = [];

    for (const part of enabledParts(this.config.parts)) {
      if (part.kind === "pointMove") {
        const position = part.getPosition?.(ctx) ?? ctx.origin;
        candidates.push({
          id: part.id,
          distancePx: screenDistance(
            view,
            event.offsetX,
            event.offsetY,
            position
          )
        });
      } else if (part.kind === "axisMove") {
        const base = part.getHandlePosition(ctx);
        const dir = part.getDirection(ctx).normalize();
        const tip = base.add(dir.multiply(scale.axisLen));
        const mid = base.add(dir.multiply(scale.axisLen * 0.5));
        candidates.push({
          id: part.id,
          distancePx: Math.min(
            screenDistance(view, event.offsetX, event.offsetY, base),
            screenDistance(view, event.offsetX, event.offsetY, mid),
            screenDistance(view, event.offsetX, event.offsetY, tip)
          )
        });
      } else if (part.kind === "planeMove") {
        candidates.push({
          id: part.id,
          distancePx: screenDistance(
            view,
            event.offsetX,
            event.offsetY,
            part.getHandlePosition(ctx, scale)
          )
        });
      } else if (part.kind === "angleMove") {
        const visual = part.visual ?? { startDeg: 0, endDeg: 90 };
        const pivot = part.getPivot(ctx);
        const normal = part.getPlaneNormal(ctx).normalize();
        const dir0 = part.getReferenceDir(ctx).normalize();
        const dir90 = normal.cross(dir0).normalize();
        const marker = part.getHandlePosition(ctx, scale);
        let distancePx = screenDistance(
          view,
          event.offsetX,
          event.offsetY,
          marker
        );
        const radius = visual.track
          ? (scale.angleTrackInnerRadius + scale.angleTrackOuterRadius) * 0.5
          : (scale.angleInnerRadius + scale.angleOuterRadius) * 0.5;
        for (let i = 0; i <= 10; i++) {
          const p = arcPoint(
            pivot,
            dir0,
            dir90,
            radius,
            visual.startDeg + ((visual.endDeg - visual.startDeg) * i) / 10
          );
          distancePx = Math.min(
            distancePx,
            screenDistance(view, event.offsetX, event.offsetY, p)
          );
        }
        candidates.push({ id: part.id, distancePx });
      }
    }

    const best = candidates
      .filter(candidate => candidate.distancePx <= this._theme.hitPixels)
      .sort((left, right) => left.distancePx - right.distancePx)[0];
    return best ? { partId: best.id, distancePx: best.distancePx } : null;
  }

  private _buildDragState(
    view: IView,
    event: PointerEvent,
    partId: string
  ): DragState | null {
    const ctx = this._ctx();
    if (!ctx) return null;
    const part = this.config.parts.find(item => item.id === partId);
    if (!part || part.enabled === false) return null;

    if (part.kind === "pointMove") {
      const startPosition = part.getPosition?.(ctx) ?? ctx.origin;
      const startHit =
        this._pointFallbackHit(view, event, part, ctx, startPosition) ??
        startPosition;
      const snapConfig = part.snap === false ? undefined : (part.snap ?? {});
      if (!snapConfig) {
        return {
          kind: "pointMove",
          part,
          startPosition,
          startHit
        };
      }
      const snapController = new ModelAsyncController();
      const pointData = this._createPointSnapData(part, snapConfig, ctx);
      const app = this.document.application as any;
      const handler = new PointSnapEventHandler(
        this.document,
        snapController,
        pointData,
        app?.getSnapConfigRef?.() ?? createDefaultSnapConfig(),
        this._snapUI()
      );
      this.controller.onCancelled(() => snapController.cancel());
      return {
        kind: "pointMove",
        part,
        startPosition,
        startHit,
        snapController,
        snapHandler: handler
      };
    }

    if (part.kind === "axisMove") {
      part.onDragStart?.(ctx);
      const axisDir = part.getDirection(ctx).normalize();
      const anchor = part.getDragAnchor?.(ctx) ?? part.getHandlePosition(ctx);
      return {
        kind: "axisMove",
        part,
        axisDir,
        anchor,
        startParam:
          rayToAxisParam(view, event.offsetX, event.offsetY, anchor, axisDir) ??
          0
      };
    }

    if (part.kind === "planeMove") {
      part.onDragStart?.(ctx);
      const scale = this._scale(view, ctx.origin);
      const basis = part.getBasis?.(ctx) ?? {
        dir0: ctx.plane.xvec,
        dir90: ctx.plane.yvec
      };
      const dir0 = basis.dir0.normalize();
      const dir90 = basis.dir90.normalize();
      const planeNormal = dir0.cross(dir90).normalize();
      if (
        dir0.lengthSq() < 1e-8 ||
        dir90.lengthSq() < 1e-8 ||
        planeNormal.lengthSq() < 1e-8
      )
        return null;
      const planeOrigin = part.getHandlePosition(ctx, scale);
      const hit =
        rayPlaneIntersect(
          view.rayAt(event.offsetX, event.offsetY).origin,
          view.rayAt(event.offsetX, event.offsetY).direction,
          planeOrigin,
          planeNormal
        ) ?? planeOrigin;
      return {
        kind: "planeMove",
        part,
        startHit: hit,
        planeOrigin,
        planeNormal,
        dir0,
        dir90
      };
    }

    part.onDragStart?.(ctx);
    const planeNormal = part.getPlaneNormal(ctx).normalize();
    const dir0 = part.getReferenceDir(ctx).normalize();
    const dir90 = planeNormal.cross(dir0).normalize();
    const ray = view.rayAt(event.offsetX, event.offsetY);
    const hit = rayPlaneIntersect(
      ray.origin,
      ray.direction,
      part.getPivot(ctx),
      planeNormal
    );
    if (!hit) return null;
    const vec = hit.sub(part.getPivot(ctx));
    return {
      kind: "angleMove",
      part,
      planeNormal,
      dir0,
      dir90,
      startAngleDeg: (Math.atan2(vec.dot(dir90), vec.dot(dir0)) * 180) / Math.PI
    };
  }

  private _createPointSnapData(
    part: SemanticPointMovePart,
    snapConfig: SemanticPointMoveSnapConfig,
    ctx: SemanticHandleContext
  ): PointSnapData {
    const fallback = snapConfig.fallback ?? { type: "viewPlane" };
    const configuredPointData = snapConfig.createPointData?.(ctx);
    const configuredFilter = configuredPointData?.filter;
    const base: PointSnapData = {
      refPoint: () =>
        part.getPosition?.(this._ctx() ?? ctx) ??
        this._ctx()?.origin ??
        ctx.origin,
      dimension: Dimension.D1D2D3,
      profile:
        this.config.snapProfile ?? SEMANTIC_HANDLE_TRANSFORM_SNAP_PROFILE,
      filter: shape => {
        const dragGhostNode = this._target?.getDragGhostNode?.();
        if (dragGhostNode && shape.owner.node === dragGhostNode) return false;
        return configuredFilter ? configuredFilter(shape) : true;
      }
    };
    if (fallback.type === "plane") {
      base.plane = () => fallback.plane(this._ctx() ?? ctx);
    }
    return { ...base, ...configuredPointData, filter: base.filter };
  }

  private _snapUI() {
    const ui = createSnapCommandUI(this.document);
    return ui ? { ...ui, requestInput: undefined } : undefined;
  }

  private _pointFallbackHit(
    view: IView,
    event: PointerEvent,
    part: SemanticPointMovePart,
    ctx: SemanticHandleContext,
    origin: XYZ
  ): XYZ | null {
    const fallback = resolvePointMoveFallback(part);
    const ray = view.rayAt(event.offsetX, event.offsetY);
    if (fallback?.type === "plane") {
      const plane = fallback.plane(ctx);
      return rayPlaneIntersect(
        ray.origin,
        ray.direction,
        plane.origin,
        plane.normal
      );
    }
    return rayPlaneIntersect(
      ray.origin,
      ray.direction,
      origin,
      view.direction().reverse()
    );
  }

  private _applyDrag(view: IView, event: PointerEvent): void {
    const ctx = this._ctx();
    const state = this._dragState;
    if (!ctx || !state) return;

    if (state.kind === "pointMove") {
      const point = this._resolvePointMovePoint(view, event, state);
      if (!point) return;
      state.part.onDrag?.(point, ctx);
      return;
    }

    if (state.kind === "axisMove") {
      const current =
        rayToAxisParam(
          view,
          event.offsetX,
          event.offsetY,
          state.anchor,
          state.axisDir
        ) ?? state.startParam;
      const delta = current - state.startParam;
      state.part.onDrag(delta, ctx);
      return;
    }

    if (state.kind === "planeMove") {
      const ray = view.rayAt(event.offsetX, event.offsetY);
      const hit = rayPlaneIntersect(
        ray.origin,
        ray.direction,
        state.planeOrigin,
        state.planeNormal
      );
      if (!hit) return;
      const rawDelta = hit.sub(state.startHit);
      const delta = state.dir0
        .multiply(rawDelta.dot(state.dir0))
        .add(state.dir90.multiply(rawDelta.dot(state.dir90)));
      const nextCtx = this._ctx() ?? ctx;
      state.part.onDrag?.(delta, nextCtx);
      return;
    }

    const ray = view.rayAt(event.offsetX, event.offsetY);
    const hit = rayPlaneIntersect(
      ray.origin,
      ray.direction,
      state.part.getPivot(ctx),
      state.planeNormal
    );
    if (!hit) return;
    const vec = hit.sub(state.part.getPivot(ctx));
    const currentAngle =
      (Math.atan2(vec.dot(state.dir90), vec.dot(state.dir0)) * 180) / Math.PI;
    const delta = currentAngle - state.startAngleDeg;
    state.part.onDrag(delta, ctx);
  }

  private _resolvePointMovePoint(
    view: IView,
    event: PointerEvent,
    state: Extract<DragState, { kind: "pointMove" }>
  ): XYZ | undefined {
    state.snapHandler?.processHoverFrame(view, event);
    if (state.snapHandler?.snaped?.point) return state.snapHandler.snaped.point;
    const hit = this._pointFallbackHit(
      view,
      event,
      state.part,
      this._ctx()!,
      state.startPosition
    );
    return hit ? state.startPosition.add(hit.sub(state.startHit)) : undefined;
  }

  private _handleClick(view: IView, partId: string): void {
    const ctx = this._ctx();
    const part = this.config.parts.find(item => item.id === partId);
    if (!ctx || !part) return;
    const showInput: SemanticHandleShowInput = (
      placeholder,
      onCommit,
      initialValue
    ) =>
      this._showInputAt(
        partId,
        view,
        this._handleTipPosition(partId),
        placeholder,
        (value, text) => {
          onCommit(value, text);
          this.refreshPreview();
        },
        initialValue
      );
    if (hasClickHandler(part)) {
      part.onClick?.(showInput, ctx);
    }
  }

  private _isPartActive(partId: string): boolean {
    return (
      this._hoveredPartId === partId ||
      this._dragPartId === partId ||
      this._inputPartId === partId
    );
  }

  private _handleTipPosition(partId: string): XYZ {
    const ctx = this._ctx();
    const view = this.lastView ?? this.document.application.activeView;
    if (!ctx || !view) return Plane.XY().origin;
    const scale = this._scale(view, ctx.origin);
    const part = this.config.parts.find(item => item.id === partId);
    if (!part) return ctx.origin;
    if (part.kind === "pointMove") return part.getPosition?.(ctx) ?? ctx.origin;
    if (part.kind === "axisMove") {
      const base = part.getHandlePosition(ctx);
      return part.visual?.arrow === false
        ? base
        : base.add(part.getDirection(ctx).normalize().multiply(scale.axisLen));
    }
    if (part.kind === "planeMove") return part.getHandlePosition(ctx, scale);
    return part.getHandlePosition(ctx, scale);
  }

  private _showInputAt(
    partId: string,
    view: IView,
    worldPos: XYZ,
    placeholder: string,
    onCommit: (value: number, text: string) => void,
    initialValue?: string
  ): void {
    this._dismissInputOverlay();
    const dom = getViewDom(view);
    if (!dom) return;
    const sp = view.worldToScreen(worldPos);
    const rect = dom.getBoundingClientRect();
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = placeholder;
    if (initialValue !== undefined) input.value = initialValue;
    Object.assign(input.style, {
      position: "fixed",
      left: `${rect.left + sp.x + 14}px`,
      top: `${rect.top + sp.y - 12}px`,
      minWidth: "88px",
      maxWidth: "320px",
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
    const coordinateInput = /[,=\[\]xyzXYZ]/.test(
      `${placeholder}${initialValue ?? ""}`
    );
    const refreshInputWidth = () => {
      const text = input.value || input.placeholder || "";
      const charCount = Math.max(text.length, 6);
      const width = Math.min(Math.max(charCount * 8 + 28, 88), 320);
      input.style.width = `${width}px`;
      const left = Math.min(
        rect.left + sp.x + 14,
        window.innerWidth - width - 8
      );
      input.style.left = `${Math.max(8, left)}px`;
    };
    const commit = (() => {
      let done = false;
      return () => {
        if (done) return;
        done = true;
        normalizeInputText();
        const value = Number.parseFloat(input.value);
        if (!Number.isNaN(value) || input.value.includes(",")) {
          onCommit(value, input.value);
        }
        this._dismissInputOverlay();
      };
    })();
    const normalizeInputText = () => {
      const raw = input.value;
      const selectionStart = input.selectionStart;
      const selectionEnd = input.selectionEnd;
      const next = normalizeSemanticInputText(raw, coordinateInput);
      if (next === raw) return;
      input.value = next;
      if (selectionStart !== null && selectionEnd !== null) {
        input.setSelectionRange(
          normalizeSemanticInputText(
            raw.slice(0, selectionStart),
            coordinateInput
          ).length,
          normalizeSemanticInputText(
            raw.slice(0, selectionEnd),
            coordinateInput
          ).length
        );
      }
      refreshInputWidth();
    };
    input.addEventListener("input", () => {
      normalizeInputText();
      refreshInputWidth();
    });
    input.addEventListener("keydown", event => {
      event.stopImmediatePropagation();
      if (event.key === "Enter") commit();
      else if (event.key === "Escape") this._dismissInputOverlay();
    });
    input.addEventListener("pointerdown", event => {
      event.stopImmediatePropagation();
    });
    input.addEventListener("pointerup", event => {
      event.stopImmediatePropagation();
    });
    input.addEventListener("pointermove", event => {
      event.stopImmediatePropagation();
    });
    input.addEventListener("blur", () => this._dismissInputOverlay());
    document.body.appendChild(input);
    this._inputEl = input;
    this._inputPartId = partId;
    refreshInputWidth();
    this._refreshView();
    requestAnimationFrame(() => {
      input.focus();
      if (initialValue !== undefined) input.select();
    });
  }

  private _dismissInputOverlay(): void {
    if (!this._inputEl) return;
    const el = this._inputEl;
    this._inputEl = null;
    this._inputPartId = null;
    el.remove();
    this._refreshView();
  }
}
