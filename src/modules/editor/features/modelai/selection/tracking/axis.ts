// @ts-nocheck
import { Line, type Plane, type XYZ } from "@modelai/core/math";

export class Axis extends Line {
  constructor(
    location: XYZ,
    direction: XYZ,
    readonly name: string
  ) {
    super(location, direction);
  }

  static getAxiesAtPlane(location: XYZ, plane: Plane, containsZ: boolean) {
    const createAxis = (direction: XYZ, name: string) =>
      new Axis(location, direction, name);

    const axies = [
      createAxis(plane.xvec, "X"),
      createAxis(plane.xvec.reverse(), "X"),
      createAxis(plane.yvec, "Y"),
      createAxis(plane.yvec.reverse(), "Y")
    ];

    if (containsZ) {
      axies.push(
        createAxis(plane.normal, "Z"),
        createAxis(plane.normal.reverse(), "Z")
      );
    }

    return axies;
  }
}
