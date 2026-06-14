// @ts-nocheck
import type { AsyncController } from "@modelai/core";
import type { Result } from "@modelai/core";
import type { IDocument } from "@modelai/core/types";
import type { SnapData, SnapResult } from "@modelai/selection/snap";
import type { SnapCommandUI, SnapEventHandler } from "@modelai/selection/snap";
import { transformI18n } from "@/plugins/i18n";

export interface IStep {
  execute(
    document: IDocument,
    controller: AsyncController
  ): Promise<SnapResult | undefined>;
}

export function createSnapCommandUI(
  document: IDocument
): SnapCommandUI | undefined {
  const app = document.application as any;
  const ui: SnapCommandUI = {
    showPrompt: (message: string) => app?.onSnapPrompt?.(message),
    clearPrompt: () => app?.onSnapPrompt?.(null),
    showToast: (message: string) => console.warn("[Command]", message),
    requestInput: (initial: string, onSubmit) => {
      const text = window.prompt(
        transformI18n("modelai.command.prompt.inputValue"),
        initial
      );
      if (text === null) return;
      const result = onSubmit(text);
      if (!result.isOk) {
        console.warn("[Command]", (result as Result<string, string>).error);
      }
    },
    clearInput: () => {}
  };
  const hasAny =
    ui.showPrompt ||
    ui.clearPrompt ||
    ui.showToast ||
    ui.requestInput ||
    ui.clearInput;
  return hasAny ? ui : undefined;
}

export abstract class SnapStep<D extends SnapData> implements IStep {
  protected cursor: string = "pointSnap";

  constructor(
    readonly tip: string,
    private readonly handleStepData: () => D,
    private readonly keepSelected: boolean = false
  ) {}

  async execute(
    document: IDocument,
    controller: AsyncController
  ): Promise<SnapResult | undefined> {
    if (!this.keepSelected) {
      document.selection.clearSelection();
      document.visual.highlighter.clear();
    }

    const data = this.handleStepData();
    this.setValidator(data);

    const handler = this.getEventHandler(document, controller, data);
    await document.selection.pickAsync(
      handler,
      this.tip,
      controller,
      false,
      this.cursor
    );
    const snaped = handler.snaped;

    handler.dispose();

    return controller.result?.status === "success" ? snaped : undefined;
  }

  protected getSnapCommandUI(document: IDocument): SnapCommandUI | undefined {
    return createSnapCommandUI(document);
  }

  private setValidator(data: D) {
    const oldValidator = data.validator;
    data.validator = point => {
      if (oldValidator) {
        return oldValidator(point) && this.validator(data, point);
      }
      return this.validator(data, point);
    };
  }

  protected abstract getEventHandler(
    document: IDocument,
    controller: AsyncController,
    data: D
  ): SnapEventHandler;

  protected abstract validator(
    data: D,
    point: import("@modelai/core/math").XYZ
  ): boolean;
}
