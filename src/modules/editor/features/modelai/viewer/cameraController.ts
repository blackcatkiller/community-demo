// @ts-nocheck
import { Observable } from "@modelai/core/observable";
import type {
  ICameraController,
  CameraType,
  XYZLike
} from "@modelai/core/types";
import { MathUtils } from "@modelai/core/math";
import {
  Box3,
  Camera,
  OrthographicCamera,
  PerspectiveCamera,
  Quaternion,
  Sphere,
  Vector3
} from "three";
import type { ThreeView } from "./view";
import { computeUpForViewDir, WORLD_UP } from "./upPolicy";

const DEG_TO_RAD = Math.PI / 180;
const ROTATE_SPEED = 0.25;
const FOV = 50;
const NEAR = 0.1;
const FAR = 1e6;
const MIN_DIST = 1e-3;
const EMPTY_SIZE = 800;
const ORTHO_MIN_ZOOM = 1e-5;
const ORTHO_MAX_ZOOM = 1e8;
const WHEEL_ZOOM_DELTA_UNIT = 120;
const WHEEL_ZOOM_BASE_RATIO = 1.12;
const WHEEL_ZOOM_MIN_STEPS = 0.25;
const WHEEL_ZOOM_MAX_STEPS = 4;
const WHEEL_SESSION_MS = 160;
const WHEEL_SESSION_PX = 18;
const ZOOM_ACTIVE_MS = 100;
const PERSPECTIVE_WHEEL_HIT_CACHE_MS = 160;
const PERSPECTIVE_WHEEL_HIT_CACHE_PX = 18;
const PERSPECTIVE_HIT_MARGIN = 1e-2;
const PERSPECTIVE_ZOOM_ACTIVE_SMOOTH_TIME = 0.012;
const PERSPECTIVE_ZOOM_SMOOTH_TIME = 0.026;
const ORTHOGRAPHIC_ZOOM_ACTIVE_SMOOTH_TIME = 0.01;
const ORTHOGRAPHIC_ZOOM_SMOOTH_TIME = 0.02;
const ZOOM_SNAP_RATIO = 1e-4;

// Keep world axis style centralized in `upPolicy`.
Camera.DEFAULT_UP = WORLD_UP;

const CAM_DEBUG_FLAG = "__MODELAI_CAM_DEBUG__";

type DebugVec3 = {
  x: number;
  y: number;
  z: number;
};

type DebugQuat = {
  x: number;
  y: number;
  z: number;
  w: number;
};

type RotateDebugMotion = {
  frame: number;
  input?: {
    dx: number;
    dy: number;
  };
  scaledInput?: {
    dx: number;
    dy: number;
  };
  pitchAxis?: DebugVec3;
  yawAxis?: DebugVec3;
  rotationQuat?: DebugQuat;
  axisAlignment?: {
    yawVsForwardAbsDot: number;
    yawVsUpAbsDot: number;
    yawVsRightAbsDot: number;
  };
  before?: RotateDebugState;
  after?: RotateDebugState;
};

type RotateDebugState = {
  dist: number;
  pos: DebugVec3;
  target: DebugVec3;
  up: DebugVec3;
  lastRight: DebugVec3;
  derivedRight: DebugVec3;
  rotateCenter?: DebugVec3;
  quat: DebugQuat;
};

type ViewHelperDebugRecord = {
  at: number;
  tag: string;
  axis?: string;
  center: DebugVec3;
  pos: DebugVec3;
  up: DebugVec3;
  target: DebugVec3;
  desiredViewDir?: DebugVec3;
  currentTarget?: DebugVec3;
};

type RotateDebugSession = {
  seq: number;
  startedAt: number;
  startTag?: string;
  pointer?: {
    x: number;
    y: number;
  };
  helper?: ViewHelperDebugRecord & {
    ageMs: number;
  };
  start?: RotateDebugState;
  firstMotion?: RotateDebugMotion;
  lastMotion?: RotateDebugMotion;
};

type FreeRotateState = {
  position: Vector3;
  target: Vector3;
  up: Vector3;
  rotateCenter: Vector3;
  pitchAxis: Vector3;
  yawAxis: Vector3;
  totalDx: number;
  totalDy: number;
};

type FreeRotateBasis = {
  forward: Vector3;
  right: Vector3;
  up: Vector3;
  pitchAxis: Vector3;
  yawAxis: Vector3;
};

type PerspectiveWheelDepthCache = {
  at: number;
  x: number;
  y: number;
  hitDistance: number;
  focusDistance: number;
};

type OrthographicWheelSession = {
  at: number;
  x: number;
  y: number;
  ndcX: number;
  ndcY: number;
  anchor: Vector3;
  forward: Vector3;
  right: Vector3;
  up: Vector3;
  distance: number;
};

type PerspectiveZoomGoal = {
  kind: "perspective";
  position: Vector3;
  target: Vector3;
  focus: Vector3;
};

type OrthographicZoomGoal = {
  kind: "orthographic";
  zoom: number;
  session: OrthographicWheelSession;
};

type CameraZoomGoal = PerspectiveZoomGoal | OrthographicZoomGoal;

function getCamDebugFlag(): unknown {
  // Enable from DevTools console:
  // `window.__MODELAI_CAM_DEBUG__ = true` (logs only risky states, throttled)
  // `window.__MODELAI_CAM_DEBUG__ = "verbose"` (logs every call, throttled)
  return (globalThis as any)?.[CAM_DEBUG_FLAG];
}

export class CameraController extends Observable implements ICameraController {
  private _width = 100;
  private _height = 100;
  private _target = new Vector3();
  private _position = new Vector3(1500, 1500, 1500);
  private _rotateCenter: Vector3 | undefined;
  private _camera: PerspectiveCamera | OrthographicCamera;
  private _lastRight = new Vector3(1, 0, 0);
  private _initialPose?: {
    position: Vector3;
    target: Vector3;
    up: Vector3;
    quaternion: Quaternion;
    orthoZoom: number;
  };
  private _dbgLastLogAt = 0;
  private _rotateDebugSeq = 0;
  private _rotateDebugFrames = 0;
  private _orthoZoom = 1;
  private _lastViewHelperDebug?: ViewHelperDebugRecord;
  private _rotateDebugSession?: RotateDebugSession;
  private _freeRotateState?: FreeRotateState;
  private _freeRotateBasis?: FreeRotateBasis;
  private _perspectiveWheelDepthCache?: PerspectiveWheelDepthCache;
  private _orthographicWheelSession?: OrthographicWheelSession;
  private _zoomGoal?: CameraZoomGoal;
  private _pointerInteractionMode?: "rotate" | "pan";
  private _lastZoomInputAt = 0;
  get cameraType(): CameraType {
    return this.getPrivateValue("cameraType" as any, "orthographic") as any;
  }
  set cameraType(v: CameraType) {
    if (this.setProperty("cameraType" as any, v as any)) {
      this.clearZoomInteractionState();
      this._camera = this.createCamera();
      if (this._camera instanceof OrthographicCamera) {
        this._orthoZoom = 1;
        this.updateOrtho(this._camera);
      }
      this.updateCameraPositionTarget();
    }
  }

  get target() {
    return this._target;
  }
  get camera() {
    return this._camera;
  }
  get lastRight() {
    return this._lastRight;
  }
  get interactionTarget() {
    if (this._pointerInteractionMode === "rotate") {
      return (this._rotateCenter ?? this._target).clone();
    }
    if (this._zoomGoal?.kind === "perspective") {
      return this._zoomGoal.focus.clone();
    }
    if (this._zoomGoal?.kind === "orthographic") {
      return this._zoomGoal.session.anchor.clone();
    }
    return this._target.clone();
  }
  get shouldShowInteractionTarget() {
    return (
      this._pointerInteractionMode === "rotate" || this._zoomGoal !== undefined
    );
  }
  get viewHelperCenter() {
    return this.getContentCenter();
  }

  constructor(readonly view: ThreeView) {
    super();
    this._camera = this.createCamera();
    this.refreshFreeRotateBasis();
  }

  // Capture the current camera pose as the "model load" pose.
  // This is intentionally separate from `fitContent()` so manual refits do not
  // silently overwrite the initial pose.
  storeInitialPose() {
    this._initialPose = {
      position: this._position.clone(),
      target: this._target.clone(),
      up: this._camera.up.clone(),
      quaternion: this._camera.quaternion.clone(),
      orthoZoom: this._orthoZoom
    };
  }

  // Restore to the pose captured by `storeInitialPose()`.
  restoreInitialPose() {
    if (!this._initialPose) return false;
    if (this._camera instanceof OrthographicCamera) {
      this._orthoZoom = this._initialPose.orthoZoom;
      this.updateOrtho(this._camera);
      this.updateNearFar();
    }
    this.lookAt(
      this._initialPose.position,
      this._initialPose.target,
      this._initialPose.up
    );
    return true;
  }

  getInitialPose() {
    return this._initialPose;
  }

  private createCamera() {
    let cam: PerspectiveCamera | OrthographicCamera;
    if (this.cameraType === "perspective") {
      cam = new PerspectiveCamera(FOV, this._width / this._height, NEAR, FAR);
    } else {
      cam = new OrthographicCamera(
        -this._width / 2,
        this._width / 2,
        this._height / 2,
        -this._height / 2,
        NEAR,
        FAR
      );
    }
    return cam;
  }

  setSize(w: number, h: number) {
    this._width = w;
    this._height = h;
    if (this._camera instanceof PerspectiveCamera) this._camera.aspect = w / h;
    else this.updateOrtho(this._camera);
    this._camera.updateProjectionMatrix();
  }

  private clearPerspectiveWheelDepthCache() {
    this._perspectiveWheelDepthCache = undefined;
  }

  private clearOrthographicWheelSession() {
    this._orthographicWheelSession = undefined;
  }

  private clearZoomGoal() {
    this._zoomGoal = undefined;
  }

  private clearZoomInteractionState() {
    this.clearPerspectiveWheelDepthCache();
    this.clearOrthographicWheelSession();
    this.clearZoomGoal();
  }

  private updateOrtho(cam: OrthographicCamera) {
    const aspect = this._width / this._height;
    const dist = this._position.distanceTo(this._target);
    const baseHalfH = dist * Math.tan((FOV * DEG_TO_RAD) / 2);
    const halfH = baseHalfH / this._orthoZoom;
    cam.left = -halfH * aspect;
    cam.right = halfH * aspect;
    cam.top = halfH;
    cam.bottom = -halfH;
  }

  updateCameraPositionTarget() {
    this._camera.position.copy(this._position);
    this._camera.lookAt(this._target);
    this._camera.updateProjectionMatrix();

    this.updateLastRight();
    this.refreshFreeRotateBasis();
  }

  private updateLastRight() {
    const dir = this._target.clone().sub(this._position).normalize();
    const right = new Vector3().crossVectors(dir, this._camera.up);
    const len2 = right.lengthSq();
    if (len2 < 1e-8) return;
    right.multiplyScalar(1 / Math.sqrt(len2));
    this._lastRight.copy(right);
  }

  private debugNav(tag: string) {
    const flag = getCamDebugFlag();
    if (!flag) return;

    const verbose = flag === "verbose";
    if (verbose && (tag === "rotate" || tag === "pan")) {
      return;
    }
    const now =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    const minIntervalMs = verbose ? 200 : 500;
    if (now - this._dbgLastLogAt < minIntervalMs) return;

    const viewDir = this._target.clone().sub(this._position);
    const dist = viewDir.length();
    if (dist <= 1e-9) return;

    const dirN = viewDir.multiplyScalar(1 / dist);
    const upN = this._camera.up.clone().normalize();
    const dot = dirN.dot(upN);
    const absDot = Math.abs(dot);
    const rightLen2 = new Vector3().crossVectors(dirN, upN).lengthSq();

    // In non-verbose mode, only report near-degenerate configurations.
    if (!verbose && absDot < 0.95 && rightLen2 > 1e-4) return;

    this._dbgLastLogAt = now;
    console.log(`[cam] ${tag}`, {
      absDotDirUp: absDot,
      dotDirUp: dot,
      rightLen2,
      dist,
      pos: { x: this._position.x, y: this._position.y, z: this._position.z },
      target: { x: this._target.x, y: this._target.y, z: this._target.z },
      up: { x: this._camera.up.x, y: this._camera.up.y, z: this._camera.up.z },
      quat: {
        x: this._camera.quaternion.x,
        y: this._camera.quaternion.y,
        z: this._camera.quaternion.z,
        w: this._camera.quaternion.w
      }
    });
  }

  private toDebugNumber(value: number) {
    return Number(value.toFixed(4));
  }

  private toDebugVec3(v: Vector3): DebugVec3 {
    return {
      x: this.toDebugNumber(v.x),
      y: this.toDebugNumber(v.y),
      z: this.toDebugNumber(v.z)
    };
  }

  private toDebugQuat(q: Quaternion): DebugQuat {
    return {
      x: this.toDebugNumber(q.x),
      y: this.toDebugNumber(q.y),
      z: this.toDebugNumber(q.z),
      w: this.toDebugNumber(q.w)
    };
  }

  private captureRotateDebugState(): RotateDebugState {
    const viewDir = this._target.clone().sub(this._position);
    const dist = viewDir.length();
    const up = this._camera.up.clone().normalize();
    const right = new Vector3().crossVectors(viewDir.clone().normalize(), up);
    const safeRight =
      right.lengthSq() > 1e-8 ? right.normalize() : this._lastRight.clone();

    return {
      dist: this.toDebugNumber(dist),
      pos: this.toDebugVec3(this._position),
      target: this.toDebugVec3(this._target),
      up: this.toDebugVec3(up),
      lastRight: this.toDebugVec3(this._lastRight),
      derivedRight: this.toDebugVec3(safeRight),
      rotateCenter: this._rotateCenter
        ? this.toDebugVec3(this._rotateCenter)
        : undefined,
      quat: this.toDebugQuat(this._camera.quaternion)
    };
  }

  private computeAxisAlignment(axis: Vector3 | DebugVec3) {
    const axisVector =
      axis instanceof Vector3
        ? axis.clone()
        : new Vector3(axis.x, axis.y, axis.z);
    if (axisVector.lengthSq() > 1e-8) axisVector.normalize();
    const forward = this._target.clone().sub(this._position).normalize();
    const up = this._camera.up.clone().normalize();
    const right = new Vector3().crossVectors(forward, up);
    if (right.lengthSq() > 1e-8) right.normalize();
    else right.copy(this._lastRight).normalize();

    return {
      yawVsForwardAbsDot: this.toDebugNumber(Math.abs(axisVector.dot(forward))),
      yawVsUpAbsDot: this.toDebugNumber(Math.abs(axisVector.dot(up))),
      yawVsRightAbsDot: this.toDebugNumber(Math.abs(axisVector.dot(right)))
    };
  }

  private ensureRotateDebugSession() {
    const flag = getCamDebugFlag();
    if (flag !== "verbose") return undefined;
    if (this._rotateDebugSession) return this._rotateDebugSession;

    const now =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    const helper = this._lastViewHelperDebug;
    const helperAgeMs = helper ? now - helper.at : Number.POSITIVE_INFINITY;
    this._rotateDebugSession = {
      seq: this._rotateDebugSeq,
      startedAt: now,
      helper:
        helper && helperAgeMs <= 5000
          ? {
              ...helper,
              ageMs: this.toDebugNumber(helperAgeMs)
            }
          : undefined
    };
    return this._rotateDebugSession;
  }

  private debugRotateSnapshot(
    tag: string,
    extra?: Record<string, unknown>,
    force = false
  ) {
    const flag = getCamDebugFlag();
    if (!flag) return;

    const verbose = flag === "verbose";
    if (!verbose && !force) return;
    const session = this.ensureRotateDebugSession();
    if (!session) return;

    const payload = (extra ?? {}) as Record<string, any>;
    if (tag.startsWith("startRotate:")) {
      session.startTag = tag;
      session.pointer = payload.pointer;
      session.start = this.captureRotateDebugState();
      return;
    }

    let motionTarget: RotateDebugMotion;
    if (!session.firstMotion) {
      motionTarget = session.firstMotion = { frame: this._rotateDebugFrames };
    } else if (session.firstMotion.frame === this._rotateDebugFrames) {
      motionTarget = session.firstMotion;
    } else if (session.lastMotion?.frame === this._rotateDebugFrames) {
      motionTarget = session.lastMotion;
    } else {
      motionTarget = session.lastMotion = { frame: this._rotateDebugFrames };
    }

    motionTarget.frame = this._rotateDebugFrames;
    if (payload.input) motionTarget.input = payload.input;
    if (payload.scaledInput) motionTarget.scaledInput = payload.scaledInput;
    if (payload.pitchAxis) motionTarget.pitchAxis = payload.pitchAxis;
    if (payload.yawAxis) {
      motionTarget.yawAxis = this.toDebugVec3(payload.yawAxis);
      motionTarget.axisAlignment = this.computeAxisAlignment(payload.yawAxis);
    }
    if (payload.rotationQuat)
      motionTarget.rotationQuat = this.toDebugQuat(payload.rotationQuat);
    if (tag === "rotate:beforeApply")
      motionTarget.before = this.captureRotateDebugState();
    if (tag === "rotate:afterApply")
      motionTarget.after = this.captureRotateDebugState();
  }

  noteViewHelperDebug(
    tag: string,
    extra?: {
      axis?: string;
      center?: Vector3;
      desiredViewDir?: Vector3;
      currentTarget?: Vector3;
    }
  ) {
    const flag = getCamDebugFlag();
    if (flag !== "verbose") return;
    this._lastViewHelperDebug = {
      at: typeof performance !== "undefined" ? performance.now() : Date.now(),
      tag,
      axis: extra?.axis,
      center: this.toDebugVec3(extra?.center ?? this.viewHelperCenter),
      pos: this.toDebugVec3(this._camera.position),
      up: this.toDebugVec3(this._camera.up),
      target: this.toDebugVec3(this._target),
      desiredViewDir: extra?.desiredViewDir
        ? this.toDebugVec3(extra.desiredViewDir)
        : undefined,
      currentTarget: extra?.currentTarget
        ? this.toDebugVec3(extra.currentTarget)
        : undefined
    };
  }

  flushRotateDebugSummary(reason = "pointerUp") {
    const session = this._rotateDebugSession;
    this._rotateDebugSession = undefined;
    if (!session) return;

    const endedAt =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    const summary = {
      reason,
      durationMs: this.toDebugNumber(endedAt - session.startedAt),
      frames: this._rotateDebugFrames,
      startTag: session.startTag,
      pointer: session.pointer,
      helper: session.helper,
      start: session.start,
      firstMotion: session.firstMotion,
      lastMotion: session.lastMotion,
      end: this.captureRotateDebugState()
    };
    console.log(`[cam][rotate#${session.seq}] ${JSON.stringify(summary)}`);
  }

  private getContentDepthRange(viewDir: Vector3) {
    const box = new Box3().setFromObject(this.view.context.visualShapes);
    if (box.isEmpty()) return undefined;

    const { min, max } = box;
    const corners = [
      new Vector3(min.x, min.y, min.z),
      new Vector3(min.x, min.y, max.z),
      new Vector3(min.x, max.y, min.z),
      new Vector3(min.x, max.y, max.z),
      new Vector3(max.x, min.y, min.z),
      new Vector3(max.x, min.y, max.z),
      new Vector3(max.x, max.y, min.z),
      new Vector3(max.x, max.y, max.z)
    ];

    let minDepth = Number.POSITIVE_INFINITY;
    let maxDepth = Number.NEGATIVE_INFINITY;
    for (const corner of corners) {
      const depth = corner.clone().sub(this._position).dot(viewDir);
      minDepth = Math.min(minDepth, depth);
      maxDepth = Math.max(maxDepth, depth);
    }

    return { minDepth, maxDepth, box };
  }

  private debugOrthoClipping(
    tag: string,
    payload: {
      dist: number;
      nearBase: number;
      farBase: number;
      centerDepth: number;
      frontDepth: number;
      backDepth: number;
      margin: number;
      nearFinal: number;
      farFinal: number;
      radius: number;
      depthRange?: {
        minDepth: number;
        maxDepth: number;
      };
    }
  ) {
    const flag = getCamDebugFlag();
    if (!flag || !(this._camera instanceof OrthographicCamera)) return;

    const verbose = flag === "verbose";
    const now =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    const minIntervalMs = verbose ? 120 : 250;
    if (now - this._dbgLastLogAt < minIntervalMs) return;

    const overlap =
      payload.depthRange &&
      payload.nearFinal >= payload.depthRange.minDepth - payload.margin;
    const nearGap = payload.depthRange
      ? payload.depthRange.minDepth - payload.nearFinal
      : undefined;
    const farGap = payload.depthRange
      ? payload.farFinal - payload.depthRange.maxDepth
      : undefined;
    const pivotOffset = this._rotateCenter
      ? this._rotateCenter.distanceTo(this.getContentCenter())
      : undefined;
    const pivotRisk =
      pivotOffset !== undefined &&
      pivotOffset > Math.max(100, payload.radius * 3);
    const rangeRisk =
      payload.depthRange &&
      (payload.depthRange.minDepth <= 0 ||
        payload.nearFinal >= payload.depthRange.minDepth ||
        payload.farFinal <= payload.depthRange.maxDepth);

    if (!verbose && !overlap && !pivotRisk && !rangeRisk) return;

    this._dbgLastLogAt = now;
    const details = {
      dist: payload.dist,
      nearBase: payload.nearBase,
      farBase: payload.farBase,
      nearFinal: payload.nearFinal,
      farFinal: payload.farFinal,
      centerDepth: payload.centerDepth,
      frontDepth: payload.frontDepth,
      backDepth: payload.backDepth,
      margin: payload.margin,
      radius: payload.radius,
      minDepth: payload.depthRange?.minDepth,
      maxDepth: payload.depthRange?.maxDepth,
      nearGap,
      farGap,
      modelCrossesNear:
        payload.depthRange !== undefined &&
        payload.depthRange.minDepth <= payload.nearFinal,
      modelPastCamera:
        payload.depthRange !== undefined && payload.depthRange.minDepth <= 0,
      rotateCenter: this._rotateCenter
        ? {
            x: this._rotateCenter.x,
            y: this._rotateCenter.y,
            z: this._rotateCenter.z
          }
        : undefined,
      rotateCenterOffsetFromContent:
        pivotOffset !== undefined ? pivotOffset : undefined,
      pos: { x: this._position.x, y: this._position.y, z: this._position.z },
      target: { x: this._target.x, y: this._target.y, z: this._target.z }
    };
    console.log(`[cam][ortho-clip] ${tag} ${JSON.stringify(details)}`);
  }

  private getContentSphere() {
    const box = new Box3().setFromObject(this.view.context.visualShapes);
    const sphere = new Sphere();
    box.getBoundingSphere(sphere);
    if (sphere.radius <= 0) {
      sphere.center.copy(this._target);
      sphere.radius = EMPTY_SIZE;
    }
    return sphere;
  }

  getContentCenter() {
    return this.getContentSphere().center.clone();
  }

  private calcOrthoPanWorldPerPixel(camera: OrthographicCamera) {
    const safeWidth = Math.max(1, this._width);
    const safeHeight = Math.max(1, this._height);
    return {
      x: Math.abs(camera.right - camera.left) / safeWidth,
      y: Math.abs(camera.top - camera.bottom) / safeHeight
    };
  }

  private calcPerspectivePanWorldPerPixel(
    camera: PerspectiveCamera,
    distance: number
  ) {
    const safeWidth = Math.max(1, this._width);
    const safeHeight = Math.max(1, this._height);
    const halfHeight =
      distance * Math.tan(MathUtils.degToRad(camera.getEffectiveFOV()) / 2);
    const halfWidth = halfHeight * camera.aspect;
    return {
      x: (halfWidth * 2) / safeWidth,
      y: (halfHeight * 2) / safeHeight
    };
  }

  pan(dx: number, dy: number) {
    this.clearZoomInteractionState();
    this._pointerInteractionMode = "pan";
    const vector = this._target.clone().sub(this._position);
    const distance = vector.length();
    if (distance <= 1e-8) return;

    const basis = this._freeRotateBasis ?? this.buildFreeRotateBasis();
    if (!basis) return;

    const worldPerPixel =
      this._camera instanceof OrthographicCamera
        ? this.calcOrthoPanWorldPerPixel(this._camera)
        : this.calcPerspectivePanWorldPerPixel(this._camera, distance);

    const vec = basis.right
      .clone()
      .multiplyScalar(-dx * worldPerPixel.x)
      .add(basis.up.clone().multiplyScalar(dy * worldPerPixel.y));
    this._target.add(vec);
    this._position.add(vec);
    this.updateCameraPositionTarget();
    this.rebaseFreeRotateState();
    this.debugNav("pan");
  }

  private buildBasisForPose(
    position: Vector3,
    target: Vector3
  ): FreeRotateBasis | undefined {
    const forward = target.clone().sub(position);
    if (forward.lengthSq() < 1e-8) return undefined;
    forward.normalize();

    const rawUp = this._camera.up.clone();
    if (rawUp.lengthSq() < 1e-8)
      rawUp.copy(computeUpForViewDir(forward, WORLD_UP, this._lastRight));
    else rawUp.normalize();

    const right = new Vector3().crossVectors(forward, rawUp);
    if (right.lengthSq() < 1e-8) {
      right.copy(this._lastRight);
    }
    if (right.lengthSq() < 1e-8) {
      right.copy(new Vector3().crossVectors(forward, WORLD_UP));
    }
    if (right.lengthSq() < 1e-8) {
      right.copy(new Vector3().crossVectors(forward, new Vector3(1, 0, 0)));
    }
    if (right.lengthSq() < 1e-8) {
      right.copy(new Vector3(1, 0, 0));
    }
    right.normalize();

    const up = new Vector3().crossVectors(right, forward);
    if (up.lengthSq() < 1e-8) return undefined;
    up.normalize();

    return {
      forward,
      right: right.clone(),
      up: up.clone(),
      pitchAxis: right.clone(),
      yawAxis: up.clone()
    };
  }

  private buildFreeRotateBasis(): FreeRotateBasis | undefined {
    return this.buildBasisForPose(this._position, this._target);
  }

  private refreshFreeRotateBasis() {
    const basis = this.buildFreeRotateBasis();
    if (basis) this._freeRotateBasis = basis;
  }

  private captureFreeRotateState() {
    const center = (this._rotateCenter ?? this._target).clone();
    const basis = this._freeRotateBasis ?? this.buildFreeRotateBasis();
    this._freeRotateState = {
      position: this._position.clone(),
      target: this._target.clone(),
      up: this._camera.up.clone(),
      rotateCenter: center,
      pitchAxis:
        basis?.pitchAxis.clone() ?? this._lastRight.clone().normalize(),
      yawAxis: basis?.yawAxis.clone() ?? this._camera.up.clone().normalize(),
      totalDx: 0,
      totalDy: 0
    };
  }

  private rebaseFreeRotateState() {
    if (!this._freeRotateState) return;
    const basis = this._freeRotateBasis ?? this.buildFreeRotateBasis();
    this._freeRotateState = {
      position: this._position.clone(),
      target: this._target.clone(),
      up: this._camera.up.clone(),
      rotateCenter: (
        this._rotateCenter ?? this._freeRotateState.rotateCenter
      ).clone(),
      pitchAxis:
        basis?.pitchAxis.clone() ?? this._freeRotateState.pitchAxis.clone(),
      yawAxis: basis?.yawAxis.clone() ?? this._freeRotateState.yawAxis.clone(),
      totalDx: 0,
      totalDy: 0
    };
  }

  private getVisualHitPointAt(mx: number, my: number) {
    const hit = this.view
      .getPointVisualHits(this.view.pointQueryAt(mx, my))
      .find(item => item.point);
    if (!hit?.point) return undefined;
    return new Vector3(hit.point.x, hit.point.y, hit.point.z);
  }

  private resolveRotatePivot(mx: number, my: number) {
    const hitPoint = this.getVisualHitPointAt(mx, my);
    if (hitPoint) {
      return {
        point: hitPoint,
        tag: "startRotate:hitPoint"
      } as const;
    }

    return {
      point: this.getContentCenter(),
      tag: "startRotate:content"
    } as const;
  }

  startRotate(x: number, y: number) {
    this.flushRotateDebugSummary("restart");
    this._rotateDebugSeq += 1;
    this._rotateDebugFrames = 0;
    this._freeRotateState = undefined;
    this._pointerInteractionMode = "rotate";
    const pivot = this.resolveRotatePivot(x, y);
    this._rotateCenter = pivot.point;
    this.captureFreeRotateState();
    this.debugRotateSnapshot(pivot.tag, {
      pointer: { x, y }
    });
  }

  rotate(dx: number, dy: number) {
    this.clearZoomInteractionState();
    this._pointerInteractionMode = "rotate";
    this._rotateDebugFrames += 1;
    const state = this._freeRotateState ?? {
      position: this._position.clone(),
      target: this._target.clone(),
      up: this._camera.up.clone(),
      rotateCenter: (this._rotateCenter ?? this._target).clone(),
      pitchAxis:
        this._freeRotateBasis?.pitchAxis.clone() ??
        this._lastRight.clone().normalize(),
      yawAxis:
        this._freeRotateBasis?.yawAxis.clone() ??
        this._camera.up.clone().normalize(),
      totalDx: 0,
      totalDy: 0
    };
    this._freeRotateState = state;
    state.totalDx += dx * ROTATE_SPEED;
    state.totalDy += dy * ROTATE_SPEED;
    const rotation = this.getRotation(
      state.totalDx,
      state.totalDy,
      state.pitchAxis,
      state.yawAxis
    );
    if (this._rotateDebugFrames <= 8) {
      this.debugRotateSnapshot("rotate:beforeApply", {
        input: { dx, dy },
        scaledInput: {
          dx: state.totalDx,
          dy: state.totalDy
        },
        rotationQuat: {
          x: rotation.x,
          y: rotation.y,
          z: rotation.z,
          w: rotation.w
        }
      });
    }
    const center = state.rotateCenter;
    this._camera.up.copy(
      state.up.clone().applyQuaternion(rotation).normalize()
    );
    this._position.copy(
      center
        .clone()
        .add(state.position.clone().sub(center).applyQuaternion(rotation))
    );
    this._target.copy(
      center
        .clone()
        .add(state.target.clone().sub(center).applyQuaternion(rotation))
    );
    this.updateNearFar();
    this.updateCameraPositionTarget();
    if (this._rotateDebugFrames <= 8) {
      this.debugRotateSnapshot("rotate:afterApply", {
        input: { dx, dy }
      });
    }
    this.debugNav("rotate");
  }

  private getRotation(
    dx: number,
    dy: number,
    pitchAxis = this._lastRight,
    yawAxis = this._camera.up
  ) {
    const safePitchAxis = pitchAxis.clone().normalize();
    const safeYawAxis = yawAxis.clone().normalize();
    const rdy = new Quaternion().setFromAxisAngle(
      safePitchAxis,
      MathUtils.degToRad(-dy)
    );
    const rdx = new Quaternion().setFromAxisAngle(
      safeYawAxis,
      MathUtils.degToRad(-dx)
    );
    if (this._rotateDebugFrames < 8) {
      this.debugRotateSnapshot("getRotation", {
        scaledInput: { dx, dy },
        pitchAxis: {
          x: safePitchAxis.x,
          y: safePitchAxis.y,
          z: safePitchAxis.z
        },
        yawAxis: {
          x: safeYawAxis.x,
          y: safeYawAxis.y,
          z: safeYawAxis.z
        }
      });
    }
    return rdx.multiply(rdy).normalize();
  }

  private calcOrthoScreenPointAt(
    mx: number,
    my: number,
    position: Vector3,
    target: Vector3,
    orthoZoom: number
  ) {
    const basis = this.buildBasisForPose(position, target);
    if (!basis) return target.clone();

    const x = (2 * mx) / this._width - 1;
    const y = (-2 * my) / this._height + 1;
    const aspect = this._width / Math.max(1, this._height);
    const distance = position.distanceTo(target);
    const halfHeight =
      (distance * Math.tan((FOV * DEG_TO_RAD) / 2)) / Math.max(orthoZoom, 1e-8);
    const halfWidth = halfHeight * aspect;

    return target
      .clone()
      .add(basis.right.multiplyScalar(x * halfWidth))
      .add(basis.up.multiplyScalar(y * halfHeight));
  }

  private calcPerspectiveScreenPointAt(
    mx: number,
    my: number,
    position: Vector3,
    target: Vector3
  ) {
    const basis = this.buildBasisForPose(position, target);
    if (!basis) return target.clone();

    const x = (2 * mx) / this._width - 1;
    const y = (-2 * my) / this._height + 1;
    const aspect = this._width / Math.max(1, this._height);
    const distance = position.distanceTo(target);
    const halfHeight =
      distance *
      Math.tan(
        MathUtils.degToRad(
          this._camera instanceof PerspectiveCamera
            ? this._camera.getEffectiveFOV()
            : FOV
        ) / 2
      );
    const halfWidth = halfHeight * aspect;

    return target
      .clone()
      .add(basis.right.multiplyScalar(x * halfWidth))
      .add(basis.up.multiplyScalar(y * halfHeight));
  }

  private resolveOrthographicPose(
    session: OrthographicWheelSession,
    orthoZoom: number
  ) {
    const halfHeight =
      (session.distance * Math.tan((FOV * DEG_TO_RAD) / 2)) /
      Math.max(orthoZoom, 1e-8);
    const halfWidth = halfHeight * (this._width / Math.max(1, this._height));
    const target = session.anchor
      .clone()
      .sub(session.right.clone().multiplyScalar(session.ndcX * halfWidth))
      .sub(session.up.clone().multiplyScalar(session.ndcY * halfHeight));
    const position = target
      .clone()
      .sub(session.forward.clone().multiplyScalar(session.distance));
    return { position, target };
  }

  private getZoomSourceState() {
    const goal = this._zoomGoal;
    if (!goal) {
      return {
        position: this._position.clone(),
        target: this._target.clone(),
        orthoZoom: this._orthoZoom
      };
    }
    if (goal.kind === "perspective") {
      return {
        position: goal.position.clone(),
        target: goal.target.clone(),
        orthoZoom: this._orthoZoom
      };
    }
    const pose = this.resolveOrthographicPose(goal.session, goal.zoom);
    return {
      position: pose.position,
      target: pose.target,
      orthoZoom: goal.zoom
    };
  }

  private calcWheelZoomRatio(delta: number) {
    const wheelSteps = Math.min(
      WHEEL_ZOOM_MAX_STEPS,
      Math.max(WHEEL_ZOOM_MIN_STEPS, Math.abs(delta) / WHEEL_ZOOM_DELTA_UNIT)
    );
    return Math.pow(WHEEL_ZOOM_BASE_RATIO, wheelSteps);
  }

  private getNow() {
    return typeof performance !== "undefined" ? performance.now() : Date.now();
  }

  private readPerspectiveWheelDepthCache(mx: number, my: number) {
    const cache = this._perspectiveWheelDepthCache;
    if (!cache) return undefined;
    if (this.getNow() - cache.at > PERSPECTIVE_WHEEL_HIT_CACHE_MS) {
      return undefined;
    }
    if (
      Math.hypot(mx - cache.x, my - cache.y) > PERSPECTIVE_WHEEL_HIT_CACHE_PX
    ) {
      return undefined;
    }
    return cache;
  }

  private readOrthographicWheelSession(mx: number, my: number) {
    const session = this._orthographicWheelSession;
    if (!session) return undefined;
    if (this.getNow() - session.at > WHEEL_SESSION_MS) {
      return undefined;
    }
    if (Math.hypot(mx - session.x, my - session.y) > WHEEL_SESSION_PX) {
      return undefined;
    }
    return session;
  }

  private estimatePerspectiveHitDistance(
    sourcePosition: Vector3,
    focusDistance: number,
    mx: number,
    my: number
  ) {
    const recentHit = this.view.getRecentVisualHit(
      mx,
      my,
      PERSPECTIVE_WHEEL_HIT_CACHE_MS,
      PERSPECTIVE_WHEEL_HIT_CACHE_PX
    );
    const hit =
      recentHit ??
      this.view
        .getPointVisualHits(this.view.pointQueryAt(mx, my))
        .find(item => item.point);
    if (!hit?.point) return undefined;

    const point = new Vector3(hit.point.x, hit.point.y, hit.point.z);
    const hitDistance = sourcePosition.distanceTo(point);
    if (!Number.isFinite(hitDistance)) return undefined;
    return Math.max(1e-9, Math.min(hitDistance, focusDistance));
  }

  private getPerspectiveWheelDepth(
    mx: number,
    my: number,
    sourcePosition: Vector3,
    focusDistance: number
  ) {
    const cache = this.readPerspectiveWheelDepthCache(mx, my);
    if (cache) {
      return cache;
    }

    const hitDistance =
      this.estimatePerspectiveHitDistance(
        sourcePosition,
        focusDistance,
        mx,
        my
      ) ?? focusDistance;
    this._perspectiveWheelDepthCache = {
      at: this.getNow(),
      x: mx,
      y: my,
      hitDistance,
      focusDistance
    };
    return this._perspectiveWheelDepthCache;
  }

  private createOrthographicWheelSession(
    mx: number,
    my: number,
    sourcePosition: Vector3,
    sourceTarget: Vector3,
    sourceOrthoZoom: number
  ) {
    const basis = this.buildBasisForPose(sourcePosition, sourceTarget);
    if (!basis) return undefined;

    const session: OrthographicWheelSession = {
      at: this.getNow(),
      x: mx,
      y: my,
      ndcX: (2 * mx) / this._width - 1,
      ndcY: (-2 * my) / this._height + 1,
      anchor: this.calcOrthoScreenPointAt(
        mx,
        my,
        sourcePosition,
        sourceTarget,
        sourceOrthoZoom
      ),
      forward: basis.forward.clone(),
      right: basis.right.clone(),
      up: basis.up.clone(),
      distance: sourcePosition.distanceTo(sourceTarget)
    };
    this._orthographicWheelSession = session;
    return session;
  }

  private getOrthographicWheelSession(
    mx: number,
    my: number,
    sourcePosition: Vector3,
    sourceTarget: Vector3,
    sourceOrthoZoom: number
  ) {
    const session = this.readOrthographicWheelSession(mx, my);
    if (session) {
      session.at = this.getNow();
      session.x = mx;
      session.y = my;
      return session;
    }
    return this.createOrthographicWheelSession(
      mx,
      my,
      sourcePosition,
      sourceTarget,
      sourceOrthoZoom
    );
  }

  private calcPerspectiveDistanceScale(
    mx: number,
    my: number,
    delta: number,
    sourcePosition: Vector3,
    focusDistance: number
  ) {
    const zoomRatio = this.calcWheelZoomRatio(delta);
    const desiredScale = delta > 0 ? 1 / zoomRatio : zoomRatio;
    if (delta <= 0) {
      return desiredScale;
    }

    const depth = this.getPerspectiveWheelDepth(
      mx,
      my,
      sourcePosition,
      focusDistance
    );
    const safeTravel = Math.max(0, depth.hitDistance - PERSPECTIVE_HIT_MARGIN);
    const minDistanceScaleFromHit =
      1 - safeTravel / Math.max(1e-9, depth.focusDistance);
    return Math.max(
      desiredScale,
      Math.min(1, Math.max(0, minDistanceScaleFromHit))
    );
  }

  private updatePerspectiveWheelDepthCacheAfterZoom(
    mx: number,
    my: number,
    distanceScale: number
  ) {
    const cache = this._perspectiveWheelDepthCache;
    if (!cache) return;
    const travel = cache.focusDistance * (distanceScale - 1);
    cache.at = this.getNow();
    cache.x = mx;
    cache.y = my;
    cache.hitDistance = Math.max(
      PERSPECTIVE_HIT_MARGIN,
      cache.hitDistance + travel
    );
    cache.focusDistance = Math.max(1e-9, cache.focusDistance * distanceScale);
  }

  private calcZoomLerpAlpha(deltaSeconds: number, smoothTime: number) {
    const safeDelta = Math.max(0, deltaSeconds);
    const t = smoothTime <= 1e-6 ? 1 : 1 - Math.exp(-safeDelta / smoothTime);
    return Math.max(0, Math.min(1, t));
  }

  private isZoomInputActive() {
    return this.getNow() - this._lastZoomInputAt <= ZOOM_ACTIVE_MS;
  }

  tick(deltaSeconds: number) {
    const goal = this._zoomGoal;
    if (!goal) return false;

    const activeInput = this.isZoomInputActive();
    const alpha = this.calcZoomLerpAlpha(
      deltaSeconds,
      goal.kind === "orthographic"
        ? activeInput
          ? ORTHOGRAPHIC_ZOOM_ACTIVE_SMOOTH_TIME
          : ORTHOGRAPHIC_ZOOM_SMOOTH_TIME
        : activeInput
          ? PERSPECTIVE_ZOOM_ACTIVE_SMOOTH_TIME
          : PERSPECTIVE_ZOOM_SMOOTH_TIME
    );
    if (alpha <= 0) return true;

    if (goal.kind === "orthographic") {
      this._orthoZoom += (goal.zoom - this._orthoZoom) * alpha;
      const orthoZoomGap = Math.abs(this._orthoZoom - goal.zoom);
      const orthoZoomScale = Math.max(
        1,
        Math.abs(goal.zoom),
        Math.abs(this._orthoZoom)
      );
      if (orthoZoomGap <= orthoZoomScale * ZOOM_SNAP_RATIO) {
        this._orthoZoom = goal.zoom;
      }

      const pose = this.resolveOrthographicPose(goal.session, this._orthoZoom);
      this._position.copy(pose.position);
      this._target.copy(pose.target);
      if (this._camera instanceof OrthographicCamera) {
        this.updateOrtho(this._camera);
      }

      if (this._orthoZoom === goal.zoom) {
        this.clearZoomGoal();
      }
      this.updateNearFar();
      this.updateCameraPositionTarget();
      return true;
    }

    this._position.lerp(goal.position, alpha);
    this._target.lerp(goal.target, alpha);

    const posGap = this._position.distanceTo(goal.position);
    const targetGap = this._target.distanceTo(goal.target);
    const travelScale = Math.max(
      1,
      goal.position.distanceTo(goal.target),
      this._position.distanceTo(this._target)
    );
    if (
      posGap <= travelScale * ZOOM_SNAP_RATIO &&
      targetGap <= travelScale * ZOOM_SNAP_RATIO
    ) {
      this._position.copy(goal.position);
      this._target.copy(goal.target);
      this.clearZoomGoal();
    }

    this.updateNearFar();
    this.updateCameraPositionTarget();
    return true;
  }

  zoom(x: number, y: number, delta: number) {
    this._pointerInteractionMode = undefined;
    if (this._camera instanceof OrthographicCamera) {
      const source = this.getZoomSourceState();
      const zoomRatio = this.calcWheelZoomRatio(delta);
      const session = this.getOrthographicWheelSession(
        x,
        y,
        source.position,
        source.target,
        source.orthoZoom
      );
      if (!session) return;
      const nextOrthoZoom =
        delta > 0
          ? Math.min(ORTHO_MAX_ZOOM, source.orthoZoom * zoomRatio)
          : Math.max(ORTHO_MIN_ZOOM, source.orthoZoom / zoomRatio);
      this._zoomGoal = {
        kind: "orthographic",
        zoom: nextOrthoZoom,
        session
      };
      this._lastZoomInputAt = this.getNow();
      this.debugNav("zoomOrtho");
      return;
    }

    const source = this.getZoomSourceState();
    const sourcePosition = source.position;
    const sourceTarget = source.target;
    const vector = sourceTarget.clone().sub(sourcePosition);
    if (vector.length() <= 1e-8) return;
    // In this app, `delta` is passed from the wheel handler as `-event.deltaY`.
    // That means delta > 0 corresponds to a wheel-up gesture (typical "zoom in").
    const focus = this.calcPerspectiveScreenPointAt(
      x,
      y,
      sourcePosition,
      sourceTarget
    );
    const focusDistance = sourcePosition.distanceTo(focus);
    if (focusDistance <= 1e-8) return;
    const distanceScale = this.calcPerspectiveDistanceScale(
      x,
      y,
      delta,
      sourcePosition,
      focusDistance
    );

    const nextTarget = focus
      .clone()
      .add(sourceTarget.clone().sub(focus).multiplyScalar(distanceScale));
    const nextPosition = focus
      .clone()
      .add(sourcePosition.clone().sub(focus).multiplyScalar(distanceScale));

    const nextVector = nextTarget.clone().sub(nextPosition);
    const nextDistance = nextVector.length();
    if (nextDistance < MIN_DIST) {
      const safeDirection =
        nextDistance > 1e-8 ? nextVector.normalize() : vector.normalize();
      nextPosition.copy(
        nextTarget.clone().sub(safeDirection.multiplyScalar(MIN_DIST))
      );
    }
    this.updatePerspectiveWheelDepthCacheAfterZoom(x, y, distanceScale);

    this._zoomGoal = {
      kind: "perspective",
      position: nextPosition,
      target: nextTarget,
      focus
    };
    this._lastZoomInputAt = this.getNow();
    this.debugNav("zoom");
  }

  endPointerGesture() {
    this._pointerInteractionMode = undefined;
    this._freeRotateState = undefined;
  }

  fitContent() {
    this.clearZoomInteractionState();
    this._pointerInteractionMode = undefined;
    const sphere = this.getContentSphere();

    let fov = FOV / 2;
    if (this._width < this._height) fov = (fov * this._width) / this._height;
    const dist = Math.abs(sphere.radius / Math.sin(fov * DEG_TO_RAD));
    const dir = this._target.clone().sub(this._position).normalize();
    this._target.copy(sphere.center);
    this._position.copy(this._target.clone().sub(dir.multiplyScalar(dist)));

    if (this._camera instanceof OrthographicCamera) {
      this._orthoZoom = 1;
      this.updateOrtho(this._camera);
    }
    this.updateNearFar();
    this.updateCameraPositionTarget();
  }

  lookAt(eye: XYZLike, target: XYZLike, up: XYZLike) {
    this.clearZoomInteractionState();
    this._pointerInteractionMode = undefined;
    this._position.set(eye.x, eye.y, eye.z);
    this._target.set(target.x, target.y, target.z);
    this._camera.up.set(up.x, up.y, up.z);
    this.updateCameraPositionTarget();
    this.debugNav("lookAt");
  }

  private updateNearFar() {
    const dist = this._position.distanceTo(this._target);
    // Ported from Chili3D: keep near a bit larger when close (better precision).
    const near = Math.max(0.01, Math.min(dist / 1000, dist / 10));
    const far = Math.max(1000, dist * 100);

    if (this._camera instanceof PerspectiveCamera) {
      this._camera.near = near;
      this._camera.far = far;
      return;
    }

    // Orthographic only: keep dynamic near/far, but prevent near from passing
    // the model front depth along current view direction.
    const sphere = this.getContentSphere();
    const viewDir = this._target.clone().sub(this._position);
    const dirLen = viewDir.length();
    if (dirLen <= 1e-9) {
      this._camera.near = near;
      this._camera.far = far;
      return;
    }

    viewDir.multiplyScalar(1 / dirLen);
    const centerDepth = sphere.center.clone().sub(this._position).dot(viewDir);
    const margin = Math.max(10, sphere.radius * 0.02, dist * 0.02);
    const frontDepth = centerDepth - sphere.radius;
    const backDepth = centerDepth + sphere.radius;
    const safeNear = Math.max(0.001, frontDepth - margin);

    // In orthographic mode, a slightly too-large near plane is very noticeable:
    // it slices the model with a flat plane. Bias toward a more conservative
    // near value whenever the content bounds become numerically tight.
    const orthoNear =
      frontDepth <= margin
        ? 0.001
        : Math.min(near, safeNear, Math.max(0.001, frontDepth * 0.5));

    this._camera.near = orthoNear;
    this._camera.far = Math.max(far, backDepth + margin);
    const debugDepthRange = getCamDebugFlag()
      ? this.getContentDepthRange(viewDir)
      : undefined;
    this.debugOrthoClipping("updateNearFar", {
      dist,
      nearBase: near,
      farBase: far,
      centerDepth,
      frontDepth,
      backDepth,
      margin,
      nearFinal: this._camera.near,
      farFinal: this._camera.far,
      radius: sphere.radius,
      depthRange: debugDepthRange
    });
  }
}
