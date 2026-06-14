// @ts-nocheck
import { Matrix4, Precision, XYZ } from "@modelai/core/math";
import { command } from "@modelai/command";
import {
  Dimension,
  PointSnapEventHandler,
  type SnapProfile,
  type PointSnapData
} from "@modelai/selection/snap";
import { createDefaultSnapConfig } from "@modelai/selection/snapConfig";
import { createSnapCommandUI, PointStep, type IStep } from "@modelai/step";
import { transformI18n } from "@/plugins/i18n";
import { createFormKitRegistration } from "@modelai/ui/formKit/runtime";
import { mountFormKit } from "@modelai/ui/formKit/mount";
import { TransformedCommand } from "./transformedCommand";

const transformProfile: SnapProfile = {
  id: "transform",
  hoverMode: "light",
  faceHover: "fallback",
  preciseOnCommit: true,
  enableTracking: false,
  enableInvisibleSnaps: true,
  enableDerivedSnaps: {
    center: true,
    intersection: false,
    perpendicular: false
  },
  stickyCandidate: true,
  transformCandidateTuning: {
    priorityWindowPx: 3,
    lockRadiusPx: 8,
    switchMarginPx: 3
  }
};

@command({
  key: "modify.move",
  icon: "icon-move"
})
export class Move extends TransformedCommand {
  protected override getSteps(): IStep[] {
    return [
      new PointStep(
        transformI18n("modelai.command.prompt.pickMoveBasePoint"),
        () => ({ dimension: Dimension.D1D2D3 }),
        true
      ),
      {
        execute: async (document, controller) => {
          const basePoint = this.stepDatas[0].point!;
          const baseView = this.stepDatas[0].view;
          const pointData = this.getSecondPointData();
          const previousValidator = pointData.validator;
          pointData.validator = point => {
            const isValid =
              basePoint.distanceTo(point) > Precision.Distance &&
              (previousValidator ? previousValidator(point) : true);
            return isValid;
          };

          const app = document.application as any;
          const snapConfig =
            app?.getSnapConfigRef?.() ?? createDefaultSnapConfig();
          const snapUI = createSnapCommandUI(document);
          const handler = new PointSnapEventHandler(
            document,
            controller,
            pointData,
            snapConfig,
            snapUI
              ? {
                  ...snapUI,
                  requestInput: undefined
                }
              : undefined
          );

          let manualTargetPoint = new XYZ(
            basePoint.x,
            basePoint.y,
            basePoint.z
          );
          const listeners = new Set<() => void>();

          const emitState = () => {
            listeners.forEach(listener => listener());
          };

          const syncManualPreview = (point: XYZ) => {
            manualTargetPoint = point;
            // Keep form input and mouse hover on the same preview channel.
            handler.setPreviewResult({
              view: baseView,
              point,
              refPoint: basePoint,
              shapes: []
            });
            emitState();
          };

          const registration = createFormKitRegistration({
            schema: {
              id: "modify-move-target-form",
              titleKey: "modelai.move.group",
              sections: [
                {
                  key: "target",
                  fields: [
                    {
                      key: "targetX",
                      labelKey: "modelai.move.targetX",
                      kind: "number",
                      step: 0.1
                    },
                    {
                      key: "targetY",
                      labelKey: "modelai.move.targetY",
                      kind: "number",
                      step: 0.1
                    },
                    {
                      key: "targetZ",
                      labelKey: "modelai.move.targetZ",
                      kind: "number",
                      step: 0.1
                    },
                    {
                      key: "targetShortcut",
                      labelKey: "modelai.move.targetShortcut",
                      kind: "button",
                      options: [
                        {
                          value: "origin",
                          labelKey: "modelai.move.targetShortcutOptions.origin"
                        }
                      ]
                    }
                  ]
                }
              ],
              actions: [
                {
                  key: "cancel",
                  labelKey: "buttons.pureClose",
                  buttonType: "text"
                },
                {
                  key: "confirm",
                  labelKey: "buttons.pureConfirm",
                  buttonType: "primary"
                }
              ],
              layout: {
                inlineNumber: true,
                numberFieldWidth: 148,
                actionsAlign: "end",
                maxBodyHeight: 320
              }
            },
            getState: () => ({
              visible: true,
              values: {
                targetX: manualTargetPoint.x,
                targetY: manualTargetPoint.y,
                targetZ: manualTargetPoint.z
              }
            }),
            handlers: {
              onChange: (fieldKey, value) => {
                if (fieldKey === "targetShortcut") {
                  if (value === "origin") {
                    syncManualPreview(new XYZ(0, 0, 0));
                  }
                  return;
                }

                const next = Number(value);
                if (Number.isNaN(next)) return;

                if (fieldKey === "targetX") {
                  syncManualPreview(
                    new XYZ(next, manualTargetPoint.y, manualTargetPoint.z)
                  );
                  return;
                }
                if (fieldKey === "targetY") {
                  syncManualPreview(
                    new XYZ(manualTargetPoint.x, next, manualTargetPoint.z)
                  );
                  return;
                }
                if (fieldKey === "targetZ") {
                  syncManualPreview(
                    new XYZ(manualTargetPoint.x, manualTargetPoint.y, next)
                  );
                }
              },
              onAction: actionKey => {
                if (actionKey === "confirm") {
                  const targetPoint =
                    handler.snaped?.point ?? manualTargetPoint;
                  if (targetPoint.distanceTo(basePoint) <= Precision.Distance) {
                    return;
                  }
                  controller.success();
                  return;
                }
                if (actionKey === "cancel") {
                  controller.cancel();
                }
              }
            },
            subscribeState: listener => {
              listeners.add(listener);
              return () => listeners.delete(listener);
            }
          });

          const unmount = mountFormKit(registration);

          try {
            await document.selection.pickAsync(
              handler,
              transformI18n("modelai.command.prompt.pickMoveTargetPoint"),
              controller,
              false,
              "pointSnap"
            );

            if (controller.result?.status !== "success") {
              return undefined;
            }

            return (
              handler.snaped ?? {
                view: baseView,
                point: manualTargetPoint,
                refPoint: basePoint,
                shapes: []
              }
            );
          } finally {
            handler.dispose();
            unmount();
          }
        }
      }
    ];
  }

  private readonly getSecondPointData = (): PointSnapData => {
    return {
      refPoint: () => this.stepDatas[0].point!,
      dimension: Dimension.D1D2D3,
      preview: this.movePreview,
      profile: transformProfile
    };
  };

  private readonly movePreview = (point: XYZ | undefined) => {
    const p1 = this.meshPoint(this.stepDatas[0].point!);
    if (!point) return [p1];
    return [
      p1,
      this.transformPreview(point),
      this.getTempLineData(this.stepDatas[0].point!, point)
    ];
  };

  protected override transfrom(point: XYZ): Matrix4 {
    const delta = point.sub(this.stepDatas[0].point!);
    return Matrix4.fromTranslation(delta.x, delta.y, delta.z);
  }
}
