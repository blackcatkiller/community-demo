// @ts-nocheck
export enum ObjectSnapType {
  none = 0,
  endPoint = 1,
  midPoint = 1 << 1,
  center = 1 << 2,
  angle = 1 << 3,
  intersection = 1 << 4,
  perpendicular = 1 << 5,
  extension = 1 << 6,
  parallel = 1 << 7,
  special = 1 << 8,
  nearest = 1 << 9,
  vertex = 1 << 10,
  grid = 1 << 11
}

export class ObjectSnapTypeUtils {
  static hasType(snapTypes: ObjectSnapType, targetType: ObjectSnapType) {
    return (snapTypes & targetType) === targetType;
  }

  static addType(snapTypes: ObjectSnapType, targetType: ObjectSnapType) {
    return snapTypes | targetType;
  }

  static removeType(snapTypes: ObjectSnapType, targetType: ObjectSnapType) {
    return snapTypes & ~targetType;
  }
}

export interface SnapConfig {
  snapTypes: ObjectSnapType;
  enableFaceSnap: boolean;
  enableTracking: boolean;
  enableSnap: boolean;
}

export const createDefaultSnapConfig = (): SnapConfig => ({
  snapTypes:
    ObjectSnapType.endPoint |
    ObjectSnapType.midPoint |
    ObjectSnapType.center |
    ObjectSnapType.intersection |
    ObjectSnapType.perpendicular,
  enableFaceSnap: true,
  enableTracking: false,
  enableSnap: true
});
