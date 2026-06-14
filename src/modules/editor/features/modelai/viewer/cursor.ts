// @ts-nocheck
import pointSnapCursorUrl from "@/assets/cursor/pointSnap.svg?url";
import pointSnapDisabledCursorUrl from "@/assets/cursor/pointSnapDisabled.svg?url";

export type ModelAICursor = "pointSnap" | "pointSnapDisabled";

const POINT_SNAP_HOTSPOT_X = 8;
const POINT_SNAP_HOTSPOT_Y = 8;

function buildCursorUrl(url: string, fallback: string) {
  return `url("${url}") ${POINT_SNAP_HOTSPOT_X} ${POINT_SNAP_HOTSPOT_Y}, ${fallback}`;
}

export function resolveModelAICursor(cursor: string | undefined): string {
  switch (cursor) {
    case "pointSnap":
      return buildCursorUrl(pointSnapCursorUrl, "crosshair");
    case "pointSnapDisabled":
      return buildCursorUrl(pointSnapDisabledCursorUrl, "not-allowed");
    default:
      return cursor || "default";
  }
}
