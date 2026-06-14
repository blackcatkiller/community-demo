// @ts-nocheck
import { NodeAction, type INode, type INodeLinkedList } from "./types";
import type { IDisposable } from "./gc";

export interface IHistoryRecord extends IDisposable {
  readonly name: string;
  undo(): void;
  redo(): void;
}

export class History implements IDisposable {
  private readonly undos: IHistoryRecord[] = [];
  private readonly redos: IHistoryRecord[] = [];

  disabled = false;
  undoLimits = 50;

  #isUndoing = false;
  get isUndoing() {
    return this.#isUndoing;
  }

  #isRedoing = false;
  get isRedoing() {
    return this.#isRedoing;
  }

  dispose(): void {
    this.redos.forEach(record => record.dispose());
    this.undos.forEach(record => record.dispose());
    this.clear();
  }

  private clear(): void {
    this.undos.length = 0;
    this.redos.length = 0;
  }

  add(record: IHistoryRecord) {
    if (this.disabled) return;

    this.redos.splice(0).forEach(item => item.dispose());
    this.undos.push(record);

    if (this.undos.length > this.undoLimits) {
      const removed = this.undos.shift();
      removed?.dispose();
    }
  }

  undoCount() {
    return this.undos.length;
  }

  redoCount() {
    return this.redos.length;
  }

  undo() {
    this.#isUndoing = true;
    this.tryOperate(
      () => {
        const record = this.undos.pop();
        if (!record) return;
        record.undo();
        this.redos.push(record);
      },
      () => {
        this.#isUndoing = false;
      }
    );
  }

  redo() {
    this.#isRedoing = true;
    this.tryOperate(
      () => {
        const record = this.redos.pop();
        if (!record) return;
        record.redo();
        this.undos.push(record);
      },
      () => {
        this.#isRedoing = false;
      }
    );
  }

  private tryOperate(action: () => void, onFinally: () => void) {
    const previousState = this.disabled;
    this.disabled = true;
    try {
      action();
    } finally {
      this.disabled = previousState;
      onFinally();
    }
  }
}

export class PropertyHistoryRecord implements IHistoryRecord {
  readonly name: string;

  constructor(
    readonly object: any,
    readonly property: string | symbol | number,
    readonly oldValue: any,
    readonly newValue: any
  ) {
    this.name = `change ${String(property)} property`;
  }

  dispose(): void {}

  undo(): void {
    this.object[this.property] = this.oldValue;
  }

  redo(): void {
    this.object[this.property] = this.newValue;
  }
}

export interface NodeHistoryRecord {
  node: INode;
  action: NodeAction;
  oldParent?: INodeLinkedList;
  oldPrevious?: INode;
  newParent?: INodeLinkedList;
  newPrevious?: INode;
}

export class NodeLinkedListHistoryRecord implements IHistoryRecord {
  readonly name: string;

  constructor(readonly records: NodeHistoryRecord[]) {
    this.name = "change node";
  }

  dispose(): void {
    this.records.forEach(record => {
      // Temporary safety guard: if a removed node has already been reattached
      // (for example via undo), dropping the redo record must not dispose the
      // live node out from under the current tree.
      if (
        record.action === NodeAction.remove &&
        record.node.parent === undefined
      ) {
        record.node.dispose();
      }
    });
    this.records.length = 0;
  }

  private handleUndo(record: NodeHistoryRecord): void {
    switch (record.action) {
      case NodeAction.add:
      case NodeAction.insertAfter:
      case NodeAction.insertBefore:
        record.newParent?.remove(record.node);
        break;
      case NodeAction.remove:
        record.oldParent?.add(record.node);
        break;
      case NodeAction.move:
        record.newParent?.move(
          record.node,
          record.oldParent!,
          record.oldPrevious
        );
        break;
      default:
        record.newParent?.remove(record.node);
        break;
    }
  }

  private handleRedo(record: NodeHistoryRecord): void {
    switch (record.action) {
      case NodeAction.add:
        record.newParent?.add(record.node);
        break;
      case NodeAction.insertAfter:
      case NodeAction.insertBefore:
        record.newParent?.insertAfter(record.newPrevious, record.node);
        break;
      case NodeAction.remove:
        record.oldParent?.remove(record.node);
        break;
      case NodeAction.move:
        record.oldParent?.move(
          record.node,
          record.newParent!,
          record.newPrevious
        );
        break;
      default:
        break;
    }
  }

  undo(): void {
    for (let i = this.records.length - 1; i >= 0; i--) {
      this.handleUndo(this.records[i]);
    }
  }

  redo(): void {
    this.records.forEach(record => this.handleRedo(record));
  }
}

export class ArrayRecord implements IHistoryRecord {
  readonly records: IHistoryRecord[] = [];

  constructor(readonly name: string) {}

  dispose(): void {
    this.records.forEach(record => record.dispose());
  }

  undo(): void {
    for (let i = this.records.length - 1; i >= 0; i--) {
      this.records[i].undo();
    }
  }

  redo(): void {
    for (const record of this.records) {
      record.redo();
    }
  }
}
