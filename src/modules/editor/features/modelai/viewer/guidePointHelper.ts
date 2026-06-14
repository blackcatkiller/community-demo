// @ts-nocheck
import type { FeatureGuidePointDescriptor } from "@/features/modelai/geometry/featureGeometry";
import {
  type FeatureGuideDescriptor,
  type FeatureGuideRole,
  hasGuideRole
} from "@/features/modelai/geometry/featureGeometry";
import {
  Group,
  Mesh,
  type Object3D,
  OrthographicCamera,
  PerspectiveCamera,
  SphereGeometry,
  Vector2,
  Vector3
} from "three";
import {
  meshStandardBlueMetallicMaterial,
  meshStandardWhiteMetallicMaterial
} from "./materials";

const GUIDE_POINT_DIAMETER_PX = 10;
const GUIDE_POINT_SPHERE_SEGMENTS = 24;

export function createGuidePointHelperObject(
  points: readonly FeatureGuidePointDescriptor[],
  diameterPx = GUIDE_POINT_DIAMETER_PX
): Group | undefined {
  if (points.length === 0) return undefined;

  const group = new Group();
  group.name = "GuidePointHelper";
  points.forEach(point => {
    const sphere = createGuidePointSphere(point, diameterPx);
    group.add(sphere);
  });
  return group.children.length > 0 ? group : undefined;
}

export function createGuidePointHelperObjectFromGuides(
  guides: readonly FeatureGuideDescriptor[],
  role: FeatureGuideRole = "display"
): Group | undefined {
  const entries = collectGuidePointEntriesByRole(guides, role);
  if (entries.length === 0) return undefined;

  const group = new Group();
  group.name = "GuidePointHelper";
  entries.forEach(entry => {
    const sphere = createGuidePointSphere(entry.point, GUIDE_POINT_DIAMETER_PX);
    sphere.userData.featureGuide = entry.guide;
    group.add(sphere);
  });
  return group.children.length > 0 ? group : undefined;
}

function collectGuidePointEntriesByRole(
  guides: readonly FeatureGuideDescriptor[],
  role: FeatureGuideRole
): Array<{
  guide: FeatureGuideDescriptor;
  point: FeatureGuidePointDescriptor;
}> {
  const entries: Array<{
    guide: FeatureGuideDescriptor;
    point: FeatureGuidePointDescriptor;
  }> = [];
  guides.forEach(guide => {
    if (!hasGuideRole(guide, role)) return;
    if (guide.kind === "guidePoint") {
      entries.push({ guide, point: guide.guidePoint });
      return;
    }
    if (guide.kind !== "centerline") {
      return;
    }
    (guide.guidePoints ?? []).forEach(point => {
      entries.push({ guide, point });
    });
  });
  return entries;
}

function createGuidePointSphere(
  point: FeatureGuidePointDescriptor,
  diameterPx: number
) {
  const sphere = new Mesh(
    new SphereGeometry(
      0.5,
      GUIDE_POINT_SPHERE_SEGMENTS,
      GUIDE_POINT_SPHERE_SEGMENTS
    ),
    point.state === "focus"
      ? meshStandardBlueMetallicMaterial
      : meshStandardWhiteMetallicMaterial
  );
  sphere.name = `GuidePointHelper:${point.id}`;
  sphere.position.set(point.point.x, point.point.y, point.point.z);
  sphere.renderOrder = 999;
  sphere.frustumCulled = false;
  sphere.userData.guidePoint = point;
  attachScreenPixelScale(sphere, diameterPx);
  return sphere;
}

export function setGuidePointHelperActive(
  object: Object3D,
  active: boolean
): boolean {
  const guidePoint = (
    object.userData as { guidePoint?: FeatureGuidePointDescriptor } | undefined
  )?.guidePoint;
  if (!guidePoint || !(object instanceof Mesh)) return false;
  object.material =
    active || guidePoint.state === "focus"
      ? meshStandardBlueMetallicMaterial
      : meshStandardWhiteMetallicMaterial;
  return true;
}

function attachScreenPixelScale(mesh: Mesh, diameterPx: number): void {
  const viewport = new Vector2();
  const worldPosition = new Vector3();
  mesh.onBeforeRender = (renderer, _scene, camera) => {
    renderer.getSize(viewport);
    const height = Math.max(viewport.y, 1);
    let worldPerPixel: number | undefined;
    if (camera instanceof PerspectiveCamera) {
      mesh.getWorldPosition(worldPosition);
      const distance = camera.position.distanceTo(worldPosition);
      const verticalWorld =
        2 * Math.tan((camera.fov * Math.PI) / 360) * distance;
      worldPerPixel = verticalWorld / height;
    } else if (camera instanceof OrthographicCamera) {
      worldPerPixel = (camera.top - camera.bottom) / camera.zoom / height;
    }
    if (!worldPerPixel || !Number.isFinite(worldPerPixel)) return;
    const radius = (worldPerPixel * diameterPx) / 2;
    mesh.scale.setScalar(Math.max(radius, 1e-6));
  };
}
