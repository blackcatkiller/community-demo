// @ts-nocheck
import { Observable } from "@modelai/core/observable";
import type {
  IDocument,
  INode,
  INodeLinkedList,
  NodeRecord,
  OnNodeChanged
} from "@modelai/core/types";
import {
  FolderNode,
  NodeUtils,
  type SerializedNodeRecord,
  setActiveModelManager
} from "./node";

export interface SerializedModelManager {
  nodes: SerializedNodeRecord[];
}

export class ModelManager extends Observable {
  private readonly _observers = new Set<OnNodeChanged>();
  private _rootNode: INodeLinkedList;
  readonly document: IDocument;

  get rootNode(): INodeLinkedList {
    return this._rootNode;
  }

  set rootNode(value: INodeLinkedList) {
    if (this._rootNode === value) return;
    const prev = this._rootNode;
    const topLevel: INode[] = [];
    let c = prev.firstChild;
    while (c) {
      topLevel.push(c);
      c = c.nextSibling;
    }
    if (topLevel.length > 0) {
      prev.remove(...topLevel);
      topLevel.forEach(node => node.dispose());
    }
    prev.dispose();
    this._rootNode = value;
    this._currentNode = undefined;
    // Deserialization hooks attach nodes before rootNode is swapped; observers must rebuild once the real root is active.
    this.notifyNodeChanged([]);
  }

  private _currentNode?: INodeLinkedList;
  get currentNode(): INodeLinkedList | undefined {
    return this._currentNode;
  }
  set currentNode(v: INodeLinkedList | undefined) {
    this._currentNode = v;
  }

  constructor(document: IDocument, name: string) {
    super();
    this.document = document;
    this._rootNode = new FolderNode(name);
    setActiveModelManager(this);
  }

  addNodeObserver(obs: OnNodeChanged) {
    this._observers.add(obs);
  }
  removeNodeObserver(obs: OnNodeChanged) {
    this._observers.delete(obs);
  }

  notifyNodeChanged(records: NodeRecord[]) {
    for (const obs of this._observers) obs(records);
  }

  addNode(...nodes: INode[]) {
    (this.currentNode ?? this.rootNode).add(...nodes);
  }

  findNodes(predicate?: (v: INode) => boolean): INode[] {
    return NodeUtils.findNodes(this._rootNode, predicate);
  }

  serialize(): SerializedModelManager {
    return { nodes: NodeUtils.serializeNode(this._rootNode) };
  }

  async deserialize(data: SerializedModelManager | null | undefined) {
    if (!data?.nodes?.length) {
      this.rootNode = new FolderNode(this.document.name);
      return;
    }
    const rootNode = await NodeUtils.deserializeNode(this.document, data.nodes);
    this.rootNode = rootNode ?? new FolderNode(this.document.name);
  }

  override disposeInternal() {
    super.disposeInternal();
    this._observers.clear();
    this._rootNode.dispose();
  }
}
