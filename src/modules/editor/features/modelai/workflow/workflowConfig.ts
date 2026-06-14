// @ts-nocheck
import type {
  WorkflowDefinition,
  WorkflowMode,
  WorkflowStepKey
} from "./types";

export const WORKFLOWS: Record<WorkflowMode, WorkflowDefinition> = {
  dfm: {
    key: "dfm",
    steps: [
      {
        key: "dfm.alignAnalysis",
        labelKey: "modelai.workbench.workflow.steps.dfmAlignAnalysis",
        sceneNodeId: "鎽嗘",
        groups: ["workpiece", "measure"]
      },
      {
        key: "dfm.parting",
        labelKey: "modelai.workbench.workflow.steps.dfmParting",
        sceneNodeId: "鍒嗗瀷",
        groups: ["measure", "stepCommand", "stepResult"]
      },
      {
        key: "dfm.slider",
        labelKey: "modelai.workbench.workflow.steps.dfmSlider",
        sceneNodeId: "婊戝潡",
        groups: ["measure", "stepCommand", "stepResult"]
      },
      {
        key: "dfm.splitMold",
        labelKey: "modelai.workbench.workflow.steps.dfmSplitMold",
        sceneNodeId: "鍒嗘ā",
        groups: ["measure", "stepCommand", "stepResult"]
      },
      {
        key: "dfm.insert",
        labelKey: "modelai.workbench.workflow.steps.dfmInsert",
        sceneNodeId: "鎷嗗垎闀朵欢",
        groups: ["measure", "stepCommand", "stepResult"]
      }
    ]
  },
  moldflow: {
    key: "moldflow",
    steps: [
      {
        key: "moldflow.gateSetup",
        labelKey: "modelai.workbench.workflow.steps.moldflowGateSetup",
        groups: ["workpiece", "gate", "measure"]
      },
      {
        key: "moldflow.partPlacement",
        labelKey: "modelai.workbench.workflow.steps.moldflowPartPlacement",
        groups: ["positioning", "measure"]
      },
      {
        key: "moldflow.runnerSetup",
        labelKey: "modelai.workbench.workflow.steps.moldflowRunnerSetup",
        groups: ["runner", "measure"]
      }
    ]
  }
};

export function normalizeWorkflowMode(rawMode: unknown): WorkflowMode {
  if (typeof rawMode !== "string") return "dfm";
  const value = rawMode.trim().toLowerCase();
  if (value === "moldflow") return "moldflow";
  if (value === "design" || value === "dfm") return "dfm";
  return "dfm";
}

export function getWorkflowDefinition(mode: WorkflowMode): WorkflowDefinition {
  return WORKFLOWS[mode];
}

export function getDefaultWorkflowStep(mode: WorkflowMode): WorkflowStepKey {
  return WORKFLOWS[mode].steps[0].key;
}

export function getWorkflowSceneNodeId(
  mode: WorkflowMode,
  stepKey: WorkflowStepKey
): string | undefined {
  return WORKFLOWS[mode].steps.find(step => step.key === stepKey)?.sceneNodeId;
}
