// @ts-nocheck
import { Logger, PubSub } from "@modelai/core";

export interface Keys {
  key: string;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}

export interface HotkeyMap {
  [key: string]: string;
}

export class HotkeyService {
  private readonly keyMap = new Map<string, string>();
  private keys: string[] = [];
  private enabled = true;

  start(): void {
    PubSub.default.sub("executeCommand", this.resetKeys);
    PubSub.default.sub("queryHotkeys", this.queryHotkeys);
    window.addEventListener("keydown", this.commandKeyDown);
    Logger.info(`${HotkeyService.name} started`);
  }

  stop(): void {
    PubSub.default.remove("executeCommand", this.resetKeys);
    PubSub.default.remove("queryHotkeys", this.queryHotkeys);
    window.removeEventListener("keydown", this.commandKeyDown);
    Logger.info(`${HotkeyService.name} stopped`);
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  addMap(map: HotkeyMap) {
    Object.keys(map).forEach(key => {
      this.keyMap.set(key.toLowerCase(), map[key]);
    });
  }

  getShortcuts(commandKey: string): string[] {
    const result: string[] = [];
    for (const [key, command] of this.keyMap.entries()) {
      if (command === commandKey) result.push(key);
    }
    return result;
  }

  private readonly commandKeyDown = (e: KeyboardEvent) => {
    if (!this.enabled) return;
    const target = e.target as HTMLElement;
    if (
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable
    ) {
      return;
    }

    const keys: Keys = {
      key: e.key.toLowerCase(),
      ctrlKey: e.ctrlKey || e.metaKey,
      shiftKey: e.shiftKey,
      altKey: e.altKey
    };

    const command = this.getCommand(keys);
    if (command !== undefined) {
      e.preventDefault();
      e.stopImmediatePropagation();
      PubSub.default.pub("executeCommand", command);
    }
  };

  private getCommand(keys: Keys): string | undefined {
    const maxKeyLength = 20;
    const totalLength = this.keys.length + keys.key.length;
    if (totalLength > maxKeyLength) {
      this.keys = this.keys.slice(totalLength - maxKeyLength);
    }
    this.keys.push(keys.key);

    for (let i = 0; i < this.keys.length; i++) {
      let key = this.keys.slice(i).join("+");
      if (keys.ctrlKey) key = `ctrl+${key}`;
      if (keys.shiftKey) key = `shift+${key}`;
      if (keys.altKey) key = `alt+${key}`;
      if (this.keyMap.has(key)) {
        return this.keyMap.get(key);
      }
    }
    return undefined;
  }

  private readonly resetKeys = () => {
    this.keys = [];
  };

  private readonly queryHotkeys = (
    commandKey: string,
    reply?: (shortcuts: string[]) => void
  ) => {
    if (typeof reply !== "function") return;
    reply(this.getShortcuts(commandKey));
  };
}
