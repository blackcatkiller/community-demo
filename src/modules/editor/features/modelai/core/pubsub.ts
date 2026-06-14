// @ts-nocheck
import type { CommandKeys } from "@modelai/command/commandKeys";
import type { ICommand } from "@modelai/command/command";
import type { IDocument, INode, IView, CursorType } from "./types";
import type { AsyncController } from "./asyncController";
import type { Result } from "./result";
import type { IDisposable } from "./gc";

export type I18nKeys = string;
export type MessageType = "info" | "warn" | "error";
export type DialogResult = "ok" | "cancel" | "close" | string;
export type Material = unknown;
export interface MeasurementRow {
  label: string;
  value: string;
}

export interface MeasurementResultMessage {
  text?: string;
  rows?: MeasurementRow[];
  id?: number;
  point?: import("@modelai/core/math").XYZ;
  meshId?: number;
}

export interface PubSubEventMap {
  activeViewChanged: (view: IView | undefined) => void;
  clearFloatTip: () => void;
  clearInput: () => void;
  clearSelectionControl: () => void;
  clearStatusBarTip: () => void;
  closeCommandContext: () => void;
  displayError: (message: string) => void;
  displayHome: (show: boolean) => void;
  documentClosed: (document: IDocument) => void;
  editMaterial: (
    document: IDocument,
    material: Material,
    callback: (material: Material) => void
  ) => void;
  executeCommand: (commandName: CommandKeys) => void;
  modelUpdate: (model: INode) => void;
  openNodeParamEditor: (document: IDocument, node: INode) => void;
  openCommandContext: (command: ICommand) => void;
  parentVisibleChanged: (model: INode) => void;
  pushPlatePlaneChanged: (
    document: IDocument,
    z: number,
    beforeZ: number
  ) => void;
  selectionChanged: (
    document: IDocument,
    selected: INode[],
    unselected: INode[]
  ) => void;
  showDialog: (
    title: I18nKeys,
    content: HTMLElement,
    callback?: (result: DialogResult) => void
  ) => void;
  showFloatTip: (
    dom: HTMLElement | { level: MessageType; msg: string }
  ) => void;
  showInput: (
    text: string,
    handler: (text: string) => Result<string, I18nKeys>
  ) => void;
  showPermanent: (
    action: () => Promise<void>,
    message: I18nKeys,
    ...args: any[]
  ) => void;
  showProperties: (document: IDocument, nodes: INode[]) => void;
  showSelectionControl: (
    payload:
      | AsyncController
      | {
          controller: AsyncController;
          canConfirm?: () => boolean;
          invalidConfirmMessageKey?: I18nKeys;
        }
  ) => void;
  showToast: (message: I18nKeys, ...args: any[]) => void;
  statusBarTip: (tip: I18nKeys) => void;
  viewClosed: (view: IView) => void;
  viewCursor: (cursor: CursorType) => void;
  visibleChanged: (model: INode) => void;

  commandFinished: (
    commandName: string,
    command: ICommand | unknown,
    status: "success" | "cancel" | "fail"
  ) => void;
  commandStarted: (commandName: string, command: ICommand | unknown) => void;
  queryHotkeys: (
    commandName: string,
    callback: (keys: string[]) => void
  ) => void;
  showMeasurementResult: (message: string | MeasurementResultMessage) => void;
  clearMeasurementResult: (id?: number) => void;
  "workbenchGui.register": (payload: {
    id: string;
    build: (gui: unknown) => { dispose?: () => void } | void;
  }) => void;
  "workbenchGui.unregister": (id: string) => void;
}

type EventCallback = (...args: any[]) => void;
type EventMap = Map<keyof PubSubEventMap, Set<EventCallback>>;

export class PubSub implements IDisposable {
  static readonly default = new PubSub();
  private readonly events: EventMap = new Map();
  private isDisposed = false;

  dispose(): void {
    this.isDisposed = true;
    this.events.forEach(callbacks => callbacks.clear());
    this.events.clear();
  }

  sub<K extends keyof PubSubEventMap>(
    event: K,
    callback: PubSubEventMap[K]
  ): void {
    if (this.isDisposed) return;
    const callbacks = this.events.get(event) ?? new Set<EventCallback>();
    callbacks.add(callback);
    this.events.set(event, callbacks);
  }

  pub<K extends keyof PubSubEventMap>(
    event: K,
    ...args: Parameters<PubSubEventMap[K]>
  ): void {
    if (this.isDisposed) return;
    this.events.get(event)?.forEach(callback => callback(...args));
  }

  remove<K extends keyof PubSubEventMap>(
    event: K,
    callback: PubSubEventMap[K]
  ): void {
    if (this.isDisposed) return;
    this.events.get(event)?.delete(callback);
  }

  removeAll(): void;
  removeAll<K extends keyof PubSubEventMap>(event: K): void;
  removeAll<K extends keyof PubSubEventMap>(event?: K): void {
    if (this.isDisposed) return;
    if (!event) {
      this.events.clear();
      return;
    }
    this.events.get(event)?.clear();
  }
}
