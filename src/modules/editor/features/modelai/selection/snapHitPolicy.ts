// @ts-nocheck
import type { IView, VisualShapeData } from "@modelai/core/types";
import { ShapeType } from "@modelai/core/types";
import type { XYZ } from "@modelai/core/math";
import { OccEdge, OccFace, OccRaycaster } from "@modelai/occ";

export interface SnapRay {
  origin: XYZ;
  direction: XYZ;
}

export interface FaceOverrideTarget {
  point?: XYZ;
  info?: string;
  shapes?: VisualShapeData[];
}

export function findFirstFaceHit(
  shapes: VisualShapeData[]
): VisualShapeData | undefined {
  return shapes.find(
    shape =>
      !shape.guide &&
      shape.shape.shapeType === ShapeType.Face &&
      shape.point !== undefined
  );
}

export function selectPrimarySnapHit(
  view: IView,
  mx: number,
  my: number,
  detected: VisualShapeData[]
): VisualShapeData | undefined {
  const featureHit = detected.find(
    shape =>
      (shape.shape.shapeType === ShapeType.Edge ||
        shape.shape.shapeType === ShapeType.Vertex) &&
      shape.point !== undefined
  );
  const faceHit = findFirstFaceHit(detected);

  if (!featureHit) return faceHit;
  if (!faceHit?.point || !featureHit.point) return featureHit;

  const ray = view.rayAt(mx, my);
  const featureDepth = depthAlongRay(
    ray.origin,
    ray.direction,
    featureHit.point
  );
  const faceDepth = depthAlongRay(ray.origin, ray.direction, faceHit.point);

  if (featureDepth <= 0) return faceHit;
  if (faceDepth <= 0) return featureHit;

  // Keep feature picks easy near silhouettes, but don't let them win through
  // a visibly closer face.
  const epsilon = Math.max(1e-4, faceDepth * 1e-3);
  return faceDepth + epsilon < featureDepth ? faceHit : featureHit;
}

export function shouldFaceOverrideSnapPoint(
  view: IView,
  mx: number,
  my: number,
  faceHit: VisualShapeData | undefined,
  target: FaceOverrideTarget | undefined
): boolean {
  const point = resolveFaceOverrideDepthPoint(target);
  if (!faceHit?.point || !point) return false;

  const ray = view.rayAt(mx, my);
  const pointDepth = depthAlongRay(ray.origin, ray.direction, point);
  const faceDepth = depthAlongRay(ray.origin, ray.direction, faceHit.point);

  if (pointDepth <= 0) return false;
  if (faceDepth <= 0) return false;

  const epsilon = Math.max(1e-4, faceDepth * 1e-3);
  return faceDepth + epsilon < pointDepth;
}

export function isFeatureTargetOccludedByFace(
  view: IView,
  mx: number,
  my: number,
  faceHit: VisualShapeData | undefined,
  target: FaceOverrideTarget | undefined
): boolean {
  if (!target?.point) return false;
  if (target.shapes?.some(shape => shape.guide)) return false;
  if (target.shapes?.some(shape => shape.shape.shapeType === ShapeType.Face)) {
    return false;
  }
  const point = resolveFaceOverrideDepthPoint(target);
  if (!faceHit?.point || !point) return false;

  const ray = view.rayAt(mx, my);
  const pointDepth = depthAlongRay(ray.origin, ray.direction, point);
  const faceDepth = depthAlongRay(ray.origin, ray.direction, faceHit.point);

  if (pointDepth <= 0) return false;
  if (faceDepth <= 0) return false;

  const epsilon = Math.max(1e-5, faceDepth * 1e-5);
  return faceDepth + epsilon < pointDepth;
}

export function preciseSnapPointForRay(
  hit: VisualShapeData,
  ray: SnapRay
): XYZ | undefined {
  const raycaster = (globalThis as { wasm?: { Raycaster?: unknown } }).wasm
    ?.Raycaster as
    | {
        raycastEdge?: unknown;
        raycastFace?: unknown;
      }
    | undefined;

  try {
    if (
      hit.shape instanceof OccEdge &&
      typeof raycaster?.raycastEdge === "function"
    ) {
      return OccRaycaster.raycastEdge(hit.shape, ray.origin, ray.direction);
    }
    if (
      hit.shape instanceof OccFace &&
      typeof raycaster?.raycastFace === "function"
    ) {
      return OccRaycaster.raycastFace(hit.shape, ray.origin, ray.direction);
    }
  } catch {
    // Fall back to the coarse hit point when the OCC raycaster is unavailable
    // or fails for a specific shape.
  }
  return hit.point;
}

function depthAlongRay(origin: XYZ, direction: XYZ, point: XYZ): number {
  return point.sub(origin).dot(direction);
}

function resolveFaceOverrideDepthPoint(
  target: FaceOverrideTarget | undefined
): XYZ | undefined {
  if (target?.info === "center") {
    const sourceHitPoint = target.shapes?.find(
      shape =>
        shape.shape.shapeType === ShapeType.Edge && shape.point !== undefined
    )?.point;
    if (sourceHitPoint) {
      return sourceHitPoint;
    }
  }
  return target?.point;
}
