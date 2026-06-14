// @ts-nocheck
import { Camera, Object3D, Vector3 } from "three";

// World coordinate style (CAD-like): Z-up.
// This is about the *world* axes, not a constraint that camera view-up must
// always be +Z.
export const WORLD_UP = new Vector3(0, 0, 1);

// Centralized place to configure three.js defaults that affect lookAt().
export function ensureThreeUpDefaults() {
  Object3D.DEFAULT_UP.copy(WORLD_UP);
  Camera.DEFAULT_UP.copy(WORLD_UP);
}

const EPS = 1e-8;

function projectToPlaneAndNormalize(v: Vector3, planeNormal: Vector3) {
  const out = v.clone().projectOnPlane(planeNormal);
  const len2 = out.lengthSq();
  if (len2 < EPS) return null;
  out.multiplyScalar(1 / Math.sqrt(len2));
  return out;
}

// NX-like camera up behavior:
// - Allow upside-down views (roll can be 180掳).
// - When preferredUp becomes parallel to viewDir (degenerate), do NOT force a
//   fixed world-up correction. Instead, use a cached screen-right direction to
//   keep left/right stable.
export function computeUpForViewDir(
  viewDir: Vector3,
  preferredUp: Vector3,
  lastRight: Vector3
) {
  const dir = viewDir.clone().normalize();

  // 1) Try to keep current roll by using preferredUp.
  const fromPreferred = projectToPlaneAndNormalize(preferredUp, dir);
  if (fromPreferred) {
    if (fromPreferred.dot(preferredUp) < 0) fromPreferred.multiplyScalar(-1);
    return fromPreferred;
  }

  // 2) Degenerate: preferredUp is parallel to viewDir.
  // Use lastRight as an anchor so the image doesn't suddenly flip.
  const right = projectToPlaneAndNormalize(lastRight, dir);
  if (right) {
    const up = new Vector3().crossVectors(right, dir).normalize();
    // Keep sign consistent with preferredUp if possible.
    if (up.dot(preferredUp) < 0) up.multiplyScalar(-1);
    return up;
  }

  // 3) Fallbacks: world-up, then any non-parallel axis.
  const fromWorld = projectToPlaneAndNormalize(WORLD_UP, dir);
  if (fromWorld) return fromWorld;

  const axis =
    Math.abs(dir.z) < 0.9 ? new Vector3(0, 0, 1) : new Vector3(0, 1, 0);
  return projectToPlaneAndNormalize(axis, dir) ?? new Vector3(0, 1, 0);
}
