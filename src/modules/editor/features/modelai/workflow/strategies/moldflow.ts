// @ts-nocheck
import { GroupNode } from "@modelai/model/node";
import { WorkpieceNode } from "@modelai/model/workpieceNode";
import { HornGateNode } from "@/features/modelai/gates/horn/hornGateNode";
import { HotTipGateNode } from "@/features/modelai/gates/hotTip/hotTipGateNode";
import { PinPointGateNode } from "@/features/modelai/gates/pinPoint/pinPointGateNode";
import { SubGateNode } from "@/features/modelai/gates/sub/subGateNode";
import type { INode, INodeLinkedList } from "@modelai/core/types";
import type { WorkflowGuardResult, WorkflowStrategy } from "../types";

const PART_PLACEMENT_STEP = "moldflow.partPlacement";
const RUNNER_SETUP_STEP = "moldflow.runnerSetup";
const VERTICAL_RUNNER_COMMAND = "create.verticalRunner";
const GATE_READY_REQUIRED_RESULT = {
  ok: false,
  reasonKey: "modelai.workbench.workflow.guards.moldflowGateFolderRequired"
} as const;

type PushPlatePlaneEditor = {
  showPushPlatePlane?: () => void;
  hidePushPlatePlane?: () => void;
  executeCommand?: (commandKey: string) => void;
};

function getPushPlatePlaneEditor(editor: unknown) {
  if (!editor || typeof editor !== "object") return undefined;
  return editor as PushPlatePlaneEditor;
}

function showPushPlatePlane(editor: unknown) {
  getPushPlatePlaneEditor(editor)?.showPushPlatePlane?.();
}

function hidePushPlatePlane(editor: unknown) {
  getPushPlatePlaneEditor(editor)?.hidePushPlatePlane?.();
}

function executeVerticalRunner(editor: unknown) {
  const app = getPushPlatePlaneEditor(editor);
  if (!app?.executeCommand) return;

  globalThis.setTimeout(() => {
    app.executeCommand?.(VERTICAL_RUNNER_COMMAND);
  }, 0);
}

function isGateNode(node: INode) {
  return (
    node instanceof PinPointGateNode ||
    node instanceof HotTipGateNode ||
    node instanceof SubGateNode ||
    node instanceof HornGateNode
  );
}

function getChildren(parent: INodeLinkedList): INode[] {
  const result: INode[] = [];
  let child = parent.firstChild;
  while (child) {
    result.push(child);
    child = child.nextSibling;
  }
  return result;
}

function hasGateUnderSameNamedWorkpieceFolder(editor: unknown) {
  const app = getPushPlatePlaneEditor(editor) as
    | {
        document?: {
          modelManager?: {
            rootNode?: INodeLinkedList;
          };
        };
      }
    | undefined;
  const rootNode = app?.document?.modelManager?.rootNode;
  if (!rootNode) return false;

  const topLevelFolders = getChildren(rootNode).filter(
    node => node instanceof GroupNode
  ) as GroupNode[];

  return topLevelFolders.some(folder => {
    const folderChildren = getChildren(folder);
    const hasWorkpiece = folderChildren.some(
      node => node instanceof WorkpieceNode
    );
    const hasGate = folderChildren.some(isGateNode);
    return hasWorkpiece && hasGate;
  });
}

function canEnterMoldflowStep(
  ctx: Parameters<WorkflowStrategy["canEnterStep"]>[0]
): true | WorkflowGuardResult {
  if (
    ctx.toStepKey !== PART_PLACEMENT_STEP &&
    ctx.toStepKey !== RUNNER_SETUP_STEP
  ) {
    return true;
  }

  return hasGateUnderSameNamedWorkpieceFolder(ctx.editor)
    ? true
    : GATE_READY_REQUIRED_RESULT;
}

export const moldflowWorkflowStrategy: WorkflowStrategy = {
  canRunCommand: () => true,
  canEnterStep: canEnterMoldflowStep,
  canLeaveStep: () => true,
  onEnterStep: ctx => {
    if (ctx.toStepKey === RUNNER_SETUP_STEP) {
      showPushPlatePlane(ctx.editor);
      executeVerticalRunner(ctx.editor);
    }
  },
  onLeaveStep: ctx => {
    if (ctx.fromStepKey === RUNNER_SETUP_STEP) {
      hidePushPlatePlane(ctx.editor);
    }
  },
  cleanupStep: ctx => {
    if (ctx.stepKey === RUNNER_SETUP_STEP) {
      hidePushPlatePlane(ctx.editor);
    }
  }
};
