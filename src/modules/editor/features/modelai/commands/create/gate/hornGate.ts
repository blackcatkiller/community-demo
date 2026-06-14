// @ts-nocheck
import { command } from "@modelai/command";
import type { INodeLinkedList } from "@modelai/core/types";
import type { HornGateNode } from "@/features/modelai/gates/horn/hornGate";
import { transformI18n } from "@/plugins/i18n";
import {
  commitCreatedHornGateNode,
  createHornGateCreateLifecycle,
  createHornGateParams,
  debugHornGateEditorEvent,
  hornGateNodeAdapter,
  startHornGateEditor
} from "@/features/modelai/gates/horn/hornGate";
import { MultistepCommand } from "../../multistepCommand";
import { createGatePointStep, resolveSnapParent } from "./gatePointSnap";

@command({
  key: "create.hornGate",
  icon: "icon-cone"
})
export class HornGateCommand extends MultistepCommand {
  private createdNode?: HornGateNode;
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
          if (!origin) throw new Error("Horn gate placement point is required");
          const plane = snapResult.view.workplane.translateTo(origin);
          const parent =
            resolveSnapParent(snapResult) ??
            document.modelManager.currentNode ??
            document.modelManager.rootNode;
          const node = hornGateNodeAdapter.createNode(
            transformI18n("modelai.body.hornGate"),
            plane,
            createHornGateParams()
          );
          node.parent = parent;
          node.parentVisible = parent.visible && parent.parentVisible;
          document.visual.context.addNode([node]);
          this.createdNode = node;
          this.createdParent = parent;
          debugHornGateEditorEvent("shell:create", {
            shell: "create",
            node,
            parent
          });
          const editor = startHornGateEditor({
            document,
            controller,
            node,
            lifecycle: createHornGateCreateLifecycle({ parent })
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
    commitCreatedHornGateNode({
      document: this.document,
      node,
      parent
    });
    this.createdNode = undefined;
    this.createdParent = undefined;
  }
}
