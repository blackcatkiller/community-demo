// @ts-nocheck
import { Observable } from "@modelai/core/observable";
import { type Plane, Ray, XY, type XYZ } from "@modelai/core/math";
import type {
  IDocument,
  IView,
  IVisualObject,
  ViewShapeGuidePolicy,
  ViewPointQuery,
  ViewMode,
  VisualShapeData
} from "@modelai/core/types";
import type { ShapeType } from "@modelai/core/types";
import {
  type Camera,
  DirectionalLight,
  Matrix4,
  PerspectiveCamera,
  Raycaster,
  type Scene,
  Vector2,
  Vector3,
  WebGLRenderer
} from "three";
import { SelectionBox } from "three/examples/jsm/interactive/SelectionBox.js";
import Stats from "three/examples/jsm/libs/stats.module.js";
import { CameraController } from "./cameraController";
import { Layers, RaycasterThreshold } from "./constants";
import { CustomAxesHelper } from "./customAxesHelper";
import { ThreeHelper } from "./helper";
import type { ThreeHighlighter } from "./highlighter";
import { InteractionTargetHelper } from "./interactionTargetHelper";
import type { ThreeVisualContext } from "./visualContext";
import {
  isVisualHitTarget,
  type VisualPointHit,
  type VisualPointHitContext,
  type VisualRectHitContext
} from "./visualObject";
import { ViewHelperWidget } from "./viewHelperWidget";

export type ViewAfterSceneRenderHook = (
  renderer: WebGLRenderer,
  camera: Camera
) => void;
export type ViewBeforeSceneRenderHook = () => void;
export type ViewShapeDetection = {
  detectShapes: (
    shapeType: ShapeType,
    mx: number,
    my: number,
    options?: { guidePolicy?: ViewShapeGuidePolicy }
  ) => VisualShapeData[];
  detectShapesRect: (
    shapeType: ShapeType,
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ) => VisualShapeData[];
};

type PointQueryCache = {
  at: number;
  x: number;
  y: number;
  raycaster: Raycaster;
  ray: Ray;
};

export class ThreeView extends Observable implements IView {
  private _dom?: HTMLElement;
  private _overlayHost?: HTMLElement;
  private _needsUpdate = false;
  private _pointerPickingEnabled = true;
  private _interactionTargetVisible = true;
  private _lastFrameTime = performance.now();
  private _hasCameraSnapshot = false;
  private readonly _lastCameraWorld = new Matrix4();
  private readonly _lastCameraProjection = new Matrix4();
  private readonly _renderer: WebGLRenderer;
  private readonly _stats: Stats;
  private readonly _scene: Scene;
  private readonly _resizeObserver: ResizeObserver;
  private readonly _beforeSceneRenderHooks =
    new Set<ViewBeforeSceneRenderHook>();
  private readonly _afterSceneRenderHooks = new Set<ViewAfterSceneRenderHook>();
  private _animationFrameId = 0;
  private _viewHelperVisible = true;
  private _webglContextLost = false;
  private _eventAbortController?: AbortController;
  private _recentPointQuery?: PointQueryCache;
  private _shapeDetection?: ViewShapeDetection;
  private readonly _visualHitsCache = new WeakMap<
    ViewPointQuery,
    VisualPointHit[]
  >();
  private readonly _viewHelperWidget: ViewHelperWidget;
  private readonly _axesHelper: CustomAxesHelper;
  private readonly _interactionTargetHelper: InteractionTargetHelper;
  readonly cameraController: CameraController;
  readonly dynamicLight = new DirectionalLight(0xffffff, 2);

  get mode(): ViewMode {
    return this.getPrivateValue("mode" as any, "solidAndWireframe") as any;
  }
  set mode(v: ViewMode) {
    this.setProperty("mode" as any, v as any, () => {
      this.applyCameraRenderLayers();
    });
  }

  get camera() {
    return this.cameraController.camera;
  }
  get width() {
    return this._dom?.clientWidth ?? 1;
  }
  get height() {
    return this._dom?.clientHeight ?? 1;
  }
  get pointerPickingEnabled() {
    return this._pointerPickingEnabled;
  }
  set pointerPickingEnabled(enabled: boolean) {
    if (this._pointerPickingEnabled === enabled) return;
    this._pointerPickingEnabled = enabled;
    if (!enabled) {
      this._recentPointQuery = undefined;
      this.document.visual.eventHandler.pointerOut?.(
        this,
        new PointerEvent("pointerout")
      );
    }
    this.update();
  }
  get axeshelper() {
    return this._axesHelper;
  }
  // Register an overlay render hook that runs after the main scene render.
  addAfterSceneRenderHook(hook: ViewAfterSceneRenderHook) {
    this._afterSceneRenderHooks.add(hook);
    this.update();
  }
  // Remove a previously registered after-scene render hook.
  removeAfterSceneRenderHook(hook: ViewAfterSceneRenderHook) {
    if (!this._afterSceneRenderHooks.delete(hook)) return;
    this.update();
  }
  // Register a preparation hook that runs before the main scene render.
  addBeforeSceneRenderHook(hook: ViewBeforeSceneRenderHook) {
    this._beforeSceneRenderHooks.add(hook);
    this.update();
  }
  // Remove a previously registered before-scene render hook.
  removeBeforeSceneRenderHook(hook: ViewBeforeSceneRenderHook) {
    if (!this._beforeSceneRenderHooks.delete(hook)) return;
    this.update();
  }

  constructor(
    readonly document: IDocument,
    readonly highlighter: ThreeHighlighter,
    readonly context: ThreeVisualContext,
    public workplane: Plane
  ) {
    super();
    this._scene = context.scene;
    this._resizeObserver = new ResizeObserver(entries => {
      for (const e of entries) {
        if (e.target === this._dom)
          this.resize(e.contentRect.width, e.contentRect.height);
      }
    });
    this.cameraController = new CameraController(this);
    this._renderer = new WebGLRenderer({ antialias: true, alpha: true });
    this._renderer.domElement.addEventListener("webglcontextlost", event => {
      event.preventDefault();
      this._webglContextLost = true;
    });
    this._renderer.domElement.addEventListener("webglcontextrestored", () => {
      this._webglContextLost = false;
      this.update();
    });
    this._renderer.setPixelRatio(window.devicePixelRatio);
    this._stats = new Stats();
    this._stats.showPanel(0);
    Object.assign(this._stats.dom.style, {
      position: "absolute",
      right: "8px",
      bottom: "8px",
      left: "auto",
      top: "auto",
      zIndex: "30",
      pointerEvents: "none"
    });
    this._scene.add(this.dynamicLight);
    this.applyCameraRenderLayers();
    this._viewHelperWidget = new ViewHelperWidget(
      this.cameraController,
      () => this.camera,
      () => this.update()
    );
    // The scene axes helper is owned by ThreeView and updated inside the
    // render loop so it can stay aligned with the current camera state.
    this._axesHelper = new CustomAxesHelper({
      size: 250,
      getCamera: () => this.camera,
      getViewportWidth: () => this.width,
      getViewportHeight: () => this.height,
      addBeforeSceneRenderHook: hook => this.addBeforeSceneRenderHook(hook),
      removeBeforeSceneRenderHook: hook =>
        this.removeBeforeSceneRenderHook(hook),
      addAfterSceneRenderHook: hook => this.addAfterSceneRenderHook(hook),
      removeAfterSceneRenderHook: hook => this.removeAfterSceneRenderHook(hook)
    });
    this._scene.add(this._axesHelper);
    this._interactionTargetHelper = new InteractionTargetHelper({
      diameterPx: 12,
      getCamera: () => this.camera,
      getTarget: () => this.cameraController.interactionTarget,
      getViewportHeight: () => this.height,
      addBeforeSceneRenderHook: hook => this.addBeforeSceneRenderHook(hook),
      removeBeforeSceneRenderHook: hook =>
        this.removeBeforeSceneRenderHook(hook),
      addAfterSceneRenderHook: hook => this.addAfterSceneRenderHook(hook),
      removeAfterSceneRenderHook: hook => this.removeAfterSceneRenderHook(hook)
    });
    this._interactionTargetHelper.setVisible(false);
    this._scene.add(this._interactionTargetHelper.object);
    this.animate();
  }

  /**
   * Attach the view to its DOM container.
   * @param el The host HTML element.
   */
  setDom(el: HTMLElement) {
    if (this._dom) this._resizeObserver.unobserve(this._dom);
    this._dom = el;
    this._renderer.domElement.style.userSelect = "none";
    el.appendChild(this._renderer.domElement);
    this._viewHelperWidget.attach(el);
    this.resize(el.clientWidth, el.clientHeight);
    this._resizeObserver.observe(el);
    this.cameraController.updateCameraPositionTarget();
    this.bindEvents(el);
  }

  setOverlayHost(el?: HTMLElement) {
    if (this._overlayHost === el) return;
    this._stats.dom.remove();
    this._overlayHost = el;
    this._overlayHost?.appendChild(this._stats.dom);
  }

  get viewHelperVisible() {
    return this._viewHelperVisible;
  }

  /**
   * Toggle the visibility of the view helper widget.
   * @param visible Whether the helper should be visible.
   */
  setViewHelperVisible(visible: boolean) {
    this._viewHelperVisible = visible;
    this._viewHelperWidget.setVisible(visible);
    this.update();
  }

  /**
   * Toggle the helper widget bounding box.
   * @param visible Whether the helper box should be visible.
   */
  setViewHelperBoxVisible(visible: boolean) {
    this._viewHelperWidget.setBoxHelperVisible(visible);
    this.update();
  }

  setInteractionTargetVisible(visible: boolean) {
    this._interactionTargetVisible = visible;
    this.syncInteractionTargetHelperVisibility();
    this.update();
  }

  setViewHelperLocation(
    location: Partial<{
      left: number | null;
      right: number | null;
      top: number | null;
      bottom: number | null;
    }>
  ) {
    this._viewHelperWidget.setLocation(location);
    this.update();
  }

  /**
   * Bind pointer, wheel, and keyboard listeners to the host element.
   * @param el The host HTML element.
   */
  private bindEvents(el: HTMLElement) {
    this._eventAbortController?.abort();
    this._eventAbortController = new AbortController();
    const eventOptions = { signal: this._eventAbortController.signal };
    el.addEventListener("pointerdown", e => {
      if (
        this._viewHelperVisible &&
        this._viewHelperWidget.handlePointerDown(e)
      ) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (this._viewHelperWidget.isAnimating) return;
      // Preserve the browser's default focus/blur behavior for primary clicks
      // so form controls can lose focus naturally when the user clicks the
      // viewport. Keep preventing default for middle/right interactions.
      if (e.button !== 0) {
        e.preventDefault();
      }
      if (this.pointerPickingEnabled) {
        this.document.visual.eventHandler.pointerDown(this, e);
      }
      this.document.visual.viewHandler.pointerDown(this, e);
    }, eventOptions);
    el.addEventListener("pointermove", e => {
      if (this._viewHelperWidget.isAnimating) return;
      if (this._viewHelperVisible) {
        const inside = this._viewHelperWidget.handlePointerMove(e);
        if (inside) return;
      }
      if (this.pointerPickingEnabled && e.buttons !== 4) {
        this.ensurePointQuery(e.offsetX, e.offsetY);
      }
      if (this.pointerPickingEnabled) {
        this.document.visual.eventHandler.pointerMove(this, e);
      }
      this.document.visual.viewHandler.pointerMove(this, e);
    }, eventOptions);
    el.addEventListener("pointerup", e => {
      if (this._viewHelperWidget.isAnimating) return;
      if (
        this._viewHelperVisible &&
        this._viewHelperWidget.handlePointerUp(e)
      ) {
        return;
      }
      e.preventDefault();
      if (this.pointerPickingEnabled) {
        this.document.visual.eventHandler.pointerUp(this, e);
      }
      this.document.visual.viewHandler.pointerUp?.(this, e);
    }, eventOptions);
    el.addEventListener("pointerout", e => {
      if (this._viewHelperWidget.isAnimating) return;
      this._recentPointQuery = undefined;
      if (this.pointerPickingEnabled) {
        this.document.visual.eventHandler.pointerOut?.(this, e);
      }
      this.document.visual.viewHandler.pointerOut?.(this, e);
    }, eventOptions);
    el.addEventListener("dblclick", e => {
      if (this._viewHelperWidget.isAnimating) return;
      if (this.pointerPickingEnabled) {
        this.document.visual.eventHandler.dblClick?.(this, e);
      }
    }, eventOptions);
    el.addEventListener(
      "wheel",
      e => {
        if (this._viewHelperWidget.isAnimating) return;
        e.preventDefault();
        this.document.visual.viewHandler.mouseWheel?.(this, e);
      },
      { passive: false, signal: this._eventAbortController.signal }
    );
    window.addEventListener("keydown", e => {
      this.document.visual.eventHandler.keyDown?.(this, e);
    }, eventOptions);
  }

  /**
   * Mark the view as dirty so it will be rendered again on the next frame.
   */
  update() {
    this._needsUpdate = true;
  }

  /**
   * Main animation loop that renders the scene and all helper overlays.
   * Rendering is driven by requestAnimationFrame.
   */
  private animate() {
    if (this._isDisposed) return;
    this._animationFrameId = requestAnimationFrame(() => this.animate());
    if (this._webglContextLost) return;
    const now = performance.now();
    const delta = (now - this._lastFrameTime) / 1000;
    this._lastFrameTime = now;

    this._viewHelperWidget.tick(now);
    const cameraAnimating = this.cameraController.tick(delta);
    const helperAnimating = this._viewHelperWidget.isAnimating;
    this.syncInteractionTargetHelperVisibility();
    if (cameraAnimating) {
      this._needsUpdate = true;
    }

    if (!this._needsUpdate) return;

    const cameraChanged =
      !this._hasCameraSnapshot ||
      !this._lastCameraWorld.equals(this.camera.matrixWorld) ||
      !this._lastCameraProjection.equals(this.camera.projectionMatrix);
    if (cameraChanged) {
      this._lastCameraWorld.copy(this.camera.matrixWorld);
      this._lastCameraProjection.copy(this.camera.projectionMatrix);
      this._hasCameraSnapshot = true;
      this._recentPointQuery = undefined;
      (this.document.visual as any)?.notifyViewUpdated?.(this);
    }

    const dir = this.camera.position.clone().sub(this.cameraController.target);
    this.dynamicLight.position.copy(dir);
    this.applyCameraRenderLayers();
    // Refresh helper state that depends on the current camera and viewport size.
    this._runBeforeSceneHooks();
    // Render the main scene first so helpers do not participate in its depth
    // or color output.
    this._renderer.autoClear = true;
    this._renderer.render(this._scene, this.camera);
    // Draw overlay helpers after the main scene render.
    this._renderAfterSceneHook();
    if (this._viewHelperVisible) {
      this._renderer.autoClear = false;
      this._viewHelperWidget.render(this._renderer);
    }
    this._renderer.autoClear = true;
    this._needsUpdate = cameraAnimating || helperAnimating;
    this._stats.update();
  }

  /**
   * Resize the renderer and camera to match the viewport size.
   * @param w The new width.
   * @param h The new height.
   */
  private resize(w: number, h: number) {
    if (h < 1) return;
    if (this._webglContextLost) return;
    if (this.camera instanceof PerspectiveCamera) {
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    this._renderer.setSize(w, h);
    this.cameraController.setSize(w, h);
    // Notify helpers after the viewport size changes so they can refresh any
    // cached viewport-dependent state.
    this.axeshelper.onResize();
    this.update();
  }
  // Run all preparation hooks before rendering the main scene.
  private _runBeforeSceneHooks() {
    for (const hook of this._beforeSceneRenderHooks) {
      hook();
    }
  }

  private syncInteractionTargetHelperVisibility() {
    this._interactionTargetHelper.setVisible(
      this._interactionTargetVisible &&
        this.cameraController.shouldShowInteractionTarget
    );
  }

  // Run all after-scene hooks using the current renderer and camera.
  private _renderAfterSceneHook() {
    if (this._afterSceneRenderHooks.size === 0) return;
    const previousAutoClear = this._renderer.autoClear;
    this._renderer.autoClear = false;
    for (const hook of this._afterSceneRenderHooks) {
      hook(this._renderer, this.camera);
    }
    this._renderer.autoClear = previousAutoClear;
  }

  /**
   * Convert screen coordinates to normalized device coordinates (NDC).
   * @param mx Screen-space x.
   * @param my Screen-space y.
   * @returns The corresponding NDC coordinate.
   */
  screenToCameraRect(mx: number, my: number) {
    return new Vector2((mx / this.width) * 2 - 1, -(my / this.height) * 2 + 1);
  }

  /**
   * Build a world-space ray from a screen-space position.
   * @param mx Screen-space x.
   * @param my Screen-space y.
   * @returns A ray cast from the current camera.
   */
  rayAt(mx: number, my: number): Ray {
    return this.ensurePointQuery(mx, my).ray;
  }

  pointQueryAt(mx: number, my: number): ViewPointQuery {
    return this.ensurePointQuery(mx, my);
  }

  /**
   * Convert screen coordinates into world coordinates.
   * @param mx Screen-space x.
   * @param my Screen-space y.
   * @returns The projected world-space point.
   */
  screenToWorld(mx: number, my: number): XYZ {
    const { x, y } = this.screenToCameraRect(mx, my);
    const vec = new Vector3(x, y, 0.5).unproject(this.camera);
    return ThreeHelper.toXYZ(vec);
  }

  /**
   * Convert a world-space point into screen coordinates.
   * @param point The world-space point.
   * @returns The corresponding screen coordinate.
   */
  worldToScreen(point: XYZ): XY {
    const projected = new Vector3(point.x, point.y, point.z).project(
      this.camera
    );
    return new XY(
      (projected.x + 1) * 0.5 * this.width,
      (1 - projected.y) * 0.5 * this.height
    );
  }

  /**
   * Get the camera forward direction in world space.
   * @returns The normalized camera direction.
   */
  direction(): XYZ {
    const dir = new Vector3();
    this.camera.getWorldDirection(dir);
    return ThreeHelper.toXYZ(dir);
  }

  /**
   * Get the camera up direction.
   * @returns The normalized up vector.
   */
  up(): XYZ {
    const up = this.camera.up.clone().normalize();
    return ThreeHelper.toXYZ(up);
  }

  /**
   * Detect visual objects under a screen-space position.
   * @param x Screen-space x.
   * @param y Screen-space y.
   * @returns The hit visual objects.
   */
  detectVisual(x: number, y: number): IVisualObject[] {
    return this.computeVisualHits(this.pointQueryAt(x, y)).map(
      hit => hit.target
    );
  }

  getRecentVisualHit(
    x: number,
    y: number,
    maxAgeMs: number,
    maxRadiusPx: number
  ) {
    const query = this._recentPointQuery;
    if (!query) return undefined;
    if (performance.now() - query.at > maxAgeMs) return undefined;
    if (Math.hypot(x - query.x, y - query.y) > maxRadiusPx) return undefined;
    const hit = this.computeVisualHits(query)[0];
    if (!hit?.target.visible) return undefined;
    return {
      at: query.at,
      x: query.x,
      y: query.y,
      target: hit.target,
      point: hit.point
    };
  }

  /**
   * Detect visual objects inside a rectangle selection.
   * @param x1 Rectangle start x.
   * @param y1 Rectangle start y.
   * @param x2 Rectangle end x.
   * @param y2 Rectangle end y.
   * @returns The visual objects inside the rectangle.
   */
  detectVisualRect(
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ): IVisualObject[] {
    const ctx = this.createRectHitContext(x1, y1, x2, y2);
    const result = new Set<IVisualObject>();
    this.context.visuals().forEach(v => {
      if (!v.visible || !isVisualHitTarget(v)) return;
      v.hitTestRect(ctx).forEach(item => result.add(item));
    });
    return Array.from(result);
  }

  /**
   * Detect sub-shapes of a given type inside a rectangle selection.
   * Uses a fast NDC AABB pass followed by a more precise inclusion check.
   * @param shapeType The requested sub-shape type.
   * @param x1 Rectangle start x.
   * @param y1 Rectangle start y.
   * @param x2 Rectangle end x.
   * @param y2 Rectangle end y.
   * @returns The matching sub-shapes.
   */
  detectShapesRect(
    shapeType: ShapeType,
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ): VisualShapeData[] {
    return (
      this._shapeDetection?.detectShapesRect(shapeType, x1, y1, x2, y2) ?? []
    );
  }

  /**
   * Detect sub-shapes under a screen-space position.
   * @param shapeType The requested sub-shape type.
   * @param mx Screen-space x.
   * @param my Screen-space y.
   * @returns The hit sub-shapes.
   */
  detectShapes(
    shapeType: ShapeType,
    mx: number,
    my: number,
    options?: { guidePolicy?: ViewShapeGuidePolicy }
  ): VisualShapeData[] {
    return this._shapeDetection?.detectShapes(shapeType, mx, my, options) ?? [];
  }

  installShapeDetection(detection?: ViewShapeDetection) {
    this._shapeDetection = detection;
  }

  getPointVisualHits(query: ViewPointQuery) {
    return this.computeVisualHits(query);
  }

  /**
   * Create a raycaster configured for the current screen-space position.
   * @param mx Screen-space x.
   * @param my Screen-space y.
   * @returns A configured raycaster.
   */
  private initRaycaster(mx: number, my: number) {
    const { x, y } = this.screenToCameraRect(mx, my);
    const raycaster = new Raycaster();
    raycaster.layers.enableAll();
    raycaster.setFromCamera(new Vector2(x, y), this.camera);
    raycaster.params = {
      ...raycaster.params,
      Line2: { threshold: RaycasterThreshold },
      Line: { threshold: RaycasterThreshold },
      Points: { threshold: RaycasterThreshold }
    };
    return raycaster;
  }

  private applyCameraRenderLayers() {
    const camera = this.camera;
    camera.layers.disableAll();
    camera.layers.enable(Layers.Default);
    if (this.mode === "wireframe") {
      camera.layers.enable(Layers.Wireframe);
    } else if (this.mode === "solid") {
      camera.layers.enable(Layers.Solid);
    } else {
      camera.layers.enable(Layers.Wireframe);
      camera.layers.enable(Layers.Solid);
    }
    camera.layers.disable(Layers.Hidden);
  }

  private createRay(mx: number, my: number) {
    const { x, y } = this.screenToCameraRect(mx, my);
    const origin = new Vector3();
    const direction = new Vector3(x, y, 0.5);
    if (this.camera instanceof PerspectiveCamera) {
      origin.setFromMatrixPosition(this.camera.matrixWorld);
      direction.unproject(this.camera).sub(origin).normalize();
    } else {
      const z =
        (this.camera.near + this.camera.far) /
        (this.camera.near - this.camera.far);
      origin.set(x, y, z).unproject(this.camera);
      direction.set(0, 0, -1).transformDirection(this.camera.matrixWorld);
    }
    return new Ray(ThreeHelper.toXYZ(origin), ThreeHelper.toXYZ(direction));
  }

  private ensurePointQuery(x: number, y: number): PointQueryCache {
    const query = this._recentPointQuery;
    if (query && query.x === x && query.y === y) {
      return query;
    }
    const next: PointQueryCache = {
      at: performance.now(),
      x,
      y,
      raycaster: this.initRaycaster(x, y),
      ray: this.createRay(x, y)
    };
    this._recentPointQuery = next;
    return next;
  }

  private computeVisualHits(query: ViewPointQuery) {
    const cached = this._visualHitsCache.get(query);
    if (cached) return cached;
    const ctx: VisualPointHitContext = {
      raycaster: query.raycaster
    };
    const hits: VisualPointHit[] = [];
    this.context.visuals().forEach(v => {
      if (!v.visible || !isVisualHitTarget(v)) return;
      hits.push(...v.hitTestPoint(ctx));
    });
    hits.sort((a, b) => a.distance - b.distance);
    this._visualHitsCache.set(query, hits);
    return hits;
  }

  private createRectHitContext(
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ): VisualRectHitContext {
    const selectionBox = this.initSelectionBox(x1, y1, x2, y2);
    const selectedInstances = new Map<string, ReadonlySet<number>>();
    selectionBox.select();
    Object.entries(selectionBox.instances).forEach(([uuid, ids]) => {
      if (!Array.isArray(ids)) return;
      const resolvedIds = ids.filter((id): id is number =>
        Number.isInteger(id)
      );
      if (resolvedIds.length > 0) {
        selectedInstances.set(uuid, new Set(resolvedIds));
      }
    });
    return {
      selectedObjects: new Set(selectionBox.collection),
      selectedInstances
    };
  }

  /**
   * Create a selection box configured for rectangle picking.
   * @param x1 Rectangle start x.
   * @param y1 Rectangle start y.
   * @param x2 Rectangle end x.
   * @param y2 Rectangle end y.
   * @returns A configured selection box.
   */
  private initSelectionBox(x1: number, y1: number, x2: number, y2: number) {
    this.applyCameraRenderLayers();
    const sb = new SelectionBox(this.camera, this._scene);
    const start = this.screenToCameraRect(x1, y1);
    const end = this.screenToCameraRect(x2, y2);
    sb.startPoint.set(start.x, start.y, 0.5);
    sb.endPoint.set(end.x, end.y, 0.5);
    return sb;
  }

  /**
   * Release view-owned resources.
   */
  disposeInternal() {
    super.disposeInternal();
    if (this._animationFrameId) {
      cancelAnimationFrame(this._animationFrameId);
      this._animationFrameId = 0;
    }
    this._eventAbortController?.abort();
    this._eventAbortController = undefined;
    this._resizeObserver.disconnect();
    this._scene.remove(this._interactionTargetHelper.object);
    this._interactionTargetHelper.dispose();
    this._scene.remove(this._axesHelper);
    this._axesHelper.dispose();
    this._viewHelperWidget.dispose();
    this._overlayHost = undefined;
    this._stats.dom.remove();
    this._renderer.dispose();
  }
}
