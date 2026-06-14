// @ts-nocheck
import { command } from "@modelai/command";
import type { INodeLinkedList } from "@modelai/core/types";
import type { Matrix4, XYZ } from "@modelai/core/math";
import type { SnapResult } from "@modelai/selection/snap";
import { PointStep } from "@modelai/step";
import type { PointVerticalRunnerNode } from "@/features/modelai/gates/pointVerticalRunner/pointVerticalRunner";
import { transformI18n } from "@/plugins/i18n";
import {
  commitCreatedPointVerticalRunnerNode,
  createPointVerticalRunnerCreateLifecycle,
  createPointVerticalRunnerParams,
  debugPointVerticalRunnerEditorEvent,
  pointVerticalRunnerNodeAdapter,
  startPointVerticalRunnerEditor
} from "@/features/modelai/gates/pointVerticalRunner/pointVerticalRunner";
import { PartingRunnerNode } from "@/features/modelai/gates/partingRunner/partingRunner";
import { MultistepCommand } from "../../multistepCommand";

type PartingRunnerCenterlineSnap = {
  node: PartingRunnerNode;
  transform: Matrix4;
};

function resolvePartingRunnerCenterlineSnap(
  snapResult: SnapResult | undefined
): PartingRunnerCenterlineSnap | undefined {
  const shape = snapResult?.shapes.find(
    shape =>
      shape.owner.node instanceof PartingRunnerNode &&
      shape.guide?.kind === "centerline" &&
      shape.guide.id === "runner-centerline"
  );
  if (!shape || !(shape.owner.node instanceof PartingRunnerNode)) {
    return undefined;
  }
  return {
    node: shape.owner.node,
    transform: shape.transform
  };
}

function resolvePartingRunnerSurfacePoint(
  point: XYZ,
  gateDirection: XYZ,
  runnerSnap: PartingRunnerCenterlineSnap
): XYZ | undefined {
  const runnerDirection = runnerSnap.transform
    .ofVector(runnerSnap.node.end.sub(runnerSnap.node.start))
    .normalize();
  const radialDirection = gateDirection.sub(
    runnerDirection.multiply(gateDirection.dot(runnerDirection))
  );
  if (radialDirection.lengthSq() <= 0) {
    return undefined;
  }

  const radius = runnerSnap.node.exportParams().diameter / 2;
  return point.add(radialDirection.normalize().multiply(radius));
}

function resolvePlacementOrigin(snapResult: SnapResult | undefined): XYZ {
  if (!snapResult?.point) {
    throw new Error("Point vertical runner placement point is required");
  }
  const point = snapResult.point;
  const runnerSnap = resolvePartingRunnerCenterlineSnap(snapResult);
  if (!runnerSnap) {
    return point;
  }

  const direction = snapResult.view.workplane.normal.normalize();
  return (
    resolvePartingRunnerSurfacePoint(point, direction, runnerSnap) ?? point
  );
}

@command({
  key: "create.verticalRunnerPoint",
  icon: "icon-cone"
})
export class VerticalRunnerPointCommand extends MultistepCommand {
  private createdNode?: PointVerticalRunnerNode;
  private createdParent?: INodeLinkedList;

  protected override getSteps() {
    return [
      new PointStep(
        transformI18n("modelai.command.prompt.pickVerticalRunnerPoint")
      ),
      {
        execute: async (document, controller) => {
          const snapResult = this.stepDatas[0];
          const origin = resolvePlacementOrigin(snapResult);
          const plane = snapResult.view.workplane.translateTo(origin);
          const parent =
            document.modelManager.currentNode ?? document.modelManager.rootNode;
          const node = pointVerticalRunnerNodeAdapter.createNode(
            transformI18n("modelai.body.pointVerticalRunner"),
            plane,
            createPointVerticalRunnerParams(Number(document.pushPlatePlane.z))
          );
          node.parent = parent;
          node.parentVisible = parent.visible && parent.parentVisible;
          document.visual.context.addNode([node]);
          this.createdNode = node;
          this.createdParent = parent;
          debugPointVerticalRunnerEditorEvent("shell:create", {
            shell: "create",
            node,
            parent
          });
          const editor = startPointVerticalRunnerEditor({
            document,
            controller,
            node,
            lifecycle: createPointVerticalRunnerCreateLifecycle({ parent })
          });
          const success = await editor.wait();
          if (!success) {
            this.createdNode = undefined;
            this.createdParent = undefined;
            return undefined;
          }
          return { view: snapResult.view, point: origin, shapes: [] };
        }
      }
    ];
  }

  protected override executeMainTask(): void {
    const node = this.createdNode;
    const parent = this.createdParent;
    if (!node || !parent) return;
    commitCreatedPointVerticalRunnerNode({
      document: this.document,
      node,
      parent
    });
    this.createdNode = undefined;
    this.createdParent = undefined;
  }
}
