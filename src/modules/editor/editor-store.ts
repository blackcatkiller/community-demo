import { create } from "zustand";

import {
  createDefaultSnapConfig,
  ObjectSnapType,
  ObjectSnapTypeUtils,
  type SnapConfig as ModelAISnapConfig,
} from "@modelai/selection/snapConfig";
import { appendNode, getUniqueNodeName } from "@/modules/editor/kernel/node-system";
import { parseStepFilePlaceholder } from "@/modules/editor/kernel/step-parser";
import type { EditorNode, Vec3 } from "@/modules/editor/kernel/types";

export type EditorTool = "select" | "move" | "rotate" | "scale";
export type CameraPreset = "iso" | "front" | "right" | "top" | "fit";
export type StepStatus = "idle" | "loading" | "ready" | "error";

export type EditorSnapConfig = ModelAISnapConfig & {
  grid: number;
  rotationStep: number;
};

export type ArrayCopySettings = {
  mode: "linear" | "rotation";
  countX: number;
  countY: number;
  spacingX: number;
  spacingY: number;
  rotationCount: number;
  rotationRadius: number;
};

type EditorState = {
  activeTool: EditorTool;
  selectedObjectId: string | null;
  cameraPreset: CameraPreset;
  stepStatus: StepStatus;
  stepMessage: string;
  nodes: EditorNode[];
  snap: EditorSnapConfig;
  arrayCopy: ArrayCopySettings;
  setActiveTool: (tool: EditorTool) => void;
  selectObject: (id: string | null) => void;
  setCameraPreset: (preset: CameraPreset) => void;
  toggleNodeVisibility: (id: string) => void;
  updateNodeTransform: (
    id: string,
    transform: Partial<Pick<EditorNode, "position" | "rotation" | "scale">>,
  ) => void;
  nudgeSelected: (axis: 0 | 1 | 2, amount: number) => void;
  rotateSelected: (axis: 0 | 1 | 2, amount: number) => void;
  setSnapEnabled: (enabled: boolean) => void;
  setFaceSnapEnabled: (enabled: boolean) => void;
  setTrackingEnabled: (enabled: boolean) => void;
  toggleObjectSnapType: (snapType: ObjectSnapType) => void;
  setSnapStep: (step: number) => void;
  setArrayCopy: (settings: Partial<ArrayCopySettings>) => void;
  executeArrayCopy: () => void;
  loadStepPlaceholder: (fileName?: string) => Promise<void>;
};

const initialNodes: EditorNode[] = [
  {
    id: "box-hero",
    name: "Base STEP Body",
    type: "step",
    visible: true,
    color: "#d8dfc8",
    position: [0, 1, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  },
  {
    id: "runner-a",
    name: "Reference Runner",
    type: "mesh",
    visible: true,
    color: "#3b6f8f",
    position: [-2.4, 0.45, 0],
    rotation: [0, 0, 0],
    scale: [1.8, 0.28, 0.28],
  },
  {
    id: "gate-a",
    name: "Gate Node",
    type: "mesh",
    visible: true,
    color: "#b75b43",
    position: [2.1, 0.55, 0],
    rotation: [0, 0, 0],
    scale: [0.55, 0.55, 0.55],
  },
];

function roundToStep(value: number, step: number) {
  if (step <= 0) return value;
  return Math.round(value / step) * step;
}

function snapVec3(vector: Vec3, snap: EditorSnapConfig): Vec3 {
  if (!snap.enableSnap) return vector;
  return [
    roundToStep(vector[0], snap.grid),
    roundToStep(vector[1], snap.grid),
    roundToStep(vector[2], snap.grid),
  ];
}

function offsetVec3(vector: Vec3, axis: 0 | 1 | 2, amount: number): Vec3 {
  const next: Vec3 = [...vector];
  next[axis] += amount;
  return next;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  activeTool: "select",
  selectedObjectId: "box-hero",
  cameraPreset: "iso",
  stepStatus: "ready",
  stepMessage: "Demo STEP placeholder loaded",
  nodes: initialNodes,
  snap: {
    ...createDefaultSnapConfig(),
    grid: 0.25,
    rotationStep: 15,
  },
  arrayCopy: {
    mode: "linear",
    countX: 3,
    countY: 1,
    spacingX: 2.4,
    spacingY: 1.6,
    rotationCount: 4,
    rotationRadius: 2.4,
  },
  setActiveTool: (tool) => set({ activeTool: tool }),
  selectObject: (id) => set({ selectedObjectId: id }),
  setCameraPreset: (preset) => set({ cameraPreset: preset }),
  toggleNodeVisibility: (id) =>
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === id ? { ...node, visible: !node.visible } : node,
      ),
    })),
  updateNodeTransform: (id, transform) =>
    set((state) => ({
      nodes: state.nodes.map((node) => {
        if (node.id !== id) return node;
        const position =
          transform.position
            ? snapVec3(transform.position, state.snap)
            : transform.position;

        return {
          ...node,
          ...transform,
          position: position ?? node.position,
        };
      }),
    })),
  nudgeSelected: (axis, amount) => {
    const { selectedObjectId, snap } = get();
    if (!selectedObjectId) return;

    set((state) => ({
      nodes: state.nodes.map((node) => {
        if (node.id !== selectedObjectId) return node;
        const rawPosition = offsetVec3(node.position, axis, amount);
        return {
          ...node,
          position: snapVec3(rawPosition, snap),
        };
      }),
    }));
  },
  rotateSelected: (axis, amount) => {
    const { selectedObjectId } = get();
    if (!selectedObjectId) return;

    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === selectedObjectId
          ? { ...node, rotation: offsetVec3(node.rotation, axis, amount) }
          : node,
      ),
    }));
  },
  setSnapEnabled: (enabled) =>
    set((state) => ({ snap: { ...state.snap, enableSnap: enabled } })),
  setFaceSnapEnabled: (enabled) =>
    set((state) => ({ snap: { ...state.snap, enableFaceSnap: enabled } })),
  setTrackingEnabled: (enabled) =>
    set((state) => ({ snap: { ...state.snap, enableTracking: enabled } })),
  toggleObjectSnapType: (snapType) =>
    set((state) => ({
      snap: {
        ...state.snap,
        snapTypes: ObjectSnapTypeUtils.hasType(state.snap.snapTypes, snapType)
          ? ObjectSnapTypeUtils.removeType(state.snap.snapTypes, snapType)
          : ObjectSnapTypeUtils.addType(state.snap.snapTypes, snapType),
      },
    })),
  setSnapStep: (step) =>
    set((state) => ({
      snap: { ...state.snap, grid: Math.max(0.05, step) },
    })),
  setArrayCopy: (settings) =>
    set((state) => ({ arrayCopy: { ...state.arrayCopy, ...settings } })),
  executeArrayCopy: () => {
    const { arrayCopy, nodes, selectedObjectId } = get();
    const source = nodes.find((node) => node.id === selectedObjectId);
    if (!source) return;

    const copies: EditorNode[] = [];
    const stamp = Date.now().toString(36);

    if (arrayCopy.mode === "rotation") {
      const count = Math.max(2, Math.floor(arrayCopy.rotationCount));
      for (let index = 1; index < count; index += 1) {
        const angle = (Math.PI * 2 * index) / count;
        copies.push({
          ...source,
          id: `${source.id}-rot-${stamp}-${index}`,
          name: getUniqueNodeName([...nodes, ...copies], `${source.name} Rot`),
          type: "array-instance",
          sourceId: source.id,
          position: [
            source.position[0] + Math.cos(angle) * arrayCopy.rotationRadius,
            source.position[1],
            source.position[2] + Math.sin(angle) * arrayCopy.rotationRadius,
          ],
          rotation: [
            source.rotation[0],
            source.rotation[1] + angle,
            source.rotation[2],
          ],
        });
      }
    } else {
      const countX = Math.max(1, Math.floor(arrayCopy.countX));
      const countY = Math.max(1, Math.floor(arrayCopy.countY));
      for (let y = 0; y < countY; y += 1) {
        for (let x = 0; x < countX; x += 1) {
          if (x === 0 && y === 0) continue;
          copies.push({
            ...source,
            id: `${source.id}-copy-${stamp}-${x}-${y}`,
            name: getUniqueNodeName([...nodes, ...copies], `${source.name} Copy`),
            type: "array-instance",
            sourceId: source.id,
            position: [
              source.position[0] + x * arrayCopy.spacingX,
              source.position[1],
              source.position[2] + y * arrayCopy.spacingY,
            ],
          });
        }
      }
    }

    if (copies.length > 0) {
      set({ nodes: [...nodes, ...copies], selectedObjectId: copies.at(-1)?.id ?? source.id });
    }
  },
  loadStepPlaceholder: async (fileName = "imported-part.step") => {
    set({ stepStatus: "loading", stepMessage: `Parsing ${fileName}...` });
    try {
      const { nodes } = get();
      const result = await parseStepFilePlaceholder(fileName, nodes);
      set((state) => ({
        nodes: appendNode(state.nodes, result.node),
        selectedObjectId: result.node.id,
        stepStatus: "ready",
        stepMessage: result.diagnostics.at(-1) ?? `Loaded ${fileName}`,
      }));
    } catch (error) {
      set({
        stepStatus: "error",
        stepMessage: error instanceof Error ? error.message : String(error),
      });
    }
  },
}));

export { ObjectSnapType, ObjectSnapTypeUtils };
export type { EditorNode, Vec3 };
