// @ts-nocheck
export class XYZ {
  constructor(
    public x: number,
    public y: number,
    public z: number
  ) {}
  toArray(): number[] {
    return [this.x, this.y, this.z];
  }
  add(other: XYZ): XYZ {
    return new XYZ(this.x + other.x, this.y + other.y, this.z + other.z);
  }
  sub(other: XYZ): XYZ {
    return new XYZ(this.x - other.x, this.y - other.y, this.z - other.z);
  }
  length(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
  }
  lengthSq(): number {
    return this.x * this.x + this.y * this.y + this.z * this.z;
  }
  cross(other: XYZ): XYZ {
    return new XYZ(
      this.y * other.z - this.z * other.y,
      this.z * other.x - this.x * other.z,
      this.x * other.y - this.y * other.x
    );
  }
  dot(other: XYZLike): number {
    return this.x * other.x + this.y * other.y + this.z * other.z;
  }
  multiply(scalar: number): XYZ {
    return new XYZ(this.x * scalar, this.y * scalar, this.z * scalar);
  }
  normalize(): XYZ {
    const len = this.length();
    return len > 0
      ? new XYZ(this.x / len, this.y / len, this.z / len)
      : new XYZ(0, 0, 0);
  }
  distanceTo(other: XYZLike): number {
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    const dz = this.z - other.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  reverse(): XYZ {
    return new XYZ(
      MathUtils.almostEqual(this.x, 0) ? 0 : -this.x,
      MathUtils.almostEqual(this.y, 0) ? 0 : -this.y,
      MathUtils.almostEqual(this.z, 0) ? 0 : -this.z
    );
  }
  angleTo(other: XYZLike): number | undefined {
    if (
      this.lengthSq() === 0 ||
      (other.x === 0 && other.y === 0 && other.z === 0)
    )
      return undefined;
    const cross = this.cross(new XYZ(other.x, other.y, other.z));
    const dot = this.dot(other);
    return Math.atan2(cross.length(), dot);
  }
  angleOnPlaneTo(other: XYZLike, normal: XYZLike): number | undefined {
    const angle = this.angleTo(other);
    if (angle === undefined) return undefined;
    const normalVec = new XYZ(normal.x, normal.y, normal.z);
    if (normalVec.lengthSq() === 0) return undefined;
    const cross = this.cross(new XYZ(other.x, other.y, other.z)).normalize();
    if (cross.lengthSq() === 0) return angle;
    return cross.isOppositeTo(normal) ? Math.PI * 2 - angle : angle;
  }
  rotate(normal: XYZ, angle: number): XYZ | undefined {
    const n = normal.normalize();
    if (n.lengthSq() === 0) return undefined;
    const cos = Math.cos(angle);
    return this.multiply(cos)
      .add(n.multiply((1 - cos) * n.dot(this)))
      .add(n.cross(this).multiply(Math.sin(angle)));
  }
  isEqualTo(other: XYZLike, tolerance: number = 1e-6): boolean {
    return (
      MathUtils.almostEqual(this.x, other.x, tolerance) &&
      MathUtils.almostEqual(this.y, other.y, tolerance) &&
      MathUtils.almostEqual(this.z, other.z, tolerance)
    );
  }
  isParallelTo(other: XYZLike, tolerance: number = 1e-6): boolean {
    const angle = this.angleTo(other);
    if (angle === undefined) return false;
    return Math.abs(angle) < tolerance || Math.abs(Math.PI - angle) < tolerance;
  }
  isOppositeTo(other: XYZLike, tolerance: number = 1e-6): boolean {
    const angle = this.angleTo(other);
    if (angle === undefined) return false;
    return Math.abs(Math.PI - angle) < tolerance;
  }
}

export interface XYZLike {
  x: number;
  y: number;
  z: number;
}

export class XY {
  constructor(
    public x: number,
    public y: number
  ) {}
  static readonly zero = new XY(0, 0);
  static readonly unitX = new XY(1, 0);
  static readonly unitY = new XY(0, 1);
  toArray(): number[] {
    return [this.x, this.y];
  }
  add(other: XY): XY {
    return new XY(this.x + other.x, this.y + other.y);
  }
  sub(other: XY): XY {
    return new XY(this.x - other.x, this.y - other.y);
  }
  multiply(scalar: number): XY {
    return new XY(this.x * scalar, this.y * scalar);
  }
  dot(other: XY): number {
    return this.x * other.x + this.y * other.y;
  }
  lengthSq(): number {
    return this.x * this.x + this.y * this.y;
  }
  length(): number {
    return Math.sqrt(this.lengthSq());
  }
  distanceTo(other: XY): number {
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
  normalize(): XY {
    const len = this.length();
    return len > 0 ? new XY(this.x / len, this.y / len) : new XY(0, 0);
  }
}

export class Matrix4 {
  private readonly _array: Float32Array;

  constructor(arr?: ArrayLike<number>) {
    this._array = new Float32Array(16);
    if (arr) this._array.set(arr);
  }

  toArray(): readonly number[] {
    return [...this._array];
  }
  get array(): ReadonlyArray<number> {
    return [...this._array];
  }

  static identity(): Matrix4 {
    const m = new Matrix4();
    m._array[0] = m._array[5] = m._array[10] = m._array[15] = 1;
    return m;
  }

  static fromArray(arr: ArrayLike<number>): Matrix4 {
    return new Matrix4(arr);
  }

  static fromTranslation(x: number, y: number, z: number): Matrix4 {
    return Matrix4.fromArray([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
  }

  static fromAxisRad(
    position: XYZLike,
    normal: XYZLike,
    radians: number
  ): Matrix4 {
    const len = Math.sqrt(
      normal.x * normal.x + normal.y * normal.y + normal.z * normal.z
    );
    if (len === 0) {
      return Matrix4.identity();
    }

    const x = normal.x / len;
    const y = normal.y / len;
    const z = normal.z / len;

    const c = Math.cos(radians);
    const s = Math.sin(radians);
    const t = 1 - c;

    const r00 = t * x * x + c;
    const r01 = t * x * y - s * z;
    const r02 = t * x * z + s * y;

    const r10 = t * x * y + s * z;
    const r11 = t * y * y + c;
    const r12 = t * y * z - s * x;

    const r20 = t * x * z - s * y;
    const r21 = t * y * z + s * x;
    const r22 = t * z * z + c;

    const rpX = r00 * position.x + r01 * position.y + r02 * position.z;
    const rpY = r10 * position.x + r11 * position.y + r12 * position.z;
    const rpZ = r20 * position.x + r21 * position.y + r22 * position.z;

    const tx = position.x - rpX;
    const ty = position.y - rpY;
    const tz = position.z - rpZ;

    return Matrix4.fromArray([
      r00,
      r10,
      r20,
      0,
      r01,
      r11,
      r21,
      0,
      r02,
      r12,
      r22,
      0,
      tx,
      ty,
      tz,
      1
    ]);
  }

  multiply(other: Matrix4): Matrix4 {
    const a = this._array,
      b = other._array,
      r = new Float32Array(16);
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        let sum = 0;
        for (let k = 0; k < 4; k++) sum += a[i + k * 4] * b[k + j * 4];
        r[i + j * 4] = sum;
      }
    }
    return Matrix4.fromArray(r);
  }

  equals(other: Matrix4): boolean {
    for (let i = 0; i < 16; i++) {
      if (Math.abs(this._array[i] - other._array[i]) > 1e-10) return false;
    }
    return true;
  }

  ofPoint(p: XYZLike): XYZ {
    const a = this._array;
    return new XYZ(
      a[0] * p.x + a[4] * p.y + a[8] * p.z + a[12],
      a[1] * p.x + a[5] * p.y + a[9] * p.z + a[13],
      a[2] * p.x + a[6] * p.y + a[10] * p.z + a[14]
    );
  }

  ofVector(v: XYZLike): XYZ {
    const a = this._array;
    return new XYZ(
      a[0] * v.x + a[4] * v.y + a[8] * v.z,
      a[1] * v.x + a[5] * v.y + a[9] * v.z,
      a[2] * v.x + a[6] * v.y + a[10] * v.z
    );
  }

  ofPoints(pts: ArrayLike<number>): number[] {
    const result: number[] = [];
    for (let i = 0; i < pts.length; i += 3) {
      const p = this.ofPoint({ x: pts[i], y: pts[i + 1], z: pts[i + 2] });
      result.push(p.x, p.y, p.z);
    }
    return result;
  }

  invert(): Matrix4 | undefined {
    const a = this._array;
    const a00 = a[0],
      a01 = a[1],
      a02 = a[2],
      a03 = a[3];
    const a10 = a[4],
      a11 = a[5],
      a12 = a[6],
      a13 = a[7];
    const a20 = a[8],
      a21 = a[9],
      a22 = a[10],
      a23 = a[11];
    const a30 = a[12],
      a31 = a[13],
      a32 = a[14],
      a33 = a[15];

    const b00 = a00 * a11 - a01 * a10;
    const b01 = a00 * a12 - a02 * a10;
    const b02 = a00 * a13 - a03 * a10;
    const b03 = a01 * a12 - a02 * a11;
    const b04 = a01 * a13 - a03 * a11;
    const b05 = a02 * a13 - a03 * a12;
    const b06 = a20 * a31 - a21 * a30;
    const b07 = a20 * a32 - a22 * a30;
    const b08 = a20 * a33 - a23 * a30;
    const b09 = a21 * a32 - a22 * a31;
    const b10 = a21 * a33 - a23 * a31;
    const b11 = a22 * a33 - a23 * a32;

    let det =
      b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;

    if (Math.abs(det) < 1e-12) return undefined;
    det = 1.0 / det;

    const out = new Float32Array(16);
    out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
    out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
    out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
    out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
    out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
    out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
    out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
    out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
    out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;

    return Matrix4.fromArray(out);
  }
}

export class Plane {
  constructor(
    public readonly origin: XYZ,
    public readonly normal: XYZ,
    public readonly xvec: XYZ
  ) {}

  static XY(): Plane {
    return new Plane(new XYZ(0, 0, 0), new XYZ(0, 0, 1), new XYZ(1, 0, 0));
  }

  get yvec(): XYZ {
    return this.normal.cross(this.xvec).normalize();
  }

  translateTo(origin: XYZ): Plane {
    return new Plane(origin, this.normal, this.xvec);
  }

  project(point: XYZ): XYZ {
    const vector = point.sub(this.origin);
    const dot = vector.dot(this.normal);
    return this.origin.add(vector.sub(this.normal.multiply(dot)));
  }

  intersectLine(line: Line): XYZ | undefined {
    const t = this.lineIntersectParameter(line);
    if (t === undefined) return undefined;
    return line.point.add(line.direction.multiply(t));
  }

  intersectRay(ray: Ray): XYZ | undefined {
    const t = this.lineIntersectParameter(ray);
    if (t === undefined || t < 0) return undefined;
    return ray.origin.add(ray.direction.multiply(t));
  }

  private lineIntersectParameter(line: {
    origin?: XYZ;
    point?: XYZ;
    direction: XYZ;
  }) {
    const origin = line.point ?? line.origin!;
    const vec = this.origin.sub(origin);
    if (vec.isEqualTo(new XYZ(0, 0, 0))) {
      return 0;
    }
    const len = vec.dot(this.normal);
    const dot = line.direction.dot(this.normal);
    if (MathUtils.almostEqual(dot, 0)) {
      return MathUtils.almostEqual(len, 0) ? 0 : undefined;
    }
    return len / dot;
  }
}

export class Ray {
  constructor(
    public readonly origin: XYZ,
    public readonly direction: XYZ
  ) {}

  toLine(): Line {
    return new Line(this.origin, this.direction);
  }
}

export class Line {
  readonly point: XYZ;
  readonly direction: XYZ;

  constructor(location: XYZ, direction: XYZ) {
    this.point = location;
    const n = direction.normalize();
    if (n.isEqualTo(new XYZ(0, 0, 0))) {
      throw new Error("Line direction can not be zero");
    }
    this.direction = n;
  }

  intersect(right: Line, tolerance = 1e-6): XYZ | undefined {
    if (this.direction.isParallelTo(right.direction, tolerance))
      return undefined;
    const result = this.nearestTo(right);
    const vec = result.sub(right.point);
    if (vec.length() < tolerance) return result;
    return vec.isParallelTo(right.direction, tolerance) ? result : undefined;
  }

  distanceTo(right: Line): number {
    const neareast1 = this.nearestTo(right);
    const neareast2 = right.nearestToPoint(neareast1);
    return neareast1.distanceTo(neareast2);
  }

  nearestTo(right: Line): XYZ {
    const n = right.direction.cross(this.direction).normalize();
    if (n.isEqualTo(new XYZ(0, 0, 0))) return this.nearestToPoint(right.point);
    const normal = n.cross(right.direction).normalize();
    const plane = new Plane(right.point, normal, n);
    return plane.intersectLine(this)!;
  }

  nearestToPoint(point: XYZ): XYZ {
    const vec = point.sub(this.point);
    const dot = vec.dot(this.direction);
    return this.point.add(this.direction.multiply(dot));
  }
}

export interface BoundingBox {
  min: XYZ;
  max: XYZ;
}

export const BoundingBoxUtils = {
  fromNumbers(pts: number[]): BoundingBox {
    let minX = Infinity,
      minY = Infinity,
      minZ = Infinity;
    let maxX = -Infinity,
      maxY = -Infinity,
      maxZ = -Infinity;
    for (let i = 0; i < pts.length; i += 3) {
      minX = Math.min(minX, pts[i]);
      maxX = Math.max(maxX, pts[i]);
      minY = Math.min(minY, pts[i + 1]);
      maxY = Math.max(maxY, pts[i + 1]);
      minZ = Math.min(minZ, pts[i + 2]);
      maxZ = Math.max(maxZ, pts[i + 2]);
    }
    return { min: new XYZ(minX, minY, minZ), max: new XYZ(maxX, maxY, maxZ) };
  }
};

export class MathUtils {
  static degToRad(deg: number): number {
    return (deg * Math.PI) / 180;
  }
  static radToDeg(rad: number): number {
    return (rad * 180) / Math.PI;
  }
  static almostEqual(a: number, b: number, tolerance: number = 1e-6): boolean {
    return Math.abs(a - b) < tolerance;
  }
  static allEqualZero(...values: number[]): boolean {
    return values.every(v => Math.abs(v) < Precision.Float);
  }
  static anyEqualZero(...values: number[]): boolean {
    return values.some(v => Math.abs(v) < Precision.Float);
  }
}

export const Precision = {
  Distance: 1e-7,
  Angle: 1e-3,
  Float: 1e-7
};

export class PlaneAngle {
  private lastX = 1;
  private lastY = 0;
  private isNegativeRotation = false;
  private currentAngle = 0;

  get angle() {
    return this.currentAngle;
  }

  constructor(readonly plane: Plane) {}

  movePoint(point: XYZ) {
    const vectorToPoint = point.sub(this.plane.origin);
    const projectionX = vectorToPoint.dot(this.plane.xvec);
    const projectionY = vectorToPoint.dot(this.plane.yvec);

    if (this.isCrossingPositiveXAxis(projectionX, projectionY)) {
      this.isNegativeRotation = !this.isNegativeRotation;
    }

    this.currentAngle = this.calculateAngle(vectorToPoint);
    this.updateLastProjections(projectionX, projectionY);
  }

  private calculateAngle(vector: XYZ): number {
    const angleInRadians = this.plane.xvec.angleOnPlaneTo(
      vector,
      this.plane.normal
    );
    if (angleInRadians === undefined) return 0;
    const angleInDegrees = (angleInRadians * 180) / Math.PI;
    return this.isNegativeRotation ? angleInDegrees - 360 : angleInDegrees;
  }

  private isCrossingPositiveXAxis(x: number, y: number): boolean {
    const isMovingUpward =
      this.lastY < -Precision.Distance && y > Precision.Distance;
    const isMovingDownward =
      this.lastY > -Precision.Distance && y < -Precision.Distance;
    const isCrossingX =
      (isMovingUpward && this.currentAngle < Precision.Angle) ||
      (isMovingDownward && this.currentAngle > -Precision.Angle);

    return isCrossingX && this.lastX > 0 && x > 0;
  }

  private updateLastProjections(x: number, y: number) {
    if (Math.abs(x) > Precision.Distance) this.lastX = x;
    if (Math.abs(y) > Precision.Distance) this.lastY = y;
  }
}
