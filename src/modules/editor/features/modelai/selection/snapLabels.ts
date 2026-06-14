// @ts-nocheck
import { transformI18n } from "@/plugins/i18n";
import { ObjectSnapType } from "./snapConfig";

export enum SnapLabelKey {
  EnableSnap = "enableSnap",
  Edge = "edge",
  End = "end",
  EndPoint = "endPoint",
  Mid = "mid",
  MidPoint = "midPoint",
  Center = "center",
  Face = "face",
  Perpendicular = "perpendicular",
  Intersection = "intersection",
  Vertex = "vertex",
  Tracking = "tracking",
  AxisX = "x",
  AxisY = "y",
  AxisZ = "z"
}

const SNAP_LABEL_KEYS: Record<SnapLabelKey, string> = {
  [SnapLabelKey.EnableSnap]: "modelai.selection.snapLabels.enableSnap",
  [SnapLabelKey.Edge]: "modelai.selection.snapLabels.edge",
  [SnapLabelKey.End]: "modelai.selection.snapLabels.end",
  [SnapLabelKey.EndPoint]: "modelai.selection.snapLabels.endPoint",
  [SnapLabelKey.Mid]: "modelai.selection.snapLabels.mid",
  [SnapLabelKey.MidPoint]: "modelai.selection.snapLabels.midPoint",
  [SnapLabelKey.Center]: "modelai.selection.snapLabels.center",
  [SnapLabelKey.Face]: "modelai.selection.snapLabels.face",
  [SnapLabelKey.Perpendicular]: "modelai.selection.snapLabels.perpendicular",
  [SnapLabelKey.Intersection]: "modelai.selection.snapLabels.intersection",
  [SnapLabelKey.Vertex]: "modelai.selection.snapLabels.vertex",
  [SnapLabelKey.Tracking]: "modelai.selection.snapLabels.tracking",
  [SnapLabelKey.AxisX]: "modelai.selection.snapLabels.axisX",
  [SnapLabelKey.AxisY]: "modelai.selection.snapLabels.axisY",
  [SnapLabelKey.AxisZ]: "modelai.selection.snapLabels.axisZ"
};

const LEGACY_SNAP_LABEL_KEYS: Record<string, SnapLabelKey> = {
  [SnapLabelKey.EnableSnap]: SnapLabelKey.EnableSnap,
  [SnapLabelKey.Edge]: SnapLabelKey.Edge,
  [SnapLabelKey.End]: SnapLabelKey.End,
  [SnapLabelKey.EndPoint]: SnapLabelKey.EndPoint,
  [SnapLabelKey.Mid]: SnapLabelKey.Mid,
  [SnapLabelKey.MidPoint]: SnapLabelKey.MidPoint,
  [SnapLabelKey.Center]: SnapLabelKey.Center,
  [SnapLabelKey.Face]: SnapLabelKey.Face,
  [SnapLabelKey.Perpendicular]: SnapLabelKey.Perpendicular,
  [SnapLabelKey.Intersection]: SnapLabelKey.Intersection,
  [SnapLabelKey.Vertex]: SnapLabelKey.Vertex,
  [SnapLabelKey.Tracking]: SnapLabelKey.Tracking,
  [SnapLabelKey.AxisX]: SnapLabelKey.AxisX,
  [SnapLabelKey.AxisY]: SnapLabelKey.AxisY,
  [SnapLabelKey.AxisZ]: SnapLabelKey.AxisZ,
  Intersection: SnapLabelKey.Intersection,
  Face: SnapLabelKey.Face,
  X: SnapLabelKey.AxisX,
  Y: SnapLabelKey.AxisY,
  Z: SnapLabelKey.AxisZ
};

export type SnapConfigItem = {
  type: ObjectSnapType;
  token: SnapLabelKey;
  hidden?: boolean;
};

export const SNAP_CONFIG_ITEMS: SnapConfigItem[] = [
  { type: ObjectSnapType.endPoint, token: SnapLabelKey.End },
  { type: ObjectSnapType.midPoint, token: SnapLabelKey.Mid },
  { type: ObjectSnapType.center, token: SnapLabelKey.Center },
  { type: ObjectSnapType.perpendicular, token: SnapLabelKey.Perpendicular },
  { type: ObjectSnapType.intersection, token: SnapLabelKey.Intersection },
  { type: ObjectSnapType.vertex, token: SnapLabelKey.Vertex, hidden: true }
];

function normalizeSnapLabelKey(
  token?: string | null
): SnapLabelKey | undefined {
  if (!token) return undefined;
  return LEGACY_SNAP_LABEL_KEYS[token];
}

export function getSnapLabel(token?: string | null) {
  if (!token) return "";
  const normalized = normalizeSnapLabelKey(token);
  return normalized ? transformI18n(SNAP_LABEL_KEYS[normalized]) : token;
}

export function formatSnapPrompt(text?: string | null) {
  if (!text) return null;
  const parts = text.split(" -> ");
  if (!parts.length) return text;
  const [head, ...rest] = parts;
  return [getSnapLabel(head), ...rest].join(" -> ");
}
