// @ts-nocheck
import {
  CommandAngleIcon,
  CommandAutoAlignIcon,
  CommandConnectivityIcon,
  CommandCopyIcon,
  CommandDistanceIcon,
  CommandHorizontalRunnerIcon,
  CommandHornGateIcon,
  CommandImportIcon,
  CommandMainRunnerIcon,
  CommandManualAlignIcon,
  CommandMirrorIcon,
  CommandMoveIcon,
  CommandPanRotateIcon,
  CommandPinPointGateIcon,
  CommandPlanarAlignIcon,
  CommandResultIcon,
  CommandRotateArrayIcon,
  CommandRotateIcon,
  CommandStepActionIcon,
  CommandPartingRunnerIcon,
  CommandSubmarineGateIcon,
  CommandTranslateArrayIcon,
  CommandVerticalRunnerIcon,
  CommandSlopeIcon
} from "./commandIcons";
import type {
  CommandGroupKey,
  CommandKey,
  WorkflowCommandDefinition,
  WorkflowCommandGroupDefinition,
  WorkflowStepKey
} from "./types";

export const COMMAND_GROUPS: Record<
  CommandGroupKey,
  WorkflowCommandGroupDefinition
> = {
  workpiece: {
    key: "workpiece",
    labelKey: "modelai.workbench.topbar.groups.workpiece",
    commands: ["importWorkpiece", "planarAlign", "manualAlign", "autoAlign"]
  },
  file: {
    key: "file",
    labelKey: "modelai.workbench.topbar.groups.file",
    commands: ["saveAs"]
  },
  gate: {
    key: "gate",
    labelKey: "modelai.workbench.topbar.groups.gate",
    commands: ["pinPointGate", "subGate", "hornGate"]
  },
  runner: {
    key: "runner",
    labelKey: "modelai.workbench.topbar.groups.runner",
    commands: [
      "mainRunner",
      "partingRunner",
      "verticalRunner",
      "horizontalRunner"
    ]
  },
  measure: {
    key: "measure",
    labelKey: "modelai.workbench.topbar.groups.measure",
    commands: ["measureLength", "measureAngle", "measureSlope"]
  },
  positioning: {
    key: "positioning",
    labelKey: "modelai.workbench.topbar.groups.positioning",
    commands: ["copy", "mirror", "rotate", "translateArray", "rotateArray"]
  },
  stepCommand: {
    key: "stepCommand",
    labelKey: "modelai.workbench.topbar.groups.stepCommand",
    commands: []
  },
  stepResult: {
    key: "stepResult",
    labelKey: "modelai.workbench.topbar.groups.stepResult",
    commands: ["viewResult"]
  },
  tailActions: {
    key: "tailActions",
    commands: [
      "measureConnectivity",
      "move",
      "rotate",
      "modelArrayCopy",
      "hotTipGate"
    ]
  },
  debug: {
    key: "debug",
    commands: ["apiTest"]
  }
};

export const COMMAND_META: Record<CommandKey, WorkflowCommandDefinition> = {
  importWorkpiece: {
    key: "importWorkpiece",
    labelKey: "modelai.workbench.topbar.importWorkpiece",
    tooltipKey: "modelai.workbench.topbar.importWorkpieceTooltip",
    icon: CommandImportIcon,
    action: "import"
  },
  autoAlign: {
    key: "autoAlign",
    labelKey: "modelai.workbench.topbar.autoAlign",
    tooltipKey: "modelai.workbench.topbar.autoAlignTooltip",
    icon: CommandAutoAlignIcon,
    action: "showPlaceholder"
  },
  planarAlign: {
    key: "planarAlign",
    labelKey: "modelai.workbench.topbar.planarAlign",
    tooltipKey: "modelai.workbench.topbar.planarAlignTooltip",
    icon: CommandPlanarAlignIcon,
    action: "showPlaceholder"
  },
  manualAlign: {
    key: "manualAlign",
    labelKey: "modelai.workbench.topbar.manualAlign",
    tooltipKey: "modelai.workbench.topbar.manualAlignTooltip",
    icon: CommandManualAlignIcon,
    action: "showPlaceholder"
  },
  saveAs: {
    key: "saveAs",
    labelKey: "modelai.workbench.topbar.saveAs",
    tooltipKey: "modelai.workbench.topbar.saveAsTooltip",
    action: "showPlaceholder"
  },
  measureLength: {
    key: "measureLength",
    labelKey: "modelai.workbench.topbar.measureLength",
    tooltipKey: "modelai.workbench.topbar.measureLengthTooltip",
    icon: CommandDistanceIcon,
    action: "executeCommand",
    payload: "measure.length",
    requiresViewport: true
  },
  measureAngle: {
    key: "measureAngle",
    labelKey: "modelai.workbench.topbar.measureAngle",
    tooltipKey: "modelai.workbench.topbar.measureAngleTooltip",
    icon: CommandAngleIcon,
    action: "executeCommand",
    payload: "measure.angle",
    requiresViewport: true
  },
  measureConnectivity: {
    key: "measureConnectivity",
    labelKey: "modelai.workbench.topbar.measureConnectivity",
    tooltipKey: "modelai.workbench.topbar.measureConnectivityTooltip",
    icon: CommandConnectivityIcon,
    action: "executeCommand",
    payload: "measure.connectivity",
    requiresViewport: true
  },
  measureSlope: {
    key: "measureSlope",
    labelKey: "modelai.workbench.topbar.measureSlope",
    tooltipKey: "modelai.workbench.topbar.measureSlopeTooltip",
    icon: CommandSlopeIcon,
    action: "executeCommand",
    payload: "measure.slope",
    requiresViewport: true
  },
  navPan: {
    key: "navPan",
    labelKey: "modelai.workbench.topbar.navPan",
    tooltipKey: "modelai.workbench.topbar.navPanTooltip",
    icon: CommandPanRotateIcon,
    action: "navPan"
  },
  navRotate: {
    key: "navRotate",
    labelKey: "modelai.workbench.topbar.navRotate",
    tooltipKey: "modelai.workbench.topbar.navRotateTooltip",
    icon: CommandRotateIcon,
    action: "navRotate"
  },
  rotateArray: {
    key: "rotateArray",
    labelKey: "modelai.workbench.topbar.rotateArray",
    tooltipKey: "modelai.workbench.topbar.rotateArrayTooltip",
    icon: CommandRotateArrayIcon,
    action: "executeCommand",
    payload: "modify.rotateReferenceArrayCopy",
    requiresViewport: true
  },
  translateArray: {
    key: "translateArray",
    labelKey: "modelai.workbench.topbar.translateArray",
    tooltipKey: "modelai.workbench.topbar.translateArrayTooltip",
    icon: CommandTranslateArrayIcon,
    action: "executeCommand",
    payload: "modify.translateReferenceArrayCopy",
    requiresViewport: true
  },
  copy: {
    key: "copy",
    labelKey: "modelai.workbench.topbar.copy",
    tooltipKey: "modelai.workbench.topbar.copyTooltip",
    icon: CommandCopyIcon,
    action: "showPlaceholder"
  },
  mirror: {
    key: "mirror",
    labelKey: "modelai.workbench.topbar.mirror",
    tooltipKey: "modelai.workbench.topbar.mirrorTooltip",
    icon: CommandMirrorIcon,
    action: "showPlaceholder"
  },
  move: {
    key: "move",
    labelKey: "modelai.workbench.topbar.move",
    tooltipKey: "modelai.workbench.topbar.moveTooltip",
    icon: CommandMoveIcon,
    action: "executeCommand",
    payload: "modify.move",
    requiresViewport: true
  },
  rotate: {
    key: "rotate",
    labelKey: "modelai.workbench.topbar.rotate",
    tooltipKey: "modelai.workbench.topbar.rotateTooltip",
    icon: CommandRotateIcon,
    action: "executeCommand",
    payload: "modify.rotate",
    requiresViewport: true
  },
  modelArrayCopy: {
    key: "modelArrayCopy",
    labelKey: "modelai.workbench.topbar.modelArrayCopy",
    tooltipKey: "modelai.workbench.topbar.modelArrayCopyTooltip",
    icon: CommandTranslateArrayIcon,
    action: "executeCommand",
    payload: "modify.modelArrayCopy",
    requiresViewport: true
  },
  executeParting: {
    key: "executeParting",
    labelKey: "modelai.workbench.topbar.executeParting",
    tooltipKey: "modelai.workbench.topbar.executePartingTooltip",
    icon: CommandStepActionIcon,
    action: "runWorkflowTask",
    workflowTask: {
      stepKey: "dfm.parting",
      artifactKey: "dfm.parting.result"
    }
  },
  executeSlider: {
    key: "executeSlider",
    labelKey: "modelai.workbench.topbar.executeSlider",
    tooltipKey: "modelai.workbench.topbar.executeSliderTooltip",
    icon: CommandStepActionIcon,
    action: "runWorkflowTask",
    workflowTask: {
      stepKey: "dfm.slider",
      artifactKey: "dfm.slider.result"
    }
  },
  executeSplitMold: {
    key: "executeSplitMold",
    labelKey: "modelai.workbench.topbar.executeSplitMold",
    tooltipKey: "modelai.workbench.topbar.executeSplitMoldTooltip",
    icon: CommandStepActionIcon,
    action: "runWorkflowTask",
    workflowTask: {
      stepKey: "dfm.splitMold",
      artifactKey: "dfm.splitMold.result"
    }
  },
  executeInsert: {
    key: "executeInsert",
    labelKey: "modelai.workbench.topbar.executeInsert",
    tooltipKey: "modelai.workbench.topbar.executeInsertTooltip",
    icon: CommandStepActionIcon,
    action: "runWorkflowTask",
    workflowTask: {
      stepKey: "dfm.insert",
      artifactKey: "dfm.insert.result"
    }
  },
  viewResult: {
    key: "viewResult",
    labelKey: "modelai.workbench.topbar.viewResult",
    tooltipKey: "modelai.workbench.topbar.viewResultTooltip",
    icon: CommandResultIcon,
    action: "viewWorkflowResult"
  },
  pinPointGate: {
    key: "pinPointGate",
    labelKey: "modelai.workbench.topbar.pinPointGate",
    tooltipKey: "modelai.workbench.topbar.pinPointGateTooltip",
    icon: CommandPinPointGateIcon,
    action: "executeCommand",
    payload: "create.pinPointGate",
    requiresViewport: true
  },
  hotTipGate: {
    key: "hotTipGate",
    labelKey: "modelai.workbench.topbar.hotTipGate",
    tooltipKey: "modelai.workbench.topbar.hotTipGateTooltip",
    icon: CommandPinPointGateIcon,
    action: "executeCommand",
    payload: "create.hotTipGate",
    requiresViewport: true
  },
  subGate: {
    key: "subGate",
    labelKey: "modelai.workbench.topbar.subGate",
    tooltipKey: "modelai.workbench.topbar.subGateTooltip",
    icon: CommandSubmarineGateIcon,
    action: "executeCommand",
    payload: "create.subGate",
    requiresViewport: true
  },
  hornGate: {
    key: "hornGate",
    labelKey: "modelai.workbench.topbar.hornGate",
    tooltipKey: "modelai.workbench.topbar.hornGateTooltip",
    icon: CommandHornGateIcon,
    action: "executeCommand",
    payload: "create.hornGate",
    requiresViewport: true
  },
  partingRunner: {
    key: "partingRunner",
    labelKey: "modelai.workbench.topbar.partingRunner",
    tooltipKey: "modelai.workbench.topbar.partingRunnerTooltip",
    icon: CommandPartingRunnerIcon,
    action: "executeCommand",
    payload: "create.partingRunner",
    requiresViewport: true
  },
  verticalRunner: {
    key: "verticalRunner",
    labelKey: "modelai.workbench.topbar.verticalRunner",
    tooltipKey: "modelai.workbench.topbar.verticalRunnerTooltip",
    icon: CommandVerticalRunnerIcon,
    action: "executeCommand",
    payload: "create.verticalRunnerPoint",
    requiresViewport: true
  },
  horizontalRunner: {
    key: "horizontalRunner",
    labelKey: "modelai.workbench.topbar.horizontalRunner",
    tooltipKey: "modelai.workbench.topbar.horizontalRunnerTooltip",
    icon: CommandHorizontalRunnerIcon,
    action: "executeCommand",
    payload: "create.horizontalRunner",
    requiresViewport: true
  },
  mainRunner: {
    key: "mainRunner",
    labelKey: "modelai.workbench.topbar.mainRunner",
    tooltipKey: "modelai.workbench.topbar.mainRunnerTooltip",
    icon: CommandMainRunnerIcon,
    action: "executeCommand",
    payload: "create.largeGate",
    requiresViewport: true
  },
  apiTest: {
    key: "apiTest",
    labelKey: "modelai.workbench.topbar.apiTest",
    tooltipKey: "modelai.workbench.topbar.apiTestTooltip",
    action: "openApiTest"
  }
};

export const STEP_COMMANDS: Record<WorkflowStepKey, CommandKey[]> = {
  "dfm.alignAnalysis": [],
  "dfm.parting": ["executeParting"],
  "dfm.slider": ["executeSlider"],
  "dfm.splitMold": ["executeSplitMold"],
  "dfm.insert": ["executeInsert"],
  "moldflow.gateSetup": [],
  "moldflow.partPlacement": [],
  "moldflow.runnerSetup": []
};

export function getCommandGroup(
  groupKey: CommandGroupKey,
  stepKey: WorkflowStepKey
): WorkflowCommandGroupDefinition {
  if (groupKey !== "stepCommand") {
    return COMMAND_GROUPS[groupKey];
  }

  return {
    ...COMMAND_GROUPS.stepCommand,
    commands: STEP_COMMANDS[stepKey]
  };
}
