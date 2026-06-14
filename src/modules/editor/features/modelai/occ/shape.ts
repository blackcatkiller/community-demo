// @ts-nocheck
import {
  gc,
  type IDisposable,
  isDisposable,
  type Matrix4,
  type IShape,
  type ISubShape,
  type IShapeMeshData,
  type EdgeMeshData,
  type FaceMeshData,
  type VertexMeshData,
  type ShapeMeshRange,
  type ShapeType,
  VisualConfig,
  type Orientation,
  type XYZ
} from "@modelai/core";
import type {
  TopoDS_Edge,
  TopoDS_Face,
  TopoDS_Shape,
  TopoDS_Vertex
} from "chili-wasm";
import {
  convertFromMatrix,
  convertToMatrix,
  getOrientation,
  getShapeEnum,
  getShapeType,
  toXYZ
} from "./helper";

function parseHexColor(hex: string): { r: number; g: number; b: number } {
  const clean = hex.startsWith("#") ? hex.slice(1) : hex;
  const int = parseInt(clean, 16);
  return {
    r: ((int >> 16) & 0xff) / 255,
    g: ((int >> 8) & 0xff) / 255,
    b: (int & 0xff) / 255
  };
}

function hexColorToNumber(hex: string): number {
  const clean = hex.startsWith("#") ? hex.slice(1) : hex;
  return parseInt(clean, 16);
}

function fillDefaultColor(colorData: Float32Array, defaultColor: number) {
  const dr = ((defaultColor >> 16) & 0xff) / 255;
  const dg = ((defaultColor >> 8) & 0xff) / 255;
  const db = (defaultColor & 0xff) / 255;
  for (let i = 0; i < colorData.length / 3; i++) {
    colorData[i * 3] = dr;
    colorData[i * 3 + 1] = dg;
    colorData[i * 3 + 2] = db;
  }
}

let _idCounter = 0;
function genId(): string {
  return `shape_${++_idCounter}`;
}

export class OccShape implements IShape {
  readonly shapeType: ShapeType;
  protected _mesh: IShapeMeshData | undefined;
  protected _shape: TopoDS_Shape;
  id: string;
  /**
   * Hex color string for each face, sourced from CAF data.
   * - An empty string means that face has no color.
   * - This field may be empty or unavailable when the WASM layer does not
   *   expose face-level color information.
   */
  faceColors?: string[];
  /**
   * Shape-level color from CAF data when the WASM layer exposes it.
   * Used as a fallback when face-level colors are unavailable.
   */
  shapeColor?: string;

  get mesh(): IShapeMeshData {
    this._mesh ??= new Mesher(this);
    return this._mesh;
  }

  get shape(): TopoDS_Shape {
    return this._shape;
  }

  get matrix(): Matrix4 {
    return gc(c =>
      convertToMatrix(c(c(this.shape.getLocation()).transformation()))
    );
  }

  set matrix(matrix: Matrix4) {
    gc(c => {
      const loc = c(new wasm.TopLoc_Location(c(convertFromMatrix(matrix))));
      this._shape.setLocation(loc, false);
      this._mesh = undefined;
    });
  }

  constructor(shape: TopoDS_Shape, id?: string) {
    this.id = id ?? genId();
    this._shape = shape;
    this.shapeType = getShapeType(shape);
  }

  static wrap(shape: TopoDS_Shape, id?: string): IShape {
    if (shape.isNull()) throw new Error("Shape is null");
    switch (shape.shapeType()) {
      case wasm.TopAbs_ShapeEnum.TopAbs_COMPOUND:
        return new OccShape(wasm.TopoDS.compound(shape), id);
      case wasm.TopAbs_ShapeEnum.TopAbs_COMPSOLID:
        return new OccShape(wasm.TopoDS.compsolid(shape), id);
      case wasm.TopAbs_ShapeEnum.TopAbs_SOLID:
        return new OccShape(wasm.TopoDS.solid(shape), id);
      case wasm.TopAbs_ShapeEnum.TopAbs_SHELL:
        return new OccShape(wasm.TopoDS.shell(shape), id);
      case wasm.TopAbs_ShapeEnum.TopAbs_FACE:
        return new OccFace(wasm.TopoDS.face(shape), id);
      case wasm.TopAbs_ShapeEnum.TopAbs_WIRE:
        return new OccShape(wasm.TopoDS.wire(shape), id);
      case wasm.TopAbs_ShapeEnum.TopAbs_EDGE:
        return new OccEdge(wasm.TopoDS.edge(shape), id);
      case wasm.TopAbs_ShapeEnum.TopAbs_VERTEX:
        return new OccVertex(wasm.TopoDS.vertex(shape), id);
      default:
        return new OccShape(shape, id);
    }
  }

  isNull(): boolean {
    return this.shape.isNull();
  }
  isEqual(other: IShape): boolean {
    return other instanceof OccShape && this.shape.isEqual(other.shape);
  }
  isSame(other: IShape): boolean {
    return other instanceof OccShape && this.shape.isSame(other.shape);
  }
  orientation(): Orientation {
    return getOrientation(this.shape);
  }

  findAncestor(ancestorType: ShapeType, fromShape: IShape): IShape[] {
    if (fromShape instanceof OccShape) {
      return wasm.Shape.findAncestor(
        fromShape.shape,
        this.shape,
        getShapeEnum(ancestorType)
      ).map((x: TopoDS_Shape) => OccShape.wrap(x));
    }
    return [];
  }

  findSubShapes(subshapeType: ShapeType): IShape[] {
    return wasm.Shape.findSubShapes(this.shape, getShapeEnum(subshapeType)).map(
      (x: TopoDS_Shape) => OccShape.wrap(x)
    );
  }

  clone(): IShape {
    return OccShape.wrap(wasm.Shape.clone(this._shape));
  }

  #disposed = false;
  readonly dispose = () => {
    if (this.#disposed) return;
    this.#disposed = true;
    this._shape.nullify();
    this._shape.delete();
    this._shape = null as any;
    if (this._mesh && isDisposable(this._mesh)) {
      (this._mesh as any).dispose();
      this._mesh = undefined;
    }
  };
}

export class OccVertex extends OccShape {
  constructor(shape: TopoDS_Vertex, id?: string) {
    super(shape, id);
  }
  point(): XYZ {
    return toXYZ(wasm.Vertex.point(this._shape as any));
  }
}

export class OccEdge extends OccShape {
  constructor(shape: TopoDS_Edge, id?: string) {
    super(shape, id);
  }
}

export class OccFace extends OccShape {
  constructor(shape: TopoDS_Face, id?: string) {
    super(shape, id);
  }
  normal(u: number, v: number): [XYZ, XYZ] {
    return gc(c => {
      const pnt = c(new wasm.gp_Pnt(0, 0, 0));
      const norm = c(new wasm.gp_Vec(0, 0, 0));
      wasm.Face.normal(this._shape, u, v, pnt, norm);
      return [toXYZ(pnt), toXYZ(norm)];
    });
  }
}

export class OccSubVertexShape extends OccVertex implements ISubShape {
  constructor(
    readonly parent: IShape,
    vertex: TopoDS_Vertex,
    readonly index: number,
    id?: string
  ) {
    super(vertex, id);
  }
  override get mesh(): IShapeMeshData {
    throw new Error("Not implemented");
  }
}

export class OccSubEdgeShape extends OccEdge implements ISubShape {
  constructor(
    readonly parent: IShape,
    edge: TopoDS_Edge,
    readonly index: number,
    id?: string
  ) {
    super(edge, id);
  }
  override get mesh(): IShapeMeshData {
    throw new Error("Not implemented");
  }
}

export class OccSubFaceShape extends OccFace implements ISubShape {
  constructor(
    readonly parent: IShape,
    face: TopoDS_Face,
    readonly index: number,
    id?: string
  ) {
    super(face, id);
  }
  override get mesh(): IShapeMeshData {
    throw new Error("Not implemented");
  }
}

export class Mesher implements IShapeMeshData, IDisposable {
  private _isMeshed = false;
  private _edges?: EdgeMeshData;
  private _faces?: FaceMeshData;
  private _points?: VertexMeshData;

  get edges(): EdgeMeshData | undefined {
    if (!this._edges) this.mesh();
    return this._edges;
  }
  set edges(v) {
    this._edges = v;
  }

  get faces(): FaceMeshData | undefined {
    if (!this._faces) this.mesh();
    return this._faces;
  }
  set faces(v) {
    this._faces = v;
  }

  get vertexs(): VertexMeshData | undefined {
    if (!this._points && this.shape instanceof OccVertex) {
      const pt = this.shape.point();
      this._points = {
        position: new Float32Array(pt.toArray()),
        color: VisualConfig.defaultEdgeColor,
        range: [
          {
            start: 0,
            count: 1,
            shape: new OccSubVertexShape(this.shape, this.shape.shape as any, 0)
          }
        ],
        size: 3
      };
    }
    return this._points;
  }
  set vertexs(v) {
    this._points = v;
  }

  constructor(private shape: OccShape) {}

  private mesh() {
    if (this._isMeshed) return;
    this._isMeshed = true;
    gc(c => {
      const occMesher = c(new wasm.Mesher(this.shape.shape, 0.005));
      const meshData = c(occMesher.mesh());
      const faceMeshData = c(meshData.faceMeshData);
      const edgeMeshData = c(meshData.edgeMeshData);
      this._faces = this.parseFaces(faceMeshData);
      this._edges = this.parseEdges(edgeMeshData);
    });
  }

  private parseFaces(data: any): FaceMeshData {
    const position = new Float32Array(data.position);
    const normal = new Float32Array(data.normal);
    const uv = new Float32Array(data.uv);
    const index = new Uint32Array(data.index);
    const range = this.getFaceRanges(data);
    const color = this.buildFaceColors(index, position.length / 3, range);
    return { position, normal, uv, index, range, color, groups: [] };
  }

  private buildFaceColors(
    index: Uint32Array,
    totalVertices: number,
    range: ShapeMeshRange[]
  ): number | number[] {
    const { faceColors, shapeColor } = this.shape;

    // per-face vertex colors (requires rebuilt WASM with getFaceColors)
    if (
      faceColors &&
      faceColors.length > 0 &&
      faceColors.some(c => c && c.length > 0)
    ) {
      const colorData = new Float32Array(totalVertices * 3);
      fillDefaultColor(colorData, VisualConfig.defaultFaceColor);
      for (let faceIdx = 0; faceIdx < range.length; faceIdx++) {
        const hexColor = faceColors[faceIdx];
        if (!hexColor || hexColor.length === 0) continue;
        const rgb = parseHexColor(hexColor);
        const { start, count } = range[faceIdx];
        for (let j = start; j < start + count; j++) {
          const vi = index[j];
          colorData[vi * 3] = rgb.r;
          colorData[vi * 3 + 1] = rgb.g;
          colorData[vi * 3 + 2] = rgb.b;
        }
      }
      return Array.from(colorData);
    }

    // shape-level uniform color (available in current WASM via node.color)
    if (shapeColor && shapeColor.length > 0) {
      return hexColorToNumber(shapeColor);
    }

    return VisualConfig.defaultFaceColor;
  }

  private parseEdges(data: any): EdgeMeshData {
    return {
      lineType: "solid",
      position: new Float32Array(data.position),
      range: this.getEdgeRanges(data),
      color: VisualConfig.defaultEdgeColor
    };
  }

  private getEdgeRanges(data: any): ShapeMeshRange[] {
    const result: ShapeMeshRange[] = [];
    for (let i = 0; i < data.edges.length; i++) {
      result.push({
        start: data.group[2 * i],
        count: data.group[2 * i + 1],
        shape: new OccSubEdgeShape(this.shape, data.edges[i], i)
      });
    }
    return result;
  }

  private getFaceRanges(data: any): ShapeMeshRange[] {
    const result: ShapeMeshRange[] = [];
    for (let i = 0; i < data.faces.length; i++) {
      result.push({
        start: data.group[2 * i],
        count: data.group[2 * i + 1],
        shape: new OccSubFaceShape(this.shape, data.faces[i], i)
      });
    }
    return result;
  }

  dispose() {
    this._faces?.range.forEach(g => g.shape.dispose());
    this._edges?.range.forEach(g => g.shape.dispose());
    this.shape = null as any;
  }
}
