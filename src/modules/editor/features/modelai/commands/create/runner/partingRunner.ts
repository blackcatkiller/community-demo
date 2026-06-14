// @ts-nocheck
import { command } from "@modelai/command";
import type { INodeLinkedList } from "@modelai/core/types";
import { Precision, XYZ } from "@modelai/core/math";
import { PointStep, type IStep } from "@modelai/step";
import { transformI18n } from "@/plugins/i18n";
import {
  bindPartingRunnerForEdit,
  commitCreatedPartingRunnerNode,
  createPartingRunnerCreateLifecycle,
  createPartingRunnerEndpointDragSession,
  createPartingRunnerNode,
  createPartingRunnerParams,
  createPartingRunnerPointData,
  debugPartingRunnerEditorEvent,
  type PartingRunnerNode,
  startPartingRunnerEditor,
  type PartingRunnerEndpointDragSession,
  type PartingRunnerNodeEditBinding,
  type PartingRunnerParams
} from "@/features/modelai/gates/partingRunner/partingRunner";
import { MultistepCommand } from "../../multistepCommand";

type CreatedPartingRunnerDraft = {
  node: PartingRunnerNode;
  parent: INodeLinkedList;
  binding: PartingRunnerNodeEditBinding;
  endpointDrag: PartingRunnerEndpointDragSession;
};

@command({
  key: "create.partingRunner",
  icon: "icon-cone"
})
export class PartingRunnerCommand extends MultistepCommand {
  private createdNode?: PartingRunnerNode;
  private createdParent?: INodeLinkedList;
  private params?: PartingRunnerParams;
  private pointData?: ReturnType<typeof createPartingRunnerPointData>;
  private draft?: CreatedPartingRunnerDraft;

  protected override getSteps(): IStep[] {
    this.params = createPartingRunnerParams();
    this.pointData = createPartingRunnerPointData({
      getStart: () => this.stepDatas[0]?.point,
      getDragGhostNode: () => this.draft?.node
    });

    return [
      this.createFirstPointStep(),
      this.createSecondPointDragStep(),
      {
        execute: async (document, controller) => {
          const draft = this.draft;
          if (!draft) return undefined;
          draft.endpointDrag.finalize();
          const { node, parent } = draft;
          this.createdNode = node;
          this.createdParent = parent;
          debugPartingRunnerEditorEvent("shell:create", {
            shell: "create",
            node,
            parent
          });
          const editor = startPartingRunnerEditor({
            document,
            controller,
            node,
            lifecycle: createPartingRunnerCreateLifecycle()
          });
          const success = await editor.wait();
          if (!success) {
            this.createdNode = undefined;
            this.createdParent = undefined;
            this.draft = undefined;
            return undefined;
          }
          const view =
            this.stepDatas[1].view ?? document.application.activeView;
          if (!view) return undefined;
          this.draft = undefined;
          return { view, point: node.end, shapes: [] };
        }
      }
    ];
  }

  protected override executeMainTask(): void {
    const node = this.createdNode;
    const parent = this.createdParent;
    if (!node || !parent) return;
    commitCreatedPartingRunnerNode({
      document: this.document,
      node,
      parent
    });
    this.createdNode = undefined;
    this.createdParent = undefined;
  }

  private createFirstPointStep(): IStep {
    return new PointStep(
      transformI18n("modelai.command.prompt.pickPartingRunnerFirstPoint"),
      () => this.getPointData().firstPointData()
    );
  }

  private createSecondPointDragStep(): IStep {
    const baseStep = new PointStep(
      transformI18n("modelai.command.prompt.pickPartingRunnerSecondPoint"),
      () => ({
        ...this.getPointData().secondPointData(),
        preview: point => {
          const draft = this.ensureDraftForSecondPoint();
          if (!point) return [];
          draft.endpointDrag.update(point);
          return this.getPointData().secondPointPreview(point);
        }
      })
    );

    return {
      execute: async (document, controller) => {
        try {
          const result = await baseStep.execute(document, controller);
          if (!result?.point) {
            this.disposeDraft(document);
            return result;
          }
          this.ensureDraftForSecondPoint().endpointDrag.update(result.point);
          return result;
        } catch (error) {
          this.disposeDraft(document);
          throw error;
        }
      }
    };
  }

  private ensureDraftForSecondPoint(): CreatedPartingRunnerDraft {
    if (this.draft) return this.draft;
    const document = this.document;
    const start = this.stepDatas[0].point!;
    const end = this.initialEndPoint(start);
    const parent =
      document.modelManager.currentNode ?? document.modelManager.rootNode;
    const node = createPartingRunnerNode(start, end, this.getParams());
    node.parent = parent;
    node.parentVisible = parent.visible && parent.parentVisible;
    document.visual.context.addNode([node]);
    const binding = bindPartingRunnerForEdit(node);
    const endpointDrag = createPartingRunnerEndpointDragSession({
      document,
      node,
      binding,
      endpoint: "end",
      source: "create-second-point",
      rebuildOnUpdate: true
    });
    this.draft = {
      node,
      parent,
      binding,
      endpointDrag
    };
    return this.draft;
  }

  private disposeDraft(document = this.document): void {
    const draft = this.draft;
    if (!draft) return;
    draft.endpointDrag.cancel();
    document.visual.context.removeNode([draft.node]);
    draft.node.parent = undefined;
    draft.node.dispose();
    document.visual.update();
    this.draft = undefined;
  }

  private initialEndPoint(start: XYZ): XYZ {
    const view =
      this.stepDatas[0]?.view ?? this.document.application.activeView;
    const xvec = view?.workplane.xvec.normalize();
    const direction =
      xvec && xvec.length() > Precision.Distance ? xvec : new XYZ(1, 0, 0);
    return start.add(
      direction.multiply(Math.max(this.getParams().diameter, 1))
    );
  }

  private getParams(): PartingRunnerParams {
    if (!this.params) {
      this.params = createPartingRunnerParams();
    }
    return this.params;
  }

  private getPointData(): ReturnType<typeof createPartingRunnerPointData> {
    if (!this.pointData) {
      this.pointData = createPartingRunnerPointData({
        getStart: () => this.stepDatas[0]?.point,
        getDragGhostNode: () => this.draft?.node
      });
    }
    return this.pointData;
  }
}
