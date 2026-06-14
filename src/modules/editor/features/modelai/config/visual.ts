// @ts-nocheck
import type {
  ModelAIResolvedVisualTheme,
  ModelAISkinMode,
  ModelAIVisualConfig,
  ModelAIVisualThemeOverrides,
  TempMeshEmphasisConfigShape
} from "./contracts";
import { resolveModelAIVisualTheme } from "./resolve";
import { DEFAULT_MODEL_AI_SKIN_MODE } from "./themes";

const defaultVisualTheme = resolveModelAIVisualTheme(
  DEFAULT_MODEL_AI_SKIN_MODE
);

export const VisualConfig: ModelAIVisualConfig = defaultVisualTheme.visual;

export const TempMeshEmphasisConfig: TempMeshEmphasisConfigShape =
  defaultVisualTheme.tempMeshEmphasis;

export function getModelAIVisualTheme(
  mode: ModelAISkinMode = DEFAULT_MODEL_AI_SKIN_MODE,
  overrides?: ModelAIVisualThemeOverrides
): ModelAIResolvedVisualTheme {
  return resolveModelAIVisualTheme(mode, overrides);
}
