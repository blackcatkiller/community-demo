// @ts-nocheck
import { command } from "@modelai/command";
import type { INodeLinkedList } from "@modelai/core/types";
import type { HotTipGateNode } from "@/features/modelai/gates/hotTip/hotTipGate";
import { transformI18n } from "@/plugins/i18n";
import {
  commitCreatedHotTipGateNode,
  createHotTipGateCreateLifecycle,
  createHotTipGateParams,
  debugHotTipGateEditorEvent,
  hotTipGateNodeAdapter,
  startHotTipGateEditor
} from "@/features/modelai/gates/hotTip/hotTipGate";
import { registerVerticalRunnerGateNode } from "@/features/modelai/gates/shared/verticalRunnerGateRegistry";
import { MultistepCommand } from "../../multistepCommand";
import { createGatePointStep, resolveSnapParent } from "./gatePointSnap";

@command({
  key: "create.hotTipGate",
  icon: "icon-cone"
})
export class HotTipGateCommand extends MultistepCommand {
  private createdNode?: HotTipGateNode;
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
          if (!origin) {
            throw new Error("Hot-tip gate placement point is required");
          }
          const plane = snapResult.view.workplane.translateTo(origin);
          const parent =
            resolveSnapParent(snapResult) ??
            document.modelManager.currentNode ??
            document.modelManager.rootNode;
          const node = hotTipGateNodeAdapter.createNode(
            transformI18n("modelai.body.hotTipGate"),
            plane,
            createHotTipGateParams()
          );
          node.parent = parent;
          node.parentVisible = parent.visible && parent.parentVisible;
          document.visual.context.addNode([node]);
          this.createdNode = node;
          this.createdParent = parent;
          debugHotTipGateEditorEvent("shell:create", {
            shell: "create",
            node,
            parent
          });
          const editor = startHotTipGateEditor({
            document,
            controller,
            node,
            lifecycle: createHotTipGateCreateLifecycle({ parent })
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
    commitCreatedHotTipGateNode({
      document: this.document,
      node,
      parent
    });
    registerVerticalRunnerGateNode(this.document, node);
    this.createdNode = undefined;
    this.createdParent = undefined;
  }
}
