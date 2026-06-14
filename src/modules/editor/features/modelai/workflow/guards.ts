// @ts-nocheck
import type {
  WorkflowCommandContext,
  WorkflowCommandDefinition,
  WorkflowGuardResult,
  WorkflowGuardReturn,
  WorkflowStepTransitionContext,
  WorkflowStrategy
} from "./types";

function normalizeGuardResult(
  result: WorkflowGuardReturn,
  fallback: Omit<WorkflowGuardResult, "ok">
): WorkflowGuardResult {
  if (typeof result === "boolean") {
    return result ? { ok: true } : { ok: false, ...fallback };
  }

  return result.ok ? { ok: true } : { ok: false, ...fallback, ...result };
}

export function canEnterStep(
  strategy: WorkflowStrategy,
  ctx: WorkflowStepTransitionContext
): WorkflowGuardResult {
  return normalizeGuardResult(strategy.canEnterStep(ctx), {
    reasonKey: "modelai.workbench.workflow.guards.stepEnterRejected",
    reason: "workflow strategy rejected step enter"
  });
}

export function canLeaveStep(
  strategy: WorkflowStrategy,
  ctx: WorkflowStepTransitionContext
): WorkflowGuardResult {
  if (ctx.state.runningCommandKey) {
    return {
      ok: false,
      reasonKey: "modelai.workbench.workflow.guards.commandRunning",
      reason: "workflow command is running"
    };
  }

  return normalizeGuardResult(strategy.canLeaveStep(ctx), {
    reasonKey: "modelai.workbench.workflow.guards.stepLeaveRejected",
    reason: "workflow strategy rejected step leave"
  });
}

export function canRunCommand(
  command: WorkflowCommandDefinition,
  canUseViewportActions: boolean,
  strategy: WorkflowStrategy,
  ctx: WorkflowCommandContext
): WorkflowGuardResult {
  if (command.requiresViewport && !canUseViewportActions) {
    return {
      ok: false,
      reasonKey: "modelai.workbench.workflow.guards.viewportNotReady",
      reason: "viewport is not ready"
    };
  }

  if (ctx.state.runningCommandKey) {
    return {
      ok: false,
      reasonKey: "modelai.workbench.workflow.guards.commandRunning",
      reason: "workflow command is running"
    };
  }

  return normalizeGuardResult(strategy.canRunCommand(ctx), {
    reasonKey: "modelai.workbench.workflow.guards.commandRejected",
    reason: "workflow strategy rejected command"
  });
}
