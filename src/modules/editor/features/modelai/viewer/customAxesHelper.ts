// @ts-nocheck
import {
  type Camera,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  Quaternion,
  SphereGeometry,
  Sprite,
  Vector3,
  type WebGLRenderer
} from "three";
import { applyOcclusionOverlay } from "@modelai/geometry/occlusionOverlay";
import {
  meshBasicAxisBlueDepthMaterial,
  meshBasicAxisGreenDepthMaterial,
  meshBasicAxisRedDepthMaterial,
  meshBasicMutedDepthMaterial,
  meshBasicNeutralDepthMaterial,
  spriteTextXMutedMaterial,
  spriteTextXRedMaterial,
  spriteTextYGreenMaterial,
  spriteTextYMutedMaterial,
  spriteTextZBlueMaterial,
  spriteTextZMutedMaterial
} from "./materials";

type CameraProvider = () => Camera | any | undefined;
type ViewportSizeProvider = () => number;
type BeforeSceneHookRegistrar = (hook: () => void) => void;
type AfterSceneHookRegistrar = (
  hook: (renderer: WebGLRenderer, camera: Camera) => void
) => void;

type CustomAxesHelperOptions = {
  size?: number;
  getCamera: CameraProvider;
  getViewportWidth: ViewportSizeProvider;
  getViewportHeight: ViewportSizeProvider;
  addBeforeSceneRenderHook: BeforeSceneHookRegistrar;
  removeBeforeSceneRenderHook: BeforeSceneHookRegistrar;
  addAfterSceneRenderHook: AfterSceneHookRegistrar;
  removeAfterSceneRenderHook: AfterSceneHookRegistrar;
};

export class CustomAxesHelper extends Group {
  private readonly _baseSize: number;
  private _pixelSize: number;
  private readonly _getCamera: CameraProvider;
  private readonly _getViewportHeight: ViewportSizeProvider;
  private readonly _removeBeforeSceneRenderHook: BeforeSceneHookRegistrar;
  private readonly _beforeSceneRenderHook = () => this.beforeSceneRender();
  private readonly _detachOcclusionOverlay: () => void;
  private readonly _overlayCloneSource = new Group();

  constructor({
    size = 250,
    getCamera,
    getViewportHeight,
    addBeforeSceneRenderHook,
    removeBeforeSceneRenderHook,
    addAfterSceneRenderHook,
    removeAfterSceneRenderHook
  }: CustomAxesHelperOptions) {
    super();
    this._baseSize = size;
    this._pixelSize = 120;
    this._getCamera = getCamera;
    this._getViewportHeight = getViewportHeight;
    this._removeBeforeSceneRenderHook = removeBeforeSceneRenderHook;
    (this as any).name = "CustomAxesHelper";
    this.build(size, this, false);
    this.build(size, this._overlayCloneSource, true);
    this.disableRaycastParticipation();
    addBeforeSceneRenderHook(this._beforeSceneRenderHook);
    this._detachOcclusionOverlay = applyOcclusionOverlay(
      {
        addBeforeSceneRenderHook,
        removeBeforeSceneRenderHook,
        addAfterSceneRenderHook,
        removeAfterSceneRenderHook
      },
      this,
      undefined,
      this._overlayCloneSource
    );
  }

  setPixelSize(px: number) {
    this._pixelSize = Math.max(16, px);
  }

  // Keeps the helper visually stable on screen for both perspective and orthographic cameras.
  update() {
    const camera = this._getCamera();
    const viewportHeight = this._getViewportHeight();
    if (!camera || viewportHeight <= 0) return;
    const self = this as any;

    let worldPerPixel = 0;
    if (camera.isPerspectiveCamera) {
      const dist = Math.max(
        1e-6,
        (camera.position as Vector3).distanceTo(self.position as Vector3)
      );
      const fovRad = ((camera.fov as number) * Math.PI) / 180;
      const worldHeight = 2 * dist * Math.tan(fovRad / 2);
      worldPerPixel = worldHeight / viewportHeight;
    } else if (camera.isOrthographicCamera) {
      const zoom = Math.max(1e-9, (camera.zoom as number) ?? 1);
      const worldHeight =
        ((camera.top as number) - (camera.bottom as number)) / zoom;
      worldPerPixel = worldHeight / viewportHeight;
    } else {
      return;
    }

    const desiredWorldSize = Math.max(1e-6, worldPerPixel * this._pixelSize);
    const scale = desiredWorldSize / this._baseSize;
    (self.scale as Vector3).setScalar(scale);
  }

  onResize() {}

  beforeSceneRender() {
    this.update();
  }

  dispose() {
    this._removeBeforeSceneRenderHook(this._beforeSceneRenderHook);
    this._detachOcclusionOverlay();
  }

  private build(size: number, root: Group, muted: boolean) {
    const shaftRadius = Math.max(0.8, size * 0.006);
    const headRadius = Math.max(1.6, size * 0.014);
    const headLength = Math.max(8, size * 0.2);
    const shaftLength = Math.max(12, size - headLength);

    this.addSingleMesh(
      root,
      new SphereGeometry(Math.max(1.2, size * 0.008), 12, 10),
      muted
    );

    this.addAxis(
      root,
      new Vector3(1, 0, 0),
      "X",
      shaftLength,
      shaftRadius,
      headLength,
      headRadius,
      new Vector3(0, 0, 0),
      muted
    );
    this.addAxis(
      root,
      new Vector3(0, 1, 0),
      "Y",
      shaftLength,
      shaftRadius,
      headLength,
      headRadius,
      new Vector3(0, 0, 0),
      muted
    );
    this.addAxis(
      root,
      new Vector3(0, 0, 1),
      "Z",
      shaftLength,
      shaftRadius,
      headLength,
      headRadius,
      new Vector3(0, 0, 0),
      muted
    );
  }

  private addAxis(
    root: Group,
    direction: Vector3,
    label: string,
    shaftLength: number,
    shaftRadius: number,
    headLength: number,
    headRadius: number,
    labelOffset: Vector3,
    muted: boolean
  ) {
    const axis = new Group();
    const dir = direction.clone().normalize();
    const axisRotation = new Quaternion().setFromUnitVectors(
      new Vector3(0, 1, 0),
      dir
    );
    axis.quaternion.copy(axisRotation);

    const visibleShaft = new Mesh(
      new CylinderGeometry(shaftRadius, shaftRadius, shaftLength, 12),
      this.resolveAxisMaterial(label, muted)
    );
    visibleShaft.position.y = shaftLength * 0.5;

    const visibleHead = new Mesh(
      new ConeGeometry(headRadius, headLength, 14),
      this.resolveAxisMaterial(label, muted)
    );
    visibleHead.position.y = shaftLength + headLength * 0.5;

    this.markRenderable(visibleShaft, 1);
    this.markRenderable(visibleHead, 1);

    axis.add(visibleShaft, visibleHead);
    root.add(axis);

    const labelDistance = shaftLength + headLength * 1.35;
    const labelPosition = dir
      .clone()
      .multiplyScalar(labelDistance)
      .add(labelOffset);

    const visibleLabel = this.createLabelSprite(
      label,
      muted,
      shaftLength + headLength
    );
    visibleLabel.position.copy(labelPosition);
    this.markRenderable(visibleLabel, muted ? 0 : 2);

    root.add(visibleLabel);
  }

  private addSingleMesh(root: Group, geometry: SphereGeometry, muted: boolean) {
    const mesh = new Mesh(
      geometry.clone(),
      muted ? meshBasicMutedDepthMaterial : meshBasicNeutralDepthMaterial
    );
    this.markRenderable(mesh, 1);
    root.add(mesh);
  }

  private markRenderable(object: any, renderOrder: number) {
    object.renderOrder = renderOrder;
    object.frustumCulled = false;
  }

  private disableRaycastParticipation() {
    const mark = (obj: any) => {
      obj.raycast = () => {};
      const children = obj.children as any[] | undefined;
      if (!children?.length) return;
      for (const child of children) mark(child);
    };
    mark(this as any);
  }

  private createLabelSprite(text: string, muted: boolean, axisLength: number) {
    const sprite = new Sprite(this.resolveLabelMaterial(text, muted));
    const h = Math.max(18, axisLength * 0.13);
    sprite.scale.set(h * 1.8, h, 1);
    return sprite;
  }

  private resolveAxisMaterial(label: string, muted: boolean) {
    if (muted) return meshBasicMutedDepthMaterial;
    switch (label) {
      case "X":
        return meshBasicAxisRedDepthMaterial;
      case "Y":
        return meshBasicAxisGreenDepthMaterial;
      default:
        return meshBasicAxisBlueDepthMaterial;
    }
  }

  private resolveLabelMaterial(label: string, muted: boolean) {
    if (muted) {
      switch (label) {
        case "X":
          return spriteTextXMutedMaterial;
        case "Y":
          return spriteTextYMutedMaterial;
        default:
          return spriteTextZMutedMaterial;
      }
    }
    switch (label) {
      case "X":
        return spriteTextXRedMaterial;
      case "Y":
        return spriteTextYGreenMaterial;
      default:
        return spriteTextZBlueMaterial;
    }
  }
}
