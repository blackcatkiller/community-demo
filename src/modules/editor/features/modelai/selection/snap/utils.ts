// @ts-nocheck
import type { IView } from "@modelai/core/types";
import type { XYZ } from "@modelai/core/math";

export function screenDistance(
  view: IView,
  mx: number,
  my: number,
  point: XYZ
): number {
  const xy = view.worldToScreen(point);
  const dx = xy.x - mx;
  const dy = xy.y - my;
  return Math.sqrt(dx * dx + dy * dy);
}
