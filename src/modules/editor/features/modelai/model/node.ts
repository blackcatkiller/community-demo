// @ts-nocheck
import { NodeLinkedListHistoryRecord } from "@modelai/core/history";
import { Logger } from "@modelai/core/logger";
import { Observable } from "@modelai/core/observable";
import { property } from "@modelai/core/property";
import { Transaction } from "@modelai/core/transaction";
import {
  type IDocument,
  type INode,
  type INodeLinkedList,
  NodeAction,
  type NodeRecord
} from "@modelai/core/types";
import {
  serializable,
  serialize,
  Serializer,
  type Serialized
} from "../serialize";
import type { ModelManager } from "./modelManager";

let _nodeIdCounter = 0;
function genNodeId(): string {
  return `node_${++_nodeIdCounter}`;
}

let _activeModelManager: ModelManager | undefined;
export function setActiveModelManager(mm: ModelManager) {
  _activeModelManager = mm;
}

export abstract class Node extends Observable implements INode {
  @serialize()
  readonly id: string;
  parent: INodeLinkedList | undefined;
  previousSibling: INode | undefined;
  nextSibling: INode | undefined;

  @serialize()
  @property("鍚嶇О", { group: "閫氱敤" })
  get name(): string {
    return this.getPrivateValue("name" as any, "untitled") as any;
  }
  set name(v: string) {
    this.setProperty("name" as any, v as any);
  }

  @serialize()
  @property("鍙", { group: "閫氱敤" })
  get visible(): boolean {
    return this.getPrivateValue("visible" as any, true) as any;
  }
  set visible(v: boolean) {
    this.setProperty("visible" as any, v as any, () => this.onVisibleChanged());
  }

  get parentVisible(): boolean {
    return this.getPrivateValue("parentVisible" as any, true) as any;
  }
  set parentVisible(v: boolean) {
    this.setProperty(
      "parentVisible" as any,
      v as any,
      () => this.onParentVisibleChanged(),
      undefined,
      false
    );
  }

  constructor(name: string, id?: string) {
    super();
    this.id = id ?? genNodeId();
    this.setPrivateValue("name" as any, name as any);
  }

  protected abstract onVisibleChanged(): void;
  protected abstract onParentVisibleChanged(): void;

  protected override getHistoryDocument(): IDocument | undefined {
    return _activeModelManager?.document;
  }

  protected disposeInternal(): void {
    super.disposeInternal();
  }
}

@serializable<FolderNode>({
  serialize: target => ({
    id: target.id,
    name: target.name,
    visible: target.visible
  }),
  deserialize: (data: Record<string, unknown>) => {
    const node = new FolderNode(
      String(data.name ?? "untitled"),
      String(data.id ?? "")
    );
    node.visible = Boolean(data.visible);
    return node;
  }
})
export class FolderNode extends Node implements INodeLinkedList {
  private _count = 0;
  private _firstChild: INode | undefined;
  private _lastChild: INode | undefined;

  get firstChild() {
    return this._firstChild;
  }
  get lastChild() {
    return this._lastChild;
  }
  size() {
    return this._count;
  }

  constructor(name: string, id?: string) {
    super(name, id);
  }

  add(...items: INode[]) {
    const records: NodeRecord[] = items.map(item => ({
      action: NodeAction.add,
      node: item,
      newParent: this,
      newPrevious: this._lastChild
    }));

    if (records.length > 0 && _activeModelManager?.document) {
      Transaction.add(
        _activeModelManager.document,
        new NodeLinkedListHistoryRecord(records)
      );
    }

    items.forEach(item => {
      item.parent = this;
      item.parentVisible = this.visible && this.parentVisible;
      if (!this._firstChild) {
        this._firstChild = this._lastChild = item;
        item.previousSibling = item.nextSibling = undefined;
      } else {
        this._lastChild!.nextSibling = item;
        item.previousSibling = this._lastChild;
        item.nextSibling = undefined;
        this._lastChild = item;
      }
      this._count++;
    });

    _activeModelManager?.notifyNodeChanged(records);
  }

  insertAfter(previousSibling: INode | undefined, ...items: INode[]) {
    const records: NodeRecord[] = [];
    let anchor = previousSibling;
    items.forEach(item => {
      records.push({
        action: NodeAction.insertAfter,
        node: item,
        newParent: this,
        newPrevious: anchor
      });
      anchor = item;
    });

    if (records.length > 0 && _activeModelManager?.document) {
      Transaction.add(
        _activeModelManager.document,
        new NodeLinkedListHistoryRecord(records)
      );
    }

    let currentAnchor = previousSibling;
    items.forEach(item => {
      this.insertNodeAfter(item, currentAnchor);
      currentAnchor = item;
    });

    _activeModelManager?.notifyNodeChanged(records);
  }

  remove(...items: INode[]) {
    const records: NodeRecord[] = items
      .filter(i => i.parent === this)
      .map(item => ({
        action: NodeAction.remove,
        node: item,
        oldParent: this,
        oldPrevious: item.previousSibling
      }));

    if (records.length > 0 && _activeModelManager?.document) {
      Transaction.add(
        _activeModelManager.document,
        new NodeLinkedListHistoryRecord(records)
      );
    }

    records.forEach(r => {
      this.removeNode(r.node);
      r.node.parent = undefined;
    });

    _activeModelManager?.notifyNodeChanged(records);
  }

  private removeNode(node: INode) {
    if (node === this._firstChild && node === this._lastChild) {
      this._firstChild = this._lastChild = undefined;
    } else if (node === this._firstChild) {
      this._firstChild = node.nextSibling;
      if (this._firstChild) this._firstChild.previousSibling = undefined;
      node.nextSibling = undefined;
    } else if (node === this._lastChild) {
      this._lastChild = node.previousSibling;
      if (this._lastChild) this._lastChild.nextSibling = undefined;
      node.previousSibling = undefined;
    } else {
      node.previousSibling!.nextSibling = node.nextSibling;
      node.nextSibling!.previousSibling = node.previousSibling;
      node.previousSibling = node.nextSibling = undefined;
    }
    this._count--;
  }

  private insertNodeAfter(node: INode, previousSibling?: INode) {
    node.parent = this;
    node.parentVisible = this.visible && this.parentVisible;

    if (!this._firstChild) {
      this._firstChild = this._lastChild = node;
      node.previousSibling = node.nextSibling = undefined;
    } else if (!previousSibling) {
      node.nextSibling = this._firstChild;
      this._firstChild.previousSibling = node;
      this._firstChild = node;
      node.previousSibling = undefined;
    } else if (previousSibling === this._lastChild) {
      this._lastChild!.nextSibling = node;
      node.previousSibling = this._lastChild;
      node.nextSibling = undefined;
      this._lastChild = node;
    } else {
      node.previousSibling = previousSibling;
      node.nextSibling = previousSibling.nextSibling;
      previousSibling.nextSibling = node;
      if (node.nextSibling) node.nextSibling.previousSibling = node;
    }

    this._count++;
  }

  move(child: INode, newParent: INodeLinkedList, previousSibling?: INode) {
    const record: NodeRecord = {
      action: NodeAction.move,
      node: child,
      oldParent: child.parent as INodeLinkedList,
      oldPrevious: child.previousSibling,
      newParent,
      newPrevious: previousSibling
    };

    if (_activeModelManager?.document) {
      Transaction.add(
        _activeModelManager.document,
        new NodeLinkedListHistoryRecord([record])
      );
    }

    this.removeNode(child);
    const target = newParent as FolderNode;
    target.insertNodeAfter(child, previousSibling);

    _activeModelManager?.notifyNodeChanged([record]);
  }

  protected onVisibleChanged() {
    this.setChildrenParentVisible();
  }
  protected onParentVisibleChanged() {
    this.setChildrenParentVisible();
  }

  private setChildrenParentVisible() {
    let child = this._firstChild;
    while (child) {
      child.parentVisible = this.visible && this.parentVisible;
      child = child.nextSibling;
    }
  }

  children(): INode[] {
    const result: INode[] = [];
    let node = this._firstChild;
    while (node) {
      result.push(node);
      node = node.nextSibling;
    }
    return result;
  }

  override disposeInternal() {
    let node = this._firstChild;
    while (node) {
      const next = node.nextSibling;
      node.dispose();
      node = next;
    }
    super.disposeInternal();
  }
}

@serializable<GroupNode>({
  serialize: target => ({
    id: target.id,
    name: target.name,
    visible: target.visible
  }),
  deserialize: (data: Record<string, unknown>) => {
    const node = new GroupNode(
      String(data.name ?? "untitled"),
      String(data.id ?? "")
    );
    node.visible = Boolean(data.visible);
    return node;
  }
})
export class GroupNode extends FolderNode {
  constructor(name: string, id?: string) {
    super(name, id);
  }
}

export class NodeUtils {
  static serializeNode(node: INode) {
    const nodes: SerializedNodeRecord[] = [];
    NodeUtils.serializeNodeToArray(nodes, node, undefined);
    return nodes;
  }

  static async deserializeNode(
    document: IDocument,
    nodes: SerializedNodeRecord[]
  ) {
    if (!nodes.length) return undefined;
    const allNodeMap = new Map<string, INode>();
    const nodeMap = new Map<string, INodeLinkedList>();
    for (const item of nodes) {
      const node = NodeUtils.deserializeNodeRecord(document, item);
      if (!node) continue;
      allNodeMap.set(item.id, node);
      if (NodeUtils.isLinkedListNode(node)) {
        nodeMap.set(item.id, node);
      }
    }

    const { reconnectPendingShapeReferences } = await import("./shapeNode");
    reconnectPendingShapeReferences(allNodeMap.values());

    for (const item of nodes) {
      const node = allNodeMap.get(item.id);
      if (!item.parentId || !node) continue;
      const parent = nodeMap.get(item.parentId);
      if (!node || !parent || !NodeUtils.isLinkedListNode(parent)) {
        Logger.warn(
          `[ModelAI] parent not found during node deserialize: ${item.parentId}`
        );
        continue;
      }
      parent.add(node);
    }

    const rootRecord = nodes[0];
    if (!rootRecord) return undefined;
    const rootNode = allNodeMap.get(rootRecord.id);
    return rootNode && NodeUtils.isLinkedListNode(rootNode)
      ? rootNode
      : undefined;
  }

  static isLinkedListNode(node: INode): node is INodeLinkedList {
    return typeof (node as any).add === "function";
  }

  static nodeOrChildrenAppendToNodes(nodes: INode[], node: INode) {
    if (NodeUtils.isLinkedListNode(node)) {
      nodes.push(node);
      let child = node.firstChild;
      while (child) {
        NodeUtils.nodeOrChildrenAppendToNodes(nodes, child);
        child = child.nextSibling;
      }
    } else {
      nodes.push(node);
    }
  }

  static findNodes(
    parent: INodeLinkedList,
    predicate?: (v: INode) => boolean
  ): INode[] {
    const result: INode[] = [];
    const walk = (node: INode | undefined) => {
      if (!node) return;
      if (!predicate || predicate(node)) result.push(node);
      if (NodeUtils.isLinkedListNode(node)) walk(node.firstChild);
      walk(node.nextSibling);
    };
    walk(parent.firstChild);
    return result;
  }

  private static serializeNodeToArray(
    nodes: SerializedNodeRecord[],
    node: INode,
    parentId: string | undefined
  ) {
    const serialized = NodeUtils.serializeNodeRecord(node, parentId);
    if (!serialized) return;
    nodes.push(serialized);

    if (NodeUtils.isLinkedListNode(node) && node.firstChild) {
      NodeUtils.serializeNodeToArray(nodes, node.firstChild, node.id);
    }
    if (node.nextSibling) {
      NodeUtils.serializeNodeToArray(nodes, node.nextSibling, parentId);
    }
  }

  private static serializeNodeRecord(
    node: INode,
    parentId: string | undefined
  ): SerializedNodeRecord | undefined {
    let serialized: Serialized;
    try {
      serialized = Serializer.serializeObject(node as object);
    } catch (error) {
      Logger.warn(
        `[ModelAI] skip unsupported node serialization: ${node.constructor.name}`,
        error
      );
      return undefined;
    }
    const result: SerializedNodeRecord = { ...serialized };
    if (parentId) {
      result.parentId = parentId;
    }
    return result;
  }

  private static deserializeNodeRecord(
    document: IDocument,
    data: SerializedNodeRecord
  ): INode | undefined {
    try {
      return Serializer.deserializeObject(
        document,
        data as Serialized
      ) as INode;
    } catch (error) {
      Logger.warn(
        "[ModelAI] skip invalid node during deserialize",
        data,
        error
      );
      return undefined;
    }
  }
}

export interface SerializedNodeRecord extends Serialized {
  parentId?: string;
}
