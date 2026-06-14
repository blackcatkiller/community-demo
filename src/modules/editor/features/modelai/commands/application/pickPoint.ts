// @ts-nocheck
import { command } from "@modelai/command";
import { type IStep, PointStep } from "@modelai/step";
import type { SnapResult } from "@modelai/selection/snap";
import { MultistepCommand } from "../multistepCommand";

@command({
  key: "special.commandPick",
  icon: "icon-pick-point",
  isApplicationCommand: true
})
export class CommandPickPoint extends MultistepCommand {
  result: SnapResult | undefined;

  protected override getSteps(): IStep[] {
    return [new PointStep("璇烽€夋嫨鐐?)];
  }

  protected override executeMainTask(): void {
    this.result = this.stepDatas[0];
  }
}
