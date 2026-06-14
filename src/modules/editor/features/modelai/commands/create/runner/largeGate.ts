// @ts-nocheck
import { command } from "@modelai/command";
import type { INodeLinkedList } from "@modelai/core/types";
import type { LargeGateNode } from "@/features/modelai/gates/large/largeGate";
import { transformI18n } from "@/plugins/i18n";
import {
  commitCreatedLargeGateNode,
  createLargeGateCreateLifecycle,
  createLargeGateParams,
  debugLargeGateEditorEvent,
  largeGateNodeAdapter,
  startLargeGateEditor
} from "@/features/modelai/gates/large/largeGate";
import { MultistepCommand } from "../../multistepCommand";
import { createGatePointStep } from "../gate/gatePointSnap";

@command({
  key: "create.largeGate",
  icon: "icon-cone"
})
export class LargeGateCommand extends MultistepCommand {
  private createdNode?: LargeGateNode;
  private createdParent?: INodeLinkedList;

  protected override getSteps() {
    return [
      createGatePointStep(
        transformI18n("modelai.command.prompt.pickGatePoint")
      ),
      {
        execute: async (document, controller) => {
          const snapResult = this.stepDatas[0];
          const origin = snapResult.point;
          if (!origin)
            throw new Error("Large gate placement point is required");
          const plane = snapResult.view.workplane.translateTo(origin);
          const parent =
            document.modelManager.currentNode ?? document.modelManager.rootNode;
          const node = largeGateNodeAdapter.createNode(
            transformI18n("modelai.body.largeGate"),
            plane,
            createLargeGateParams()
          );
          node.parent = parent;
          node.parentVisible = parent.visible && parent.parentVisible;
          document.visual.context.addNode([node]);
          this.createdNode = node;
          this.createdParent = parent;
          debugLargeGateEditorEvent("shell:create", {
            shell: "create",
            node,
            parent
          });
          const editor = startLargeGateEditor({
            document,
            controller,
            node,
            lifecycle: createLargeGateCreateLifecycle({ parent })
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
    commitCreatedLargeGateNode({
      document: this.document,
      node,
      parent
    });
    this.createdNode = undefined;
    this.createdParent = undefined;
  }
}
