// @ts-nocheck
import { AsyncController } from "@modelai/core";
import { CancelableCommand } from "@modelai/command";
import { CommandUtils } from "@modelai/command";
import type { IView } from "@modelai/core/types";
import { MeshDataUtils, VisualConfig } from "@modelai/core/types";
import { Transaction } from "@modelai/core";
import type { XYZ } from "@modelai/core/math";
import type { SnapResult } from "@modelai/selection/snap";
import type { IStep } from "@modelai/step";

export abstract class MultistepCommand extends CancelableCommand {
  protected stepDatas: SnapResult[] = [];

  protected async executeAsync(): Promise<void> {
    if (!(await this.canExecute()) || !(await this.executeSteps())) {
      return;
    }
    await Transaction.executeAsync(
      this.document,
      this.getTransactionName(),
      async () => {
        await this.executeMainTaskAsync();
      }
    );
  }

  protected canExecute(): Promise<boolean> {
    return Promise.resolve(true);
  }

  protected override onRestarting(): void {
    this.resetStepDatas();
  }

  protected async executeSteps(): Promise<boolean> {
    const steps = this.getSteps();
    try {
      while (this.stepDatas.length < steps.length) {
        this.controller = new AsyncController();
        const data = await steps[this.stepDatas.length].execute(
          this.document,
          this.controller
        );
        if (
          data === undefined ||
          this.controller.result?.status !== "success"
        ) {
          return false;
        }
        this.stepDatas.push(data);
      }
      return true;
    } finally {
      if (!this.isRestarting) {
        this.document.selection.clearSelection();
        this.document.visual.highlighter.clear();
      }
    }
  }

  protected resetStepDatas() {
    this.stepDatas.length = 0;
  }

  protected meshPoint(point: XYZ) {
    return MeshDataUtils.createVertexMesh(
      point,
      VisualConfig.temporaryVertexSize,
      VisualConfig.temporaryVertexColor
    );
  }

  protected meshLine(
    start: XYZ,
    end: XYZ,
    color = VisualConfig.defaultEdgeColor,
    lineWidth?: number
  ) {
    const data = MeshDataUtils.createEdgeMesh(
      start,
      end,
      color,
      "solid",
      lineWidth
    );
    return data;
  }

  protected findPlane(view: IView, origin: XYZ) {
    return view.workplane.translateTo(origin);
  }

  protected getTransactionName() {
    return CommandUtils.getCommandData(this)?.key ?? this.constructor.name;
  }

  protected executeMainTaskAsync(): Promise<void> {
    this.executeMainTask();
    return Promise.resolve();
  }

  protected abstract getSteps(): IStep[];
  protected abstract executeMainTask(): void;
}
