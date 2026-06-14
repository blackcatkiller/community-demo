// @ts-nocheck
import {
  AsyncController,
  PubSub,
  type IDocument,
  type IDisposable,
  type INode
} from "@modelai/core";
import type { ICommand } from "@modelai/command/command";
import { mountFormKit } from "@modelai/ui/formKit/mount";
import type { FormKitRegistration } from "@modelai/ui/formKit/runtime";
import {
  createHornGateEditLifecycle,
  hornGateNodeAdapter,
  type HornGateEditorHandle,
  startHornGateEditor
} from "../horn/hornGate";
import {
  createHotTipGateEditLifecycle,
  hotTipGateNodeAdapter,
  type HotTipGateEditorHandle,
  startHotTipGateEditor
} from "../hotTip/hotTipGate";
import {
  createSubGateEditLifecycle,
  startSubGateEditor,
  subGateNodeAdapter,
  type SubGateEditorHandle
} from "../sub/subGate";
import {
  createLargeGateEditLifecycle,
  largeGateNodeAdapter,
  startLargeGateEditor,
  type LargeGateEditorHandle
} from "../large/largeGate";
import {
  createPinPointGateEditLifecycle,
  pinPointGateNodeAdapter,
  startPinPointGateEditor,
  type PinPointGateEditorHandle
} from "../pinPoint/pinPointGate";
import {
  createPointVerticalRunnerEditLifecycle,
  pointVerticalRunnerNodeAdapter,
  startPointVerticalRunnerEditor,
  type PointVerticalRunnerEditorHandle
} from "../pointVerticalRunner/pointVerticalRunner";
import {
  createHorizontalRunnerEditLifecycle,
  HorizontalRunnerNode,
  startHorizontalRunnerEditor,
  type HorizontalRunnerEditorHandle
} from "../horizontalRunner/horizontalRunner";
import {
  createPartingRunnerEditLifecycle,
  PartingRunnerNode,
  startPartingRunnerEditor,
  type PartingRunnerEditorHandle
} from "../partingRunner/partingRunner";
import {
  VerticalRunnerEditSession,
  VerticalRunnerNode
} from "../verticalRunner/verticalRunner";

type VerticalRunnerEditSessionInstance = IDisposable & {
  createFormKitRegistration(controller: AsyncController): FormKitRegistration;
  attachGizmo(controller: AsyncController): void;
  confirm(): void;
  cancel(): void;
};

type ActiveGateEditor = {
  document: IDocument;
  node?: INode;
  close(reason: "confirm" | "cancel"): void;
  dispose(): void;
};

function createVerticalRunnerEditSession(
  document: IDocument,
  node: INode
): VerticalRunnerEditSessionInstance | undefined {
  if (node instanceof VerticalRunnerNode) {
    return new VerticalRunnerEditSession(document, node);
  }
  return undefined;
}

export class GateEditorService implements IDisposable {
  private active?: ActiveGateEditor;

  constructor() {
    PubSub.default.sub("openNodeParamEditor", this.handleOpenNodeParamEditor);
    PubSub.default.sub("showProperties", this.handleShowProperties);
    PubSub.default.sub("openCommandContext", this.handleOpenCommandContext);
    PubSub.default.sub("documentClosed", this.handleDocumentClosed);
  }

  dispose(): void {
    this.closeActive("cancel");
    PubSub.default.remove(
      "openNodeParamEditor",
      this.handleOpenNodeParamEditor
    );
    PubSub.default.remove("showProperties", this.handleShowProperties);
    PubSub.default.remove("openCommandContext", this.handleOpenCommandContext);
    PubSub.default.remove("documentClosed", this.handleDocumentClosed);
  }

  private readonly handleOpenNodeParamEditor = (
    document: IDocument,
    node: INode
  ) => {
    if (
      this.active &&
      this.active.document === document &&
      this.active.node === node
    ) {
      return;
    }

    if (hornGateNodeAdapter.isNode(node)) {
      this.closeActive("cancel");

      const editor = startHornGateEditor({
        document,
        node,
        lifecycle: createHornGateEditLifecycle()
      });
      this.active = {
        document,
        node,
        close: reason => {
          if (reason === "confirm") editor.confirm();
          else editor.cancel();
        },
        dispose: () => editor.dispose()
      };
      void editor.wait().finally(() => {
        this.cleanupNodeEditorActive(editor);
      });
      return;
    }

    if (subGateNodeAdapter.isNode(node)) {
      this.closeActive("cancel");

      const editor = startSubGateEditor({
        document,
        node,
        lifecycle: createSubGateEditLifecycle()
      });
      this.active = {
        document,
        node,
        close: reason => {
          if (reason === "confirm") editor.confirm();
          else editor.cancel();
        },
        dispose: () => editor.dispose()
      };
      void editor.wait().finally(() => {
        this.cleanupNodeEditorActive(editor);
      });
      return;
    }

    if (largeGateNodeAdapter.isNode(node)) {
      this.closeActive("cancel");

      const editor = startLargeGateEditor({
        document,
        node,
        lifecycle: createLargeGateEditLifecycle()
      });
      this.active = {
        document,
        node,
        close: reason => {
          if (reason === "confirm") editor.confirm();
          else editor.cancel();
        },
        dispose: () => editor.dispose()
      };
      void editor.wait().finally(() => {
        this.cleanupNodeEditorActive(editor);
      });
      return;
    }

    if (hotTipGateNodeAdapter.isNode(node)) {
      this.closeActive("cancel");

      const editor = startHotTipGateEditor({
        document,
        node,
        lifecycle: createHotTipGateEditLifecycle()
      });
      this.active = {
        document,
        node,
        close: reason => {
          if (reason === "confirm") editor.confirm();
          else editor.cancel();
        },
        dispose: () => editor.dispose()
      };
      void editor.wait().finally(() => {
        this.cleanupNodeEditorActive(editor);
      });
      return;
    }

    if (pinPointGateNodeAdapter.isNode(node)) {
      this.closeActive("cancel");

      const editor = startPinPointGateEditor({
        document,
        node,
        lifecycle: createPinPointGateEditLifecycle()
      });
      this.active = {
        document,
        node,
        close: reason => {
          if (reason === "confirm") editor.confirm();
          else editor.cancel();
        },
        dispose: () => editor.dispose()
      };
      void editor.wait().finally(() => {
        this.cleanupNodeEditorActive(editor);
      });
      return;
    }

    if (pointVerticalRunnerNodeAdapter.isNode(node)) {
      this.closeActive("cancel");

      const editor = startPointVerticalRunnerEditor({
        document,
        node,
        lifecycle: createPointVerticalRunnerEditLifecycle()
      });
      this.active = {
        document,
        node,
        close: reason => {
          if (reason === "confirm") editor.confirm();
          else editor.cancel();
        },
        dispose: () => editor.dispose()
      };
      void editor.wait().finally(() => {
        this.cleanupNodeEditorActive(editor);
      });
      return;
    }

    if (node instanceof HorizontalRunnerNode) {
      this.closeActive("cancel");

      const editor = startHorizontalRunnerEditor({
        document,
        node,
        lifecycle: createHorizontalRunnerEditLifecycle()
      });
      this.active = {
        document,
        node,
        close: reason => {
          if (reason === "confirm") editor.confirm();
          else editor.cancel();
        },
        dispose: () => editor.dispose()
      };
      void editor.wait().finally(() => {
        this.cleanupNodeEditorActive(editor);
      });
      return;
    }

    if (node instanceof PartingRunnerNode) {
      this.closeActive("cancel");

      const editor = startPartingRunnerEditor({
        document,
        node,
        lifecycle: createPartingRunnerEditLifecycle()
      });
      this.active = {
        document,
        node,
        close: reason => {
          if (reason === "confirm") editor.confirm();
          else editor.cancel();
        },
        dispose: () => editor.dispose()
      };
      void editor.wait().finally(() => {
        this.cleanupNodeEditorActive(editor);
      });
      return;
    }

    const session = createVerticalRunnerEditSession(document, node);
    if (!session) return;

    this.closeActive("cancel");

    const controller = new AsyncController();
    const registration = session.createFormKitRegistration(controller);
    const unmount = mountFormKit(registration);

    const cleanupSessionActive = () => {
      if (!this.active || this.active.document !== document) {
        controller.dispose();
        return;
      }
      if (this.active.node !== node) {
        controller.dispose();
        return;
      }
      const active = this.active;
      this.active = undefined;
      active.dispose();
    };

    controller.onCompleted(() => {
      try {
        session.confirm();
      } finally {
        cleanupSessionActive();
      }
    });

    controller.onCancelled(() => {
      try {
        session.cancel();
      } finally {
        cleanupSessionActive();
      }
    });

    this.active = {
      document,
      node,
      close: reason => {
        if (!controller.result) {
          if (reason === "confirm") controller.success();
          else controller.cancel();
          return;
        }
        if (reason === "confirm") session.confirm();
        else session.cancel();
      },
      dispose: () => {
        unmount();
        controller.dispose();
        session.dispose();
      }
    };

    session.attachGizmo(controller);
  };

  private readonly handleShowProperties = (
    document: IDocument,
    nodes: INode[]
  ) => {
    if (!this.active) return;
    if (this.active.document !== document) {
      this.closeActive("cancel");
      return;
    }

    if (nodes.length !== 1 || nodes[0] !== this.active.node) {
      this.closeActive("cancel");
    }
  };

  private readonly handleOpenCommandContext = (_command: ICommand) => {
    this.closeActive("cancel");
  };

  private readonly handleDocumentClosed = (document: IDocument) => {
    if (this.active?.document === document) {
      this.closeActive("cancel");
    }
  };

  private closeActive(reason: "confirm" | "cancel") {
    const active = this.active;
    if (!active) return;
    this.active = undefined;
    try {
      active.close(reason);
    } finally {
      active.dispose();
    }
  }

  private cleanupNodeEditorActive(
    editor:
      | HornGateEditorHandle
      | HotTipGateEditorHandle
      | SubGateEditorHandle
      | LargeGateEditorHandle
      | PinPointGateEditorHandle
      | PointVerticalRunnerEditorHandle
      | HorizontalRunnerEditorHandle
      | PartingRunnerEditorHandle
  ) {
    if (!this.active) return;
    const active = this.active;
    if (active.node !== editor.node || active.document !== editor.document) {
      return;
    }
    this.active = undefined;
  }
}
