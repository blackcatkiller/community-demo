export type Vec3 = [number, number, number];

export type EditorNodeKind = "mesh" | "step" | "array-instance" | "group";

export type EditorNode = {
  id: string;
  name: string;
  type: EditorNodeKind;
  visible: boolean;
  color: string;
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
  parentId?: string;
  sourceId?: string;
  children?: string[];
  metadata?: Record<string, string | number | boolean>;
};

export type CameraPreset = "iso" | "front" | "right" | "top" | "fit";

export type CameraProjection = "perspective" | "orthographic";

export type StepStatus = "idle" | "loading" | "ready" | "error";
