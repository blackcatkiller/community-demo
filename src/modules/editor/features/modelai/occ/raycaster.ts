// @ts-nocheck
import { gc, type XYZ } from "@modelai/core";
import { toXYZ } from "./helper";
import type { OccEdge, OccFace } from "./shape";

function getRaycaster(): any {
  return (wasm as any).Raycaster;
}

/**
 * Result returned by the OCC raycaster.
 *
 * - `distance`: distance from the ray origin to the hit point
 * - `parameter`: ray parameter `t` where `point = origin + t * direction`
 */
export interface RaycastResult {
  /** Whether the ray hit the target. */
  hit: boolean;
  /** Hit point coordinates. */
  point: XYZ;
  /** Distance from the origin to the hit point. */
  distance: number;
  /** Ray parameter `t` where `point = origin + t * direction`. */
  parameter: number;
}

/**
 * Thin wrapper around the WASM raycaster.
 *
 * Note: `direction` should ideally be normalized so `distance` and `parameter`
 * stay intuitive.
 */
export class OccRaycaster {
  /**
   * Raycast against an edge using the topological method.
   *
   * This path is accurate and preferred for precise snapping.
   */
  static raycastEdge(
    edge: OccEdge,
    origin: XYZ,
    direction: XYZ
  ): XYZ | undefined {
    return gc(_c => {
      const result = getRaycaster().raycastEdge(
        edge.shape,
        { x: origin.x, y: origin.y, z: origin.z },
        { x: direction.x, y: direction.y, z: direction.z }
      );

      if (result.hit) return toXYZ(result.point);
      return undefined;
    });
  }

  /**
   * Raycast against a face using the topological method.
   *
   * This path is accurate and preferred for precise snapping.
   */
  static raycastFace(
    face: OccFace,
    origin: XYZ,
    direction: XYZ
  ): XYZ | undefined {
    return gc(_c => {
      const result = getRaycaster().raycastFace(
        face.shape,
        { x: origin.x, y: origin.y, z: origin.z },
        { x: direction.x, y: direction.y, z: direction.z }
      );

      if (result.hit) return toXYZ(result.point);
      return undefined;
    });
  }

  /**
   * Raycast against a face using the geometric method.
   *
   * Use this as a fallback when the topological path is unavailable or unstable.
   */
  static raycastFaceGeom(
    face: OccFace,
    origin: XYZ,
    direction: XYZ
  ): XYZ | undefined {
    return gc(_c => {
      const result = getRaycaster().raycastFaceGeom(
        face.shape,
        { x: origin.x, y: origin.y, z: origin.z },
        { x: direction.x, y: direction.y, z: direction.z }
      );

      if (result.hit) return toXYZ(result.point);
      return undefined;
    });
  }

  /** Raycast against an edge and return the full result payload. */
  static raycastEdgeFull(
    edge: OccEdge,
    origin: XYZ,
    direction: XYZ
  ): RaycastResult | undefined {
    return gc(_c => {
      const result = getRaycaster().raycastEdge(
        edge.shape,
        { x: origin.x, y: origin.y, z: origin.z },
        { x: direction.x, y: direction.y, z: direction.z }
      );

      if (result.hit) {
        return {
          hit: true,
          point: toXYZ(result.point),
          distance: result.distance,
          parameter: result.parameter
        };
      }
      return undefined;
    });
  }

  /** Raycast against a face and return the full result payload. */
  static raycastFaceFull(
    face: OccFace,
    origin: XYZ,
    direction: XYZ
  ): RaycastResult | undefined {
    return gc(_c => {
      const result = getRaycaster().raycastFace(
        face.shape,
        { x: origin.x, y: origin.y, z: origin.z },
        { x: direction.x, y: direction.y, z: direction.z }
      );

      if (result.hit) {
        return {
          hit: true,
          point: toXYZ(result.point),
          distance: result.distance,
          parameter: result.parameter
        };
      }
      return undefined;
    });
  }
}
