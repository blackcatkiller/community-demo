// @ts-nocheck
import type { ICommand } from "./command";

const commandRegistry = new Map<string, CommandConstructor>();

export type CommandConstructor = new (...args: any[]) => ICommand;

export interface CommandData {
  key: string;
  icon?: string;
  toggle?: any;
  helpText?: string;
  helpUrl?: string;
  isApplicationCommand?: boolean;
}

export function command<T extends CommandConstructor>(metadata: CommandData) {
  return (ctor: T) => {
    commandRegistry.set(metadata.key, ctor);
    (ctor as any).prototype.data = metadata;
  };
}

export class CommandUtils {
  static getCommandData(
    target: string | ICommand | CommandConstructor
  ): CommandData | undefined {
    if (typeof target === "string") {
      const ctor = commandRegistry.get(target);
      return (ctor as any)?.prototype?.data;
    }

    const prototype =
      typeof target === "function"
        ? (target as any).prototype
        : Object.getPrototypeOf(target);

    return prototype?.data;
  }

  static getCommand(name: string): CommandConstructor | undefined {
    return commandRegistry.get(name);
  }

  static getAllCommands(): CommandData[] {
    return Array.from(commandRegistry.values())
      .map(ctor => (ctor as any).prototype?.data)
      .filter(Boolean);
  }
}
