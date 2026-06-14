// @ts-nocheck
import type { IDocument } from "./types";
import { ArrayRecord, type IHistoryRecord } from "./history";
import { Logger } from "./logger";

export class Transaction {
  private static readonly transactionMap = new WeakMap<
    IDocument,
    ArrayRecord
  >();

  constructor(
    readonly document: IDocument,
    readonly name: string
  ) {}

  static add(document: IDocument, record: IHistoryRecord) {
    if (document.history.disabled) return;

    const transaction = Transaction.transactionMap.get(document);
    if (transaction) {
      transaction.records.push(record);
      return;
    }

    Transaction.addToHistory(document, record);
  }

  static addToHistory(document: IDocument, record: IHistoryRecord) {
    document.history.add(record);
    Logger.info(`history added ${record.name}`);
  }

  static execute(document: IDocument, name: string, action: () => void) {
    const transaction = new Transaction(document, name);
    transaction.start();
    try {
      action();
      transaction.commit();
    } catch (error) {
      transaction.rollback();
      throw error;
    }
  }

  static async executeAsync(
    document: IDocument,
    name: string,
    action: () => Promise<void>
  ) {
    const transaction = new Transaction(document, name);
    transaction.start();
    try {
      await action();
      transaction.commit();
    } catch (error) {
      transaction.rollback();
      throw error;
    }
  }

  start(name?: string) {
    const transactionName = name ?? this.name;
    if (Transaction.transactionMap.has(this.document)) {
      throw new Error(`The document has started a transaction ${this.name}`);
    }
    Transaction.transactionMap.set(
      this.document,
      new ArrayRecord(transactionName)
    );
  }

  commit() {
    const transaction = Transaction.transactionMap.get(this.document);
    if (!transaction) {
      throw new Error("Transaction has not started");
    }
    if (transaction.records.length > 0) {
      Transaction.addToHistory(this.document, transaction);
    }
    Transaction.transactionMap.delete(this.document);
  }

  rollback() {
    const transaction = Transaction.transactionMap.get(this.document);
    Transaction.transactionMap.delete(this.document);
    transaction?.undo();
  }
}
