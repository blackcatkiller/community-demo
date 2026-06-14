// @ts-nocheck
import type { Plane, XYZ } from "@modelai/core/math";
import {
  CatmullRomCurve3,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Matrix4,
  Mesh,
  Quaternion,
  SphereGeometry,
  TubeGeometry,
  Vector3
} from "three";
import {
  meshStandardBlueMetallicMaterial,
  meshStandardGreenMetallicMaterial,
  meshStandardRedMetallicMaterial,
  meshStandardSlateMetallicMaterial
} from "./materials";

export type RotateHelperMode = "xy" | "yz" | "zx" | "workplane";

const BASE_SIZE = 100;

function toVector3(value: XYZ) {
  return new Vector3(value.x, value.y, value.z);
}

export class RotateHelper {
  readonly object = new Group();

  private readonly _visibleRoot = new Group();

  constructor() {
    this.object.name = "RotateHelper";
    this.object.matrixAutoUpdate = true;
    this.object.add(this._visibleRoot);

    this.buildRoot(this._visibleRoot);
  }

  setPose(center: XYZ, plane: Plane, mode: RotateHelperMode, size: number) {
    const x = toVector3(plane.xvec.normalize());
    const y = toVector3(plane.yvec.normalize());
    const z = toVector3(plane.normal.normalize());
    const basis = new Matrix4().makeBasis(x, y, z);
    const quaternion = new Quaternion().setFromRotationMatrix(basis);
    const scale = Math.max(1e-6, size / BASE_SIZE);

    this.object.position.copy(toVector3(center));
    this.object.quaternion.copy(quaternion);
    this.object.scale.setScalar(scale);
    this.object.updateMatrixWorld(true);

    const material = this.resolveVisibleMaterial(mode);
    this._visibleRoot.traverse(obj => {
      if (obj instanceof Mesh) {
        obj.material = material;
      }
    });
  }

  dispose() {
    this.disposeGroup(this._visibleRoot);
    this.object.clear();
  }

  private buildRoot(root: Group) {
    root.add(this.buildCenterDot());
    root.add(this.buildAxisArrow());
    root.add(this.buildRotateArrow());
  }

  private buildCenterDot() {
    const mesh = new Mesh(
      new SphereGeometry(2.2, 14, 12),
      meshStandardBlueMetallicMaterial
    );
    mesh.renderOrder = 2;
    return mesh;
  }

  private buildAxisArrow() {
    const root = new Group();
    const shaft = new Mesh(
      new CylinderGeometry(0.9, 0.9, 64, 14).rotateX(Math.PI / 2),
      meshStandardBlueMetallicMaterial
    );
    shaft.position.z = 32;

    const head = new Mesh(
      new ConeGeometry(2.3, 12, 16).rotateX(Math.PI / 2),
      meshStandardBlueMetallicMaterial
    );
    head.position.z = 70;

    shaft.renderOrder = 2;
    head.renderOrder = 2;
    root.add(shaft, head);
    return root;
  }

  private buildRotateArrow() {
    const radius = 22;
    const tubeRadius = 0.6;
    // Follow the positive-axis right-hand rule in local XY space:
    // the circular arrow runs counterclockwise when viewed along +Z.
    const startAngle = -Math.PI * 0.35;
    const endAngle = Math.PI * 1.2;
    const samples = 40;

    const points: Vector3[] = [];
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const angle = startAngle + (endAngle - startAngle) * t;
      points.push(
        new Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0)
      );
    }

    const curve = new CatmullRomCurve3(points, false, "centripetal");
    const arc = new Mesh(
      new TubeGeometry(curve, 64, tubeRadius, 10, false),
      meshStandardBlueMetallicMaterial
    );
    arc.renderOrder = 1;

    const arrow = this.buildArcArrowHead(points);
    const group = new Group();
    group.add(arc, arrow);
    return group;
  }

  private buildArcArrowHead(points: Vector3[]) {
    const last = points[points.length - 1];
    const prev = points[points.length - 2];
    const tangent = last.clone().sub(prev).normalize();
    const coneLength = 6.8;
    const coneRadius = 2.2;
    const cone = new Mesh(
      new ConeGeometry(coneRadius, coneLength, 16).rotateX(Math.PI / 2),
      meshStandardBlueMetallicMaterial
    );
    cone.quaternion.copy(
      new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), tangent)
    );
    cone.position.copy(
      last.clone().add(tangent.clone().multiplyScalar(coneLength * 0.5))
    );
    cone.renderOrder = 2;
    return cone;
  }

  private disposeGroup(root: Group) {
    root.traverse(obj => {
      const geometry = (obj as any).geometry;
      geometry?.dispose?.();
    });
  }

  private resolveVisibleMaterial(mode: RotateHelperMode) {
    switch (mode) {
      case "yz":
        return meshStandardRedMetallicMaterial;
      case "zx":
        return meshStandardGreenMetallicMaterial;
      case "workplane":
        return meshStandardSlateMetallicMaterial;
      default:
        return meshStandardBlueMetallicMaterial;
    }
  }
}
