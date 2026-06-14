// @ts-nocheck
import {
  type IHighlighter,
  type IVisualObject,
  type ShapeType,
  ShapeTypeUtils,
  VisualState,
  VisualStateUtils
} from "@modelai/core/types";
import { BufferAttribute, BufferGeometry, Group, Mesh } from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { ThreeGeometry } from "./geometry";
import {
  faceLambertHighlightOverlayMaterial,
  faceLambertSelectedOverlayMaterial,
  faceLambertSnapOverlayMaterial,
  lineHighlightWideMaterial,
  lineSelectedWideMaterial,
  lineSnapWideMaterial
} from "./materials";
import {
  ReferenceInstanceVisual,
  type ThreeReferenceArrayVisual
} from "./referenceArrayVisual";
import { isWholeStateVisual, type IWholeStateVisual } from "./visualObject";

type HighlightableVisual =
  | (ThreeGeometry & IWholeStateVisual)
  | (ThreeReferenceArrayVisual & IWholeStateVisual);

class GeometryState {
  // Whole-shape state per ShapeType key
  private readonly _wholeStates = new Map<string, VisualState>();
  // Sub-shape index sets and their single merged batch object, keyed by `${VisualState}_${ShapeType}`
  private readonly _subSets = new Map<string, Set<number>>();
  private readonly _batchObjects = new Map<string, LineSegments2 | Mesh>();

  constructor(
    private highlighter: ThreeHighlighter,
    private visual: HighlightableVisual
  ) {}

  private wholeKey(type: ShapeType) {
    return `w_${type}`;
  }
  private batchKey(state: VisualState, type: ShapeType) {
    return `b_${state}_${type}`;
  }

  addState(state: VisualState, type: ShapeType, indexes: number[]) {
    if (ShapeTypeUtils.isWhole(type)) {
      this.setWholeState("add", state, type);
    } else if (indexes.length > 0) {
      const key = this.batchKey(state, type);
      let set = this._subSets.get(key);
      if (!set) {
        set = new Set();
        this._subSets.set(key, set);
      }
      indexes.forEach(i => set!.add(i));
      this.rebuildBatch(state, type, key, set);
    }
  }

  removeState(state: VisualState, type: ShapeType, indexes: number[]) {
    if (ShapeTypeUtils.isWhole(type)) {
      this.setWholeState("remove", state, type);
    } else if (indexes.length > 0) {
      const key = this.batchKey(state, type);
      const set = this._subSets.get(key);
      if (!set) return;
      indexes.forEach(i => set.delete(i));
      if (set.size === 0) {
        this.disposeBatchObject(key);
        this._subSets.delete(key);
      } else {
        this.rebuildBatch(state, type, key, set);
      }
    }
  }

  private setWholeState(
    method: "add" | "remove",
    state: VisualState,
    type: ShapeType
  ) {
    const key = this.wholeKey(type);
    const oldState = this._wholeStates.get(key) ?? VisualState.normal;
    const newState =
      method === "add"
        ? VisualStateUtils.addState(oldState, state)
        : VisualStateUtils.removeState(oldState, state);
    if (newState === VisualState.normal) this.visual.clearWholeVisualState();
    else this.visual.applyWholeVisualState(newState);
    if (newState === VisualState.normal) {
      this._wholeStates.delete(key);
    } else {
      this._wholeStates.set(key, newState);
    }
  }

  /**
   * Rebuild the single merged Mesh / LineSegments2 that represents ALL sub-shapes
   * for a given (state, type) combination.  One GPU object replaces N individual ones.
   */
  private rebuildBatch(
    state: VisualState,
    type: ShapeType,
    key: string,
    indices: Set<number>
  ) {
    this.disposeBatchObject(key);
    if (!(this.visual instanceof ThreeGeometry) || indices.size === 0) return;
    const isHighlight = VisualStateUtils.hasState(
      state,
      VisualState.edgeHighlight
    );
    const isSnapHighlight = VisualStateUtils.hasState(
      state,
      VisualState.snapHighlight
    );

    if (ShapeTypeUtils.hasFace(type) || ShapeTypeUtils.hasShell(type)) {
      const faces = this.visual.geometryNode.mesh.faces;
      if (!faces?.index) return;

      // Count total triangles across all selected faces
      let totalCount = 0;
      indices.forEach(i => {
        if (i >= 0 && i < faces.range.length)
          totalCount += faces.range[i].count;
      });
      if (totalCount === 0) return;

      // Merge index ranges into a single Uint32Array (shares the same position/normal)
      const merged = new Uint32Array(totalCount);
      let offset = 0;
      indices.forEach(i => {
        if (i < 0 || i >= faces.range.length) return;
        const { start, count } = faces.range[i];
        merged.set(faces.index.subarray(start, start + count), offset);
        offset += count;
      });

      const geom = new BufferGeometry();
      geom.setAttribute("position", new BufferAttribute(faces.position, 3));
      geom.setAttribute("normal", new BufferAttribute(faces.normal, 3));
      geom.setIndex(new BufferAttribute(merged, 1));
      const mesh = new Mesh(
        geom,
        isSnapHighlight
          ? faceLambertSnapOverlayMaterial
          : isHighlight
            ? faceLambertHighlightOverlayMaterial
            : faceLambertSelectedOverlayMaterial
      );
      mesh.applyMatrix4(this.visual.matrixWorld);
      this.highlighter.container.add(mesh);
      this._batchObjects.set(key, mesh);
    } else if (ShapeTypeUtils.hasEdge(type) || ShapeTypeUtils.hasWire(type)) {
      const edges = this.visual.geometryNode.mesh.edges;
      if (!edges) return;

      // Count total floats across all selected edges
      let totalFloats = 0;
      indices.forEach(i => {
        if (i >= 0 && i < edges.range.length)
          totalFloats += edges.range[i].count * 3;
      });
      if (totalFloats === 0) return;

      // Merge position slices into a single Float32Array
      const merged = new Float32Array(totalFloats);
      let offset = 0;
      indices.forEach(i => {
        if (i < 0 || i >= edges.range.length) return;
        const { start, count } = edges.range[i];
        const src = edges.position.subarray(start * 3, (start + count) * 3);
        merged.set(src, offset);
        offset += src.length;
      });

      const lineGeom = new LineSegmentsGeometry();
      lineGeom.setPositions(merged);
      const seg = new LineSegments2(
        lineGeom,
        isSnapHighlight
          ? lineSnapWideMaterial
          : isHighlight
            ? lineHighlightWideMaterial
            : lineSelectedWideMaterial
      );
      seg.applyMatrix4(this.visual.matrixWorld);
      this.highlighter.container.add(seg);
      this._batchObjects.set(key, seg);
    }
  }

  private disposeBatchObject(key: string) {
    const obj = this._batchObjects.get(key);
    if (obj) {
      this.highlighter.container.remove(obj);
      obj.geometry?.dispose();
      this._batchObjects.delete(key);
    }
  }

  resetState() {
    this._batchObjects.forEach(obj => {
      this.highlighter.container.remove(obj);
      obj.geometry?.dispose();
    });
    this._batchObjects.clear();
    this._subSets.clear();
    this._wholeStates.clear();
    this.visual.clearWholeVisualState();
  }
}

export class ThreeHighlighter implements IHighlighter {
  private readonly _stateMap = new Map<HighlightableVisual, GeometryState>();
  private readonly _referenceVisuals = new Set<ThreeReferenceArrayVisual>();
  readonly container: Group;

  constructor(scene: import("three").Scene) {
    this.container = new Group();
    this.container.name = "highlighter";
    scene.add(this.container);
  }

  addState(
    obj: IVisualObject,
    state: VisualState,
    type: ShapeType,
    ...index: number[]
  ) {
    if (obj instanceof ReferenceInstanceVisual) {
      this._referenceVisuals.add(obj.visual);
      if (VisualStateUtils.hasState(state, VisualState.snapHighlight)) {
        obj.visual.addInstanceState(obj.instanceNode, "snap");
      } else if (VisualStateUtils.hasState(state, VisualState.edgeSelected)) {
        obj.visual.addInstanceState(obj.instanceNode, "selected");
      } else if (VisualStateUtils.hasState(state, VisualState.edgeHighlight)) {
        obj.visual.addInstanceState(obj.instanceNode, "highlight");
      }
      return;
    }
    if (!isWholeStateVisual(obj)) return;
    const visual = obj as HighlightableVisual;
    const gs = this.getOrInit(visual);
    gs.addState(state, type, index);
  }

  removeState(
    obj: IVisualObject,
    state: VisualState,
    type: ShapeType,
    ...index: number[]
  ) {
    if (obj instanceof ReferenceInstanceVisual) {
      this._referenceVisuals.add(obj.visual);
      if (VisualStateUtils.hasState(state, VisualState.snapHighlight)) {
        obj.visual.removeInstanceState(obj.instanceNode, "snap");
      } else if (VisualStateUtils.hasState(state, VisualState.edgeSelected)) {
        obj.visual.removeInstanceState(obj.instanceNode, "selected");
      } else if (VisualStateUtils.hasState(state, VisualState.edgeHighlight)) {
        obj.visual.removeInstanceState(obj.instanceNode, "highlight");
      }
      return;
    }
    if (!isWholeStateVisual(obj)) return;
    const visual = obj as HighlightableVisual;
    const gs = this.getOrInit(visual);
    gs.removeState(state, type, index);
  }

  clear() {
    this._stateMap.forEach(gs => gs.resetState());
    this._stateMap.clear();
    this._referenceVisuals.forEach(visual => visual.clearInstanceStates());
    this._referenceVisuals.clear();
  }

  private getOrInit(visual: HighlightableVisual): GeometryState {
    let gs = this._stateMap.get(visual);
    if (!gs) {
      gs = new GeometryState(this, visual);
      this._stateMap.set(visual, gs);
    }
    return gs;
  }
}
