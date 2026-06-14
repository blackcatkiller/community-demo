// @ts-nocheck
/**
 * Per-range AABB cache for sub-shape rectangle selection.
 *
 * Strategy
 * For every sub-shape range we store a tight 3-D axis-aligned bounding box in
 * local geometry space (minX/Y/Z, maxX/Y/Z).  The cache is a WeakMap keyed on
 * the mesh-data object (`EdgeMeshData | FaceMeshData | VertexMeshData`), so it
 * is automatically invalidated whenever the geometry rebuilds and replaces those
 * arrays.
 *
 * 3-way NDC sieve (per range, called from detectShapesRect)
 * Given the MVP matrix and the NDC selection rectangle we project the 8 corners
 * of the AABB and compute their NDC envelope:
 *
 *   REJECT     - NDC envelope does not overlap selection rect          -> O(8)
 *   ACCEPT     - all 8 corners individually inside the selection rect  -> O(8)
 *               (valid because perspective projection preserves convexity)
 *   PER-VERTEX - otherwise fall through to the full vertex-by-vertex test
 */

import type {
  EdgeMeshData,
  FaceMeshData,
  ShapeMeshRange,
  VertexMeshData
} from "@modelai/core/types";
import { type Matrix4, Vector3 } from "three";

/** [minX, minY, minZ, maxX, maxY, maxZ] in local geometry space */
export type Aabb = [number, number, number, number, number, number];

/** Result of the 3-way AABB sieve */
export const enum AabbResult {
  Reject = 0, // no vertex can be inside -> skip range
  Accept = 1, // all vertices are guaranteed inside -> accept without per-vertex test
  PerVertex = 2 // uncertain -> full per-vertex test required
}

function computeDirectAabb(
  positions: Float32Array,
  start: number,
  count: number
): Aabb {
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  const end = start + count;
  for (let i = start; i < end; i++) {
    const x = positions[i * 3],
      y = positions[i * 3 + 1],
      z = positions[i * 3 + 2];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return [minX, minY, minZ, maxX, maxY, maxZ];
}

function computeFaceAabb(
  positions: Float32Array,
  indices: Uint32Array,
  start: number,
  count: number
): Aabb {
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  const end = start + count;
  for (let i = start; i < end; i++) {
    const vi = indices[i];
    const x = positions[vi * 3],
      y = positions[vi * 3 + 1],
      z = positions[vi * 3 + 2];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return [minX, minY, minZ, maxX, maxY, maxZ];
}

function buildAabbs(
  ranges: ShapeMeshRange[],
  positions: Float32Array,
  indices?: Uint32Array
): Aabb[] {
  return ranges.map(g =>
    indices
      ? computeFaceAabb(positions, indices, g.start, g.count)
      : computeDirectAabb(positions, g.start, g.count)
  );
}

type MeshKey = EdgeMeshData | FaceMeshData | VertexMeshData;
const _cache = new WeakMap<MeshKey, Aabb[]>();

export function getAabbs(meshData: EdgeMeshData, _index?: undefined): Aabb[];
export function getAabbs(meshData: FaceMeshData, index: Uint32Array): Aabb[];
export function getAabbs(meshData: VertexMeshData, _index?: undefined): Aabb[];
export function getAabbs(meshData: MeshKey, index?: Uint32Array): Aabb[] {
  let cached = _cache.get(meshData);
  if (!cached) {
    cached = buildAabbs(meshData.range, meshData.position, index);
    _cache.set(meshData, cached);
  }
  return cached;
}

// Reusable Vector3 (caller must not use this across async boundaries)
const _pt = new Vector3();

const _CORNERS_OFFSETS: [0 | 1, 0 | 1, 0 | 1][] = [
  [0, 0, 0],
  [1, 0, 0],
  [0, 1, 0],
  [1, 1, 0],
  [0, 0, 1],
  [1, 0, 1],
  [0, 1, 1],
  [1, 1, 1]
];

/**
 * Project the 8 AABB corners with `mvp` and classify the range.
 *
 * @param aabb   Local-space AABB for the range
 * @param mvp    Model-View-Projection matrix for the geometry
 * @param ndc    Selection rectangle in NDC space [minX, maxX, minY, maxY]
 */
export function classifyAabb(
  aabb: Aabb,
  mvp: Matrix4,
  ndc: [number, number, number, number] // [minX, maxX, minY, maxY]
): AabbResult {
  const [minX, minY, minZ, maxX, maxY, maxZ] = aabb;
  const [ndcMinX, ndcMaxX, ndcMinY, ndcMaxY] = ndc;

  // NDC envelope of all 8 projected corners
  let envMinX = Infinity,
    envMaxX = -Infinity;
  let envMinY = Infinity,
    envMaxY = -Infinity;
  let allInside = true;

  const xs: [number, number] = [minX, maxX];
  const ys: [number, number] = [minY, maxY];
  const zs: [number, number] = [minZ, maxZ];

  for (const [ix, iy, iz] of _CORNERS_OFFSETS) {
    _pt.set(xs[ix], ys[iy], zs[iz]).applyMatrix4(mvp);

    if (_pt.x < envMinX) envMinX = _pt.x;
    if (_pt.x > envMaxX) envMaxX = _pt.x;
    if (_pt.y < envMinY) envMinY = _pt.y;
    if (_pt.y > envMaxY) envMaxY = _pt.y;

    if (
      _pt.x < ndcMinX ||
      _pt.x > ndcMaxX ||
      _pt.y < ndcMinY ||
      _pt.y > ndcMaxY ||
      _pt.z < -1 ||
      _pt.z > 1
    ) {
      allInside = false;
      // Don't break: we still need the envelope for the reject test
    }
  }

  // Reject: NDC envelope has no overlap with selection rect
  if (
    envMaxX < ndcMinX ||
    envMinX > ndcMaxX ||
    envMaxY < ndcMinY ||
    envMinY > ndcMaxY
  ) {
    return AabbResult.Reject;
  }

  // Accept: all 8 corners are individually inside the selection rect
  if (allInside) return AabbResult.Accept;

  return AabbResult.PerVertex;
}
