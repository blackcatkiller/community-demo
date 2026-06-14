// @ts-nocheck
import type { IApplication } from "@modelai/core/types";
import type { AsyncController } from "@modelai/core";
import { Observable, PubSub } from "@modelai/core";
import { type Property, PropertyUtils, property } from "@modelai/core/property";
import type { IDisposable } from "@modelai/core/gc";

export interface ICommand {
  execute(application: IApplication): Promise<void>;
}

export interface ICancelableCommand extends ICommand, IDisposable {
  cancel(): Promise<void>;
}

export function isCancelableCommand(
  command: ICommand
): command is ICancelableCommand {
  return "cancel" in command;
}

export abstract class CancelableCommand
  extends Observable
  implements ICancelableCommand
{
  private static readonly propertiesCache = new Map<string, any>();
  protected readonly disposeStack: Set<IDisposable> = new Set();

  private isCompleted = false;
  private isCanceled = false;
  private applicationRef: IApplication | undefined;

  protected get application(): IApplication {
    if (!this.applicationRef) throw new Error("application is not set");
    return this.applicationRef;
  }

  protected get document() {
    const doc = this.application.activeView?.document;
    if (!doc) throw new Error("active document is not available");
    return doc;
  }

  private controllerValue?: AsyncController;
  protected get controller() {
    return this.controllerValue;
  }
  protected set controller(value: AsyncController | undefined) {
    if (this.controllerValue === value) return;
    this.controllerValue?.dispose();
    this.controllerValue = value;
  }

  @property("鍙栨秷")
  async cancel() {
    this.isCanceled = true;
    this.controller?.cancel();
    while (!this.isCompleted) {
      await new Promise(r => setTimeout(r, 30));
    }
  }

  @property("閲嶅鎵ц")
  get repeatOperation() {
    return this.getPrivateValue("repeatOperation", false);
  }
  set repeatOperation(value: boolean) {
    this.setProperty("repeatOperation", value);
  }

  protected isRestarting = false;
  protected async restart() {
    this.isRestarting = true;
    await this.cancel();
  }

  protected onRestarting() {}

  async execute(application: IApplication): Promise<void> {
    if (!application.activeView?.document) return;
    this.applicationRef = application;

    try {
      this.beforeExecute();
      await this.executeAsync();

      while (
        this.isRestarting ||
        (!this.checkCanceled() && this.repeatOperation)
      ) {
        this.isRestarting = false;
        this.onRestarting();
        await this.executeAsync();
      }
    } finally {
      this.afterExecute();
    }
  }

  protected checkCanceled() {
    if (this.isCanceled) return true;
    if (this.controller?.result?.status === "cancel") return true;
    return false;
  }

  protected abstract executeAsync(): Promise<void>;

  protected beforeExecute() {
    this.readProperties();
    PubSub.default.pub("openCommandContext", this);
  }

  protected afterExecute() {
    this.saveProperties();
    PubSub.default.pub("closeCommandContext");
    this.controller?.dispose();
    this.disposeStack.forEach(x => x.dispose());
    this.disposeStack.clear();
    this.isCompleted = true;
  }

  private readProperties() {
    PropertyUtils.getProperties(this).forEach(prop => {
      const cacheKey = this.cacheKeyOfProperty(prop);
      if (CancelableCommand.propertiesCache.has(cacheKey)) {
        this.setPrivateValue(
          prop.name as keyof this,
          CancelableCommand.propertiesCache.get(cacheKey)
        );
      }
    });
  }

  private saveProperties() {
    PropertyUtils.getProperties(this).forEach(prop => {
      const cacheKey = this.cacheKeyOfProperty(prop);
      const value = (this as any)[prop.name];
      if (typeof value === "function") return;
      CancelableCommand.propertiesCache.set(cacheKey, value);
    });
  }

  private cacheKeyOfProperty(property: Property) {
    return `${this.constructor.name}_${property.name}`;
  }
}
