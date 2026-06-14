// @ts-nocheck
/**
 * Shared limits for persisted snap-related point meshes.
 *
 * We keep this config in `selection/tracking` and derive per-source limits from
 * a single total cap to avoid drift between modules.
 *
 * Rule:
 * - `MAX_TRACKING_POINTS` is either equal to `MAX_INVISIBLE_SNAPS` or exactly +1.
 * - `MAX_TRACKING_POINTS + MAX_INVISIBLE_SNAPS === TrackingPointConfig.maxTotalPoints`.
 *
 * With an odd total, tracking gets the extra slot.
 */
export const TrackingPointConfig = {
  /**
   * The total budget for persisted point meshes (tracking points + invisible snap hints).
   * This does NOT include per-frame temporary cursor points.
   */
  maxTotalPoints: 10
} as const;

export const MAX_INVISIBLE_SNAPS = Math.floor(
  TrackingPointConfig.maxTotalPoints / 2
);

export const MAX_TRACKING_POINTS =
  TrackingPointConfig.maxTotalPoints - MAX_INVISIBLE_SNAPS;
