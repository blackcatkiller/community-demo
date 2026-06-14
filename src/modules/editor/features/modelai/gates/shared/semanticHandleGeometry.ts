// @ts-nocheck
import type { FaceMeshData } from "@modelai/core/types";
import { XYZ } from "@modelai/core";

export type SemanticArrowMeshOptions = {
  baseCenter: XYZ;
  dir: XYZ;
  sideHint: XYZ;
  coneHeight: number;
  coneRadius: number;
  stemHeight: number;
  stemRadius: number;
  color: number;
  segments?: number;
};

export function createSemanticArrowMesh(
  options: SemanticArrowMeshOptions
): FaceMeshData {
  const {
    baseCenter,
    dir,
    sideHint,
    coneHeight,
    coneRadius,
    stemHeight,
    stemRadius,
    color,
    segments = 16
  } = options;
  const axis = dir.normalize();
  const stemTop = baseCenter.add(axis.multiply(stemHeight));
  const tip = stemTop.add(axis.multiply(coneHeight));
  let side = axis.cross(sideHint).normalize();
  if (side.lengthSq() < 1e-8) side = axis.cross(new XYZ(0, 1, 0)).normalize();
  if (side.lengthSq() < 1e-8) side = axis.cross(new XYZ(1, 0, 0)).normalize();
  const up = side.cross(axis).normalize();
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const pushTri = (a: XYZ, b: XYZ, c: XYZ) => {
    const n = b.sub(a).cross(c.sub(a)).normalize();
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    normals.push(n.x, n.y, n.z, n.x, n.y, n.z, n.x, n.y, n.z);
    uvs.push(0, 0, 1, 0, 0, 1);
  };
  const coneRing: XYZ[] = [];
  const stemBaseRing: XYZ[] = [];
  const stemTopRing: XYZ[] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const coneOffset = side
      .multiply(Math.cos(a) * coneRadius)
      .add(up.multiply(Math.sin(a) * coneRadius));
    const stemOffset = side
      .multiply(Math.cos(a) * stemRadius)
      .add(up.multiply(Math.sin(a) * stemRadius));
    coneRing.push(stemTop.add(coneOffset));
    stemBaseRing.push(baseCenter.add(stemOffset));
    stemTopRing.push(stemTop.add(stemOffset));
  }
  for (let i = 0; i < segments; i++) {
    const next = (i + 1) % segments;
    pushTri(tip, coneRing[i], coneRing[next]);
    pushTri(stemBaseRing[i], stemTopRing[i], stemTopRing[next]);
    pushTri(stemBaseRing[i], stemTopRing[next], stemBaseRing[next]);
  }
  for (let i = 1; i < segments - 1; i++) {
    pushTri(stemTop, coneRing[i], coneRing[i + 1]);
    pushTri(baseCenter, stemBaseRing[i + 1], stemBaseRing[i]);
  }
  const index = new Uint32Array(positions.length / 3);
  for (let i = 0; i < index.length; i++) index[i] = i;
  return {
    position: new Float32Array(positions),
    normal: new Float32Array(normals),
    uv: new Float32Array(uvs),
    index,
    groups: [{ start: 0, count: index.length }],
    color,
    range: []
  };
}
