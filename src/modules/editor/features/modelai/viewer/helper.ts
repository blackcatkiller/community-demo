// @ts-nocheck
import { Matrix4, XYZ } from "@modelai/core/math";
import {
  Color,
  Matrix4 as ThreeMatrix4,
  Vector3,
  type Vector3Like
} from "three";

export class ThreeHelper {
  static toMatrix(m: ThreeMatrix4): Matrix4 {
    return Matrix4.fromArray(m.toArray());
  }
  static fromMatrix(m: Matrix4): ThreeMatrix4 {
    return new ThreeMatrix4().fromArray(m.toArray());
  }
  static toXYZ(v: Vector3): XYZ {
    return new XYZ(v.x, v.y, v.z);
  }
  static fromXYZ(v: Vector3Like): Vector3 {
    return new Vector3(v.x, v.y, v.z);
  }
  static fromColor(c: number | string): Color {
    return new Color(c);
  }

  static findGroupIndex(
    groups: { start: number; count: number }[],
    subIndex: number
  ): number | undefined {
    for (let i = 0; i < groups.length; i++) {
      if (
        subIndex >= groups[i].start &&
        subIndex < groups[i].start + groups[i].count
      )
        return i;
    }
    return undefined;
  }
}
