// @ts-nocheck
import type { AsyncController } from "@modelai/core";
import type {
  IDocument,
  IView,
  IVisualObject,
  VisualShapeData
} from "@modelai/core/types";
import { type ShapeType, VisualState } from "@modelai/core/types";
import { SelectionHandler } from "./selectionHandler";

/**
 * Sub-shape selection for points, edges, and faces.
 *
 * - `candidateTypes` limits the selectable shape types via a ShapeType bitmask.
 * - Supports both click selection and rectangle selection.
 * - Supports Shift-toggle multi-selection.
 */
export class SubShapeSelectionHandler extends SelectionHandler {
  private _highlights: VisualShapeData[] = [];
  /**
   * Nested map for O(1) dedup: owner 鈫?"${shapeType}_${index}" 鈫扸isualShapeData)
   * Grouped by owner so we can issue batched addState/removeState calls.
   */
  private _selected = new Map<IVisualObject, Map<string, VisualShapeData>>();
  private _candidateTypes: ShapeType;
  onSelectionChanged?: (count: number) => void;
  selectedState: VisualState = VisualState.edgeSelected;
  highlightState: VisualState = VisualState.edgeHighlight;

  constructor(
    readonly document: IDocument,
    candidateTypes: ShapeType,
    container?: HTMLElement,
    controller?: AsyncController,
    private readonly filter?: (shape: VisualShapeData) => boolean,
    multiMode: boolean = false
  ) {
    super(container, multiMode, controller);
    this._candidateTypes = candidateTypes;
  }

  get candidateTypes(): ShapeType {
    return this._candidateTypes;
  }

  setCandidateTypes(types: ShapeType) {
    this.cleanHighlights();
    this.clearSubSelection();
    this._candidateTypes = types;
  }

  protected override setHighlight(view: IView, event: PointerEvent) {
    if (this._candidateTypes === 0) return;
    if (
      this.rect &&
      Math.abs(this.mouse.x - event.offsetX) > 3 &&
      Math.abs(this.mouse.y - event.offsetY) > 3
    ) {
      // Do not show hover highlights while rectangle selection is in progress.
      this.cleanHighlights();
      return;
    }
    let detected = view.detectShapes(
      this._candidateTypes,
      event.offsetX,
      event.offsetY
    );
    if (this.filter) detected = detected.filter(this.filter);
    this.applyHighlights(view, detected.length > 0 ? [detected[0]] : []);
  }

  private applyHighlights(view: IView, detecteds: VisualShapeData[]) {
    this.cleanHighlights();
    detecteds.forEach(d => {
      view.document.visual.highlighter.addState(
        d.owner,
        this.highlightState,
        d.shape.shapeType,
        ...d.indexes
      );
    });
    this._highlights = detecteds;
    view.update();
  }

  protected override clearSelected() {
    this.clearSubSelection();
  }

  protected override highlightNext(_view: IView) {}

  protected override cleanHighlights() {
    this._highlights.forEach(d => {
      this.document.visual.highlighter.removeState(
        d.owner,
        this.highlightState,
        d.shape.shapeType,
        ...d.indexes
      );
    });
    this._highlights = [];
  }

  protected override select(view: IView, event: PointerEvent): number {
    let toSelect: VisualShapeData[];
    const isDrag =
      this.rect !== undefined ||
      Math.abs(this.mouse.x - event.offsetX) > 3 ||
      Math.abs(this.mouse.y - event.offsetY) > 3;

    const t0 = performance.now();

    if (isDrag) {
      toSelect = view.detectShapesRect(
        this._candidateTypes,
        this.mouse.x,
        this.mouse.y,
        event.offsetX,
        event.offsetY
      );
      if (this.filter) toSelect = toSelect.filter(this.filter);
    } else {
      toSelect = this._highlights.length > 0 ? [...this._highlights] : [];
    }

    const t1 = performance.now();

    if (toSelect.length === 0) {
      if (!event.shiftKey) this.clearSubSelection();
      return 0;
    }

    const t2before = performance.now();
    if (event.shiftKey) {
      this.toggleSubSelection(toSelect, view);
    } else {
      this.clearSubSelection();
      const t2clear = performance.now();
      this.addToSubSelection(toSelect);
      const t2build = performance.now();
      console.debug(
        `[SubShapeSelect] drag=${isDrag}  hit=${toSelect.length}  selected=${this.selectedCount}` +
          `\n  detect : ${(t1 - t0).toFixed(1)} ms` +
          `\n  clear  : ${(t2clear - t2before).toFixed(1)} ms` +
          `\n  build  : ${(t2build - t2clear).toFixed(1)} ms` +
          `\n  total  : ${(t2build - t0).toFixed(1)} ms`
      );
      this.onSelectionChanged?.(this.selectedCount);
      view.update();
      return this.selectedCount;
    }

    const t3 = performance.now();
    console.debug(
      `[SubShapeSelect] drag=${isDrag}  hit=${toSelect.length}  selected=${this.selectedCount}` +
        `\n  detect : ${(t1 - t0).toFixed(1)} ms` +
        `\n  toggle : ${(t3 - t2before).toFixed(1)} ms` +
        `\n  total  : ${(t3 - t0).toFixed(1)} ms`
    );

    this.onSelectionChanged?.(this.selectedCount);
    view.update();
    return this.selectedCount;
  }

  /** Total number of selected sub-shapes across all owners. */
  private get selectedCount(): number {
    let n = 0;
    for (const m of this._selected.values()) n += m.size;
    return n;
  }

  /** Inner key for the per-owner Map. */
  private static subKey(d: VisualShapeData) {
    return `${d.shape.shapeType}_${d.indexes[0]}`;
  }

  /** Group an array of VisualShapeData by (owner, shapeType) 鈫抍ollected indexes. */
  private groupByOwnerType(
    shapes: VisualShapeData[]
  ): Map<IVisualObject, Map<ShapeType, number[]>> {
    const groups = new Map<IVisualObject, Map<ShapeType, number[]>>();
    for (const d of shapes) {
      let typeMap = groups.get(d.owner);
      if (!typeMap) {
        typeMap = new Map();
        groups.set(d.owner, typeMap);
      }
      let indices = typeMap.get(d.shape.shapeType);
      if (!indices) {
        indices = [];
        typeMap.set(d.shape.shapeType, indices);
      }
      indices.push(...d.indexes);
    }
    return groups;
  }

  private addToSubSelection(shapes: VisualShapeData[]) {
    // O(1) dedup 鈫抩nly collect shapes not already in _selected
    const toAdd: VisualShapeData[] = [];
    for (const d of shapes) {
      const k = SubShapeSelectionHandler.subKey(d);
      let ownerMap = this._selected.get(d.owner);
      if (!ownerMap) {
        ownerMap = new Map();
        this._selected.set(d.owner, ownerMap);
      }
      if (!ownerMap.has(k)) {
        ownerMap.set(k, d);
        toAdd.push(d);
      }
    }
    if (toAdd.length === 0) return;
    // One addState call per (owner, type) 鈫抩ne batch GPU object rebuild each
    for (const [owner, typeMap] of this.groupByOwnerType(toAdd)) {
      for (const [type, indices] of typeMap) {
        this.document.visual.highlighter.addState(
          owner,
          this.selectedState,
          type,
          ...indices
        );
      }
    }
  }

  private toggleSubSelection(shapes: VisualShapeData[], _view: IView) {
    const toRemove: VisualShapeData[] = [];
    const toAdd: VisualShapeData[] = [];

    for (const d of shapes) {
      const k = SubShapeSelectionHandler.subKey(d);
      const ownerMap = this._selected.get(d.owner);
      if (ownerMap?.has(k)) {
        toRemove.push(ownerMap.get(k)!);
        ownerMap.delete(k);
        if (ownerMap.size === 0) this._selected.delete(d.owner);
      } else {
        let om = this._selected.get(d.owner);
        if (!om) {
          om = new Map();
          this._selected.set(d.owner, om);
        }
        om.set(k, d);
        toAdd.push(d);
      }
    }

    for (const [owner, typeMap] of this.groupByOwnerType(toRemove)) {
      for (const [type, indices] of typeMap) {
        this.document.visual.highlighter.removeState(
          owner,
          this.selectedState,
          type,
          ...indices
        );
      }
    }
    for (const [owner, typeMap] of this.groupByOwnerType(toAdd)) {
      for (const [type, indices] of typeMap) {
        this.document.visual.highlighter.addState(
          owner,
          this.selectedState,
          type,
          ...indices
        );
      }
    }
  }

  clearSubSelection() {
    // Batch removeState per (owner, type) 鈫抩ne call rebuilds the batch object once
    for (const [owner, innerMap] of this._selected) {
      const typeGroups = new Map<ShapeType, number[]>();
      for (const d of innerMap.values()) {
        let indices = typeGroups.get(d.shape.shapeType);
        if (!indices) {
          indices = [];
          typeGroups.set(d.shape.shapeType, indices);
        }
        indices.push(...d.indexes);
      }
      for (const [type, indices] of typeGroups) {
        this.document.visual.highlighter.removeState(
          owner,
          this.selectedState,
          type,
          ...indices
        );
      }
    }
    this._selected.clear();
    this.onSelectionChanged?.(0);
  }

  getSelectedShapes(): VisualShapeData[] {
    const result: VisualShapeData[] = [];
    for (const innerMap of this._selected.values()) {
      for (const d of innerMap.values()) result.push(d);
    }
    return result;
  }

  override dispose() {
    this.cleanHighlights();
    this.clearSubSelection();
    super.dispose();
  }
}
