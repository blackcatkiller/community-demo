// @ts-nocheck
import { applyForegroundOverlay } from "@modelai/geometry/foregroundOverlay";
import {
  type Camera,
  Group,
  Mesh,
  SphereGeometry,
  type Vector3,
  type WebGLRenderer
} from "three";
import { meshBasicRedAlpha100Material } from "./materials";

type CameraProvider = () => Camera | any | undefined;
type TargetProvider = () => Vector3;
type ViewportSizeProvider = () => number;
type BeforeSceneHookRegistrar = (hook: () => void) => void;
type AfterSceneHookRegistrar = (
  hook: (renderer: WebGLRenderer, camera: Camera) => void
) => void;

type InteractionTargetHelperOptions = {
  diameterPx?: number;
  getCamera: CameraProvider;
  getTarget: TargetProvider;
  getViewportHeight: ViewportSizeProvider;
  addBeforeSceneRenderHook: BeforeSceneHookRegistrar;
  removeBeforeSceneRenderHook: BeforeSceneHookRegistrar;
  addAfterSceneRenderHook: AfterSceneHookRegistrar;
  removeAfterSceneRenderHook: AfterSceneHookRegistrar;
};

const BASE_RADIUS = 0.5;

export class InteractionTargetHelper {
  readonly object = new Group();
  private _diameterPx: number;
  private _visible = true;
  private readonly _getCamera: CameraProvider;
  private readonly _getTarget: TargetProvider;
  private readonly _getViewportHeight: ViewportSizeProvider;
  private readonly _removeBeforeSceneRenderHook: BeforeSceneHookRegistrar;
  private readonly _beforeSceneRenderHook = () => this.beforeSceneRender();
  private readonly _detachForegroundOverlay: () => void;
  private readonly _sphere: Mesh<SphereGeometry>;

  constructor({
    diameterPx = 12,
    getCamera,
    getTarget,
    getViewportHeight,
    addBeforeSceneRenderHook,
    removeBeforeSceneRenderHook,
    addAfterSceneRenderHook,
    removeAfterSceneRenderHook
  }: InteractionTargetHelperOptions) {
    this._diameterPx = Math.max(4, diameterPx);
    this._getCamera = getCamera;
    this._getTarget = getTarget;
    this._getViewportHeight = getViewportHeight;
    this._removeBeforeSceneRenderHook = removeBeforeSceneRenderHook;
    this.object.name = "InteractionTargetHelper";

    this._sphere = new Mesh(
      new SphereGeometry(BASE_RADIUS, 24, 20),
      meshBasicRedAlpha100Material
    );
    this._sphere.renderOrder = 999;
    this._sphere.frustumCulled = false;
    this.object.add(this._sphere);
    this.disableRaycastParticipation();

    addBeforeSceneRenderHook(this._beforeSceneRenderHook);
    this._detachForegroundOverlay = applyForegroundOverlay(
      {
        addBeforeSceneRenderHook,
        removeBeforeSceneRenderHook,
        addAfterSceneRenderHook,
        removeAfterSceneRenderHook
      },
      this.object
    );
  }

  setPixelDiameter(px: number) {
    this._diameterPx = Math.max(4, px);
  }

  setVisible(visible: boolean) {
    this._visible = visible;
    this.object.visible = visible;
  }

  update() {
    const camera = this._getCamera();
    const viewportHeight = Math.max(1, this._getViewportHeight());
    if (!camera || !this._visible) return;

    const target = this._getTarget();
    this.object.position.copy(target);

    let worldPerPixel = 0;
    if ((camera as any).isPerspectiveCamera) {
      const dist = Math.max(1e-6, camera.position.distanceTo(target));
      const fovRad = (((camera as any).fov as number) * Math.PI) / 180;
      const worldHeight = 2 * dist * Math.tan(fovRad / 2);
      worldPerPixel = worldHeight / viewportHeight;
    } else if ((camera as any).isOrthographicCamera) {
      const zoom = Math.max(1e-9, ((camera as any).zoom as number) ?? 1);
      const worldHeight =
        (((camera as any).top as number) - ((camera as any).bottom as number)) /
        zoom;
      worldPerPixel = worldHeight / viewportHeight;
    } else {
      return;
    }

    const diameterWorld = Math.max(1e-6, worldPerPixel * this._diameterPx);
    this.object.scale.setScalar(diameterWorld / (BASE_RADIUS * 2));
  }

  dispose() {
    this._removeBeforeSceneRenderHook(this._beforeSceneRenderHook);
    this._detachForegroundOverlay();
    this._sphere.geometry.dispose();
  }

  private beforeSceneRender() {
    this.update();
  }

  private disableRaycastParticipation() {
    this.object.traverse(obj => {
      (obj as any).raycast = () => {};
    });
  }
}
