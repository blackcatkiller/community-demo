// @ts-nocheck
import type {
  CommandKey,
  WorkflowRuntimeState,
  WorkflowStepCache,
  WorkflowStepKey
} from "./types";

export function getStepCache(
  state: WorkflowRuntimeState,
  stepKey: WorkflowStepKey
): WorkflowStepCache {
  const cache = state.cache[stepKey] ?? {};
  state.cache[stepKey] = cache;
  return cache;
}

export function patchStepCache(
  state: WorkflowRuntimeState,
  stepKey: WorkflowStepKey,
  patch: Partial<WorkflowStepCache>
): void {
  Object.assign(getStepCache(state, stepKey), patch);
}

export function rememberCommandSelection(
  state: WorkflowRuntimeState,
  stepKey: WorkflowStepKey,
  commandKey: CommandKey
): void {
  patchStepCache(state, stepKey, {
    selectedCommandKey: commandKey,
    lastCommandKey: commandKey
  });
}
