// @ts-nocheck
import { Logger, PubSub } from "@modelai/core";
import type { IApplication } from "@modelai/core/types";
import { CommandUtils } from "@modelai/command";
import { isCancelableCommand } from "@modelai/command";
import { transformI18n } from "@/plugins/i18n";
import { ElMessageBox } from "element-plus";

export class CommandService {
  private lastCommand?: string;
  private checking = false;
  private app?: IApplication;

  register(app: IApplication) {
    this.app = app;
    Logger.info(`${CommandService.name} registered`);
  }

  start(): void {
    PubSub.default.sub("executeCommand", this.executeCommand);
    PubSub.default.sub("activeViewChanged", this.onActiveViewChanged);
    Logger.info(`${CommandService.name} started`);
  }

  stop(): void {
    PubSub.default.remove("executeCommand", this.executeCommand);
    PubSub.default.remove("activeViewChanged", this.onActiveViewChanged);
    Logger.info(`${CommandService.name} stopped`);
  }

  execute(commandName: string) {
    PubSub.default.pub("executeCommand", commandName);
  }

  private readonly onActiveViewChanged = async () => {
    const app = this.app;
    if (!app) return;
    const current = (app as any).executingCommand;
    if (current && isCancelableCommand(current)) {
      await current.cancel();
    }
  };

  private readonly executeCommand = async (commandName: string) => {
    const command =
      commandName === "special.last" ? this.lastCommand : commandName;
    if (!command || !(await this.canExecute(command))) return;
    Logger.info(`executing command ${command}`);
    await this.executeAsync(command);
  };

  private async executeAsync(commandName: string) {
    const app = this.app;
    if (!app) return;
    const ctor = CommandUtils.getCommand(commandName);
    if (!ctor) {
      Logger.error(`Can not find ${commandName} command`);
      return;
    }
    const command = new ctor();
    (app as any).executingCommand = command;
    PubSub.default.pub("commandStarted", commandName, command);
    PubSub.default.pub("showProperties", app.activeView?.document, []);

    let status: "success" | "cancel" | "fail" = "success";
    try {
      await command.execute(app);
    } catch (err) {
      status = "fail";
      PubSub.default.pub("displayError", err as string);
      Logger.error(err);
    } finally {
      this.lastCommand = commandName;
      (app as any).executingCommand = undefined;
      PubSub.default.pub("commandFinished", commandName, command, status);
    }
  }

  private async canExecute(commandName: string) {
    if (this.checking) return false;
    this.checking = true;
    const result = await this.checkingCommand(commandName);
    this.checking = false;
    return result;
  }

  private async checkingCommand(commandName: string) {
    const app = this.app;
    if (!app) return false;
    const commandData = CommandUtils.getCommandData(commandName);
    if (!commandData?.isApplicationCommand && app.activeView === undefined) {
      await this.showDialog(transformI18n("modelai.command.error.noDocument"));
      return false;
    }
    if (!commandData?.isApplicationCommand) {
      const modelManager = app.activeView?.document?.modelManager;
      const rootNode = modelManager?.rootNode as any;
      const hasModel =
        typeof rootNode?.size === "function" ? rootNode.size() > 0 : true;
      if (!hasModel) {
        await this.showDialog(transformI18n("modelai.command.error.noModel"));
        return false;
      }
    }
    const current = (app as any).executingCommand;
    if (!current) return true;
    if (CommandUtils.getCommandData(current)?.key === commandName) {
      await this.showDialog(
        this.formatMessage(
          "modelai.command.error.commandExecuting",
          commandName
        )
      );
      return false;
    }
    if (isCancelableCommand(current)) {
      await current.cancel();
      return true;
    }
    return false;
  }

  private async showDialog(message: string) {
    try {
      await ElMessageBox.alert(
        message,
        transformI18n("modelai.command.dialogTitle"),
        {
          confirmButtonText: transformI18n("buttons.pureConfirm"),
          customClass: "workbench-dialog",
          type: "warning",
          showClose: false,
          closeOnClickModal: true,
          closeOnPressEscape: true
        }
      );
    } catch {
      // ignore close
    }
  }

  private formatMessage(key: string, ...args: Array<string | number>) {
    let text = transformI18n(key);
    args.forEach((value, index) => {
      text = text.replace(`{${index}}`, String(value));
    });
    return text;
  }
}
