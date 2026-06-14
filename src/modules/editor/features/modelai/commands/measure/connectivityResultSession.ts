// @ts-nocheck
import type { AsyncController } from "@modelai/core";
import { createFormKitRegistration } from "@modelai/ui/formKit/runtime";

const CONNECTIVITY_RESULT_FORM_ID = "measure-connectivity-result-form";

type ConnectivityResultSessionOptions = {
  resultText: string;
};

export class ConnectivityResultSession {
  constructor(private readonly options: ConnectivityResultSessionOptions) {}

  createFormKitRegistration(controller: AsyncController) {
    return createFormKitRegistration({
      schema: {
        id: CONNECTIVITY_RESULT_FORM_ID,
        titleKey: "modelai.measurement.connectivityDialogTitle",
        sections: [
          {
            key: "connectivity-result",
            fields: [
              {
                key: "result",
                labelKey: "modelai.measurement.connectivity",
                kind: "text"
              }
            ]
          }
        ],
        actions: [
          {
            key: "confirm",
            labelKey: "buttons.pureConfirm",
            buttonType: "primary"
          }
        ],
        layout: {
          actionsAlign: "end",
          maxBodyHeight: 180
        }
      },
      getState: () => ({
        visible: true,
        values: {
          result: this.options.resultText
        }
      }),
      handlers: {
        onAction: actionKey => {
          if (actionKey === "confirm") {
            controller.success();
          }
        }
      }
    });
  }
}
