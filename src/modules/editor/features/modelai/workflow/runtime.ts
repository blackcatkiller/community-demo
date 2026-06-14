// @ts-nocheck
import { computed, reactive, unref, watch } from "vue";
import type { MaybeRefOrGetter } from "vue";
import { COMMAND_GROUPS, COMMAND_META, getCommandGroup } from "./commandConfig";
import { buildWorkflowGraphData } from "./graph";
import { canEnterStep, canLeaveStep, canRunCommand } from "./guards";
import {
  getStepCache,
  patchStepCache,
  rememberCommandSelection
} from "./cache";
import { dfmWorkflowStrategy } from "./strategies/dfm";
import { moldflowWorkflowStrategy } from "./strategies/moldflow";
import {
  getDefaultWorkflowStep,
  getWorkflowDefinition,
  getWorkflowSceneNodeId
} from "./workflowConfig";
import type {
  CommandKey,
  TranslateFn,
  WorkflowArtifactKey,
  WorkflowCommandDefinition,
  WorkflowCommandPrepareResult,
  WorkflowGuardResult,
  WorkflowMode,
  WorkflowRuntimeSnapshot,
  WorkflowRuntimeState,
  WorkflowSelectStepResult,
  WorkflowStepDirection,
  WorkflowStepCache,
  WorkflowStepKey,
  WorkflowStepRuntime,
  WorkflowStepStatus,
  WorkflowStrategy,
  WorkflowTopBarButton,
  WorkflowTopBarGroup
} from "./types";

const WORKFLOW_STRATEGIES: Record<WorkflowMode, WorkflowStrategy> = {
  dfm: dfmWorkflowStrategy,
  moldflow: moldflowWorkflowStrategy
};

interface WorkflowRuntimeOptions {
  mode: MaybeRefOrGetter<WorkflowMode>;
  canUseViewportActions: MaybeRefOrGetter<boolean>;
  editor?: MaybeRefOrGetter<unknown>;
  workflow?: MaybeRefOrGetter<unknown>;
}

interface UseWorkflowRuntimeOptions extends WorkflowRuntimeOptions {
  t: TranslateFn;
}

function getValue<T>(value: MaybeRefOrGetter<T>): T {
  if (typeof value === "function") {
    return (value as () => T)();
  }

  return unref(value);
}

function createStepRuntime(
  key: WorkflowStepKey,
  status: WorkflowStepStatus
): WorkflowStepRuntime {
  return {
    key,
    status,
    updatedAt: Date.now()
  };
}

function getInitialStepStatus(): WorkflowStepStatus {
  return "ready";
}

function buildButton(
  commandKey: CommandKey,
  t: TranslateFn,
  disabled: boolean,
  active: boolean
): WorkflowTopBarButton {
  const meta = COMMAND_META[commandKey];
  return {
    key: meta.key,
    label: t(meta.labelKey),
    tooltip: t(meta.tooltipKey),
    icon: meta.icon,
    action: meta.action,
    payload: meta.payload,
    workflowTask: meta.workflowTask,
    disabled,
    active
  };
}

export class ModelAIWorkflowRuntime {
  readonly state: WorkflowRuntimeState;
  private enteredStepKey: string | undefined;

  constructor(private readonly options: WorkflowRuntimeOptions) {
    const initialMode = this.getMode();
    this.state = reactive<WorkflowRuntimeState>({
      mode: initialMode,
      currentStepKey: getDefaultWorkflowStep(initialMode),
      steps: {},
      artifacts: {},
      cache: {}
    });

    this.ensureModeSteps(initialMode);
    this.refreshStepStatuses();
  }

  get mode() {
    return this.state.mode;
  }

  get currentStepKey() {
    return this.state.currentStepKey;
  }

  get currentStep() {
    return getWorkflowDefinition(this.state.mode).steps.find(
      step => step.key === this.state.currentStepKey
    );
  }

  // The current product path treats mode updates as initialization/file-entry
  // sync. Runtime business mode switching should be introduced explicitly later.
  syncMode(mode: WorkflowMode) {
    this.state.mode = mode;
    this.enteredStepKey = undefined;
    this.ensureModeSteps(mode);

    const workflow = getWorkflowDefinition(mode);
    const stepExists = workflow.steps.some(
      step => step.key === this.state.currentStepKey
    );
    if (!stepExists) {
      this.state.currentStepKey = getDefaultWorkflowStep(mode);
    }

    this.refreshStepStatuses();
  }

  buildGraphData(t: TranslateFn) {
    return buildWorkflowGraphData(
      this.state.mode,
      this.state.currentStepKey,
      this.state,
      t
    );
  }

  buildTopBarGroups(t: TranslateFn): WorkflowTopBarGroup[] {
    const step =
      this.currentStep ?? getWorkflowDefinition(this.state.mode).steps[0];
    const groups = step.groups.map(groupKey => {
      const definition = getCommandGroup(groupKey, step.key);

      return {
        key: definition.key,
        label: definition.labelKey ? t(definition.labelKey) : undefined,
        buttons: definition.commands.map(commandKey =>
          buildButton(
            commandKey,
            t,
            !this.getCommandGuard(commandKey).ok,
            this.state.runningCommandKey === commandKey
          )
        )
      };
    });
    return [
      ...groups,
      {
        key: COMMAND_GROUPS.debug.key,
        buttons: COMMAND_GROUPS.debug.commands.map(commandKey =>
          buildButton(
            commandKey,
            t,
            !this.getCommandGuard(commandKey).ok,
            this.state.runningCommandKey === commandKey
          )
        )
      },
      {
        key: COMMAND_GROUPS.tailActions.key,
        buttons: COMMAND_GROUPS.tailActions.commands.map(commandKey =>
          buildButton(
            commandKey,
            t,
            !this.getCommandGuard(commandKey).ok,
            this.state.runningCommandKey === commandKey
          )
        )
      }
    ];
  }

  async selectStep(stepKey: string): Promise<WorkflowSelectStepResult> {
    const workflow = getWorkflowDefinition(this.state.mode);
    const nextStep = workflow.steps.find(step => step.key === stepKey);
    if (!nextStep) return { ok: false, reason: "unknown workflow step" };

    if (nextStep.key === this.state.currentStepKey) {
      return { ok: true, step: nextStep };
    }

    const ctx = this.createTransitionContext(nextStep.key);
    const strategy = this.getStrategy();
    const leaveGuard = canLeaveStep(strategy, ctx);
    if (!leaveGuard.ok) return leaveGuard;

    const enterGuard = canEnterStep(strategy, ctx);
    if (!enterGuard.ok) return enterGuard;

    let switched = false;
    try {
      await strategy.onLeaveStep?.(ctx);
      this.setCurrentStep(nextStep.key);
      switched = true;
      await strategy.onEnterStep?.(ctx);
      this.markCurrentStepEntered();
    } catch (error) {
      if (switched) {
        this.setCurrentStep(ctx.fromStepKey);
      }
      const reason = this.getErrorMessage(
        error,
        "workflow step transition failed"
      );
      patchStepCache(this.state, switched ? ctx.toStepKey : ctx.fromStepKey, {
        lastError: reason
      });
      return {
        ok: false,
        reasonKey: "modelai.workbench.workflow.guards.transitionFailed",
        reason
      };
    }

    return { ok: true, step: nextStep };
  }

  async enterCurrentStep(event?: unknown): Promise<WorkflowSelectStepResult> {
    const step = this.currentStep;
    if (!step) return { ok: false, reason: "current workflow step not found" };

    const enteredStepKey = this.getCurrentEnteredStepKey();
    if (this.enteredStepKey === enteredStepKey) {
      return { ok: true, step };
    }

    const ctx = this.createTransitionContext(this.state.currentStepKey, event);
    const strategy = this.getStrategy();
    const enterGuard = canEnterStep(strategy, ctx);
    if (!enterGuard.ok) return enterGuard;

    try {
      this.setCurrentStep(this.state.currentStepKey);
      await strategy.onEnterStep?.(ctx);
      this.enteredStepKey = enteredStepKey;
    } catch (error) {
      const reason = this.getErrorMessage(error, "workflow step entry failed");
      patchStepCache(this.state, this.state.currentStepKey, {
        lastError: reason
      });
      return {
        ok: false,
        reasonKey: "modelai.workbench.workflow.guards.transitionFailed",
        reason
      };
    }

    return { ok: true, step };
  }

  async goNext(): Promise<WorkflowSelectStepResult> {
    const nextStep = this.getRelativeStep(1);
    if (!nextStep) return { ok: false, reason: "next workflow step not found" };
    return this.selectStep(nextStep);
  }

  async goPrevious(): Promise<WorkflowSelectStepResult> {
    const previousStep = this.getRelativeStep(-1);
    if (!previousStep) {
      return { ok: false, reason: "previous workflow step not found" };
    }
    return this.selectStep(previousStep);
  }

  prepareCommand(commandKey: string): WorkflowCommandPrepareResult {
    const command = COMMAND_META[commandKey as CommandKey];
    if (!command) return { ok: false, reason: "unknown workflow command" };

    const guard = this.getCommandGuard(command.key);
    if (!guard.ok) return guard;

    rememberCommandSelection(
      this.state,
      this.state.currentStepKey,
      command.key
    );
    return { ok: true, command };
  }

  updateArtifacts(artifacts: Partial<Record<WorkflowArtifactKey, unknown>>) {
    Object.assign(this.state.artifacts, artifacts);
    this.refreshStepStatuses();
  }

  hydrate(snapshot: WorkflowRuntimeSnapshot) {
    const workflow = getWorkflowDefinition(this.state.mode);
    const stepKeys = new Set(workflow.steps.map(step => step.key));
    const currentStepKey = stepKeys.has(snapshot.currentStepKey)
      ? snapshot.currentStepKey
      : getDefaultWorkflowStep(this.state.mode);

    this.state.currentStepKey = currentStepKey;
    this.enteredStepKey = undefined;
    this.state.artifacts = { ...snapshot.artifacts };
    this.state.cache = {};
    this.state.steps = {};
    this.state.runningCommandKey = undefined;
    this.state.runningStepKey = undefined;

    workflow.steps.forEach(step => {
      const runtime = snapshot.steps[step.key];
      this.state.steps[step.key] = runtime
        ? { ...runtime, activeCommandKey: undefined }
        : createStepRuntime(step.key, getInitialStepStatus());
      this.state.cache[step.key] = {
        ...(snapshot.cache[step.key] ?? {})
      };
    });

    this.refreshStepStatuses();
  }

  snapshot(): WorkflowRuntimeSnapshot {
    const workflow = getWorkflowDefinition(this.state.mode);
    const steps: WorkflowRuntimeSnapshot["steps"] = {};
    const cache: WorkflowRuntimeSnapshot["cache"] = {};

    workflow.steps.forEach(step => {
      const runtime = this.state.steps[step.key];
      if (runtime) {
        steps[step.key] = { ...runtime, activeCommandKey: undefined };
      }
      cache[step.key] = { ...(this.state.cache[step.key] ?? {}) };
    });

    return {
      currentStepKey: this.state.currentStepKey,
      steps,
      artifacts: { ...this.state.artifacts },
      cache
    };
  }

  setStepStatus(stepKey: WorkflowStepKey, status: WorkflowStepStatus) {
    const runtime = this.state.steps[stepKey];
    if (!runtime) return;
    runtime.status = status;
    runtime.updatedAt = Date.now();
  }

  markCommandStarted(commandName: string) {
    const commandKey = this.getCommandKeyByModelaiCommandName(commandName);
    if (!commandKey) return;

    const stepKey = this.state.currentStepKey;
    const now = Date.now();
    this.state.runningCommandKey = commandKey;
    this.state.runningStepKey = stepKey;

    const runtime = this.state.steps[stepKey];
    if (runtime) {
      runtime.activeCommandKey = commandKey;
      runtime.startedAt = now;
      runtime.updatedAt = now;
    }

    patchStepCache(this.state, stepKey, {
      lastCommandKey: commandKey,
      lastModelaiCommandName: commandName,
      lastCommandStatus: undefined,
      lastError: undefined
    });
  }

  markCommandFinished(
    commandName: string,
    status: "success" | "cancel" | "fail"
  ) {
    const commandKey = this.getCommandKeyByModelaiCommandName(commandName);
    const runningCommandKey = this.state.runningCommandKey;
    if (runningCommandKey && commandKey !== runningCommandKey) {
      return;
    }

    const stepKey = this.state.runningStepKey ?? this.state.currentStepKey;
    const now = Date.now();
    patchStepCache(this.state, stepKey, {
      lastCommandKey: commandKey,
      lastModelaiCommandName: commandName,
      lastCommandStatus: status,
      lastError: status === "fail" ? commandName : undefined
    });

    const runtime = this.state.steps[stepKey];
    if (runtime) {
      if (!commandKey || runtime.activeCommandKey === commandKey) {
        runtime.activeCommandKey = undefined;
      }
      runtime.finishedAt = now;
      runtime.updatedAt = now;
    }

    if (!commandKey || runningCommandKey === commandKey) {
      this.state.runningCommandKey = undefined;
      this.state.runningStepKey = undefined;
    }
  }

  markWorkflowTaskStarted(commandKey: string): WorkflowGuardResult {
    const command = COMMAND_META[commandKey as CommandKey];
    if (!command?.workflowTask) {
      return { ok: false, reason: "unknown workflow task" };
    }

    const guard = this.getCommandGuard(command.key);
    if (!guard.ok) return guard;

    const stepKey = command.workflowTask.stepKey ?? this.state.currentStepKey;
    const runtime = this.state.steps[stepKey];
    if (!runtime) {
      return { ok: false, reason: "workflow task step not found" };
    }

    if (command.workflowTask.artifactKey) {
      delete this.state.artifacts[command.workflowTask.artifactKey];
    }

    const now = Date.now();
    this.state.runningCommandKey = command.key;
    this.state.runningStepKey = stepKey;
    runtime.activeCommandKey = command.key;
    runtime.status = "running";
    runtime.startedAt = now;
    runtime.updatedAt = now;
    runtime.error = undefined;

    rememberCommandSelection(this.state, stepKey, command.key);
    patchStepCache(this.state, stepKey, {
      lastCommandKey: command.key,
      lastCommandStatus: undefined,
      lastError: undefined,
      lastResult: undefined
    });

    return { ok: true };
  }

  markWorkflowTaskSucceeded(commandKey: string, result?: unknown) {
    this.finishWorkflowTask(commandKey, "success", result);
  }

  markWorkflowTaskFailed(commandKey: string, error?: unknown) {
    this.finishWorkflowTask(commandKey, "fail", error);
  }

  patchStepCache(stepKey: WorkflowStepKey, patch: Partial<WorkflowStepCache>) {
    patchStepCache(this.state, stepKey, patch);
  }

  async cleanupStep(stepKey: WorkflowStepKey) {
    await this.getStrategy().cleanupStep?.({
      state: this.state,
      mode: this.state.mode,
      stepKey,
      editor: this.getOptionalValue(this.options.editor),
      workflow: this.getOptionalValue(this.options.workflow)
    });
  }

  async dispose() {
    const stepKeys = Object.keys(this.state.steps) as WorkflowStepKey[];
    await Promise.all(stepKeys.map(stepKey => this.cleanupStep(stepKey)));
  }

  getWorkflowSceneNodeId(stepKey: WorkflowStepKey) {
    return getWorkflowSceneNodeId(this.state.mode, stepKey);
  }

  private getCommandGuard(commandKey: CommandKey) {
    return canRunCommand(
      COMMAND_META[commandKey],
      this.getCanUseViewportActions(),
      this.getStrategy(),
      {
        state: this.state,
        mode: this.state.mode,
        currentStepKey: this.state.currentStepKey,
        commandKey,
        editor: this.getOptionalValue(this.options.editor),
        workflow: this.getOptionalValue(this.options.workflow)
      }
    );
  }

  private createTransitionContext(toStepKey: WorkflowStepKey, event?: unknown) {
    return {
      state: this.state,
      mode: this.state.mode,
      fromStepKey: this.state.currentStepKey,
      toStepKey,
      direction: this.getStepDirection(this.state.currentStepKey, toStepKey),
      editor: this.getOptionalValue(this.options.editor),
      workflow: this.getOptionalValue(this.options.workflow),
      event
    };
  }

  private markCurrentStepEntered() {
    this.enteredStepKey = this.getCurrentEnteredStepKey();
  }

  private getCurrentEnteredStepKey() {
    return `${this.state.mode}:${this.state.currentStepKey}`;
  }

  private getStepDirection(
    fromStepKey: WorkflowStepKey,
    toStepKey: WorkflowStepKey
  ): WorkflowStepDirection {
    if (fromStepKey === toStepKey) return "same";

    const steps = getWorkflowDefinition(this.state.mode).steps;
    const fromIndex = steps.findIndex(step => step.key === fromStepKey);
    const toIndex = steps.findIndex(step => step.key === toStepKey);
    if (fromIndex < 0 || toIndex < 0) return "same";

    const distance = toIndex - fromIndex;
    if (distance === 1) return "forward";
    if (distance === -1) return "backward";
    return distance > 0 ? "jumpForward" : "jumpBackward";
  }

  private setCurrentStep(stepKey: WorkflowStepKey) {
    const now = Date.now();
    this.state.currentStepKey = stepKey;
    const runtime = this.state.steps[stepKey];
    if (runtime) {
      runtime.enteredAt = now;
      runtime.updatedAt = now;
    }
  }

  private getRelativeStep(offset: number) {
    const steps = getWorkflowDefinition(this.state.mode).steps;
    const currentIndex = steps.findIndex(
      step => step.key === this.state.currentStepKey
    );
    return steps[currentIndex + offset]?.key;
  }

  private ensureModeSteps(mode: WorkflowMode) {
    const workflow = getWorkflowDefinition(mode);
    const nextStepKeys = new Set(workflow.steps.map(step => step.key));

    Object.keys(this.state.steps).forEach(stepKey => {
      if (!nextStepKeys.has(stepKey as WorkflowStepKey)) {
        delete this.state.steps[stepKey];
        delete this.state.cache[stepKey as WorkflowStepKey];
      }
    });

    workflow.steps.forEach(step => {
      if (!this.state.steps[step.key]) {
        this.state.steps[step.key] = createStepRuntime(
          step.key,
          getInitialStepStatus()
        );
      }
      getStepCache(this.state, step.key);
    });
  }

  private refreshStepStatuses() {
    const workflow = getWorkflowDefinition(this.state.mode);
    workflow.steps.forEach(step => {
      const runtime =
        this.state.steps[step.key] ??
        createStepRuntime(step.key, getInitialStepStatus());
      const lockedStatus = ["running", "success", "failed", "dirty"].includes(
        runtime.status
      );

      if (!lockedStatus) {
        runtime.status = getInitialStepStatus();
        runtime.updatedAt = Date.now();
      }

      this.state.steps[step.key] = runtime;
    });
  }

  private getStrategy() {
    return WORKFLOW_STRATEGIES[this.state.mode];
  }

  private getCommandKeyByModelaiCommandName(commandName: string) {
    const command = (
      Object.values(COMMAND_META) as WorkflowCommandDefinition[]
    ).find(
      meta => meta.action === "executeCommand" && meta.payload === commandName
    );
    return command?.key;
  }

  private finishWorkflowTask(
    commandKey: string,
    status: "success" | "fail",
    resultOrError?: unknown
  ) {
    const command = COMMAND_META[commandKey as CommandKey];
    if (!command?.workflowTask) return;

    const runningCommandKey = this.state.runningCommandKey;
    if (runningCommandKey && runningCommandKey !== command.key) {
      return;
    }

    const stepKey =
      this.state.runningStepKey ??
      command.workflowTask.stepKey ??
      this.state.currentStepKey;
    const now = Date.now();
    const failed = status === "fail";
    const error = failed
      ? this.getErrorMessage(resultOrError, "workflow task failed")
      : undefined;

    if (!failed && command.workflowTask.artifactKey) {
      this.state.artifacts[command.workflowTask.artifactKey] = resultOrError;
      this.refreshStepStatuses();
    }

    patchStepCache(this.state, stepKey, {
      lastCommandKey: command.key,
      lastCommandStatus: failed ? "fail" : "success",
      lastError: error,
      lastResult: failed ? undefined : resultOrError
    });

    const runtime = this.state.steps[stepKey];
    if (runtime) {
      if (runtime.activeCommandKey === command.key) {
        runtime.activeCommandKey = undefined;
      }
      runtime.status = failed ? "failed" : "success";
      runtime.finishedAt = now;
      runtime.updatedAt = now;
      runtime.error = error;
    }

    if (!runningCommandKey || runningCommandKey === command.key) {
      this.state.runningCommandKey = undefined;
      this.state.runningStepKey = undefined;
    }
  }

  private getMode() {
    return getValue(this.options.mode);
  }

  private getCanUseViewportActions() {
    return getValue(this.options.canUseViewportActions);
  }

  private getOptionalValue<T>(value: MaybeRefOrGetter<T> | undefined) {
    return value === undefined ? undefined : getValue(value);
  }

  private getErrorMessage(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback;
  }
}

export function useWorkflowRuntime(options: UseWorkflowRuntimeOptions) {
  const runtime = new ModelAIWorkflowRuntime(options);

  const currentStepKey = computed(() => runtime.currentStepKey);
  const currentStep = computed(() => runtime.currentStep);
  const graphData = computed(() => runtime.buildGraphData(options.t));
  const topBarGroups = computed(() => runtime.buildTopBarGroups(options.t));

  const stopModeWatch = watch(
    () => getValue(options.mode),
    mode => runtime.syncMode(mode),
    { immediate: true }
  );

  return {
    runtime,
    state: runtime.state,
    currentStepKey,
    currentStep,
    graphData,
    topBarGroups,
    selectStep: (stepKey: string) => runtime.selectStep(stepKey),
    enterCurrentStep: (event?: unknown) => runtime.enterCurrentStep(event),
    goNext: () => runtime.goNext(),
    goPrevious: () => runtime.goPrevious(),
    prepareCommand: (commandKey: string) => runtime.prepareCommand(commandKey),
    updateArtifacts: (
      artifacts: Partial<Record<WorkflowArtifactKey, unknown>>
    ) => runtime.updateArtifacts(artifacts),
    hydrate: (snapshot: WorkflowRuntimeSnapshot) => runtime.hydrate(snapshot),
    snapshot: () => runtime.snapshot(),
    setStepStatus: (stepKey: WorkflowStepKey, status: WorkflowStepStatus) =>
      runtime.setStepStatus(stepKey, status),
    markCommandStarted: (commandName: string) =>
      runtime.markCommandStarted(commandName),
    markCommandFinished: (
      commandName: string,
      status: "success" | "cancel" | "fail"
    ) => runtime.markCommandFinished(commandName, status),
    markWorkflowTaskStarted: (commandKey: string) =>
      runtime.markWorkflowTaskStarted(commandKey),
    markWorkflowTaskSucceeded: (commandKey: string, result?: unknown) =>
      runtime.markWorkflowTaskSucceeded(commandKey, result),
    markWorkflowTaskFailed: (commandKey: string, error?: unknown) =>
      runtime.markWorkflowTaskFailed(commandKey, error),
    cleanupStep: (stepKey: WorkflowStepKey) => runtime.cleanupStep(stepKey),
    dispose: async () => {
      stopModeWatch();
      await runtime.dispose();
    },
    getWorkflowSceneNodeId: (stepKey: WorkflowStepKey) =>
      runtime.getWorkflowSceneNodeId(stepKey)
  };
}
