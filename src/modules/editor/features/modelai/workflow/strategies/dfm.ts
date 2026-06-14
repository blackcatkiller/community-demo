// @ts-nocheck
import type {
  CommandKey,
  WorkflowArtifactKey,
  WorkflowGuardResult,
  WorkflowRuntimeState,
  WorkflowStepKey,
  WorkflowStrategy
} from "../types";

const SOURCE_MODELS_ARTIFACT_KEY: WorkflowArtifactKey = "dfm.sourceModels";

const DFM_STEP_ORDER: WorkflowStepKey[] = [
  "dfm.alignAnalysis",
  "dfm.parting",
  "dfm.slider",
  "dfm.splitMold",
  "dfm.insert"
];

const DFM_EXECUTE_STEP_BY_COMMAND: Partial<
  Record<CommandKey, WorkflowStepKey>
> = {
  executeParting: "dfm.parting",
  executeSlider: "dfm.slider",
  executeSplitMold: "dfm.splitMold",
  executeInsert: "dfm.insert"
};

const DFM_RESULT_ARTIFACT_BY_STEP: Partial<
  Record<WorkflowStepKey, WorkflowArtifactKey>
> = {
  "dfm.parting": "dfm.parting.result",
  "dfm.slider": "dfm.slider.result",
  "dfm.splitMold": "dfm.splitMold.result",
  "dfm.insert": "dfm.insert.result"
};

const WORKPIECE_REQUIRED_RESULT = {
  ok: false,
  reasonKey: "modelai.workbench.renderToolbar.needWorkpieceModel"
} as const;

const PREVIOUS_STEP_REQUIRED_RESULT = {
  ok: false,
  reasonKey: "modelai.workbench.workflow.guards.completePreviousStep"
} as const;

const STEP_COMMAND_REJECTED_RESULT = {
  ok: false,
  reasonKey: "modelai.workbench.workflow.guards.commandRejected"
} as const;

const STEP_RESULT_REQUIRED_RESULT = {
  ok: false,
  reasonKey: "modelai.workbench.workflow.guards.stepResultUnavailable"
} as const;

const TASK_NOT_IMPLEMENTED_RESULT = {
  ok: false,
  reasonKey: "modelai.workbench.workflow.tasks.notImplemented"
} as const;

const COMMANDS_REQUIRING_WORKPIECE = new Set<CommandKey>([
  "autoAlign",
  "planarAlign",
  "manualAlign",
  "executeParting",
  "executeSlider",
  "executeSplitMold",
  "executeInsert"
]);

function hasSingleWorkpieceModel(
  artifact: unknown
): artifact is { sources: unknown[] } {
  return (
    !!artifact &&
    typeof artifact === "object" &&
    "sources" in artifact &&
    Array.isArray(artifact.sources) &&
    artifact.sources.length === 1
  );
}

function getStepIndex(stepKey: WorkflowStepKey) {
  return DFM_STEP_ORDER.indexOf(stepKey);
}

function getPreviousStepKey(stepKey: WorkflowStepKey) {
  const index = getStepIndex(stepKey);
  return index > 0 ? DFM_STEP_ORDER[index - 1] : undefined;
}

function isStepSuccessful(
  state: WorkflowRuntimeState,
  stepKey: WorkflowStepKey | undefined
) {
  if (!stepKey) return true;
  return state.steps[stepKey]?.status === "success";
}

function hasArtifact(
  state: WorkflowRuntimeState,
  artifactKey: WorkflowArtifactKey | undefined
) {
  if (!artifactKey) return false;
  return state.artifacts[artifactKey] !== undefined;
}

function getDfmEditor(editor: unknown) {
  if (!editor || typeof editor !== "object") return undefined;
  return editor as {
    clearDfmResultView?: () => void;
  };
}

function canEnterDfmStep(
  ctx: Parameters<WorkflowStrategy["canEnterStep"]>[0]
): true | WorkflowGuardResult {
  if (ctx.toStepKey === "dfm.alignAnalysis") return true;

  if (
    !hasSingleWorkpieceModel(ctx.state.artifacts[SOURCE_MODELS_ARTIFACT_KEY])
  ) {
    return WORKPIECE_REQUIRED_RESULT;
  }

  return isStepSuccessful(ctx.state, getPreviousStepKey(ctx.toStepKey))
    ? true
    : PREVIOUS_STEP_REQUIRED_RESULT;
}

function canRunDfmWorkflowTask(
  ctx: Parameters<WorkflowStrategy["canRunCommand"]>[0],
  stepKey: WorkflowStepKey
): true | WorkflowGuardResult {
  if (ctx.currentStepKey !== stepKey) {
    return STEP_COMMAND_REJECTED_RESULT;
  }

  if (
    !hasSingleWorkpieceModel(ctx.state.artifacts[SOURCE_MODELS_ARTIFACT_KEY])
  ) {
    return WORKPIECE_REQUIRED_RESULT;
  }

  return isStepSuccessful(ctx.state, getPreviousStepKey(stepKey))
    ? true
    : PREVIOUS_STEP_REQUIRED_RESULT;
}

function canViewDfmStepResult(
  ctx: Parameters<WorkflowStrategy["canRunCommand"]>[0]
): true | WorkflowGuardResult {
  const artifactKey = DFM_RESULT_ARTIFACT_BY_STEP[ctx.currentStepKey];
  if (!artifactKey) return STEP_RESULT_REQUIRED_RESULT;

  const currentStep = ctx.state.steps[ctx.currentStepKey];
  if (currentStep?.status !== "success") return STEP_RESULT_REQUIRED_RESULT;

  return hasArtifact(ctx.state, artifactKey)
    ? true
    : STEP_RESULT_REQUIRED_RESULT;
}

export const dfmWorkflowStrategy: WorkflowStrategy = {
  canRunCommand: ctx => {
    if (ctx.commandKey === "viewResult") {
      return canViewDfmStepResult(ctx);
    }

    if (ctx.commandKey === "executeInsert") {
      return TASK_NOT_IMPLEMENTED_RESULT;
    }

    const taskStepKey = DFM_EXECUTE_STEP_BY_COMMAND[ctx.commandKey];
    if (taskStepKey) {
      return canRunDfmWorkflowTask(ctx, taskStepKey);
    }

    if (!COMMANDS_REQUIRING_WORKPIECE.has(ctx.commandKey)) return true;
    return hasSingleWorkpieceModel(
      ctx.state.artifacts[SOURCE_MODELS_ARTIFACT_KEY]
    )
      ? true
      : WORKPIECE_REQUIRED_RESULT;
  },
  canEnterStep: canEnterDfmStep,
  canLeaveStep: () => true,
  onEnterStep: ctx => {
    getDfmEditor(ctx.editor)?.clearDfmResultView?.();
  }
};
