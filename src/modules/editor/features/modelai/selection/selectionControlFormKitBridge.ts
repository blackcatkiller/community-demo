// @ts-nocheck
import { AsyncController, PubSub, type IDisposable } from "@modelai/core";
import { mountFormKit } from "@modelai/ui/formKit/mount";
import { createSelectionControlFormKitRegistration } from "./selectionControlFormKit";

type ActiveSelectionControl = {
  controller: AsyncController;
  unmount: () => void;
};

type SelectionControlPayload =
  | AsyncController
  | {
      controller: AsyncController;
      canConfirm?: () => boolean;
      invalidConfirmMessageKey?: string;
    };

export class SelectionControlFormKitBridge implements IDisposable {
  private active?: ActiveSelectionControl;
  private prompt = "";
  private readonly listeners = new Set<() => void>();

  constructor() {
    PubSub.default.sub("showSelectionControl", this.handleShowSelectionControl);
    PubSub.default.sub(
      "clearSelectionControl",
      this.handleClearSelectionControl
    );
    PubSub.default.sub("selectionChanged", this.handleSelectionChanged);
    PubSub.default.sub("statusBarTip", this.handleStatusBarTip);
    PubSub.default.sub("clearStatusBarTip", this.handleClearStatusBarTip);
  }

  dispose(): void {
    this.closeActive();
    PubSub.default.remove(
      "showSelectionControl",
      this.handleShowSelectionControl
    );
    PubSub.default.remove(
      "clearSelectionControl",
      this.handleClearSelectionControl
    );
    PubSub.default.remove("selectionChanged", this.handleSelectionChanged);
    PubSub.default.remove("statusBarTip", this.handleStatusBarTip);
    PubSub.default.remove("clearStatusBarTip", this.handleClearStatusBarTip);
    this.listeners.clear();
  }

  private readonly handleShowSelectionControl = (
    payload: SelectionControlPayload
  ) => {
    const normalized =
      payload instanceof AsyncController ? { controller: payload } : payload;
    const { controller, canConfirm, invalidConfirmMessageKey } = normalized;

    if (this.active?.controller === controller) {
      return;
    }

    this.closeActive();

    const registration = createSelectionControlFormKitRegistration({
      controller,
      getPrompt: () => this.prompt,
      canConfirm,
      invalidConfirmMessageKey,
      subscribeState: listener => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
      }
    });
    const unmount = mountFormKit(registration);

    controller.onCompleted(() => {
      this.cleanupActive(controller);
    });
    controller.onCancelled(() => {
      this.cleanupActive(controller);
    });

    this.active = {
      controller,
      unmount
    };
  };

  private readonly handleClearSelectionControl = () => {
    this.closeActive();
  };

  private readonly handleSelectionChanged = () => {
    if (!this.active) {
      return;
    }
    this.emit();
  };

  private readonly handleStatusBarTip = (tip: string) => {
    this.prompt = tip;
    this.emit();
  };

  private readonly handleClearStatusBarTip = () => {
    this.prompt = "";
    this.emit();
  };

  private cleanupActive(controller: AsyncController) {
    if (!this.active || this.active.controller !== controller) {
      return;
    }
    this.closeActive();
  }

  private emit() {
    this.listeners.forEach(listener => listener());
  }

  private closeActive() {
    const active = this.active;
    if (!active) return;
    this.active = undefined;
    active.unmount();
  }
}
