// @ts-nocheck
import type { Component } from "vue";
import type { GraphData, NodeStatus } from "@modelai/ui/nodeGraph";

export type WorkflowMode = "dfm" | "moldflow";

export type WorkflowStepKey =
  | "dfm.alignAnalysis"
  | "dfm.parting"
  | "dfm.slider"
  | "dfm.splitMold"
  | "dfm.insert"
  | "moldflow.gateSetup"
  | "moldflow.partPlacement"
  | "moldflow.runnerSetup";

export type WorkflowStepStatus =
  | "idle"
  | "blocked"
  | "ready"
  | "running"
  | "success"
  | "failed"
  | "dirty";

export type WorkflowArtifactKey = string;

export type CommandGroupKey =
  | "workpiece"
  | "file"
  | "gate"
  | "runner"
  | "measure"
  | "positioning"
  | "stepCommand"
  | "stepResult"
  | "tailActions"
  | "debug";

export type CommandKey =
  | "importWorkpiece"
  | "autoAlign"
  | "planarAlign"
  | "manualAlign"
  | "saveAs"
  | "measureLength"
  | "measureAngle"
  | "measureConnectivity"
  | "measureSlope"
  | "navPan"
  | "navRotate"
  | "rotateArray"
  | "translateArray"
  | "copy"
  | "mirror"
  | "move"
  | "rotate"
  | "modelArrayCopy"
  | "executeParting"
  | "executeSlider"
  | "executeSplitMold"
  | "executeInsert"
  | "viewResult"
  | "pinPointGate"
  | "hotTipGate"
  | "subGate"
  | "hornGate"
  | "partingRunner"
  | "verticalRunner"
  | "horizontalRunner"
  | "mainRunner"
  | "apiTest";

export type WorkflowCommandAction =
  | "import"
  | "showPlaceholder"
  | "executeCommand"
  | "navPan"
  | "navRotate"
  | "runWorkflowTask"
  | "viewWorkflowResult"
  | "openApiTest";

export type TranslateFn = (
  key: string,
  named?: Record<string, string | number>
) => string;

export interface WorkflowCommandDefinition {
  key: CommandKey;
  labelKey: string;
  tooltipKey: string;
  icon?: Component;
  action: WorkflowCommandAction;
  payload?: unknown;
  requiresViewport?: boolean;
  workflowTask?: WorkflowCommandTaskDefinition;
}

export interface WorkflowCommandTaskDefinition {
  stepKey?: WorkflowStepKey;
  artifactKey?: WorkflowArtifactKey;
}

export interface WorkflowCommandGroupDefinition {
  key: CommandGroupKey;
  labelKey?: string;
  commands: CommandKey[];
}

export interface WorkflowStepDefinition {
  key: WorkflowStepKey;
  labelKey: string;
  sceneNodeId?: string;
  groups: CommandGroupKey[];
}

export interface WorkflowDefinition {
  key: WorkflowMode;
  steps: WorkflowStepDefinition[];
}

export interface WorkflowStepRuntime {
  key: WorkflowStepKey;
  status: WorkflowStepStatus;
  activeCommandKey?: CommandKey;
  error?: string;
  enteredAt?: number;
  startedAt?: number;
  finishedAt?: number;
  updatedAt?: number;
  dirtyReason?: string;
}

export interface WorkflowStepCache {
  selectedCommandKey?: CommandKey;
  lastCommandKey?: CommandKey;
  lastModelaiCommandName?: string;
  lastCommandStatus?: "success" | "cancel" | "fail";
  lastError?: string;
  lastResult?: unknown;
  messages?: unknown[];
  params?: Record<string, unknown>;
  previewState?: Record<string, unknown>;
}

export interface WorkflowRuntimeState {
  mode: WorkflowMode;
  currentStepKey: WorkflowStepKey;
  steps: Record<string, WorkflowStepRuntime>;
  artifacts: Partial<Record<WorkflowArtifactKey, unknown>>;
  cache: Partial<Record<WorkflowStepKey, WorkflowStepCache>>;
  runningCommandKey?: CommandKey;
  runningStepKey?: WorkflowStepKey;
}

export interface WorkflowRuntimeSnapshot {
  currentStepKey: WorkflowStepKey;
  steps: Partial<Record<WorkflowStepKey, WorkflowStepRuntime>>;
  artifacts: Partial<Record<WorkflowArtifactKey, unknown>>;
  cache: Partial<Record<WorkflowStepKey, WorkflowStepCache>>;
}

export interface WorkflowGuardResult {
  ok: boolean;
  reasonKey?: string;
  reason?: string;
}

export type WorkflowGuardReturn = boolean | WorkflowGuardResult;

export type WorkflowStepDirection =
  | "same"
  | "forward"
  | "backward"
  | "jumpForward"
  | "jumpBackward";

export interface WorkflowCommandContext {
  state: WorkflowRuntimeState;
  mode: WorkflowMode;
  currentStepKey: WorkflowStepKey;
  commandKey: CommandKey;
  editor?: unknown;
  workflow?: unknown;
  event?: unknown;
}

export interface WorkflowStepTransitionContext {
  state: WorkflowRuntimeState;
  mode: WorkflowMode;
  fromStepKey: WorkflowStepKey;
  toStepKey: WorkflowStepKey;
  direction: WorkflowStepDirection;
  editor?: unknown;
  workflow?: unknown;
  event?: unknown;
}

export interface WorkflowStepCleanupContext {
  state: WorkflowRuntimeState;
  mode: WorkflowMode;
  stepKey: WorkflowStepKey;
  editor?: unknown;
  workflow?: unknown;
  event?: unknown;
}

export interface WorkflowStrategy {
  canRunCommand: (ctx: WorkflowCommandContext) => WorkflowGuardReturn;
  canEnterStep: (ctx: WorkflowStepTransitionContext) => WorkflowGuardReturn;
  canLeaveStep: (ctx: WorkflowStepTransitionContext) => WorkflowGuardReturn;
  onEnterStep?: (ctx: WorkflowStepTransitionContext) => void | Promise<void>;
  onLeaveStep?: (ctx: WorkflowStepTransitionContext) => void | Promise<void>;
  cleanupStep?: (ctx: WorkflowStepCleanupContext) => void | Promise<void>;
}

export interface WorkflowTopBarButton {
  key: CommandKey;
  label?: string;
  tooltip?: string;
  icon?: Component;
  action?: WorkflowCommandAction;
  payload?: unknown;
  workflowTask?: WorkflowCommandTaskDefinition;
  disabled?: boolean;
  active?: boolean;
}

export interface WorkflowTopBarGroup {
  key: CommandGroupKey;
  label?: string;
  buttons: WorkflowTopBarButton[];
}

export interface WorkflowSelectStepResult extends WorkflowGuardResult {
  step?: WorkflowStepDefinition;
}

export interface WorkflowCommandPrepareResult extends WorkflowGuardResult {
  command?: WorkflowCommandDefinition;
}

export type WorkflowGraphData = GraphData;
export type WorkflowGraphNodeStatus = NodeStatus;
