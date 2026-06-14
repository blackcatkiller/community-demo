// @ts-nocheck
import type {
  IDocument,
  IEventHandler,
  IVisual,
  IView
} from "@modelai/core/types";
import type { Plane } from "@modelai/core/math";
import { AmbientLight, Scene } from "three";
import { ThreeHighlighter } from "./highlighter";
import { ShapeHitTester } from "./shapeHitTester";
import { ensureThreeUpDefaults } from "./upPolicy";
import { ThreeView } from "./view";
import { ThreeViewHandler } from "./viewHandler";
import { ThreeVisualContext } from "./visualContext";

ensureThreeUpDefaults();

export class ThreeVisual implements IVisual {
  readonly context: ThreeVisualContext;
  readonly scene: Scene;
  readonly highlighter: ThreeHighlighter;
  readonly viewHandler: IEventHandler;
  private _eventHandler: IEventHandler;
  private _views: ThreeView[] = [];
  private _viewUpdaters = new Set<(view: IView) => void>();

  get eventHandler() {
    return this._eventHandler;
  }
  set eventHandler(v: IEventHandler) {
    this._eventHandler = v;
  }

  constructor(
    readonly document: IDocument,
    defaultHandler: IEventHandler
  ) {
    this.scene = this.initScene();
    this.viewHandler = new ThreeViewHandler();
    this.context = new ThreeVisualContext(this.scene, document);
    this.context.onNeedsUpdate = () => this.update();
    this.highlighter = new ThreeHighlighter(this.scene);
    this._eventHandler = defaultHandler;
  }

  private initScene() {
    const scene = new Scene();
    scene.add(new AmbientLight(0x888888, 4));
    return scene;
  }

  resetEventHandler() {}

  update() {
    this._views.forEach(v => v.update());
  }

  registerViewUpdater(updater: (view: IView) => void) {
    this._viewUpdaters.add(updater);
  }

  unregisterViewUpdater(updater: (view: IView) => void) {
    this._viewUpdaters.delete(updater);
  }

  notifyViewUpdated(view: IView) {
    this._viewUpdaters.forEach(updater => updater(view));
  }

  createView(name: string, workplane: Plane): IView {
    const view = new ThreeView(
      this.document,
      this.highlighter,
      this.context,
      workplane
    );
    ShapeHitTester.install(view);
    this._views.push(view);
    return view;
  }

  dispose() {
    this.context.dispose();
    this.viewHandler.dispose();
    this.scene.clear();
  }
}
