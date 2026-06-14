// @ts-nocheck
import { command } from "@modelai/command";
import type { INodeLinkedList } from "@modelai/core/types";
import { Precision, XYZ } from "@modelai/core/math";
import { PointStep, type IStep } from "@modelai/step";
import { transformI18n } from "@/plugins/i18n";
import {
  bindHorizontalRunnerForEdit,
  commitCreatedHorizontalRunnerNode,
  createHorizontalRunnerEndpointDragSession,
  createHorizontalRunnerCreateLifecycle,
  createHorizontalRunnerNode,
  createHorizontalRunnerParams,
  createHorizontalRunnerPointData,
  debugHorizontalRunnerEditorEvent,
  resolveInitialHorizontalRunnerPushPlatePlaneZ,
  startHorizontalRunnerEditor,
  type HorizontalRunnerEndpointDragSession,
  type HorizontalRunnerNode,
  type HorizontalRunnerNodeEditBinding,
  type HorizontalRunnerParams
} from "@/features/modelai/gates/horizontalRunner/horizontalRunner";
import { MultistepCommand } from "../../multistepCommand";

type CreatedHorizontalRunnerDraft = {
  node: HorizontalRunnerNode;
  parent: INodeLinkedList;
  binding: HorizontalRunnerNodeEditBinding;
  endpointDrag: HorizontalRunnerEndpointDragSession;
};

@command({
  key: "create.horizontalRunner",
  icon: "icon-cone"
})
export class HorizontalRunnerCommand extends MultistepCommand {
  private createdNode?: HorizontalRunnerNode;
  private createdParent?: INodeLinkedList;
  private params?: HorizontalRunnerParams;
  private pointData?: ReturnType<typeof createHorizontalRunnerPointData>;
  private draft?: CreatedHorizontalRunnerDraft;

  protected override getSteps(): IStep[] {
    const initialPushPlatePlaneZ =
      resolveInitialHorizontalRunnerPushPlatePlaneZ(this.document);
    this.params = createHorizontalRunnerParams(initialPushPlatePlaneZ);
    this.pointData = createHorizontalRunnerPointData({
      getPushPlatePlaneZ: () => this.getParams().pushPlatePlaneZ,
      getParams: () => this.getParams(),
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
          debugHorizontalRunnerEditorEvent("shell:create", {
            shell: "create",
            node,
            parent
          });
          const editor = startHorizontalRunnerEditor({
            document,
            controller,
            node,
            lifecycle: createHorizontalRunnerCreateLifecycle()
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
    commitCreatedHorizontalRunnerNode({
      document: this.document,
      node,
      parent
    });
    this.createdNode = undefined;
    this.createdParent = undefined;
  }

  private createFirstPointStep(): IStep {
    const baseStep = new PointStep(
      transformI18n("modelai.command.prompt.pickHorizontalRunnerFirstPoint"),
      () => this.getPointData().firstPointData()
    );

    return {
      execute: async (document, controller) => {
        const result = await baseStep.execute(document, controller);
        if (!result?.point) return result;
        return {
          ...result,
          point: this.projectPoint(result.point)
        };
      }
    };
  }

  private createSecondPointDragStep(): IStep {
    const baseStep = new PointStep(
      transformI18n("modelai.command.prompt.pickHorizontalRunnerSecondPoint"),
      () => ({
        ...this.getPointData().secondPointData(),
        preview: (point, snaped) => {
          const draft = this.ensureDraftForSecondPoint();
          if (!point) {
            return [];
          }
          const projected = this.projectPoint(point);
          draft.endpointDrag.update(projected);
          return this.getPointData().projectedPointPreview(point, snaped);
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
          const projected = this.projectPoint(result.point);
          this.ensureDraftForSecondPoint().endpointDrag.update(projected);
          return {
            ...result,
            point: projected
          };
        } catch (error) {
          this.disposeDraft(document);
          throw error;
        }
      }
    };
  }

  private ensureDraftForSecondPoint(): CreatedHorizontalRunnerDraft {
    if (this.draft) return this.draft;
    const document = this.document;
    const start = this.projectPoint(this.stepDatas[0].point!);
    const end = this.initialEndPoint(start);
    const parent =
      document.modelManager.currentNode ?? document.modelManager.rootNode;
    const node = createHorizontalRunnerNode(start, end, this.getParams());
    node.parent = parent;
    node.parentVisible = parent.visible && parent.parentVisible;
    document.visual.context.addNode([node]);
    const binding = bindHorizontalRunnerForEdit(node);
    const endpointDrag = createHorizontalRunnerEndpointDragSession({
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

  private getParams(): HorizontalRunnerParams {
    if (!this.params) {
      this.params = createHorizontalRunnerParams(
        resolveInitialHorizontalRunnerPushPlatePlaneZ(this.document)
      );
    }
    return this.params;
  }

  private getPointData(): ReturnType<typeof createHorizontalRunnerPointData> {
    if (!this.pointData) {
      this.pointData = createHorizontalRunnerPointData({
        getPushPlatePlaneZ: () => this.getParams().pushPlatePlaneZ,
        getParams: () => this.getParams(),
        getStart: () => this.stepDatas[0]?.point,
        getDragGhostNode: () => this.draft?.node
      });
    }
    return this.pointData;
  }

  private projectPoint(point: XYZ): XYZ {
    return this.getPointData().projectPoint(point);
  }
}
