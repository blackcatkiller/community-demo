// @ts-nocheck
import type { GraphData, NodeStatus } from "@modelai/ui/nodeGraph";
import { WORKFLOWS } from "./workflowConfig";
import type {
  TranslateFn,
  WorkflowMode,
  WorkflowRuntimeState,
  WorkflowStepKey,
  WorkflowStepStatus
} from "./types";

function toNodeStatus(
  status: WorkflowStepStatus,
  isCurrent: boolean
): NodeStatus {
  if (status === "success") return "done";
  if (status === "running") return "running";
  if (status === "failed") return "failed";
  if (status === "dirty") return "dirty";
  if (status === "blocked") return "blocked";
  if (isCurrent) return "active";
  return "pending";
}

export function buildWorkflowGraphData(
  mode: WorkflowMode,
  currentStepKey: WorkflowStepKey,
  state: WorkflowRuntimeState,
  t: TranslateFn
): GraphData {
  const workflow = WORKFLOWS[mode];

  return {
    nodes: workflow.steps.map(step => ({
      id: step.key,
      label: t(step.labelKey),
      status: toNodeStatus(
        state.steps[step.key]?.status ?? "idle",
        step.key === currentStepKey
      )
    })),
    edges: workflow.steps.slice(0, -1).map((step, index) => ({
      from: step.key,
      to: workflow.steps[index + 1].key
    }))
  };
}
