// @ts-nocheck
import type { AsyncController } from "@modelai/core";
import { createFormKitRegistration } from "@modelai/ui/formKit/runtime";

export function createSelectionControlFormKitRegistration(options: {
  controller: AsyncController;
  getPrompt: () => string;
  canConfirm?: () => boolean;
  invalidConfirmMessageKey?: string;
  subscribeState?: (listener: () => void) => (() => void) | void;
}) {
  const {
    controller,
    getPrompt,
    canConfirm,
    invalidConfirmMessageKey,
    subscribeState
  } = options;

  return createFormKitRegistration({
    schema: {
      id: "selection-control-form-kit",
      titleKey: "modelai.selection.control.title",
      sections: [
        {
          key: "selection-control-info",
          fields: [
            {
              key: "prompt",
              labelKey: "modelai.selection.control.promptLabel",
              kind: "text"
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
      actionGuards:
        canConfirm && invalidConfirmMessageKey
          ? [
              {
                key: "selection-required",
                actionKey: "confirm",
                fieldKey: "prompt",
                messageKey: invalidConfirmMessageKey
              }
            ]
          : undefined,
      layout: {
        actionsAlign: "end"
      }
    },
    behavior: {
      releaseFocusOnActionWarning: true
    },
    getState: () => ({
      visible: true,
      values: {
        prompt: getPrompt()
      }
    }),
    handlers: {
      isActionGuardTriggered: guardKey => {
        if (guardKey !== "selection-required") {
          return false;
        }
        return canConfirm ? !canConfirm() : false;
      },
      onAction: actionKey => {
        if (actionKey === "confirm") {
          controller.success();
          return;
        }
        if (actionKey === "cancel") {
          controller.cancel();
        }
      }
    },
    subscribeState
  });
}
