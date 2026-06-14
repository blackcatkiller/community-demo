// @ts-nocheck
import { command } from "@modelai/command";
import type { IApplication, IDocument } from "@modelai/core/types";
import type { ICommand } from "@modelai/command";

function refreshDocument(document: IDocument | undefined) {
  document?.selection.clearSelection();
  document?.visual.highlighter.clear();
  document?.visual.update();
}

@command({
  key: "edit.undo",
  icon: "icon-undo",
  isApplicationCommand: true
})
export class Undo implements ICommand {
  async execute(application: IApplication): Promise<void> {
    const document = application.activeView?.document;
    document?.history.undo();
    refreshDocument(document);
  }
}
