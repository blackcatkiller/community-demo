// @ts-nocheck
import {
  AmbientLight,
  type Camera,
  DirectionalLight,
  type Material,
  type Object3D,
  type Object3DEventMap,
  Scene,
  type WebGLRenderer
} from "three";
import type { OcclusionOverlayHost } from "./occlusionOverlay";

type MaterialCarrier = {
  material?: Material | Material[];
};

function buildOverlayObjectPairs(
  source: Object3D<Object3DEventMap>,
  overlay: Object3D<Object3DEventMap>
): Array<{
  source: Object3D<Object3DEventMap>;
  overlay: Object3D<Object3DEventMap>;
}> {
  const sourceObjects: Object3D<Object3DEventMap>[] = [];
  const overlayObjects: Object3D<Object3DEventMap>[] = [];
  source.traverse(child => sourceObjects.push(child));
  overlay.traverse(child => overlayObjects.push(child));

  return sourceObjects.flatMap((sourceObject, index) => {
    const overlayObject = overlayObjects[index];
    return overlayObject
      ? [{ source: sourceObject, overlay: overlayObject }]
      : [];
  });
}

function syncOverlayMaterials(
  pairs: readonly {
    source: Object3D<Object3DEventMap>;
    overlay: Object3D<Object3DEventMap>;
  }[]
): void {
  pairs.forEach(pair => {
    const sourceCarrier = pair.source as MaterialCarrier;
    const overlayCarrier = pair.overlay as MaterialCarrier;
    if (sourceCarrier.material) {
      overlayCarrier.material = sourceCarrier.material;
    }
  });
}

function syncOverlayChildTransforms(
  pairs: readonly {
    source: Object3D<Object3DEventMap>;
    overlay: Object3D<Object3DEventMap>;
  }[]
): void {
  pairs.forEach((pair, index) => {
    if (index === 0) return;
    pair.overlay.visible = pair.source.visible;
    pair.overlay.matrixAutoUpdate = false;
    pair.overlay.matrix.copy(pair.source.matrix);
    pair.overlay.matrixWorldNeedsUpdate = true;
  });
}

function isObjectVisibleInHierarchy(obj: Object3D<Object3DEventMap>): boolean {
  let current: Object3D<Object3DEventMap> | null = obj;
  while (current) {
    if (!current.visible) return false;
    current = current.parent;
  }
  return true;
}

export function applyForegroundOverlay(
  host: OcclusionOverlayHost,
  obj: Object3D<Object3DEventMap>
) {
  const overlayObject = obj.clone(true);
  const objectPairs = buildOverlayObjectPairs(obj, overlayObject);
  overlayObject.matrixAutoUpdate = false;
  const overlayScene = new Scene();
  overlayScene.add(new AmbientLight(0xffffff, 2.2));
  const keyLight = new DirectionalLight(0xffffff, 1.8);
  keyLight.position.set(1.5, 2, 3);
  overlayScene.add(keyLight);
  overlayScene.add(overlayObject);

  let lastVisible = obj.visible;

  const beforeRender = () => {
    lastVisible = isObjectVisibleInHierarchy(obj);
    if (!lastVisible) return;
    obj.updateMatrixWorld(true);
    obj.visible = false;
    overlayObject.visible = true;
    overlayObject.matrix.copy(obj.matrixWorld);
    overlayObject.matrixWorld.copy(obj.matrixWorld);
    overlayObject.matrixWorldNeedsUpdate = false;
    syncOverlayChildTransforms(objectPairs);
    syncOverlayMaterials(objectPairs);
  };

  const afterRender = (renderer: WebGLRenderer, camera: Camera) => {
    if (!lastVisible) return;
    renderer.clearDepth();
    renderer.render(overlayScene, camera);
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
