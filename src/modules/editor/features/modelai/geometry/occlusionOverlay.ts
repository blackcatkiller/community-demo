// @ts-nocheck
import {
  type Camera,
  GreaterDepth,
  type Material,
  type Object3D,
  type Object3DEventMap,
  type WebGLRenderer
} from "three";

const DEFAULT_OCCLUDED_COLOR = 0x7a7a7a;

export type OcclusionOverlayHost = {
  addBeforeSceneRenderHook(hook: () => void): void;
  removeBeforeSceneRenderHook(hook: () => void): void;
  addAfterSceneRenderHook(
    hook: (renderer: WebGLRenderer, camera: Camera) => void
  ): void;
  removeAfterSceneRenderHook(
    hook: (renderer: WebGLRenderer, camera: Camera) => void
  ): void;
  update?: () => void;
};

function applyOccludedMaterial(
  object: Object3D<Object3DEventMap>,
  overrideMaterial?: Material
) {
  object.traverse(child => {
    const current = (child as any).material as
      | Material
      | Material[]
      | undefined;
    if (!current) return;

    const nextMaterial = Array.isArray(current)
      ? current.map(material =>
          buildOccludedMaterial(material, overrideMaterial)
        )
      : buildOccludedMaterial(current, overrideMaterial);

    (child as any).material = nextMaterial;
    child.renderOrder = 0;
    child.frustumCulled = false;
  });
}

function buildOccludedMaterial(
  source: Material,
  overrideMaterial?: Material
): Material {
  const material = (overrideMaterial ?? source).clone();
  const color = (material as any).color;
  if (color?.setHex) {
    color.setHex(DEFAULT_OCCLUDED_COLOR);
  }
  (material as any).depthTest = true;
  (material as any).depthWrite = false;
  (material as any).depthFunc = GreaterDepth;
  (material as any).transparent = true;
  if (typeof (material as any).opacity === "number") {
    (material as any).opacity = Math.min((material as any).opacity, 1);
  }
  material.needsUpdate = true;
  return material;
}

function isObjectVisibleInHierarchy(obj: Object3D<Object3DEventMap>): boolean {
  let current: Object3D<Object3DEventMap> | null = obj;
  while (current) {
    if (!current.visible) return false;
    current = current.parent;
  }
  return true;
}

export function applyOcclusionOverlay(
  host: OcclusionOverlayHost,
  obj: Object3D<Object3DEventMap>,
  occludedMaterial?: Material,
  cloneSource?: Object3D<Object3DEventMap>
) {
  const occludedClone = (cloneSource ?? obj).clone(true);
  occludedClone.matrixAutoUpdate = false;
  applyOccludedMaterial(occludedClone, occludedMaterial);

  let lastVisible = obj.visible;

  const beforeRender = () => {
    lastVisible = isObjectVisibleInHierarchy(obj);
    if (!lastVisible) return;
    obj.updateMatrixWorld(true);
    obj.visible = false;
    occludedClone.visible = true;
    occludedClone.matrix.copy(obj.matrixWorld);
    occludedClone.matrixWorld.copy(obj.matrixWorld);
    occludedClone.matrixWorldNeedsUpdate = false;
  };

  const afterRender = (renderer: any, camera: any) => {
    if (!lastVisible) return;
    renderer.render(occludedClone as any, camera);
    obj.visible = true;
    renderer.render(obj as any, camera);
    obj.visible = lastVisible;
  };

  host.addBeforeSceneRenderHook(beforeRender);
  host.addAfterSceneRenderHook(afterRender);
  host.update?.();

  return () => {
    host.removeBeforeSceneRenderHook(beforeRender);
    host.removeAfterSceneRenderHook(afterRender);
    host.update?.();
  };
}
