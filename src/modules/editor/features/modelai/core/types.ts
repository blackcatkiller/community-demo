// @ts-nocheck
import type { IDisposable } from "./gc";
import type { AsyncController } from "./asyncController";
import type { History } from "./history";
import type { BoundingBox, Matrix4, Plane, XYZ, XYZLike } from "./math";
import type { FeatureGuideDescriptor } from "../geometry/featureGeometry";
import type { Object3D, Raycaster } from "three";

export type { BoundingBox, XYZLike };

// --- Shape Types ---

export enum ShapeType {
  Shape = 0b0,
  Compound = 0b1,
  CompoundSolid = 0b10,
  Solid = 0b100,
  Shell = 0b1000,
  Face = 0b10000,
  Wire = 0b100000,
  Edge = 0b1000000,
  Vertex = 0b10000000
}

export class ShapeTypeUtils {
  static isWhole(type: ShapeType) {
    return (
      type === ShapeType.Shape ||
      type === ShapeType.Compound ||
      type === ShapeType.CompoundSolid ||
      type === ShapeType.Solid ||
      type === ShapeType.Vertex
    );
  }
  static hasCompound(t: ShapeType) {
    return (t & ShapeType.Compound) !== 0;
  }
  static hasCompoundSolid(t: ShapeType) {
    return (t & ShapeType.CompoundSolid) !== 0;
  }
  static hasSolid(t: ShapeType) {
    return (t & ShapeType.Solid) !== 0;
  }
  static hasShell(t: ShapeType) {
    return (t & ShapeType.Shell) !== 0;
  }
  static hasFace(t: ShapeType) {
    return (t & ShapeType.Face) !== 0;
  }
  static hasWire(t: ShapeType) {
    return (t & ShapeType.Wire) !== 0;
  }
  static hasEdge(t: ShapeType) {
    return (t & ShapeType.Edge) !== 0;
  }
  static hasVertex(t: ShapeType) {
    return (t & ShapeType.Vertex) !== 0;
  }
}

export enum VisualState {
  normal = 0,
  edgeHighlight = 1,
  edgeSelected = 1 << 1,
  faceTransparent = 1 << 2,
  faceColored = 1 << 3,
  snapHighlight = 1 << 4,
  faceDragGhost = 1 << 5
}

export type CursorType = string;

export class VisualStateUtils {
  static addState(origin: VisualState, add: VisualState) {
    return origin | add;
  }
  static removeState(origin: VisualState, remove: VisualState) {
    return (origin & remove) ^ origin;
  }
  static hasState(origin: VisualState, test: VisualState) {
    return (origin & test) === test;
  }
}

export type LineType = "solid" | "dash";

// --- Mesh Data ---

export interface ShapeMeshRange {
  start: number;
  count: number;
  shape: ISubShape;
  transform?: Matrix4;
}

export interface ShapeMeshData {
  position: Float32Array;
  range: ShapeMeshRange[];
  color?: number | number[];
}

export interface VertexMeshData extends ShapeMeshData {
  size: number;
  alwaysOnTop?: boolean;
}

export interface EdgeMeshData extends ShapeMeshData {
  lineType: LineType;
  lineWidth?: number;
  advancedOcclusion?: boolean;
}

export interface FaceMeshData extends ShapeMeshData {
  index: Uint32Array;
  normal: Float32Array;
  uv: Float32Array;
  groups: { start: number; count: number; materialIndex?: number }[];
}

export interface IShapeMeshData {
  edges: EdgeMeshData | undefined;
  faces: FaceMeshData | undefined;
  vertexs: VertexMeshData | undefined;
}

export class MeshDataUtils {
  static isVertexMesh(d: ShapeMeshData): d is VertexMeshData {
    return (d as VertexMeshData)?.size !== undefined;
  }
  static isEdgeMesh(d: ShapeMeshData): d is EdgeMeshData {
    return (d as EdgeMeshData)?.lineType !== undefined;
  }
  static isFaceMesh(d: ShapeMeshData): d is FaceMeshData {
    return (d as FaceMeshData)?.index !== undefined;
  }
  static createVertexMesh(
    point: XYZLike,
    size: number,
    color: number
  ): VertexMeshData {
    return {
      position: new Float32Array([point.x, point.y, point.z]),
      range: [],
      size,
      color
    };
  }
  static createEdgeMesh(
    start: XYZLike,
    end: XYZLike,
    color: number,
    lineType: LineType = "solid",
    lineWidth?: number
  ): EdgeMeshData {
    return {
      position: new Float32Array([
        start.x,
        start.y,
        start.z,
        end.x,
        end.y,
        end.z
      ]),
      range: [],
      color,
      lineType,
      lineWidth
    };
  }
}

export function subEdge(
  edges: EdgeMeshData,
  index: number
): Float32Array | undefined {
  if (index < 0 || index >= edges.range.length) return undefined;
  const { start, count } = edges.range[index];
  return edges.position.slice(start * 3, (start + count) * 3);
}

export function subFaceOutlines(
  faces: FaceMeshData,
  index: number
): Float32Array | undefined {
  if (index < 0 || index >= faces.range.length) return undefined;
  const { start, count } = faces.range[index];
  const result: number[] = [];
  for (let i = start; i < start + count; i += 3) {
    const idx0 = faces.index[i],
      idx1 = faces.index[i + 1],
      idx2 = faces.index[i + 2];
    const pushEdge = (a: number, b: number) => {
      result.push(
        faces.position[a * 3],
        faces.position[a * 3 + 1],
        faces.position[a * 3 + 2],
        faces.position[b * 3],
        faces.position[b * 3 + 1],
        faces.position[b * 3 + 2]
      );
    };
    pushEdge(idx0, idx1);
    pushEdge(idx1, idx2);
    pushEdge(idx2, idx0);
  }
  return new Float32Array(result);
}

// --- Shape Interfaces ---

export enum Orientation {
  FORWARD,
  REVERSED,
  INTERNAL,
  EXTERNAL
}

export interface IShape extends IDisposable {
  readonly shapeType: ShapeType;
  readonly id: string;
  readonly mesh: IShapeMeshData;
  matrix: Matrix4;
  isNull(): boolean;
  isEqual(other: IShape): boolean;
  isSame(other: IShape): boolean;
  findAncestor(ancestorType: ShapeType, fromShape: IShape): IShape[];
  findSubShapes(subshapeType: ShapeType): IShape[];
  clone(): IShape;
}

export interface ISubShape extends IShape {
  index: number;
  parent: IShape;
}

// --- Visual Config ---

export { VisualConfig } from "@modelai/config/visual";

// --- Node action ---

export enum NodeAction {
  add,
  remove,
  insertBefore,
  insertAfter,
  move,
  transfer
}

export interface NodeRecord {
  action: NodeAction;
  node: INode;
  oldParent?: INodeLinkedList;
  oldPrevious?: INode;
  newParent?: INodeLinkedList;
  newPrevious?: INode;
}

// --- Node interfaces ---

export interface INode extends IDisposable {
  readonly id: string;
  visible: boolean;
  parentVisible: boolean;
  name: string;
  parent: INodeLinkedList | undefined;
  previousSibling: INode | undefined;
  nextSibling: INode | undefined;
  onPropertyChanged(
    handler: (property: string, source: any, oldValue: any) => void
  ): void;
  removePropertyChanged(
    handler: (property: string, source: any, oldValue: any) => void
  ): void;
}

export interface INodeLinkedList extends INode {
  firstChild: INode | undefined;
  lastChild: INode | undefined;
  add(...items: INode[]): void;
  insertAfter(previousSibling: INode | undefined, ...items: INode[]): void;
  remove(...items: INode[]): void;
  size(): number;
  move(child: INode, newParent: INodeLinkedList, previousSibling?: INode): void;
}

// --- Visual interfaces ---

export interface IVisualObject extends IDisposable {
  visible: boolean;
  transform: Matrix4;
  worldTransform(): Matrix4;
  boundingBox(): { min: XYZ; max: XYZ } | undefined;
}

export interface IEventHandler extends IDisposable {
  isEnabled: boolean;
  pointerMove(view: IView, event: PointerEvent): void;
  pointerDown(view: IView, event: PointerEvent): void;
  pointerUp(view: IView, event: PointerEvent): void;
  dblClick?(view: IView, event: MouseEvent): void;
  pointerOut?(view: IView, event: PointerEvent): void;
  mouseWheel?(view: IView, event: WheelEvent): void;
  keyDown?(view: IView, event: KeyboardEvent): void;
}

export interface IHighlighter {
  addState(
    obj: IVisualObject,
    state: VisualState,
    type: ShapeType,
    ...index: number[]
  ): void;
  removeState(
    obj: IVisualObject,
    state: VisualState,
    type: ShapeType,
    ...index: number[]
  ): void;
  clear(): void;
}

export interface IVisualContext extends IDisposable {
  onNeedsUpdate?: () => void;
  onVisualShapesChanged?: () => void;
  addNode(nodes: INode[]): void;
  removeNode(nodes: INode[]): void;
  getVisual(node: INode): IVisualObject | undefined;
  getNode(visual: IVisualObject): INode | undefined;
  redrawNode(nodes: INode[]): void;
  setVisible(node: INode, visible: boolean): void;
  visuals(): IVisualObject[];
  handleNodeChanged(records: NodeRecord[]): void;
  displayMesh(
    meshes: ShapeMeshData[],
    opacity?: number,
    depthTest?: boolean
  ): number;
  displayObject(obj: Object3D): number;
  removeMesh(id: number): void;
  setTempMeshEmphasis(id: number, emphasized: boolean): void;
  /** Update the world transform of a temp mesh created by displayMesh/displayObject. */
  setTempMeshTransform(id: number, matrix: Matrix4): void;
  /** For lightweight dynamic guides (e.g. auxiliary lines). */
  displayLineSegments(data: EdgeMeshData): number;
  /** Update positions of a temp mesh created by displayLineSegments/displayMesh. */
  setPosition(id: number, position: Float32Array): void;
  /** Display instanced face meshes for lightweight previews. */
  displayInstancedMesh(
    data: FaceMeshData,
    matrixs: Matrix4[],
    opacity?: number
  ): number;
  /** Update instance matrices of a temp instanced mesh. */
  setInstanceMatrix(id: number, matrixs: Matrix4[]): void;
}

export interface IView {
  readonly document: IDocument;
  readonly cameraController: ICameraController;
  readonly width: number;
  readonly height: number;
  pointerPickingEnabled: boolean;
  mode: ViewMode;
  workplane: Plane;
  setDom(element: HTMLElement): void;
  update(): void;
  up(): XYZ;
  direction(): XYZ;
  detectVisual(x: number, y: number): IVisualObject[];
  detectVisualRect(
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ): IVisualObject[];
  detectShapes(
    shapeType: ShapeType,
    mx: number,
    my: number,
    options?: { guidePolicy?: ViewShapeGuidePolicy }
  ): VisualShapeData[];
  detectShapesRect(
    shapeType: ShapeType,
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ): VisualShapeData[];
  setInteractionTargetVisible?(visible: boolean): void;
  screenToWorld(mx: number, my: number): XYZ;
  worldToScreen(point: XYZ): import("./math").XY;
  rayAt(mx: number, my: number): import("./math").Ray;
  pointQueryAt(mx: number, my: number): ViewPointQuery;
}

export type ViewShapeGuidePolicy = "default" | "pointProxy";

export interface ViewPointQuery {
  readonly at: number;
  readonly x: number;
  readonly y: number;
  readonly ray: import("./math").Ray;
  readonly raycaster: Raycaster;
}

export type ViewMode = "wireframe" | "solid" | "solidAndWireframe";
export type CameraType = "perspective" | "orthographic";

export interface ICameraController {
  cameraType: CameraType;
  zoom(x: number, y: number, delta: number): void;
  pan(dx: number, dy: number): void;
  rotate(dx: number, dy: number): void;
  startRotate(x: number, y: number): void;
  fitContent(): void;
  lookAt(
    eye: import("./math").XYZLike,
    target: import("./math").XYZLike,
    up: import("./math").XYZLike
  ): void;
}

export interface IVisual extends IDisposable {
  readonly document: IDocument;
  readonly context: IVisualContext;
  readonly highlighter: IHighlighter;
  readonly viewHandler: IEventHandler;
  eventHandler: IEventHandler;
  update(): void;
  resetEventHandler(): void;
  createView(name: string, workplane: import("./math").Plane): IView;
}

export interface VisualShapeData {
  owner: IVisualObject & { node: any };
  shape: IShape;
  transform: Matrix4;
  point?: XYZ;
  indexes: number[];
  guide?: FeatureGuideDescriptor;
}

export type OnNodeChanged = (records: NodeRecord[]) => void;

export interface PushPlatePlaneObject {
  z: number;
  helperVisible: boolean;
  helperWidth: number;
  helperHeight: number;
}

// --- Document & Application ---

export interface IDocument {
  readonly id: string;
  name: string;
  readonly visual: IVisual;
  readonly modelManager: import("@modelai/model/modelManager").ModelManager;
  readonly selection: ISelection;
  readonly application: IApplication;
  readonly history: History;
  readonly pushPlatePlane: PushPlatePlaneObject;
}

export interface ISelection {
  getSelectedNodes(): INode[];
  setSelection(nodes: INode[], toggle: boolean): void;
  clearSelection(): void;
  onSelectionChanged(
    cb: (selected: INode[], deselected: INode[]) => void
  ): void;
  pickShape(
    prompt: string,
    controller: AsyncController,
    multiMode: boolean,
    selectedState?: VisualState,
    highlightState?: VisualState
  ): Promise<VisualShapeData[]>;
  pickNode(
    prompt: string,
    controller: AsyncController,
    multiMode: boolean
  ): Promise<INode[]>;
  pickAsync(
    handler: IEventHandler,
    prompt: string,
    controller: AsyncController,
    showControl: boolean,
    cursor?: CursorType
  ): Promise<void>;
}

export interface IApplication {
  activeView: IView | undefined;
  readonly views: IView[];
}
