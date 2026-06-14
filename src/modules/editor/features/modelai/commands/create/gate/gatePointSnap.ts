// @ts-nocheck
import { AsyncController } from "@modelai/core";
import type { IDocument, INode, INodeLinkedList } from "@modelai/core/types";
import type { PointSnapData, SnapResult } from "@modelai/selection/snap";
import { PointStep, type IStep } from "@modelai/step";
import { transformI18n } from "@/plugins/i18n";

const INVALID_GATE_POINT_PROMPT_KEY =
  "modelai.command.prompt.placeGateOnWorkpiece";

function canPlaceGateAtSnap(snaped: SnapResult | undefined) {
  return resolveSnapParent(snaped) !== undefined;
}

export function resolveSnapParent(
  snaped: Pick<SnapResult, "nodes" | "shapes"> | undefined
): INodeLinkedList | undefined {
  const nodeParent = snaped?.nodes?.find(node => node.parent)?.parent;
  if (nodeParent) return nodeParent;

  return snaped?.shapes
    ?.map(shape => shape.owner.node as INode | undefined)
    .find(node => node?.parent)?.parent;
}

function getInvalidGatePointPrompt() {
  return transformI18n(INVALID_GATE_POINT_PROMPT_KEY);
}

function showInvalidGatePointPrompt(document: IDocument) {
  const app = document.application as any;
  app?.onSnapPrompt?.(getInvalidGatePointPrompt());
}

export function createGatePointSnapData(): PointSnapData {
  return {
    shapeHitFallback: true,
    prompt: snaped =>
      canPlaceGateAtSnap(snaped) ? undefined : getInvalidGatePointPrompt(),
    hoverCursor: snaped =>
      canPlaceGateAtSnap(snaped) ? "pointSnap" : "pointSnapDisabled"
  };
}

export function createGatePointStep(tip: string): IStep {
  const pointStep = new PointStep(tip, createGatePointSnapData);

  return {
    async execute(document: IDocument, controller: AsyncController) {
      while (!controller.result) {
        const pickController = new AsyncController();
        controller.onCancelled(() => pickController.cancel());

        const snaped = await pointStep.execute(document, pickController);
        if (controller.result) return undefined;

        if (pickController.result?.status !== "success" || !snaped) {
          controller.cancel(pickController.result?.message);
          return undefined;
        }

        if (canPlaceGateAtSnap(snaped)) {
          controller.success();
          return snaped;
        }

        showInvalidGatePointPrompt(document);
      }

      return undefined;
    }
  };
}
