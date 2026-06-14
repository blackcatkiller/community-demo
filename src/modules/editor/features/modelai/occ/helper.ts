// @ts-nocheck
import { Matrix4, Orientation, ShapeType, XYZ } from "@modelai/core";
import type {
  gp_Dir,
  gp_Pnt,
  gp_Trsf,
  gp_Vec,
  TopoDS_Shape,
  Vector3
} from "chili-wasm";

export function toXYZ(p: gp_Pnt | gp_Dir | gp_Vec | Vector3): XYZ {
  return new XYZ(p.x, p.y, p.z);
}

export function toDir(value: { x: number; y: number; z: number }): gp_Dir {
  return new wasm.gp_Dir(value.x, value.y, value.z);
}

export function toPnt(value: { x: number; y: number; z: number }): gp_Pnt {
  return new wasm.gp_Pnt(value.x, value.y, value.z);
}

export function convertFromMatrix(matrix: Matrix4): gp_Trsf {
  const arr = matrix.toArray();
  const trsf = new wasm.gp_Trsf();
  trsf.setValues(
    arr[0],
    arr[4],
    arr[8],
    arr[12],
    arr[1],
    arr[5],
    arr[9],
    arr[13],
    arr[2],
    arr[6],
    arr[10],
    arr[14]
  );
  return trsf;
}

export function convertToMatrix(trsf: gp_Trsf): Matrix4 {
  const arr = [
    trsf.value(1, 1),
    trsf.value(2, 1),
    trsf.value(3, 1),
    0,
    trsf.value(1, 2),
    trsf.value(2, 2),
    trsf.value(3, 2),
    0,
    trsf.value(1, 3),
    trsf.value(2, 3),
    trsf.value(3, 3),
    0,
    trsf.value(1, 4),
    trsf.value(2, 4),
    trsf.value(3, 4),
    1
  ];
  return Matrix4.fromArray(arr);
}

export function getOrientation(shape: TopoDS_Shape): Orientation {
  switch (shape.getOrientation()) {
    case wasm.TopAbs_Orientation.TopAbs_FORWARD:
      return Orientation.FORWARD;
    case wasm.TopAbs_Orientation.TopAbs_REVERSED:
      return Orientation.REVERSED;
    case wasm.TopAbs_Orientation.TopAbs_INTERNAL:
      return Orientation.INTERNAL;
    case wasm.TopAbs_Orientation.TopAbs_EXTERNAL:
      return Orientation.EXTERNAL;
    default:
      return Orientation.FORWARD;
  }
}

export function getShapeType(shape: TopoDS_Shape): ShapeType {
  switch (shape.shapeType()) {
    case wasm.TopAbs_ShapeEnum.TopAbs_COMPOUND:
      return ShapeType.Compound;
    case wasm.TopAbs_ShapeEnum.TopAbs_COMPSOLID:
      return ShapeType.CompoundSolid;
    case wasm.TopAbs_ShapeEnum.TopAbs_SOLID:
      return ShapeType.Solid;
    case wasm.TopAbs_ShapeEnum.TopAbs_SHELL:
      return ShapeType.Shell;
    case wasm.TopAbs_ShapeEnum.TopAbs_FACE:
      return ShapeType.Face;
    case wasm.TopAbs_ShapeEnum.TopAbs_WIRE:
      return ShapeType.Wire;
    case wasm.TopAbs_ShapeEnum.TopAbs_EDGE:
      return ShapeType.Edge;
    case wasm.TopAbs_ShapeEnum.TopAbs_VERTEX:
      return ShapeType.Vertex;
    default:
      return ShapeType.Shape;
  }
}

export function getShapeEnum(shapeType: ShapeType) {
  switch (shapeType) {
    case ShapeType.Compound:
      return wasm.TopAbs_ShapeEnum.TopAbs_COMPOUND;
    case ShapeType.CompoundSolid:
      return wasm.TopAbs_ShapeEnum.TopAbs_COMPSOLID;
    case ShapeType.Solid:
      return wasm.TopAbs_ShapeEnum.TopAbs_SOLID;
    case ShapeType.Shell:
      return wasm.TopAbs_ShapeEnum.TopAbs_SHELL;
    case ShapeType.Face:
      return wasm.TopAbs_ShapeEnum.TopAbs_FACE;
    case ShapeType.Wire:
      return wasm.TopAbs_ShapeEnum.TopAbs_WIRE;
    case ShapeType.Edge:
      return wasm.TopAbs_ShapeEnum.TopAbs_EDGE;
    case ShapeType.Vertex:
      return wasm.TopAbs_ShapeEnum.TopAbs_VERTEX;
    default:
      return wasm.TopAbs_ShapeEnum.TopAbs_SHAPE;
  }
}
