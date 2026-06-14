// @ts-nocheck
import type { BoundingBox } from "@modelai/core/math";
import type {
  ShapeType,
  VisualState,
  ViewShapeGuidePolicy
} from "@modelai/core/types";
import type { Mesh, Object3D, Points } from "three";
import type { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import type { ThreeGeometry } from "./geometry";

export type GeometryRenderChannels = {
  faces?: Mesh;
  edges?: LineSegments2;
  vertexs?: Points;
  guides: LineSegments2[];
};

export interface GeometryVisualBackend {
  attach(visual: ThreeGeometry): void;
  detach(): void;
  refresh(): void;
  boundingBox(): BoundingBox | undefined;
  getRenderChannels(): GeometryRenderChannels;
  getShapeHitObjects?(
    shapeType: ShapeType,
    guidePolicy?: ViewShapeGuidePolicy
  ): Object3D[] | undefined;
  wholeVisualEnabled?(): boolean;
  applyWholeVisualState?(state: VisualState): boolean;
  clearWholeVisualState?(): boolean;
}
