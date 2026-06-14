// @ts-nocheck
import { PubSub, type AsyncController } from "@modelai/core";
import type { IDocument } from "@modelai/core/types";
import { MeshDataUtils } from "@modelai/core/types";
import { command } from "@modelai/command";
import { applyOcclusionOverlay } from "@/features/modelai/geometry/occlusionOverlay";
import { mountFormKit } from "@modelai/ui/formKit/mount";
import type { IStep } from "@modelai/step";
import { ThreeGeometryFactory } from "@modelai/viewer/geometryFactory";
import type { ThreeView } from "@modelai/viewer/view";
import { HotTipGateNode } from "@/features/modelai/gates/hotTip/hotTipGate";
import { PinPointGateNode } from "@/features/modelai/gates/pinPoint/pinPointGate";
import { Group } from "three";
import { i18n, transformI18n } from "@/plugins/i18n";
import { resolveDefaultRunnerZ } from "@/features/modelai/gates/shared/defaultRunnerZ";
import {
  getPendingVerticalRunnerGateNodes,
  markVerticalRunnerGenerated
} from "@/features/modelai/gates/shared/verticalRunnerGateRegistry";
import { addNodeWithRunnerRootGrouping } from "@/features/modelai/gates/shared/runnerGroup";
import {
  buildVerticalRunnerPreviewMeshes,
  createVerticalRunnerParams,
  rememberVerticalRunnerParams,
  resolveVerticalRunnerSegment,
  resolveVerticalRunnerTargets,
  VerticalRunnerCreateSession,
  VerticalRunnerNode,
  type VerticalRunnerParams,
  type VerticalRunnerTarget
} from "@/features/modelai/gates/verticalRunner/verticalRunner";
import { MultistepCommand } from "../../multistepCommand";

const BATCHED_VERTICAL_RUNNER_THRESHOLD = 50;
const BATCHED_VERTICAL_RUNNER_CHUNK_SIZE = 50;

type LoadingBridge = {
  onLoadingChange?: (loading: boolean, message: string) => void;
};

async function yieldToUi() {
  await new Promise<void>(resolve => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });
}

function formatMessage(key: string, ...args: Array<string | number>) {
  const translate = i18n.global.t as (
    messageKey: string,
    values?: Array<string | number>
  ) => string;
  return translate(key, args);
}

function resolveRegisteredVerticalRunnerGateNode(target: VerticalRunnerTarget) {
  return target.gateNode instanceof PinPointGateNode ||
    target.gateNode instanceof HotTipGateNode
    ? target.gateNode
    : target.resolvedGateNode;
}

function createVerticalRunnerPreviewMeshObject(
  mesh: ReturnType<typeof buildVerticalRunnerPreviewMeshes>[number],
  view?: ThreeView
) {
  if (MeshDataUtils.isVertexMesh(mesh)) {
    return ThreeGeometryFactory.createVertexGeometry(mesh);
  }
  if (MeshDataUtils.isEdgeMesh(mesh)) {
    const obj = ThreeGeometryFactory.createEdgeGeometry(mesh);
    if (mesh.advancedOcclusion && view) {
      obj.userData.detachOcclusionOverlay = applyOcclusionOverlay(view, obj);
    }
    return obj;
  }
  if (MeshDataUtils.isFaceMesh(mesh)) {
    return ThreeGeometryFactory.createFaceGeometry(mesh, 1);
  }
  return undefined;
}

class VerticalRunnerPreviewStep {
  private previewObjectId?: number;
  private previewRefreshVersion = 0;
  private previewLoadingVersion = 0;

  constructor(
    private readonly session: VerticalRunnerCreateSession,
    private readonly getTargets: () => VerticalRunnerTarget[]
  ) {}

  async execute(document: IDocument, controller: AsyncController) {
    const app = document.application as LoadingBridge;
    const registration = this.session.createFormKitRegistration(controller);
    const unmount = mountFormKit(registration);
    const prompt = transformI18n(
      "modelai.command.prompt.confirmPlaceVerticalRunner"
    );

    const refreshPreview = async () => {
      const refreshId = ++this.previewRefreshVersion;
      const targets = this.getTargets();
      const params = this.session.getParams();
      const totalCount = targets.length;
      const shouldYieldBetweenChunks =
        totalCount > BATCHED_VERTICAL_RUNNER_THRESHOLD;
      const chunkSize = shouldYieldBetweenChunks
        ? BATCHED_VERTICAL_RUNNER_CHUNK_SIZE
        : Math.max(1, totalCount);

      this.clearPreview(document);

      if (shouldYieldBetweenChunks) {
        this.previewLoadingVersion = refreshId;
        app.onLoadingChange?.(
          true,
          formatMessage(
            "modelai.verticalRunner.previewingProgress",
            0,
            totalCount
          )
        );
        await yieldToUi();
      }

      try {
        const view = document.application.activeView as ThreeView | undefined;
        const previewObject = await this.buildPreviewGroupAsync(
          targets,
          params,
          view,
          refreshId,
          totalCount,
          chunkSize,
          app
        );
        if (refreshId !== this.previewRefreshVersion) {
          return;
        }
        if (!previewObject) {
          document.visual.update();
          return;
        }
        this.previewObjectId =
          document.visual.context.displayObject(previewObject);
        document.visual.update();
      } finally {
        if (
          shouldYieldBetweenChunks &&
          this.previewLoadingVersion === refreshId
        ) {
          this.previewLoadingVersion = 0;
          app.onLoadingChange?.(false, "");
        }
      }
    };
    const handleSessionChanged = () => {
      void refreshPreview();
    };

    this.session.onPropertyChanged(handleSessionChanged);
    PubSub.default.pub("statusBarTip", prompt);
    await refreshPreview();

    try {
      await new Promise<void>((resolve, reject) => {
        controller.onCompleted(() => resolve());
        controller.onCancelled(() => reject());
      });
    } catch {
      // ignore cancel
    } finally {
      this.session.removePropertyChanged(handleSessionChanged);
      this.clearPreview(document);
      PubSub.default.pub("clearStatusBarTip");
      unmount();
    }

    if (controller.result?.status !== "success") return undefined;
    const view = document.application.activeView;
    if (!view) return undefined;

    return {
      view,
      shapes: [],
      nodes: this.getTargets().map(target => target.gateNode)
    };
  }

  private clearPreview(document: IDocument) {
    if (this.previewObjectId === undefined) return;
    document.visual.context.removeMesh(this.previewObjectId);
    this.previewObjectId = undefined;
  }

  private async buildPreviewGroupAsync(
    targets: VerticalRunnerTarget[],
    params: ReturnType<VerticalRunnerCreateSession["getParams"]>,
    view: ThreeView | undefined,
    refreshId: number,
    totalCount: number,
    chunkSize: number,
    app: LoadingBridge
  ) {
    const group = new Group();
    const shouldYieldBetweenChunks =
      totalCount > BATCHED_VERTICAL_RUNNER_THRESHOLD;

    for (
      let chunkStart = 0;
      chunkStart < targets.length;
      chunkStart += chunkSize
    ) {
      if (refreshId !== this.previewRefreshVersion) {
        return undefined;
      }

      const chunk = targets.slice(chunkStart, chunkStart + chunkSize);
      const meshes = buildVerticalRunnerPreviewMeshes(chunk, params);
      meshes.forEach(mesh => {
        const obj = createVerticalRunnerPreviewMeshObject(mesh, view);
        if (obj) group.add(obj);
      });

      if (!shouldYieldBetweenChunks) {
        continue;
      }

      app.onLoadingChange?.(
        true,
        formatMessage(
          "modelai.verticalRunner.previewingProgress",
          Math.min(chunkStart + chunk.length, totalCount),
          totalCount
        )
      );
      await yieldToUi();
    }

    if (group.children.length === 0) {
      return undefined;
    }

    group.children.forEach(child => {
      if ("renderOrder" in child) {
        child.renderOrder = 1;
      }
    });

    return group;
  }
}

@command({
  key: "create.verticalRunner",
  icon: "icon-cone"
})
export class VerticalRunnerCommand extends MultistepCommand {
  private _targets: VerticalRunnerTarget[] = [];
  private _session?: VerticalRunnerCreateSession;

  protected override async canExecute(): Promise<boolean> {
    this.resolveTargets();
    return this._targets.length > 0;
  }

  private resolveTargets(
    params?: VerticalRunnerParams
  ): VerticalRunnerTarget[] {
    const verticalRunnerGateNodes = getPendingVerticalRunnerGateNodes(
      this.document
    );
    const runnerParams =
      params ??
      createVerticalRunnerParams(Number(this.document.pushPlatePlane.z));
    this._targets = resolveVerticalRunnerTargets(
      this.document,
      verticalRunnerGateNodes,
      runnerParams
    );
    return this._targets;
  }

  protected override getSteps(): IStep[] {
    const session = new VerticalRunnerCreateSession(
      this.document,
      resolveDefaultRunnerZ(this.document)
    );
    this._session = session;
    this.resolveTargets(session.getParams());

    return [
      new VerticalRunnerPreviewStep(session, () =>
        this.resolveTargets(session.getParams())
      )
    ];
  }

  protected override executeMainTask(): void {}

  protected override async executeMainTaskAsync(): Promise<void> {
    const session = this._session;
    if (!session) return;

    const params = session.getParams();
    const targets = this.resolveTargets(params);
    rememberVerticalRunnerParams(params);

    const app = this.application as LoadingBridge;
    const totalCount = targets.length;
    const shouldYieldBetweenChunks =
      totalCount > BATCHED_VERTICAL_RUNNER_THRESHOLD;
    const chunkSize = shouldYieldBetweenChunks
      ? BATCHED_VERTICAL_RUNNER_CHUNK_SIZE
      : totalCount;
    let processed = 0;
    let created = 0;

    app.onLoadingChange?.(
      true,
      formatMessage(
        "modelai.verticalRunner.creatingProgress",
        processed,
        totalCount
      )
    );
    if (shouldYieldBetweenChunks) {
      await yieldToUi();
    }

    try {
      for (
        let chunkStart = 0;
        chunkStart < targets.length;
        chunkStart += chunkSize
      ) {
        const chunk = targets.slice(chunkStart, chunkStart + chunkSize);
        for (const target of chunk) {
          const segment = resolveVerticalRunnerSegment(
            target.start,
            target.direction,
            params
          );
          if (segment) {
            const node = new VerticalRunnerNode(
              transformI18n("modelai.body.verticalRunner"),
              target.start,
              target.direction,
              params,
              resolveRegisteredVerticalRunnerGateNode(target)?.id
            );

            addNodeWithRunnerRootGrouping(this.document, node);
            created += 1;
          }

          const registeredGateNode =
            resolveRegisteredVerticalRunnerGateNode(target);
          if (registeredGateNode) {
            markVerticalRunnerGenerated(this.document, registeredGateNode);
          }
          processed += 1;
        }

        if (!shouldYieldBetweenChunks) {
          continue;
        }

        this.document.visual.update();
        app.onLoadingChange?.(
          true,
          formatMessage(
            "modelai.verticalRunner.creatingProgress",
            processed,
            totalCount
          )
        );
        await yieldToUi();
      }
    } finally {
      app.onLoadingChange?.(false, "");
    }

    if (created > 0) {
      this.document.visual.update();
    }
  }
}
