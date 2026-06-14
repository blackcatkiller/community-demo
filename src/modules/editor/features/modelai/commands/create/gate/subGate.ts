// @ts-nocheck
import { command } from "@modelai/command";
import type { INodeLinkedList } from "@modelai/core/types";
import type { SubGateNode } from "@/features/modelai/gates/sub/subGate";
import { transformI18n } from "@/plugins/i18n";
import {
  commitCreatedSubGateNode,
  createSubGateCreateLifecycle,
  createSubGateParams,
  debugSubGateEditorEvent,
  startSubGateEditor,
  subGateNodeAdapter
} from "@/features/modelai/gates/sub/subGate";
import { MultistepCommand } from "../../multistepCommand";
import { createGatePointStep, resolveSnapParent } from "./gatePointSnap";

@command({
  key: "create.subGate",
  icon: "icon-cone"
})
export class SubGateCommand extends MultistepCommand {
  private createdNode?: SubGateNode;
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
          if (!origin) throw new Error("Sub gate placement point is required");
          const plane = snapResult.view.workplane.translateTo(origin);
          const parent =
            resolveSnapParent(snapResult) ??
            document.modelManager.currentNode ??
            document.modelManager.rootNode;
          const node = subGateNodeAdapter.createNode(
            transformI18n("modelai.body.subGate"),
            plane,
            createSubGateParams()
          );
          node.parent = parent;
          node.parentVisible = parent.visible && parent.parentVisible;
          document.visual.context.addNode([node]);
          this.createdNode = node;
          this.createdParent = parent;
          debugSubGateEditorEvent("shell:create", {
            shell: "create",
            node,
            parent
          });
          const editor = startSubGateEditor({
            document,
            controller,
            node,
            lifecycle: createSubGateCreateLifecycle({ parent })
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
    commitCreatedSubGateNode({
      document: this.document,
      node,
      parent
    });
    this.createdNode = undefined;
    this.createdParent = undefined;
  }
}
