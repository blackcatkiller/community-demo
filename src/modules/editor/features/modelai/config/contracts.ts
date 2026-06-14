// @ts-nocheck
export type ModelAISkinMode = "light" | "dark";

export interface ModelAIVisualConfig {
  defaultFaceColor: number;
  defaultEdgeColor: number;
  highlightEdgeColor: number;
  measurementGuideColor: number;
  highlightFaceColor: number;
  snapVertexColor: number;
  snapEdgeColor: number;
  snapFaceColor: number;
  selectedEdgeColor: number;
  selectedFaceColor: number;
  hintVertexSize: number;
  hintVertexColor: number;
  snapHintVertexColor: number;
  trackingVertexSize: number;
  trackingVertexColor: number;
  trackingEdgeColor: number;
  temporaryVertexSize: number;
  temporaryVertexColor: number;
  temporaryEdgeColor: number;
}

export interface TempMeshEmphasisConfigShape {
  color: number;
}

export interface ModelAIResolvedVisualTheme {
  mode: ModelAISkinMode;
  visual: ModelAIVisualConfig;
  tempMeshEmphasis: TempMeshEmphasisConfigShape;
}

export interface ModelAIVisualThemeOverrides {
  visual?: Partial<ModelAIVisualConfig>;
  tempMeshEmphasis?: Partial<TempMeshEmphasisConfigShape>;
}
