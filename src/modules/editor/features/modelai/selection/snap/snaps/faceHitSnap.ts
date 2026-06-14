// @ts-nocheck
import type { VisualShapeData } from "@modelai/core/types";
import {
  DEFAULT_SNAP_PROFILE,
  type ISnapCandidateProvider,
  type MouseAndDetected,
  type SnapCandidate,
  type SnapHitContext,
  type SnapResult
} from "../snap";
import { SnapLabelKey } from "../../snapLabels";
import {
  findFirstFaceHit,
  preciseSnapPointForRay
} from "@modelai/selection/snapHitPolicy";
import { BaseSnap } from "./baseSnap";

/**
 * Fallback snap that allows command-based point picking on model faces.
 *
 * It returns the ray-hit point reported by `view.detectShapes(ShapeType.Face, ...)`.
 * Edge/vertex priority is handled by `SnapEventHandler` (it tries edges/vertices first),
 * so this snap is only used when there is no nearby edge/vertex hit.
 */
export class FaceHitSnap extends BaseSnap implements ISnapCandidateProvider {
  constructor(private readonly preciseOnHover = false) {
    super();
  }

  snap(data: MouseAndDetected): SnapResult | undefined {
    const candidate = this.collectCandidates({
      view: data.view,
      mx: data.mx,
      my: data.my,
      ray: data.view.rayAt(data.mx, data.my),
      shapes: data.shapes,
      profile: DEFAULT_SNAP_PROFILE
    }).at(0);
    if (!candidate) return undefined;

    // Visual feedback: highlight the hit face while hovering.
    this.highlight(data.view, candidate.shapes);

    return {
      view: data.view,
      point: candidate.point,
      info: candidate.info,
      shapes: candidate.shapes
    };
  }

  collectCandidates(context: SnapHitContext): SnapCandidate[] {
    if (context.shapes.length === 0) return [];

    const hit = findFirstFaceHit(context.shapes);
    if (!hit?.point) return [];

    return [
      {
        key: this.getCandidateKey(hit),
        type: "face",
        point: this.getHoverPoint(context, hit),
        shapes: [hit],
        info: SnapLabelKey.Face,
        source: "face",
        preciseResolver: context.profile.preciseOnCommit
          ? () =>
              preciseSnapPointForRay(hit, {
                origin: context.ray.origin,
                direction: context.ray.direction
              }) ?? hit.point
          : undefined
      }
    ];
  }

  private getHoverPoint(data: SnapHitContext, hit: VisualShapeData) {
    if (!this.preciseOnHover) return hit.point;

    return (
      preciseSnapPointForRay(hit, {
        origin: data.ray.origin,
        direction: data.ray.direction
      }) ?? hit.point
    );
  }

  private getCandidateKey(hit: VisualShapeData) {
    return `face:${hit.shape.id}:${hit.indexes.join(",")}`;
  }
}
