// @ts-nocheck
import type {
  ModelAIResolvedVisualTheme,
  ModelAISkinMode,
  ModelAIVisualThemeOverrides
} from "./contracts";
import { DEFAULT_MODEL_AI_SKIN_MODE, modelAIVisualThemes } from "./themes";

export function resolveModelAIVisualTheme(
  mode: ModelAISkinMode = DEFAULT_MODEL_AI_SKIN_MODE,
  overrides?: ModelAIVisualThemeOverrides
): ModelAIResolvedVisualTheme {
  const theme = modelAIVisualThemes[mode] ?? modelAIVisualThemes.dark;
  return {
    mode,
    visual: {
      ...theme.visual,
      ...overrides?.visual
    },
    tempMeshEmphasis: {
      ...theme.tempMeshEmphasis,
      ...overrides?.tempMeshEmphasis
    }
  };
}
