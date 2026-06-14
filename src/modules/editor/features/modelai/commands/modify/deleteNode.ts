// @ts-nocheck
import { PubSub } from "@modelai/core";
import { command } from "@modelai/command";
import type { INode, INodeLinkedList } from "@modelai/core/types";
import { GetOrSelectNodeStep, type IStep } from "@modelai/step";
import { MultistepCommand } from "../multistepCommand";

function toUniqueNodes(nodes: INode[]): INode[] {
  return Array.from(new Set(nodes));
}

function isDescendantOfAny(node: INode, candidates: Set<INode>): boolean {
  let current = node.parent;
  while (current) {
    if (candidates.has(current)) return true;
    current = current.parent;
  }
  return false;
}

function getTopLevelNodes(nodes: INode[]): INode[] {
  const unique = toUniqueNodes(nodes);
  const set = new Set(unique);
  return unique.filter(node => !isDescendantOfAny(node, set));
}

function groupNodesByParent(nodes: INode[]): Map<INodeLinkedList, INode[]> {
  const result = new Map<INodeLinkedList, INode[]>();
  for (const node of nodes) {
    const parent = node.parent;
    if (!parent) continue;
    const list = result.get(parent);
    if (list) list.push(node);
    else result.set(parent, [node]);
  }
  return result;
}

@command({
  key: "modify.deleteNode",
  icon: "icon-delete"
})
export class DeleteNode extends MultistepCommand {
  protected override getSteps(): IStep[] {
    return [
      new GetOrSelectNodeStep("Select nodes to delete", { multiple: true })
    ];
  }

  protected override executeMainTask(): void {
    const selectedNodes = this.stepDatas[0]?.nodes ?? [];
    const nodesToDelete = getTopLevelNodes(selectedNodes).filter(
      node => node.parent !== undefined
    );
    if (nodesToDelete.length === 0) {
      PubSub.default.pub("showToast", "No nodes selected");
      return;
    }

    const deleteSet = new Set(nodesToDelete);
    const currentNode = this.document.modelManager.currentNode;
    if (
      currentNode &&
      (deleteSet.has(currentNode) || isDescendantOfAny(currentNode, deleteSet))
    ) {
      this.document.modelManager.currentNode =
        this.document.modelManager.rootNode;
    }

    this.document.selection.clearSelection();

    const removeGroups = groupNodesByParent(nodesToDelete);
    removeGroups.forEach((nodes, parent) => parent.remove(...nodes));

    this.document.visual.update();
    PubSub.default.pub("showToast", `Deleted ${nodesToDelete.length} node(s)`);
  }
}
