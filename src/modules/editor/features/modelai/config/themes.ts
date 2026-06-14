// @ts-nocheck
import type { ModelAIResolvedVisualTheme, ModelAISkinMode } from "./contracts";
import { ModelAIPalette } from "./palette";

export const DEFAULT_MODEL_AI_SKIN_MODE: ModelAISkinMode = "dark";

export const modelAIVisualThemes: Record<
  ModelAISkinMode,
  Omit<ModelAIResolvedVisualTheme, "mode">
> = {
  light: {
    visual: {
      defaultFaceColor: ModelAIPalette.neutral[100],
      defaultEdgeColor: ModelAIPalette.neutral[800],
      highlightEdgeColor: ModelAIPalette.cyan[500],
      measurementGuideColor: ModelAIPalette.blue[600],
      highlightFaceColor: ModelAIPalette.cyan[600],
      snapVertexColor: ModelAIPalette.amber[500],
      snapEdgeColor: ModelAIPalette.yellow[600],
      snapFaceColor: ModelAIPalette.yellow[600],
      // Align normal hover and selection to the same cyan family.
      selectedEdgeColor: ModelAIPalette.cyan[500],
      selectedFaceColor: ModelAIPalette.cyan[600],
      hintVertexSize: 5,
      hintVertexColor: ModelAIPalette.cyan[500],
      snapHintVertexColor: ModelAIPalette.yellow[600],
      trackingVertexSize: 5,
      trackingVertexColor: ModelAIPalette.blue[600],
      trackingEdgeColor: ModelAIPalette.blue[600],
      temporaryVertexSize: 7,
      temporaryVertexColor: ModelAIPalette.amber[500],
      temporaryEdgeColor: ModelAIPalette.magenta[500]
    },
    tempMeshEmphasis: {
      color: ModelAIPalette.magenta[500]
    }
  },
  dark: {
    visual: {
      defaultFaceColor: ModelAIPalette.neutral[100],
      defaultEdgeColor: ModelAIPalette.neutral[800],
      highlightEdgeColor: ModelAIPalette.cyan[400],
      measurementGuideColor: ModelAIPalette.blue[500],
      highlightFaceColor: ModelAIPalette.cyan[500],
      snapVertexColor: ModelAIPalette.amber[500],
      snapEdgeColor: ModelAIPalette.yellow[400],
      snapFaceColor: ModelAIPalette.yellow[400],
      // Align normal hover and selection to the same cyan family.
      selectedEdgeColor: ModelAIPalette.cyan[400],
      selectedFaceColor: ModelAIPalette.cyan[500],
      hintVertexSize: 5,
      hintVertexColor: ModelAIPalette.cyan[400],
      snapHintVertexColor: ModelAIPalette.yellow[400],
      trackingVertexSize: 5,
      trackingVertexColor: ModelAIPalette.blue[500],
      trackingEdgeColor: ModelAIPalette.blue[500],
      temporaryVertexSize: 7,
      temporaryVertexColor: ModelAIPalette.amber[500],
      temporaryEdgeColor: ModelAIPalette.magenta[400]
    },
    tempMeshEmphasis: {
      color: ModelAIPalette.magenta[400]
    }
  }
};
