// @ts-nocheck
import type { IDisposable } from "./gc";
import { PropertyHistoryRecord } from "./history";
import { Transaction } from "./transaction";
import type { IDocument } from "./types";

export type PropertyChangedHandler = (
  property: string,
  source: any,
  oldValue: any
) => void;

export class Observable implements IDisposable {
  private readonly _handlers = new Set<PropertyChangedHandler>();
  protected _isDisposed = false;

  protected getPrivateValue<K extends keyof this>(
    key: K,
    defaultValue?: this[K]
  ): this[K] {
    const pk = `_${String(key)}` as keyof this;
    if (pk in this) return this[pk] as this[K];
    if (defaultValue !== undefined) {
      (this as any)[pk] = defaultValue;
      return defaultValue;
    }
    return undefined as this[K];
  }

  protected setPrivateValue<K extends keyof this>(
    key: K,
    value: this[K]
  ): void {
    (this as any)[`_${String(key)}`] = value;
  }

  protected getHistoryDocument(): IDocument | undefined {
    return undefined;
  }

  protected setProperty(
    property: string,
    newValue: any,
    onChanged?: (property: string, oldValue: any) => void,
    equals?: { equals: (a: any, b: any) => boolean },
    recordHistory = true
  ): boolean {
    const oldValue =
      (this as any)[property] ?? this.getPrivateValue(property as any);
    if (equals ? equals.equals(oldValue, newValue) : oldValue === newValue)
      return false;
    this.setPrivateValue(property as any, newValue);
    const document = this.getHistoryDocument();
    if (recordHistory && document) {
      Transaction.add(
        document,
        new PropertyHistoryRecord(this, property, oldValue, newValue)
      );
    }
    onChanged?.(property, oldValue);
    this.emitPropertyChanged(property, oldValue);
    return true;
  }

  protected emitPropertyChanged(property: string, oldValue: any) {
    for (const cb of this._handlers) cb(property, this, oldValue);
  }

  onPropertyChanged(handler: PropertyChangedHandler) {
    this._handlers.add(handler);
  }
  removePropertyChanged(handler: PropertyChangedHandler) {
    this._handlers.delete(handler);
  }
  clearPropertyChanged() {
    this._handlers.clear();
  }

  readonly dispose = () => {
    if (this._isDisposed) return;
    this._isDisposed = true;
    this.disposeInternal();
  };

  protected disposeInternal() {
    this._handlers.clear();
  }
}
