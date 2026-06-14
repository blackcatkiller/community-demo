// @ts-nocheck
import type { IDocument, INode, INodeLinkedList } from "@modelai/core/types";
import { HorizontalRunnerNode } from "../horizontalRunner/horizontalRunner";
import { LargeGateNode } from "../large/largeGate";
import { GroupNode } from "@modelai/model/node";
import { PartingRunnerNode } from "../partingRunner/partingRunner";
import { PointVerticalRunnerNode } from "../pointVerticalRunner/pointVerticalRunner";
import { ShapeNode } from "@modelai/model/shapeNode";
import { VerticalRunnerNode } from "../verticalRunner/verticalRunner";
import { transformI18n } from "@/plugins/i18n";

function resolveRunnerTypeSource(node: INode): INode {
  if (node instanceof ShapeNode) {
    return node.resolvedShapeSource;
  }

  return node;
}

function resolveRunnerTypeGroupName(node: INode): string | undefined {
  const source = resolveRunnerTypeSource(node);

  if (source instanceof HorizontalRunnerNode) {
    return transformI18n("modelai.body.horizontalRunner");
  }

  if (source instanceof PartingRunnerNode) {
    return transformI18n("modelai.body.partingRunner");
  }

  if (source instanceof VerticalRunnerNode) {
    return transformI18n("modelai.body.verticalRunner");
  }

  if (source instanceof PointVerticalRunnerNode) {
    return transformI18n("modelai.body.pointVerticalRunner");
  }

  if (source instanceof LargeGateNode) {
    return transformI18n("modelai.body.largeGate");
  }

  return undefined;
}

function resolveRunnerRootTypeGroup(
  document: IDocument,
  groupName: string
): INodeLinkedList {
  const root = document.modelManager.rootNode;
  let child = root.firstChild;

  while (child) {
    if (child instanceof GroupNode && child.name === groupName) {
      return child;
    }
    child = child.nextSibling;
  }

  const group = new GroupNode(groupName);
  root.add(group);
  return group;
}

export function resolveRunnerNodeRootTypeGroup(
  document: IDocument,
  node: INode
): INodeLinkedList | undefined {
  const groupName = resolveRunnerTypeGroupName(node);
  return groupName
    ? resolveRunnerRootTypeGroup(document, groupName)
    : undefined;
}

export function resolveNodeParentWithRunnerRootGrouping(
  document: IDocument,
  node: INode,
  fallbackParent?: INodeLinkedList
): INodeLinkedList {
  return (
    resolveRunnerNodeRootTypeGroup(document, node) ??
    fallbackParent ??
    document.modelManager.currentNode ??
    document.modelManager.rootNode
  );
}

export function addNodeWithRunnerRootGrouping(
  document: IDocument,
  node: INode,
  fallbackParent?: INodeLinkedList
): INodeLinkedList {
  const parent = resolveNodeParentWithRunnerRootGrouping(
    document,
    node,
    fallbackParent
  );
  parent.add(node);
  return parent;
}

export function commitDraftNodeWithRunnerRootGrouping(
  document: IDocument,
  node: INode,
  fallbackParent?: INodeLinkedList
): INodeLinkedList {
  document.visual.context.removeNode([node]);
  return addNodeWithRunnerRootGrouping(document, node, fallbackParent);
}
