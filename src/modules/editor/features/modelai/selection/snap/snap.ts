// @ts-nocheck
import type {
  IDocument,
  INode,
  IView,
  ShapeMeshData,
  VisualShapeData
} from "@modelai/core/types";
import type { Plane, XYZ } from "@modelai/core/math";
import type { Object3D } from "three";

export type SnapFilter = (shape: VisualShapeData) => boolean;

export type SnapProfileId =
  | "default"
  | "transform"
  | "precisePick"
  | "facePlacement";

export interface TransformCandidateTuning {
  priorityWindowPx: number;
  lockRadiusPx: number;
  switchMarginPx: number;
}

export interface SnapProfile {
  id: SnapProfileId | string;
  hoverMode: "light" | "balanced" | "full";
  faceHover: "off" | "fallback" | "primary";
  preciseOnCommit: boolean;
  enableTracking: boolean;
  enableInvisibleSnaps: boolean;
  enableDerivedSnaps: {
    center: boolean;
    intersection: boolean;
    perpendicular: boolean;
  };
  stickyCandidate: boolean;
  transformCandidateTuning: TransformCandidateTuning;
}

export interface SnapRay {
  origin: XYZ;
  direction: XYZ;
}

export type SnapCandidateType =
  | "vertex"
  | "endPoint"
  | "midPoint"
  | "center"
  | "guidePoint"
  | "intersection"
  | "perpendicular"
  | "face"
  | "tracking"
  | "plane";

export interface SnapCandidate {
  key: string;
  type: SnapCandidateType;
  point: XYZ;
  shapes: VisualShapeData[];
  refPoint?: XYZ;
  info?: string;
  distance?: number;
  score?: number;
  source: "feature" | "derived" | "face" | "tracking" | "plane";
  preciseResolver?: () => XYZ | undefined;
}

export interface SnapHitContext {
  view: IView;
  mx: number;
  my: number;
  ray: SnapRay;
  shapes: VisualShapeData[];
  profile: SnapProfile;
}

export const DEFAULT_SNAP_PROFILE: SnapProfile = {
  id: "default",
  hoverMode: "balanced",
  faceHover: "primary",
  preciseOnCommit: true,
  enableTracking: true,
  enableInvisibleSnaps: true,
  enableDerivedSnaps: {
    center: true,
    intersection: true,
    perpendicular: true
  },
  stickyCandidate: true,
  transformCandidateTuning: {
    priorityWindowPx: 3,
    lockRadiusPx: 6,
    switchMarginPx: 2
  }
};

export interface SnapData {
  preview?: (point: XYZ | undefined, snaped?: SnapResult) => ShapeMeshData[];
  previewObjects?: (point: XYZ | undefined, snaped?: SnapResult) => Object3D[];
  prompt?: (point: SnapResult | undefined) => string | undefined;
  hoverCursor?: (point: SnapResult | undefined) => string | undefined;
  filter?: SnapFilter;
  validator?: (point: XYZ) => boolean;
  featurePoints?: {
    point: XYZ;
    prompt: string;
    when?: () => boolean;
  }[];
  profile?: Partial<SnapProfile> | SnapProfile;
}

export interface SnapResult {
  view: IView;
  point?: XYZ;
  info?: string;
  distance?: number;
  refPoint?: XYZ;
  shapes: VisualShapeData[];
  nodes?: INode[];
  plane?: Plane;
}

export interface MouseAndDetected {
  view: IView;
  mx: number;
  my: number;
  shapes: VisualShapeData[];
}

export interface ISnap {
  snap(data: MouseAndDetected): SnapResult | undefined;
  readonly handleSnaped?: (document: IDocument, snaped?: SnapResult) => void;
  removeDynamicObject(): void;
  clear(): void;
}

export interface ISnapCandidateProvider {
  collectCandidates(context: SnapHitContext): SnapCandidate[];
}

export function resolveSnapProfile(
  data?: Pick<SnapData, "profile">
): SnapProfile {
  const profile = data?.profile;
  if (!profile) {
    return {
      ...DEFAULT_SNAP_PROFILE,
      enableDerivedSnaps: { ...DEFAULT_SNAP_PROFILE.enableDerivedSnaps }
    };
  }

  return {
    ...DEFAULT_SNAP_PROFILE,
    ...profile,
    enableDerivedSnaps: {
      ...DEFAULT_SNAP_PROFILE.enableDerivedSnaps,
      ...profile.enableDerivedSnaps
    },
    transformCandidateTuning: {
      ...DEFAULT_SNAP_PROFILE.transformCandidateTuning,
      ...profile.transformCandidateTuning
    }
  };
}
