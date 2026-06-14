// @ts-nocheck
import {
  type OrthographicCamera,
  Color,
  Mesh,
  type PerspectiveCamera,
  Quaternion,
  OrthographicCamera as ThreeOrthoCamera,
  PlaneGeometry,
  Scene,
  Vector2,
  Vector3,
  Vector4,
  type WebGLRenderer
} from "three";
import type { CameraController } from "./cameraController";
import {
  ViewCubeHelper,
  BLOOM_LAYER_CCW,
  BLOOM_LAYER_CW,
  type RotateArrowDir,
  type ViewHelperHit,
  type ZUpAxisType
} from "./viewCubeHelper";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { meshBasicAdditiveOverlayMaterial } from "./materials";

type AnyCamera = PerspectiveCamera | OrthographicCamera;

type AxisAnimState = {
  start: number;
  duration: number;
  center: Vector3;
  dist: number;
  fromDir: Vector3;
  toDir: Vector3;
  fromUp: Vector3;
  toUp: Vector3;
  rollAxis?: Vector3;
  rollAngle?: number;
  rigRotation?: Quaternion;
  rigFromCameraOffset?: Vector3;
  rigFromTargetOffset?: Vector3;
};

const EPS = 1e-6;
const VIEW_HELPER_DEBUG_FLAG = "__MODELAI_CAM_DEBUG__";

function slerpUnitVectors(from: Vector3, to: Vector3, t: number) {
  const dot = Math.max(-1, Math.min(1, from.dot(to)));
  if (1 - Math.abs(dot) < EPS) {
    return from.clone().lerp(to, t).normalize();
  }
  const theta = Math.acos(dot);
  const sinTheta = Math.sin(theta);
  const a = Math.sin((1 - t) * theta) / sinTheta;
  const b = Math.sin(t * theta) / sinTheta;
  return from.clone().multiplyScalar(a).add(to.clone().multiplyScalar(b));
}

function signedAngleAroundAxis(from: Vector3, to: Vector3, axis: Vector3) {
  const fromProjected = from.clone().projectOnPlane(axis).normalize();
  const toProjected = to.clone().projectOnPlane(axis).normalize();
  const cross = new Vector3().crossVectors(fromProjected, toProjected);
  const sin = cross.dot(axis);
  const cos = fromProjected.dot(toProjected);
  return Math.atan2(sin, cos);
}

// For top/bottom views (viewDir ~ +/-Z), "roll" is ambiguous. Our NX-like policy
// tries to preserve roll using lastRight, which can lead to a diagonal (e.g. 45deg)
// result when entering Z views from an oblique camera. Snap the resulting up vector
// to the nearest cardinal axis in the view plane so the view is "upright", while
// still preserving 90deg roll steps (rotate arrows).
function snapUpToNearestCardinalInPlane(viewDir: Vector3, up: Vector3) {
  const dir = viewDir.clone().normalize();
  const candidates = [
    new Vector3(1, 0, 0),
    new Vector3(-1, 0, 0),
    new Vector3(0, 1, 0),
    new Vector3(0, -1, 0),
    new Vector3(0, 0, 1),
    new Vector3(0, 0, -1)
  ];

  let best: Vector3 | null = null;
  let bestDot = -Infinity;
  for (const c of candidates) {
    const proj = c.clone().projectOnPlane(dir);
    const len2 = proj.lengthSq();
    if (len2 < 1e-8) continue;
    proj.multiplyScalar(1 / Math.sqrt(len2));
    const d = proj.dot(up);
    if (d > bestDot) {
      bestDot = d;
      best = proj;
    }
  }

  return best ?? up;
}

export class ViewHelperWidget {
  private _helper?: ViewCubeHelper;
  private _dom?: HTMLElement;
  private _cameraRef?: AnyCamera;
  private _visible = true;
  private _boxHelperVisible = false;
  private _anim?: AxisAnimState;
  private _selectedFace: ZUpAxisType | null = null;
  private _hovered: ViewHelperHit | null = null;
  private readonly _handleWindowKeyDown = (e: KeyboardEvent) => {
    if (!this.shouldHandleStandardViewShortcut(e)) return;
    this.activateStandardView("posZ");
    e.preventDefault();
    e.stopImmediatePropagation();
  };

  // Default placement: left-bottom. (Not persisted; refresh resets.)
  private _location = {
    left: 0,
    right: 0,
    bottom: 0,
    top: null as number | null
  };
  private _bloom?: {
    composer: EffectComposer;
    renderPass: RenderPass;
    bloomPass: UnrealBloomPass;
    size: Vector4;
    overlayScene: Scene;
    overlayCamera: ThreeOrthoCamera;
    overlayMesh: Mesh;
  };

  constructor(
    private readonly cameraController: CameraController,
    private readonly getCamera: () => AnyCamera,
    private readonly requestRender: () => void
  ) {}

  private getHelperCenter() {
    return this.cameraController.viewHelperCenter.clone();
  }

  private debugViewHelper(tag: string, extra?: Record<string, unknown>) {
    const flag = (globalThis as any)?.[VIEW_HELPER_DEBUG_FLAG];
    if (!flag) return;
    if (flag !== "verbose") return;
    this.cameraController.noteViewHelperDebug(tag, {
      axis: typeof extra?.axis === "string" ? extra.axis : undefined,
      center: this.getHelperCenter(),
      desiredViewDir:
        extra?.desiredViewDir instanceof Vector3
          ? extra.desiredViewDir
          : undefined,
      currentTarget:
        extra?.currentTarget instanceof Vector3
          ? extra.currentTarget
          : undefined
    });
  }

  get visible() {
    return this._visible;
  }

  setVisible(visible: boolean) {
    this._visible = visible;
    this.requestRender();
  }

  setBoxHelperVisible(visible: boolean) {
    this._boxHelperVisible = visible;
    this._helper?.setBoxHelperVisible(visible);
    this.requestRender();
  }

  setLocation(
    location: Partial<{
      left: number | null;
      right: number | null;
      top: number | null;
      bottom: number | null;
    }>
  ) {
    this._location = {
      ...this._location,
      ...location
    };
    this.applyLocationToHelper();
    this.requestRender();
  }

  get isAnimating() {
    return Boolean(this._anim);
  }

  activateStandardView(axis: ZUpAxisType) {
    if (this.isAnimating) return;
    this._selectedFace = axis;
    this._hovered = null;
    this.startAxisAnimation(axis);
    this.requestRender();
  }

  attach(dom: HTMLElement) {
    this._dom = dom;
    this.recreateHelperIfNeeded(true);
    window.removeEventListener("keydown", this._handleWindowKeyDown);
    window.addEventListener("keydown", this._handleWindowKeyDown);
  }

  dispose() {
    window.removeEventListener("keydown", this._handleWindowKeyDown);
    this._helper?.dispose();
    this._helper = undefined;
    this._dom = undefined;
    this._cameraRef = undefined;
    this._anim = undefined;
    if (this._bloom) {
      this._bloom.overlayMesh.geometry.dispose();
    }
    this._bloom = undefined;
  }

  handlePointerDown(e: PointerEvent): boolean {
    if (!this._visible) return false;
    if (!this._dom) return false;
    this.recreateHelperIfNeeded(false);
    if (!this._helper) return false;

    this._helper.center.copy(this.getHelperCenter());
    this._helper.setSelectedFace(this._selectedFace);
    this._helper.setHovered(this._hovered);

    // Clicking on the helper background (not on face/lock) is treated as a "blank click".
    const { inside, hit } = this._helper.handlePointerMove(e);
    const normalizedHit = this.normalizeHit(hit);
    if (!inside) return false;

    if (normalizedHit?.kind === "face") {
      this.activateStandardView(normalizedHit.axis);
      this._hovered = normalizedHit;
      this._helper.setSelectedFace(normalizedHit.axis);
      this._helper.setHovered(normalizedHit);
      return true;
    }

    if (normalizedHit?.kind === "rotate") {
      this._hovered = normalizedHit;
      this._helper.setHovered(normalizedHit);
      this.startRollAnimation(normalizedHit.dir);
      this.requestRender();
      return true;
    }

    return false;
  }

  handlePointerMove(e: PointerEvent): boolean {
    if (!this._visible) return false;
    if (!this._dom) return false;
    this.recreateHelperIfNeeded(false);
    if (!this._helper) return false;

    this._helper.center.copy(this.getHelperCenter());
    this._helper.setSelectedFace(this._selectedFace);
    const { inside, hit } = this._helper.handlePointerMove(e);
    const normalizedHit = this.normalizeHit(hit);
    if (!inside && !this._hovered) return false;

    const changed =
      this._hovered?.kind !== normalizedHit?.kind ||
      (this._hovered?.kind === "face" &&
        normalizedHit?.kind === "face" &&
        this._hovered.axis !== normalizedHit.axis) ||
      (this._hovered?.kind === "rotate" &&
        normalizedHit?.kind === "rotate" &&
        this._hovered.dir !== normalizedHit.dir) ||
      (!this._hovered && !!normalizedHit) ||
      (!!this._hovered && !normalizedHit);

    if (!changed) return inside;

    this._hovered = normalizedHit;
    this._helper.setHovered(normalizedHit);
    this.requestRender();
    return inside;
  }

  private shouldHandleStandardViewShortcut(e: KeyboardEvent) {
    if (!this._visible || !this._dom) return false;
    if (this.isAnimating) return false;
    if (
      this.cameraController.view.document.application.activeView !==
      this.cameraController.view
    ) {
      return false;
    }
    if (this.isEditableTarget(e.target)) return false;
    if (e.key !== "F8") return false;
    if (e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) return false;
    return true;
  }

  private isEditableTarget(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return false;
    return (
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT" ||
      target.isContentEditable
    );
  }

  private normalizeHit(hit: ViewHelperHit | null): ViewHelperHit | null {
    if (hit?.kind !== "lock") return hit;
    return {
      kind: "face",
      axis: this.lockAxisToFace(hit.axis)
    };
  }

  private lockAxisToFace(axis: "x" | "y" | "z"): ZUpAxisType {
    switch (axis) {
      case "x":
        return "posX";
      case "y":
        return "posY";
      case "z":
        return "posZ";
    }
  }

  handlePointerUp(e: PointerEvent): boolean {
    void e;
    return false;
  }

  tick(now: number) {
    if (!this._anim) return;
    const t = Math.min(1, (now - this._anim.start) / this._anim.duration);
    const s = t * t * (3 - 2 * t); // smoothstep
    if (
      this._anim.rigRotation &&
      this._anim.rigFromCameraOffset &&
      this._anim.rigFromTargetOffset
    ) {
      const q = new Quaternion().slerpQuaternions(
        new Quaternion(),
        this._anim.rigRotation,
        s
      );
      const pos = this._anim.center
        .clone()
        .add(this._anim.rigFromCameraOffset.clone().applyQuaternion(q));
      const target = this._anim.center
        .clone()
        .add(this._anim.rigFromTargetOffset.clone().applyQuaternion(q));
      const up = this._anim.fromUp.clone().applyQuaternion(q).normalize();

      this.cameraController.lookAt(pos, target, up);
      this.requestRender();

      if (t >= 1) {
        this.cameraController.lookAt(
          this._anim.center
            .clone()
            .add(
              this._anim.rigFromCameraOffset
                .clone()
                .applyQuaternion(this._anim.rigRotation)
            ),
          this._anim.center
            .clone()
            .add(
              this._anim.rigFromTargetOffset
                .clone()
                .applyQuaternion(this._anim.rigRotation)
            ),
          this._anim.fromUp
            .clone()
            .applyQuaternion(this._anim.rigRotation)
            .normalize()
        );
        this._anim = undefined;
      }
      return;
    }

    const dir = slerpUnitVectors(this._anim.fromDir, this._anim.toDir, s);
    const pos = this._anim.center.clone().addScaledVector(dir, this._anim.dist);
    const up =
      this._anim.rollAxis && this._anim.rollAngle !== undefined
        ? this._anim.fromUp
            .clone()
            .applyAxisAngle(this._anim.rollAxis, this._anim.rollAngle * s)
            .normalize()
        : this._anim.fromUp.clone().lerp(this._anim.toUp, s).normalize();

    this.cameraController.lookAt(pos, this._anim.center, up);
    this.requestRender();

    if (t >= 1) {
      // Final snap to end the animation without forcing a no-roll correction.
      this.cameraController.lookAt(
        this._anim.center
          .clone()
          .addScaledVector(this._anim.toDir, this._anim.dist),
        this._anim.center,
        this._anim.toUp
      );
      this._anim = undefined;
    }
  }

  render(renderer: WebGLRenderer) {
    if (!this._visible) return;
    if (!this._dom) return;
    this.recreateHelperIfNeeded(false);
    if (!this._helper) return;
    this._helper.center.copy(this.getHelperCenter());
    this._helper.setSelectedFace(this._selectedFace);
    this._helper.setHovered(this._hovered);
    this._helper.render(renderer);
    this.renderBloom(renderer);
  }

  private recreateHelperIfNeeded(force: boolean) {
    if (!this._dom) return;
    const camera = this.getCamera();
    if (!force && this._helper && this._cameraRef === camera) return;

    this._helper?.dispose();
    this._helper = new ViewCubeHelper(camera, this._dom);
    this._cameraRef = camera;
    this._helper.center.copy(this.getHelperCenter());
    this.applyLocationToHelper();
    this._helper.size = 180;
    this._helper.setBoxHelperVisible(this._boxHelperVisible);
    this._helper.setSelectedFace(this._selectedFace);
  }

  private applyLocationToHelper() {
    if (!this._helper) return;
    this._helper.location.left = this._location.left;
    this._helper.location.right = this._location.right;
    this._helper.location.bottom = this._location.bottom;
    this._helper.location.top = this._location.top;
  }

  private renderBloom(renderer: WebGLRenderer) {
    if (!this._helper) return;
    if (this._hovered?.kind !== "rotate") return;
    const vp = this._helper.getLastViewport();
    if (vp.z <= 0 || vp.w <= 0) return;

    const scene = this._helper.getScene();
    const camera = this._helper.getCamera();

    if (
      !this._bloom ||
      this._bloom.size.z !== vp.z ||
      this._bloom.size.w !== vp.w
    ) {
      const composer = new EffectComposer(renderer);
      const renderPass = new RenderPass(scene, camera);
      renderPass.clear = true;
      const bloomPass = new UnrealBloomPass(
        new Vector2(vp.z, vp.w),
        1.1,
        0.35,
        0.2
      );
      composer.addPass(renderPass);
      composer.addPass(bloomPass);
      composer.setSize(vp.z, vp.w);

      const overlayScene = new Scene();
      const overlayCamera = new ThreeOrthoCamera(-1, 1, 1, -1, 0, 1);
      const overlayMesh = new Mesh(
        new PlaneGeometry(2, 2),
        meshBasicAdditiveOverlayMaterial
      );
      meshBasicAdditiveOverlayMaterial.map = composer.readBuffer.texture;
      overlayScene.add(overlayMesh);

      this._bloom = {
        composer,
        renderPass,
        bloomPass,
        size: vp.clone(),
        overlayScene,
        overlayCamera,
        overlayMesh
      };
    }

    const prevViewport = new Vector4();
    const prevScissor = new Vector4();
    renderer.getViewport(prevViewport);
    renderer.getScissor(prevScissor);
    const prevScissorTest = renderer.getScissorTest();
    const prevClearColor = new Color();
    renderer.getClearColor(prevClearColor);
    const prevClearAlpha = renderer.getClearAlpha();

    renderer.setScissorTest(true);
    renderer.setScissor(vp.x, vp.y, vp.z, vp.w);
    renderer.setViewport(vp.x, vp.y, vp.z, vp.w);
    renderer.setClearColor(0x000000, 0);
    renderer.clearDepth();

    const prevMask = camera.layers.mask;
    const layer =
      this._hovered?.kind === "rotate" && this._hovered.dir === "ccw"
        ? BLOOM_LAYER_CCW
        : BLOOM_LAYER_CW;
    camera.layers.set(layer);

    const composer = this._bloom.composer;
    composer.renderToScreen = false;
    composer.render();

    renderer.render(this._bloom.overlayScene, this._bloom.overlayCamera);
    camera.layers.mask = prevMask;

    renderer.setClearColor(prevClearColor, prevClearAlpha);
    renderer.setViewport(
      prevViewport.x,
      prevViewport.y,
      prevViewport.z,
      prevViewport.w
    );
    renderer.setScissor(
      prevScissor.x,
      prevScissor.y,
      prevScissor.z,
      prevScissor.w
    );
    renderer.setScissorTest(prevScissorTest);
  }

  private startAxisAnimation(axis: ZUpAxisType) {
    const camera = this.getCamera();
    const center = this.getHelperCenter();
    const desiredViewDir = this.axisToVector(axis).clone().multiplyScalar(-1);
    const currentTarget = this.cameraController.target.clone();
    const currentViewDir = currentTarget
      .clone()
      .sub(camera.position)
      .normalize();
    const baseRotation = new Quaternion().setFromUnitVectors(
      currentViewDir,
      desiredViewDir
    );
    const baseUp = camera.up.clone().applyQuaternion(baseRotation).normalize();

    // Keep the panned rig shape, but quantize the final standard view roll.
    const snappedUp = snapUpToNearestCardinalInPlane(desiredViewDir, baseUp);
    const rollAngle = signedAngleAroundAxis(baseUp, snappedUp, desiredViewDir);
    const rollRotation = new Quaternion().setFromAxisAngle(
      desiredViewDir,
      rollAngle
    );
    const finalRotation = rollRotation.multiply(baseRotation).normalize();
    this.debugViewHelper("startAxisAnimation", {
      axis,
      desiredViewDir,
      currentTarget
    });

    this._anim = {
      start: performance.now(),
      duration: 300,
      center,
      dist: camera.position.distanceTo(currentTarget),
      fromDir: camera.position.clone().sub(currentTarget).normalize(),
      toDir: desiredViewDir.clone().multiplyScalar(-1),
      fromUp: camera.up.clone(),
      toUp: snappedUp,
      rigRotation: finalRotation,
      rigFromCameraOffset: camera.position.clone().sub(center),
      rigFromTargetOffset: currentTarget.sub(center)
    };
  }

  private startRollAnimation(dir: RotateArrowDir) {
    if (this.isAnimating) return;
    const camera = this.getCamera();
    const center = this.getHelperCenter();
    const dist = camera.position.distanceTo(center);
    const viewDir = center.clone().sub(camera.position).normalize();
    const angle = dir === "ccw" ? Math.PI / 2 : -Math.PI / 2;
    const toUp = camera.up.clone().applyAxisAngle(viewDir, angle).normalize();
    const fromDir = camera.position.clone().sub(center).normalize();

    this._anim = {
      start: performance.now(),
      duration: 220,
      center,
      dist,
      fromDir,
      toDir: fromDir.clone(),
      fromUp: camera.up.clone(),
      toUp,
      rollAxis: viewDir.clone(),
      rollAngle: angle
    };
  }

  private axisToVector(axis: ZUpAxisType) {
    switch (axis) {
      case "posX":
        return new Vector3(1, 0, 0);
      case "negX":
        return new Vector3(-1, 0, 0);
      case "posY":
        return new Vector3(0, 1, 0);
      case "negY":
        return new Vector3(0, -1, 0);
      case "posZ":
        return new Vector3(0, 0, 1);
      case "negZ":
        return new Vector3(0, 0, -1);
    }
  }

  // Intentionally no axisToUp(): camera up behavior is centralized in `upPolicy`.
}
