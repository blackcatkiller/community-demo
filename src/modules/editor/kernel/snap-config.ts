import type { Vec3 } from "@/modules/editor/kernel/types";

export type ObjectSnapFlag =
  | "endPoint"
  | "midPoint"
  | "center"
  | "perpendicular"
  | "intersection";

export type SnapConfig = {
  enableSnap: boolean;
  enableFaceSnap: boolean;
  enableTracking: boolean;
  objectSnap: Record<ObjectSnapFlag, boolean>;
  gridStep: number;
  rotationStep: number;
};

export const snapLabels: Array<{ id: keyof SnapConfig | ObjectSnapFlag; label: string }> = [
  { id: "enableSnap", label: "启用捕捉" },
  { id: "endPoint", label: "端点" },
  { id: "midPoint", label: "中点" },
  { id: "center", label: "圆心" },
  { id: "perpendicular", label: "垂足" },
  { id: "intersection", label: "交点" },
  { id: "enableFaceSnap", label: "面" },
  { id: "enableTracking", label: "追踪" },
];

export function createDefaultSnapConfig(): SnapConfig {
  return {
    enableSnap: true,
    enableFaceSnap: true,
    enableTracking: false,
    objectSnap: {
      endPoint: true,
      midPoint: true,
      center: true,
      perpendicular: true,
      intersection: true,
    },
    gridStep: 0.25,
    rotationStep: 15,
  };
}

export function toggleSnapFlag(config: SnapConfig, id: keyof SnapConfig | ObjectSnapFlag) {
  if (id in config.objectSnap) {
    const flag = id as ObjectSnapFlag;
    return {
      ...config,
      objectSnap: { ...config.objectSnap, [flag]: !config.objectSnap[flag] },
    };
  }

  if (id === "enableSnap" || id === "enableFaceSnap" || id === "enableTracking") {
    return { ...config, [id]: !config[id] };
  }

  return config;
}

export function snapScalarToGrid(value: number, step: number) {
  if (step <= 0) return value;
  return Math.round(value / step) * step;
}

export function snapVec3ToGrid(vector: Vec3, config: SnapConfig): Vec3 {
  if (!config.enableSnap) return vector;
  return [
    snapScalarToGrid(vector[0], config.gridStep),
    snapScalarToGrid(vector[1], config.gridStep),
    snapScalarToGrid(vector[2], config.gridStep),
  ];
}
