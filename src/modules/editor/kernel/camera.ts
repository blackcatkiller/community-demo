import { Box3, Vector3 } from "three";

import type { CameraPreset, EditorNode } from "@/modules/editor/kernel/types";

export function getVisibleNodeBounds(nodes: EditorNode[]) {
  const box = new Box3();
  for (const node of nodes) {
    if (!node.visible || node.type === "group") continue;
    box.expandByPoint(new Vector3(...node.position));
  }
  if (box.isEmpty()) {
    box.expandByPoint(new Vector3(0, 0, 0));
  }
  return box;
}

export function getCameraPose(nodes: EditorNode[], preset: CameraPreset) {
  const box = getVisibleNodeBounds(nodes);
  const center = new Vector3();
  const size = new Vector3();
  box.getCenter(center);
  box.getSize(size);

  const radius = Math.max(3, size.length() * 0.75);
  const distance = preset === "fit" ? radius * 2.6 : radius * 2.2;
  const presets: Record<CameraPreset, [number, number, number]> = {
    iso: [distance, distance, distance],
    front: [0, distance * 0.45, distance],
    right: [distance, distance * 0.45, 0],
    top: [0, distance, 0.001],
    fit: [distance, distance * 0.8, distance],
  };
  const offset = presets[preset];

  return {
    center,
    position: new Vector3(
      center.x + offset[0],
      center.y + offset[1],
      center.z + offset[2],
    ),
    radius,
  };
}
