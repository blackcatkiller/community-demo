// @ts-nocheck
import { command } from "@modelai/command";
import type { INodeLinkedList } from "@modelai/core/types";
import type { PinPointGateNode } from "@/features/modelai/gates/pinPoint/pinPointGate";
import { transformI18n } from "@/plugins/i18n";
import {
  commitCreatedPinPointGateNode,
  createPinPointGateCreateLifecycle,
  createPinPointGateParams,
  debugPinPointGateEditorEvent,
  pinPointGateNodeAdapter,
  startPinPointGateEditor
} from "@/features/modelai/gates/pinPoint/pinPointGate";
import { registerVerticalRunnerGateNode } from "@/features/modelai/gates/shared/verticalRunnerGateRegistry";
import { MultistepCommand } from "../../multistepCommand";
import { createGatePointStep, resolveSnapParent } from "./gatePointSnap";

@command({
  key: "create.pinPointGate",
  icon: "icon-cone"
})
export class PinPointGateCommand extends MultistepCommand {
  private createdNode?: PinPointGateNode;
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
            throw new Error("Pin-point gate placement point is required");
          }
          const plane = snapResult.view.workplane.translateTo(origin);
          const parent =
            resolveSnapParent(snapResult) ??
            document.modelManager.currentNode ??
            document.modelManager.rootNode;
          const node = pinPointGateNodeAdapter.createNode(
            transformI18n("modelai.body.pinPointGate"),
            plane,
            createPinPointGateParams()
          );
          node.parent = parent;
          node.parentVisible = parent.visible && parent.parentVisible;
          document.visual.context.addNode([node]);
          this.createdNode = node;
          this.createdParent = parent;
          debugPinPointGateEditorEvent("shell:create", {
            shell: "create",
            node,
            parent
          });
          const editor = startPinPointGateEditor({
            document,
            controller,
            node,
            lifecycle: createPinPointGateCreateLifecycle({ parent })
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
    commitCreatedPinPointGateNode({
      document: this.document,
      node,
      parent
    });
    registerVerticalRunnerGateNode(this.document, node);
    this.createdNode = undefined;
    this.createdParent = undefined;
  }
}
