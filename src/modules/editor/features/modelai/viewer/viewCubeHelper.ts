// @ts-nocheck
import {
  ConeGeometry,
  CylinderGeometry,
  EdgesGeometry,
  EllipseCurve,
  Box3,
  BoxHelper,
  LineSegments,
  TubeGeometry,
  CatmullRomCurve3,
  Scene,
  BoxGeometry,
  Mesh,
  type MeshBasicMaterial,
  Object3D,
  OrthographicCamera,
  PlaneGeometry,
  Quaternion,
  Raycaster,
  Shape,
  ShapeGeometry,
  Sprite,
  SphereGeometry,
  Vector2,
  Vector3,
  Vector4
} from "three";
import {
  lineBasicSlateAlpha60NoDepthMaterial,
  lineBasicWhiteAlpha65Material,
  meshBasicBlueAlpha78Material,
  meshBasicBlueAlpha90Material,
  meshBasicBlueAlpha95Material,
  meshBasicBlueAlpha98Material,
  meshBasicBlueAlpha100Material,
  meshBasicGreenAlpha78Material,
  meshBasicGreenAlpha90Material,
  meshBasicGreenAlpha95Material,
  meshBasicGreenAlpha98Material,
  meshBasicGreenAlpha100Material,
  meshBasicInvisibleOccluderMaterial,
  meshBasicMutedAlpha35Material,
  meshBasicRedAlpha78Material,
  meshBasicRedAlpha90Material,
  meshBasicRedAlpha95Material,
  meshBasicRedAlpha98Material,
  meshBasicRedAlpha100Material,
  meshBasicSlateAlpha42Material,
  meshBasicSlateAlpha70NoDepthMaterial,
  meshBasicSlateAlpha72Material,
  meshBasicSlateAlpha95Material,
  meshBasicWhiteAlpha08NoDepthMaterial,
  meshBasicWhiteAlpha90DoubleSidedNoDepthMaterial,
  spriteBadgeXMutedMaterial,
  spriteBadgeXRedMaterial,
  spriteBadgeYGreenMaterial,
  spriteBadgeYMutedMaterial,
  spriteBadgeZBlueMaterial,
  spriteBadgeZMutedMaterial,
  spriteGlowSoftMaterial
} from "./materials";

export type ZUpAxisType = "posX" | "negX" | "posY" | "negY" | "posZ" | "negZ";
export type RotateAxisLock = "off" | "x" | "y" | "z";
export type RotateArrowDir = "ccw" | "cw";
export const BLOOM_LAYER_CCW = 10;
export const BLOOM_LAYER_CW = 11;

export type ViewHelperHit =
  | { kind: "face"; axis: ZUpAxisType }
  | { kind: "lock"; axis: Exclude<RotateAxisLock, "off"> }
  | { kind: "rotate"; dir: RotateArrowDir };

// Z-up friendly view helper:
// - Renders a small cube with clickable faces for standard views
// - Renders clickable axis arrows for rotate-axis locking
// - Does not animate the camera itself (camera logic lives in CameraController/ViewHelperWidget)
export class ViewCubeHelper {
  readonly isViewHelper = true;
  readonly root = new Object3D();
  private readonly _staticRoot = new Object3D();
  private readonly _orientedRoot = new Object3D();
  private readonly _scene = new Scene();
  readonly center = new Vector3();
  readonly location = {
    top: null as number | null,
    right: 0,
    bottom: 0,
    left: null as number | null
  };
  // Rendered viewport size (px)
  size = 160;

  private readonly _domElement: HTMLElement;
  private readonly _camera: { quaternion: Quaternion };
  private readonly _raycaster = new Raycaster();
  private readonly _mouse = new Vector2();
  private readonly _orthoCamera = new OrthographicCamera(-2, 2, 2, -2, 0, 4);
  private readonly _interactive: Object3D[] = [];
  private readonly _occluders: Object3D[] = [];
  private readonly _viewport = new Vector4();
  private readonly _lastViewport = new Vector4();

  private _boxHelperVisible = false;
  private _boxHelper?: BoxHelper;

  private _selectedFace: ZUpAxisType | null = null;
  private _hovered: ViewHelperHit | null = null;
  private _axisLock: RotateAxisLock = "off";
  private _cubeHalf = 0.37;
  private _arrowBaseOffset = 0.04;
  private _axisShaftLen = 0.24;
  private _axisHeadLen = 0.09;
  private _axisShaftRadius = 0.035;
  private _axisHeadRadius = 0.11;
  private _axisBaseInset = 0.02;
  private _glowBaseOpacity = 0.22;

  private readonly _faceMeshes = new Map<
    ZUpAxisType,
    Mesh<PlaneGeometry, MeshBasicMaterial>
  >();
  private readonly _faceNubs = new Map<
    ZUpAxisType,
    Mesh<SphereGeometry, MeshBasicMaterial>
  >();
  private readonly _arrowGroups = new Map<
    Exclude<RotateAxisLock, "off">,
    Object3D
  >();
  private readonly _axisLabels = new Map<
    Exclude<RotateAxisLock, "off">,
    Sprite
  >();
  private _glow?: Sprite;

  constructor(camera: { quaternion: Quaternion }, domElement: HTMLElement) {
    this._camera = camera;
    this._domElement = domElement;
    this._orthoCamera.position.set(0, 0, 2);

    this.root.add(this._staticRoot);
    this.root.add(this._orientedRoot);
    this._scene.add(this.root);

    this.buildGlow();
    this.buildCube();
    this.buildAxisArrows();
    this.buildRotateArrows();
  }

  setSelectedFace(axis: ZUpAxisType | null) {
    this._selectedFace = axis;
    this.updateVisualState();
  }

  setHovered(hit: ViewHelperHit | null) {
    this._hovered = hit;
    this.updateVisualState();
  }

  setAxisLock(lock: RotateAxisLock) {
    this._axisLock = lock;
    this.updateVisualState();
  }

  setBoxHelperVisible(visible: boolean) {
    this._boxHelperVisible = visible;
    if (!visible) {
      if (this._boxHelper) {
        this.root.remove(this._boxHelper);
      }
      return;
    }
    if (!this._boxHelper) {
      this._boxHelper = new BoxHelper(this.root, 0x9ca3af);
      this._boxHelper.material = lineBasicSlateAlpha60NoDepthMaterial;
    }
    if (this._boxHelper.parent !== this.root) {
      this.root.add(this._boxHelper);
    }
  }

  getScene() {
    return this._scene;
  }

  getCamera() {
    return this._orthoCamera;
  }

  getLastViewport() {
    return this._lastViewport.clone();
  }

  render(renderer: {
    clearDepth(): void;
    getViewport(v: Vector4): void;
    setViewport(x: number, y: number, w: number, h: number): void;
    render(o: Object3D, c: OrthographicCamera): void;
  }) {
    const dim = this.size;
    const { x, y } = this.computeViewportOrigin(dim);
    this._lastViewport.set(x, y, dim, dim);
    if (this._boxHelperVisible) {
      this._boxHelper?.update();
    }
    renderer.clearDepth();
    renderer.getViewport(this._viewport);
    renderer.setViewport(x, y, dim, dim);
    renderer.render(this.root, this._orthoCamera);
    renderer.setViewport(
      this._viewport.x,
      this._viewport.y,
      this._viewport.z,
      this._viewport.w
    );
  }

  handleClick(event: PointerEvent): ViewHelperHit | null {
    return this.hitTest(event).hit;
  }

  // Hover helper. Returns whether the pointer is within the view-helper viewport.
  handlePointerMove(event: PointerEvent) {
    return this.hitTest(event);
  }

  private hitTest(event: PointerEvent): {
    inside: boolean;
    hit: ViewHelperHit | null;
  } {
    const dim = this.size;
    const rect = this._domElement.getBoundingClientRect();
    const { x, y } = this.computeViewportOrigin(dim);

    const offsetX = rect.left + x;
    const offsetY = rect.top + (this._domElement.offsetHeight - dim - y);

    this._mouse.x = ((event.clientX - offsetX) / dim) * 2 - 1;
    this._mouse.y = -(((event.clientY - offsetY) / dim) * 2 - 1);

    if (
      this._mouse.x < -1 ||
      this._mouse.x > 1 ||
      this._mouse.y < -1 ||
      this._mouse.y > 1
    ) {
      return { inside: false, hit: null };
    }

    this._raycaster.setFromCamera(this._mouse, this._orthoCamera);
    const hits = this._raycaster.intersectObjects(this._interactive, false);

    // Apply cube occlusion so back-side nubs/faces don't get picked.
    const occHits = this._occluders.length
      ? this._raycaster.intersectObjects(this._occluders, false)
      : [];
    const occDist = occHits.length
      ? occHits[0].distance
      : Number.POSITIVE_INFINITY;
    const visibleHits = hits.filter(h => h.distance <= occDist + 1e-4);
    if (!visibleHits.length) return { inside: true, hit: null };

    // Prefer face/nub hits over axis-lock hits so clicks don't "pierce" to arrows.
    const pick = (k: ViewHelperHit["kind"]) =>
      visibleHits.find(h => (h.object.userData.kind as any) === k)?.object;

    const faceObj = pick("face");
    if (faceObj)
      return {
        inside: true,
        hit: { kind: "face", axis: faceObj.userData.axis as ZUpAxisType }
      };

    const lockObj = pick("lock");
    if (lockObj)
      return {
        inside: true,
        hit: {
          kind: "lock",
          axis: lockObj.userData.axis as Exclude<RotateAxisLock, "off">
        }
      };

    const rotateObj = pick("rotate");
    if (rotateObj)
      return {
        inside: true,
        hit: {
          kind: "rotate",
          dir: rotateObj.userData.dir as RotateArrowDir
        }
      };

    return { inside: true, hit: null };
  }

  dispose() {
    this.root.traverse(obj => {
      if (obj instanceof Mesh) {
        obj.geometry.dispose();
      } else if (obj instanceof LineSegments) {
        obj.geometry.dispose();
      }
    });
  }

  private computeViewportOrigin(dim: number) {
    this._orientedRoot.quaternion.copy(this._camera.quaternion).invert();
    this.root.updateMatrixWorld();
    const loc = this.location;
    const bounds = this.computeBoundsInViewport(dim);
    const domWidth = this._domElement.offsetWidth;
    const domHeight = this._domElement.offsetHeight;
    const x =
      loc.left !== null
        ? bounds
          ? loc.left - bounds.minX
          : loc.left
        : domWidth - dim - (loc.right ?? 0) + (bounds ? dim - bounds.maxX : 0);
    const y =
      loc.top !== null
        ? domHeight - dim - (loc.top ?? 0) + (bounds ? dim - bounds.maxY : 0)
        : bounds
          ? loc.bottom - bounds.minY
          : loc.bottom;
    return { x, y };
  }

  private computeBoundsInViewport(dim: number) {
    const box = new Box3().setFromObject(this.root);
    if (box.isEmpty()) return null;
    const corners = [
      new Vector3(box.min.x, box.min.y, box.min.z),
      new Vector3(box.min.x, box.min.y, box.max.z),
      new Vector3(box.min.x, box.max.y, box.min.z),
      new Vector3(box.min.x, box.max.y, box.max.z),
      new Vector3(box.max.x, box.min.y, box.min.z),
      new Vector3(box.max.x, box.min.y, box.max.z),
      new Vector3(box.max.x, box.max.y, box.min.z),
      new Vector3(box.max.x, box.max.y, box.max.z)
    ];
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const corner of corners) {
      const p = corner.project(this._orthoCamera);
      const px = (p.x + 1) * 0.5 * dim;
      const py = (p.y + 1) * 0.5 * dim;
      minX = Math.min(minX, px);
      minY = Math.min(minY, py);
      maxX = Math.max(maxX, px);
      maxY = Math.max(maxY, py);
    }
    return { minX, minY, maxX, maxY };
  }

  private buildCube() {
    const cubeSize = 0.74;
    const half = cubeSize / 2;
    this._cubeHalf = half;
    const eps = 0.001;
    const faceGeo = new PlaneGeometry(cubeSize, cubeSize);
    // Bigger "face nub" for easier interaction.
    const nubGeo = new SphereGeometry(0.11, 18, 14);

    // Depth-only occluder so the face "nubs" behind the cube are hidden and not pickable.
    // Slightly shrink to reduce z-fighting with the face planes.
    const occluder = new Mesh(
      new BoxGeometry(
        cubeSize - eps * 6,
        cubeSize - eps * 6,
        cubeSize - eps * 6
      ),
      meshBasicInvisibleOccluderMaterial
    );
    occluder.renderOrder = -3;
    this._orientedRoot.add(occluder);
    this._occluders.push(occluder);

    // Subtle solid body + outline, so faces read better on dark backgrounds.
    const body = new Mesh(
      new BoxGeometry(cubeSize, cubeSize, cubeSize),
      meshBasicWhiteAlpha08NoDepthMaterial
    );
    body.renderOrder = -2;
    this._orientedRoot.add(body);

    const edges = new LineSegments(
      new EdgesGeometry(body.geometry as BoxGeometry),
      lineBasicWhiteAlpha65Material
    );
    edges.renderOrder = -1;
    this._orientedRoot.add(edges);

    const makeFace = (axis: ZUpAxisType) => {
      const mesh = new Mesh(faceGeo, meshBasicSlateAlpha42Material);
      mesh.userData.kind = "face";
      mesh.userData.axis = axis;
      this._faceMeshes.set(axis, mesh);
      this._interactive.push(mesh);
      this._orientedRoot.add(mesh);
      return mesh;
    };

    const makeNub = (axis: ZUpAxisType) => {
      const nub = new Mesh(nubGeo, this.resolveNubMaterial(axis, "normal"));
      nub.userData.kind = "face";
      nub.userData.axis = axis;
      this._faceNubs.set(axis, nub);
      this._interactive.push(nub);
      this._orientedRoot.add(nub);
      return nub;
    };

    // Faces share the same base color; selection/hover is handled via updateVisualState().
    const posX = makeFace("posX");
    posX.position.set(half + eps, 0, 0);
    posX.rotation.y = -Math.PI / 2;
    const nubPosX = makeNub("posX");
    nubPosX.position.set(half + this._arrowBaseOffset, 0, 0);

    const negX = makeFace("negX");
    negX.position.set(-half - eps, 0, 0);
    negX.rotation.y = Math.PI / 2;
    const nubNegX = makeNub("negX");
    nubNegX.position.set(-half - this._arrowBaseOffset, 0, 0);

    const posY = makeFace("posY");
    posY.position.set(0, half + eps, 0);
    posY.rotation.x = Math.PI / 2;
    const nubPosY = makeNub("posY");
    nubPosY.position.set(0, half + this._arrowBaseOffset, 0);

    const negY = makeFace("negY");
    negY.position.set(0, -half - eps, 0);
    negY.rotation.x = -Math.PI / 2;
    const nubNegY = makeNub("negY");
    nubNegY.position.set(0, -half - this._arrowBaseOffset, 0);

    const posZ = makeFace("posZ");
    posZ.position.set(0, 0, half + eps);
    const nubPosZ = makeNub("posZ");
    nubPosZ.position.set(0, 0, half + this._arrowBaseOffset);

    const negZ = makeFace("negZ");
    negZ.position.set(0, 0, -half - eps);
    negZ.rotation.y = Math.PI;
    const nubNegZ = makeNub("negZ");
    nubNegZ.position.set(0, 0, -half - this._arrowBaseOffset);

    this.updateVisualState();
  }

  private buildAxisArrows() {
    // Closer to TransformControls: thicker shaft + larger head.
    // CylinderGeometry/ConeGeometry are Y-up by default; rotate to build along +Z.
    // Slightly shorter than before for a tighter gizmo.
    const shaftGeo = new CylinderGeometry(
      this._axisShaftRadius,
      this._axisShaftRadius,
      this._axisShaftLen,
      10
    ).rotateX(Math.PI / 2);
    const headGeo = new ConeGeometry(
      this._axisHeadRadius,
      this._axisHeadLen,
      14
    ).rotateX(Math.PI / 2);

    const makeArrow = (
      axis: Exclude<RotateAxisLock, "off">,
      _colorHex: string,
      dir: Vector3
    ) => {
      const group = new Object3D();
      group.userData.kind = "lock";
      group.userData.axis = axis;

      const material = this.resolveArrowMaterial(axis, "normal");
      const shaft = new Mesh(shaftGeo, material);
      const head = new Mesh(headGeo, material);

      // Build arrow along +Z first, then rotate to dir.
      const shaftCenter = this._axisShaftLen * 0.5 + this._axisBaseInset;
      const headCenter =
        this._axisShaftLen + this._axisHeadLen * 0.5 + this._axisBaseInset;
      shaft.position.z = shaftCenter;
      head.position.z = headCenter;

      const tmpQuat = new Quaternion().setFromUnitVectors(
        new Vector3(0, 0, 1),
        dir.clone().normalize()
      );
      group.quaternion.copy(tmpQuat);
      group.add(shaft, head);

      // Place arrows around the cube so the base doesn't stick out from the center.
      group.position.copy(
        dir
          .clone()
          .normalize()
          .multiplyScalar(
            this._cubeHalf + this._arrowBaseOffset - this._axisBaseInset
          )
      );

      this._arrowGroups.set(axis, group);
      this._interactive.push(shaft, head);
      shaft.userData.kind = "lock";
      shaft.userData.axis = axis;
      head.userData.kind = "lock";
      head.userData.axis = axis;
      this._orientedRoot.add(group);
      return group;
    };

    // Z-up world axes (match CAD mental model).
    makeArrow("x", "#ff365f", new Vector3(1, 0, 0));
    makeArrow("y", "#1fbf6a", new Vector3(0, 1, 0));
    makeArrow("z", "#2f7bff", new Vector3(0, 0, 1));

    this.updateVisualState();
    this.updateAxisLabels();
  }

  private buildRotateArrows() {
    const glowRadius = 1.25;
    const gap = (10 * Math.PI) / 180;
    const span = (120 * Math.PI) / 180;
    const halfGap = gap * 0.5;
    const top = Math.PI / 2;
    const rightEnd = top - halfGap;
    const rightStart = rightEnd - span;
    const leftStart = top + halfGap;
    const leftEnd = leftStart + span;

    const makeArc = (start: number, end: number, dir: RotateArrowDir) => {
      const s = start;
      let e = end;
      if (e < s) e += Math.PI * 2;
      const curve2d = new EllipseCurve(
        0,
        0,
        glowRadius,
        glowRadius,
        s,
        e,
        false,
        0
      );
      const pts2d = curve2d.getPoints(64);
      const pts3d = pts2d.map(p => new Vector3(p.x, p.y, 0));
      const curve3d = new CatmullRomCurve3(pts3d, false, "centripetal");
      const tube = new TubeGeometry(curve3d, 64, 0.036, 8, false);
      const mesh = new Mesh(tube, meshBasicSlateAlpha70NoDepthMaterial);
      mesh.position.set(0, -0.04, -0.2);
      mesh.userData.kind = "rotate";
      mesh.userData.dir = dir;
      mesh.layers.enable(dir === "ccw" ? BLOOM_LAYER_CCW : BLOOM_LAYER_CW);
      this._interactive.push(mesh);
      this._staticRoot.add(mesh);

      // Arrow at the lower end of each arc, aligned to the arc tangent.
      const arrowShape = new Shape();
      arrowShape.moveTo(-0.08, 0.045);
      arrowShape.lineTo(0.13, 0);
      arrowShape.lineTo(-0.08, -0.045);
      arrowShape.lineTo(-0.04, 0);
      arrowShape.closePath();
      const arrowGeo = new ShapeGeometry(arrowShape);
      const arrow = new Mesh(
        arrowGeo,
        meshBasicWhiteAlpha90DoubleSidedNoDepthMaterial
      );
      const endAngle = dir === "ccw" ? end : start;
      const angle = endAngle;
      const r = glowRadius + 0.03;
      arrow.position.set(Math.cos(angle) * r, Math.sin(angle) * r, -0.19);
      // Tangent direction along the arc.
      const tangentAngle = angle + (dir === "ccw" ? Math.PI / 2 : -Math.PI / 2);
      arrow.rotation.z = tangentAngle;
      arrow.scale.setScalar(1.25);
      this._staticRoot.add(arrow);
      return mesh;
    };

    makeArc(leftStart, leftEnd, "ccw");
    makeArc(rightStart, rightEnd, "cw");
  }

  private buildGlow() {
    const sprite = new Sprite(spriteGlowSoftMaterial);
    sprite.scale.setScalar(3.2);
    sprite.position.set(0, 0, -1.15);
    sprite.renderOrder = -20;
    sprite.userData.kind = "glow";
    this._glow = sprite;
    this._staticRoot.add(sprite);
  }

  // Backdrop removed per UI request.

  private updateVisualState() {
    const hoveredFace =
      this._hovered?.kind === "face" ? this._hovered.axis : null;
    const hoveredLock =
      this._hovered?.kind === "lock" ? this._hovered.axis : null;
    const hoveredRotate =
      this._hovered?.kind === "rotate" ? this._hovered.dir : null;

    // Faces: selected face is brighter and more opaque.
    for (const [axis, mesh] of this._faceMeshes.entries()) {
      const isSelected = this._selectedFace === axis;
      const isHovered = hoveredFace === axis;
      mesh.material = isSelected
        ? meshBasicSlateAlpha95Material
        : isHovered
          ? meshBasicSlateAlpha72Material
          : meshBasicSlateAlpha42Material;
      (mesh as any).renderOrder = isSelected ? 2 : isHovered ? 1 : 0;
    }
    for (const [axis, nub] of this._faceNubs.entries()) {
      const isSelected = this._selectedFace === axis;
      const isHovered = hoveredFace === axis;
      nub.scale.setScalar(isSelected ? 1.35 : isHovered ? 1.18 : 1.05);
      nub.material = this.resolveNubMaterial(
        axis,
        isSelected ? "selected" : isHovered ? "hover" : "normal"
      );
      (nub as any).renderOrder = isSelected ? 3 : isHovered ? 2 : 1;
    }

    // Arrows: locked axis enlarges and becomes fully opaque.
    const hasLock = this._axisLock !== "off";
    for (const [axis, group] of this._arrowGroups.entries()) {
      const locked = this._axisLock === axis;
      const hovered = hoveredLock === axis;
      group.scale.setScalar(1.0);
      group.traverse(obj => {
        if (obj instanceof Mesh) {
          obj.material = this.resolveArrowMaterial(
            axis,
            locked ? "locked" : hovered ? "hover" : hasLock ? "muted" : "normal"
          );
          return;
        }
        if (obj instanceof Sprite) {
          // Keep labels readable even when de-emphasized.
          const normalMat = obj.userData.normalMat;
          const mutedMat = obj.userData.mutedMat;
          const muted = hasLock && !locked && !hovered;
          const nextMat = muted
            ? (mutedMat ?? obj.material)
            : (normalMat ?? obj.material);
          if (obj.material !== nextMat) obj.material = nextMat;
        }
      });
    }

    void hoveredRotate;
  }

  private updateAxisLabels() {
    const ensure = (axis: Exclude<RotateAxisLock, "off">) => {
      const group = this._arrowGroups.get(axis);
      if (!group) return;
      const existing = this._axisLabels.get(axis);
      const { normal, muted } = this.resolveAxisLabelMaterials(axis);
      const labelZ =
        this._axisBaseInset + this._axisShaftLen + this._axisHeadLen + 0.14;

      if (existing) {
        existing.userData.normalMat = normal;
        existing.userData.mutedMat = muted;
        existing.material = normal;
        existing.position.set(0, 0, labelZ);
      } else {
        const sprite = new Sprite(normal);
        sprite.scale.setScalar(0.6);
        sprite.position.set(0, 0, labelZ);
        sprite.userData.kind = "lock";
        sprite.userData.axis = axis;
        sprite.userData.normalMat = normal;
        sprite.userData.mutedMat = muted;
        group.add(sprite);
        this._axisLabels.set(axis, sprite);
        this._interactive.push(sprite);
      }
    };

    ensure("x");
    ensure("y");
    ensure("z");

    this.updateVisualState();
  }

  private resolveAxisLabelMaterials(axis: Exclude<RotateAxisLock, "off">) {
    switch (axis) {
      case "x":
        return {
          normal: spriteBadgeXRedMaterial,
          muted: spriteBadgeXMutedMaterial
        };
      case "y":
        return {
          normal: spriteBadgeYGreenMaterial,
          muted: spriteBadgeYMutedMaterial
        };
      default:
        return {
          normal: spriteBadgeZBlueMaterial,
          muted: spriteBadgeZMutedMaterial
        };
    }
  }

  private resolveNubMaterial(
    axis: ZUpAxisType,
    state: "normal" | "hover" | "selected"
  ) {
    if (axis === "posX" || axis === "negX") {
      if (state === "selected") return meshBasicRedAlpha100Material;
      if (state === "hover") return meshBasicRedAlpha98Material;
      return meshBasicRedAlpha90Material;
    }
    if (axis === "posY" || axis === "negY") {
      if (state === "selected") return meshBasicGreenAlpha100Material;
      if (state === "hover") return meshBasicGreenAlpha98Material;
      return meshBasicGreenAlpha90Material;
    }
    if (state === "selected") return meshBasicBlueAlpha100Material;
    if (state === "hover") return meshBasicBlueAlpha98Material;
    return meshBasicBlueAlpha90Material;
  }

  private resolveArrowMaterial(
    axis: Exclude<RotateAxisLock, "off">,
    state: "normal" | "hover" | "locked" | "muted"
  ) {
    if (state === "muted") return meshBasicMutedAlpha35Material;
    if (axis === "x") {
      if (state === "locked") return meshBasicRedAlpha100Material;
      if (state === "hover") return meshBasicRedAlpha95Material;
      return meshBasicRedAlpha78Material;
    }
    if (axis === "y") {
      if (state === "locked") return meshBasicGreenAlpha100Material;
      if (state === "hover") return meshBasicGreenAlpha95Material;
      return meshBasicGreenAlpha78Material;
    }
    if (state === "locked") return meshBasicBlueAlpha100Material;
    if (state === "hover") return meshBasicBlueAlpha95Material;
    return meshBasicBlueAlpha78Material;
  }
}
