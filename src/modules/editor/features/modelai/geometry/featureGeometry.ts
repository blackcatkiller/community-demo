// @ts-nocheck
import type { Result } from "@modelai/core/result";
import type { EdgeMeshData, IShape } from "@modelai/core/types";
import { MeshDataUtils, VisualConfig } from "@modelai/core/types";
import type { Matrix4, XYZ } from "@modelai/core/math";
import { gc } from "@modelai/core/gc";
import { OccEdge } from "@modelai/occ/shape";

const GUIDE_ARC_MIN_SEGMENTS = 24;
const GUIDE_ARC_MAX_ANGLE_STEP = Math.PI / 90;

export type FeatureGuideRole = "display" | "pickProxy" | "editProxy";
export type FeatureGuideOwner = "feature" | "shapeA" | "shapeB";
export type FeatureGuideBindingField = string;

export type FeatureGuideBinding = {
  kind: string;
  fields: readonly FeatureGuideBindingField[];
  metadata?: Readonly<Record<string, boolean | number | string>>;
};

export type GuideFeaturePointType = "center" | "end" | "mid";

export type GuideFeaturePoint = {
  point: XYZ;
  type: GuideFeaturePointType;
};

export type FeatureGuidePointRole = string & {};
export type FeatureGuidePointState = "default" | "focus";
export type FeatureGuidePointTarget =
  | {
      kind: "guidePath";
      guideId: string;
      feature: GuideFeaturePointType | "start" | "end" | (string & {});
    }
  | {
      kind: "standalone";
      feature?: string;
    };

export type FeatureGuidePointDescriptor = {
  id: string;
  role: FeatureGuidePointRole;
  point: XYZ;
  state?: FeatureGuidePointState;
  editable?: boolean;
  target?: FeatureGuidePointTarget;
  binding?: FeatureGuideBinding;
};

export type GuideProjectionResult = {
  point: XYZ;
  distance: number;
};

export type GuidePath =
  | {
      kind: "line";
      start: XYZ;
      end: XYZ;
    }
  | {
      kind: "arc";
      center: XYZ;
      normal: XYZ;
      start: XYZ;
      sweepAngle: number;
    };

export type FeatureCenterlineGuide = {
  id: string;
  kind: "centerline";
  owner: FeatureGuideOwner;
  roles: readonly FeatureGuideRole[];
  binding?: FeatureGuideBinding;
  path: GuidePath;
  carrier?: FeatureGuideCarrier;
  guidePoints?: readonly FeatureGuidePointDescriptor[];
};

export type FeatureKeyPointGuide = {
  id: string;
  kind: "keyPoint";
  owner: FeatureGuideOwner;
  roles: readonly FeatureGuideRole[];
  binding?: FeatureGuideBinding;
  point: XYZ;
};

export type FeatureGuidePointGuide = {
  id: string;
  kind: "guidePoint";
  owner: FeatureGuideOwner;
  roles: readonly FeatureGuideRole[];
  binding?: FeatureGuideBinding;
  guidePoint: FeatureGuidePointDescriptor;
};

export type FeatureGuideDescriptor =
  | FeatureCenterlineGuide
  | FeatureKeyPointGuide
  | FeatureGuidePointGuide;

export type FeatureGeometryResult = {
  shape: Result<IShape>;
  guides: FeatureGuideDescriptor[];
};

export type FeatureGuideCarrier = {
  edge: OccEdge;
  featurePoints: readonly GuideFeaturePoint[];
};

export type FeatureGuideBuildOptions = {
  roles?: FeatureGuideRole | readonly FeatureGuideRole[];
  binding?: FeatureGuideBinding;
  guidePoints?: readonly FeatureGuidePointDescriptor[];
};

const DEFAULT_FEATURE_GUIDE_ROLES: readonly FeatureGuideRole[] = ["display"];

function normalizeGuideRoles(
  roles?: FeatureGuideRole | readonly FeatureGuideRole[]
): readonly FeatureGuideRole[] {
  if (!roles) {
    return DEFAULT_FEATURE_GUIDE_ROLES;
  }
  const next = Array.isArray(roles) ? roles : [roles];
  if (next.length === 0) {
    return DEFAULT_FEATURE_GUIDE_ROLES;
  }
  return [...new Set(next)];
}

function normalizeGuideBuildOptions(
  options?: FeatureGuideRole | FeatureGuideBuildOptions
): FeatureGuideBuildOptions {
  if (!options) {
    return {};
  }
  if (typeof options === "string" || Array.isArray(options)) {
    return {
      roles: options
    };
  }
  return options;
}

export function hasGuideRole(
  guide: FeatureGuideDescriptor,
  role: FeatureGuideRole
): boolean {
  return guide.roles.includes(role);
}

export function filterGuidesByRole(
  guides: readonly FeatureGuideDescriptor[],
  role: FeatureGuideRole
): FeatureGuideDescriptor[] {
  return guides.filter(guide => hasGuideRole(guide, role));
}

export function isEditableGuide(
  guide: FeatureGuideDescriptor
): guide is FeatureCenterlineGuide {
  return guide.kind === "centerline" && hasGuideRole(guide, "editProxy");
}

export function isCenterlineGuideByRole(
  guide: FeatureGuideDescriptor,
  role: FeatureGuideRole
): guide is FeatureCenterlineGuide {
  return guide.kind === "centerline" && hasGuideRole(guide, role);
}

export function filterCenterlineGuidesByRole(
  guides: readonly FeatureGuideDescriptor[],
  role: FeatureGuideRole
): FeatureCenterlineGuide[] {
  return guides.filter(guide => isCenterlineGuideByRole(guide, role));
}

export function resolveGuideBinding(
  guide: FeatureGuideDescriptor
): FeatureGuideBinding | undefined {
  return guide.binding;
}

export function getGuideCarrierEdge(
  guide: FeatureGuideDescriptor
): OccEdge | undefined {
  return guide.kind === "centerline" ? guide.carrier?.edge : undefined;
}

export function getGuideCarrierFeaturePoints(
  guide: FeatureGuideDescriptor
): readonly GuideFeaturePoint[] {
  return guide.kind === "centerline"
    ? (guide.carrier?.featurePoints ?? [])
    : [];
}

export function disposeGuideDescriptors(
  guides: readonly FeatureGuideDescriptor[]
) {
  guides.forEach(guide => {
    getGuideCarrierEdge(guide)?.dispose();
  });
}

function cloneWireEdge(edge: any) {
  return new OccEdge(wasm.TopoDS.edge(wasm.Shape.clone(edge)));
}

function createGuideCarrier(
  edge: OccEdge,
  path: GuidePath
): FeatureGuideCarrier {
  return {
    edge,
    featurePoints: buildGuidePathFeaturePoints(path)
  };
}

function tryBuildLineGuideCarrier(
  path: Extract<GuidePath, { kind: "line" }>
): FeatureGuideCarrier | undefined {
  try {
    if (
      typeof (wasm as any)?.ShapeBuilderModelAi?.StraightSpine === "function"
    ) {
      const wire = (wasm as any).ShapeBuilderModelAi.StraightSpine(
        path.start.x,
        path.start.y,
        path.start.z,
        path.end.x,
        path.end.y,
        path.end.z
      );
      const edge = wasm.Wire.edgeLoop(wire)[0];
      const carrier = edge
        ? createGuideCarrier(cloneWireEdge(edge), path)
        : undefined;
      wire.delete?.();
      return carrier;
    }

    return gc(collect => {
      const curveHandle = collect(
        wasm.Curve.makeLine(
          { x: path.start.x, y: path.start.y, z: path.start.z },
          { x: path.end.x, y: path.end.y, z: path.end.z }
        )
      );
      const curve = curveHandle.get();
      if (!curve) return undefined;

      const trimmedHandle = collect(
        wasm.Curve.trim(curve, 0, path.start.distanceTo(path.end))
      );
      const trimmed = trimmedHandle.get();
      if (!trimmed) return undefined;

      return createGuideCarrier(
        new OccEdge(wasm.Edge.fromCurve(trimmed)),
        path
      );
    });
  } catch {
    return undefined;
  }
}

function tryBuildArcGuideCarrier(
  path: Extract<GuidePath, { kind: "arc" }>
): FeatureGuideCarrier | undefined {
  try {
    if (typeof (wasm as any)?.ShapeBuilderModelAi?.ArcSpine !== "function") {
      return undefined;
    }

    const wire = (wasm as any).ShapeBuilderModelAi.ArcSpine(
      path.center.x,
      path.center.y,
      path.center.z,
      path.normal.x,
      path.normal.y,
      path.normal.z,
      path.start.x,
      path.start.y,
      path.start.z,
      path.sweepAngle
    );
    const edge = wasm.Wire.edgeLoop(wire)[0];
    const carrier = edge
      ? createGuideCarrier(cloneWireEdge(edge), path)
      : undefined;
    wire.delete?.();
    return carrier;
  } catch {
    return undefined;
  }
}

export function tryBuildGuideCarrier(
  path: GuidePath
): FeatureGuideCarrier | undefined {
  return path.kind === "line"
    ? tryBuildLineGuideCarrier(path)
    : tryBuildArcGuideCarrier(path);
}

export function buildLineGuide(
  id: string,
  owner: FeatureGuideOwner,
  start: XYZ,
  end: XYZ,
  options?: FeatureGuideRole | FeatureGuideBuildOptions
): FeatureCenterlineGuide {
  const next = normalizeGuideBuildOptions(options);
  const path: GuidePath = {
    kind: "line",
    start,
    end
  };
  return {
    id,
    kind: "centerline",
    owner,
    roles: normalizeGuideRoles(next.roles),
    binding: next.binding,
    path,
    carrier: tryBuildGuideCarrier(path),
    guidePoints: next.guidePoints
  };
}

export function buildArcGuide(
  id: string,
  owner: FeatureGuideOwner,
  center: XYZ,
  normal: XYZ,
  start: XYZ,
  sweepAngle: number,
  options?: FeatureGuideRole | FeatureGuideBuildOptions
): FeatureCenterlineGuide {
  const next = normalizeGuideBuildOptions(options);
  const path: GuidePath = {
    kind: "arc",
    center,
    normal,
    start,
    sweepAngle
  };
  return {
    id,
    kind: "centerline",
    owner,
    roles: normalizeGuideRoles(next.roles),
    binding: next.binding,
    path,
    carrier: tryBuildGuideCarrier(path),
    guidePoints: next.guidePoints
  };
}

export function buildGuidePoint(
  id: string,
  owner: FeatureGuideOwner,
  point: FeatureGuidePointDescriptor,
  options?: FeatureGuideRole | FeatureGuideBuildOptions
): FeatureGuidePointGuide {
  const next = normalizeGuideBuildOptions(options);
  return {
    id,
    kind: "guidePoint",
    owner,
    roles: normalizeGuideRoles(next.roles),
    binding: next.binding,
    guidePoint: point
  };
}

function rotateAroundAxis(vector: XYZ, axis: XYZ, angleRad: number): XYZ {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  return vector
    .multiply(cos)
    .add(axis.cross(vector).multiply(sin))
    .add(axis.multiply(axis.dot(vector) * (1 - cos)));
}

function transformGuidePoint(point: XYZ, transform?: Matrix4) {
  return transform ? transform.ofPoint(point) : point;
}

function buildLineGuideFeaturePoints(
  path: Extract<GuidePath, { kind: "line" }>,
  transform?: Matrix4
) {
  const mid = path.start.add(path.end).multiply(0.5);
  return {
    end: [
      {
        point: transformGuidePoint(path.start, transform),
        type: "end" as const
      },
      {
        point: transformGuidePoint(path.end, transform),
        type: "end" as const
      }
    ],
    mid: [
      {
        point: transformGuidePoint(mid, transform),
        type: "mid" as const
      }
    ],
    center: [] as GuideFeaturePoint[]
  };
}

function buildArcGuideFeaturePoints(
  path: Extract<GuidePath, { kind: "arc" }>,
  transform?: Matrix4
) {
  const startVector = path.start.sub(path.center);
  const end = path.center.add(
    rotateAroundAxis(startVector, path.normal, path.sweepAngle)
  );
  const mid = path.center.add(
    rotateAroundAxis(startVector, path.normal, path.sweepAngle * 0.5)
  );
  return {
    end: [
      {
        point: transformGuidePoint(path.start, transform),
        type: "end" as const
      },
      {
        point: transformGuidePoint(end, transform),
        type: "end" as const
      }
    ],
    mid: [
      {
        point: transformGuidePoint(mid, transform),
        type: "mid" as const
      }
    ],
    center: [
      {
        point: transformGuidePoint(path.center, transform),
        type: "center" as const
      }
    ]
  };
}

export function buildGuideFeaturePoints(
  guide: FeatureGuideDescriptor,
  transform?: Matrix4
): GuideFeaturePoint[] {
  if (guide.kind !== "centerline") {
    return [];
  }
  return buildGuidePathFeaturePoints(guide.path, transform);
}

function buildGuidePathFeaturePoints(
  path: GuidePath,
  transform?: Matrix4
): GuideFeaturePoint[] {
  const features =
    path.kind === "line"
      ? buildLineGuideFeaturePoints(path, transform)
      : buildArcGuideFeaturePoints(path, transform);
  return [...features.end, ...features.mid, ...features.center];
}

function buildArcGuidePositions(path: Extract<GuidePath, { kind: "arc" }>) {
  const segmentCount = Math.max(
    GUIDE_ARC_MIN_SEGMENTS,
    Math.ceil(Math.abs(path.sweepAngle) / GUIDE_ARC_MAX_ANGLE_STEP)
  );
  const startVector = path.start.sub(path.center);
  const positions: number[] = [];

  for (let index = 0; index < segmentCount; index += 1) {
    const startAngle = (path.sweepAngle * index) / segmentCount;
    const endAngle = (path.sweepAngle * (index + 1)) / segmentCount;
    const segmentStart = path.center.add(
      rotateAroundAxis(startVector, path.normal, startAngle)
    );
    const segmentEnd = path.center.add(
      rotateAroundAxis(startVector, path.normal, endAngle)
    );
    positions.push(
      segmentStart.x,
      segmentStart.y,
      segmentStart.z,
      segmentEnd.x,
      segmentEnd.y,
      segmentEnd.z
    );
  }

  return new Float32Array(positions);
}

function projectPointToLinePath(
  path: Extract<GuidePath, { kind: "line" }>,
  point: XYZ
): GuideProjectionResult | undefined {
  const direction = path.end.sub(path.start);
  const lengthSq = direction.lengthSq();
  if (lengthSq <= 0) {
    return undefined;
  }

  const parameter = Math.max(
    0,
    Math.min(1, point.sub(path.start).dot(direction) / lengthSq)
  );
  const projected = path.start.add(direction.multiply(parameter));
  return {
    point: projected,
    distance: projected.distanceTo(point)
  };
}

function projectPointToArcPath(
  path: Extract<GuidePath, { kind: "arc" }>,
  point: XYZ
): GuideProjectionResult | undefined {
  const normal = path.normal.normalize();
  const startVector = path.start.sub(path.center);
  const radius = startVector.length();
  if (radius <= 0 || normal.lengthSq() <= 0) {
    return undefined;
  }

  const relative = point.sub(path.center);
  const planar = relative.sub(normal.multiply(relative.dot(normal)));
  const planarDirection =
    planar.lengthSq() > 0 ? planar.normalize() : startVector.normalize();
  const candidateVector = planarDirection.multiply(radius);
  const rawAngle =
    path.sweepAngle >= 0
      ? (startVector.angleOnPlaneTo(candidateVector, normal) ?? 0)
      : -(startVector.angleOnPlaneTo(candidateVector, normal.reverse()) ?? 0);
  const clampedAngle =
    path.sweepAngle >= 0
      ? Math.max(0, Math.min(path.sweepAngle, rawAngle))
      : Math.max(path.sweepAngle, Math.min(0, rawAngle));
  const rotated = startVector.rotate(normal, clampedAngle);
  if (!rotated) {
    return undefined;
  }

  const projected = path.center.add(rotated);
  return {
    point: projected,
    distance: projected.distanceTo(point)
  };
}

export function buildGuidePathPositions(path: GuidePath): Float32Array {
  if (path.kind === "line") {
    return new Float32Array([
      path.start.x,
      path.start.y,
      path.start.z,
      path.end.x,
      path.end.y,
      path.end.z
    ]);
  }
  if (path.kind === "arc") {
    return buildArcGuidePositions(path);
  }
}

export function projectPointToGuidePath(
  path: GuidePath,
  point: XYZ
): GuideProjectionResult | undefined {
  if (path.kind === "line") {
    return projectPointToLinePath(path, point);
  }
  return projectPointToArcPath(path, point);
}

export function buildGuideEdgeMeshes(
  guides: readonly FeatureGuideDescriptor[],
  options?: { advancedOcclusion?: boolean }
): EdgeMeshData[] {
  return buildGuideEdgeMeshesByRole(guides, "display", options);
}

export function collectGuidePointsByRole(
  guides: readonly FeatureGuideDescriptor[],
  role: FeatureGuideRole = "display"
): FeatureGuidePointDescriptor[] {
  return filterGuidesByRole(guides, role).flatMap(guide => {
    if (guide.kind === "guidePoint") {
      return [guide.guidePoint];
    }
    if (guide.kind !== "centerline" || !hasGuideRole(guide, role)) {
      return [];
    }
    return [...(guide.guidePoints ?? [])];
  });
}

export function buildGuideEdgeMeshesByRole(
  guides: readonly FeatureGuideDescriptor[],
  role: FeatureGuideRole,
  options?: { advancedOcclusion?: boolean }
): EdgeMeshData[] {
  return filterGuidesByRole(guides, role).flatMap(guide => {
    if (guide.kind !== "centerline" || !hasGuideRole(guide, role)) {
      return [];
    }
    const mesh =
      guide.path.kind === "line"
        ? MeshDataUtils.createEdgeMesh(
            guide.path.start,
            guide.path.end,
            VisualConfig.measurementGuideColor,
            "solid",
            3
          )
        : {
            position: buildGuidePathPositions(guide.path),
            color: VisualConfig.measurementGuideColor,
            lineType: "solid" as const,
            lineWidth: 3,
            range: []
          };

    if (options?.advancedOcclusion) {
      mesh.advancedOcclusion = true;
    }
    return [mesh];
  });
}
