// @ts-nocheck
import { AsyncController } from "@modelai/core";
import { property } from "@modelai/core/property";
import {
  MeshDataUtils,
  VisualConfig,
  type EdgeMeshData
} from "@modelai/core/types";
import type { Matrix4, XYZ } from "@modelai/core/math";
import { GeometryNode, ShapeNode } from "@modelai/model/shapeNode";
import {
  copyWorkpieceShapeOrigin,
  WorkpieceNode
} from "@modelai/model/workpieceNode";
import { PinPointGateNode } from "@/features/modelai/gates/pinPoint/pinPointGate";
import { HotTipGateNode } from "@/features/modelai/gates/hotTip/hotTipGate";
import { LargeGateNode } from "@/features/modelai/gates/large/largeGate";
import { SubGateNode } from "@/features/modelai/gates/sub/subGate";
import { HornGateNode } from "@/features/modelai/gates/horn/hornGate";
import { VerticalRunnerNode } from "@/features/modelai/gates/verticalRunner/verticalRunner";
import { PointVerticalRunnerNode } from "@/features/modelai/gates/pointVerticalRunner/pointVerticalRunner";
import type { INodeLinkedList } from "@modelai/core/types";
import { transformI18n } from "@/plugins/i18n";
import { MultistepCommand } from "../../multistepCommand";

function boundingBoxWireframePositions(box: { min: XYZ; max: XYZ }): number[] {
  const { min, max } = box;
  return [
    min.x,
    min.y,
    min.z,
    min.x,
    min.y,
    max.z,
    min.x,
    min.y,
    max.z,
    min.x,
    max.y,
    max.z,
    min.x,
    max.y,
    max.z,
    min.x,
    max.y,
    min.z,
    min.x,
    max.y,
    min.z,
    min.x,
    min.y,
    min.z,
    max.x,
    min.y,
    min.z,
    max.x,
    min.y,
    max.z,
    max.x,
    min.y,
    max.z,
    max.x,
    max.y,
    max.z,
    max.x,
    max.y,
    max.z,
    max.x,
    max.y,
    min.z,
    max.x,
    max.y,
    min.z,
    max.x,
    min.y,
    min.z,
    min.x,
    min.y,
    min.z,
    max.x,
    min.y,
    min.z,
    min.x,
    min.y,
    max.z,
    max.x,
    min.y,
    max.z,
    min.x,
    max.y,
    max.z,
    max.x,
    max.y,
    max.z,
    min.x,
    max.y,
    min.z,
    max.x,
    max.y,
    min.z
  ];
}

export abstract class TransformedCommand extends MultistepCommand {
  protected models: GeometryNode[] = [];
  protected positions: number[] = [];

  @property("Clone")
  get isClone() {
    return this.getPrivateValue("isClone" as any, false) as boolean;
  }
  set isClone(value: boolean) {
    this.setProperty("isClone", value);
  }

  protected abstract transfrom(point: XYZ): Matrix4;

  protected transformPreview = (point: XYZ): EdgeMeshData => {
    const transform = this.transfrom(point);
    const positions = transform.ofPoints(this.positions);
    return {
      position: new Float32Array(positions),
      lineType: "solid",
      color: VisualConfig.temporaryEdgeColor,
      range: []
    };
  };

  private async ensureSelectedModels() {
    const selected = this.document.selection
      .getSelectedNodes()
      .filter((x): x is GeometryNode => x instanceof GeometryNode);
    if (selected.length > 0) {
      this.models = selected;
      return true;
    }

    const selection = this.document.selection as any;
    const oldFilter = selection.nodeFilter;
    selection.nodeFilter = (node: any) => node instanceof GeometryNode;

    try {
      this.controller = new AsyncController();
      const nodes = await this.document.selection.pickNode(
        transformI18n("modelai.command.prompt.selectModelsToTransform"),
        this.controller,
        true
      );
      this.models = nodes.filter(
        (x): x is GeometryNode => x instanceof GeometryNode
      );
      return this.models.length > 0;
    } finally {
      selection.nodeFilter = oldFilter;
    }
  }

  protected override async canExecute(): Promise<boolean> {
    if (!(await this.ensureSelectedModels())) return false;

    this.positions = this.models.flatMap(model => {
      const edges = model.mesh.edges?.position;
      if (edges && edges.length > 0) {
        return model.transform.ofPoints(edges);
      }
      const box = model.boundingBox();
      return box ? boundingBoxWireframePositions(box) : [];
    });

    return true;
  }

  protected getTempLineData(start: XYZ, end: XYZ) {
    return MeshDataUtils.createEdgeMesh(
      start,
      end,
      VisualConfig.temporaryEdgeColor,
      "solid"
    );
  }

  protected override executeMainTask(): void {
    const point = this.stepDatas.at(-1)?.point;
    if (!point) return;
    const transform = this.transfrom(point);

    if (this.isClone) {
      this.models.forEach(model => {
        const clone = this.cloneModel(model);
        if (!clone) return;
        clone.transform = transform.multiply(model.transform);

        const parent = model.parent as INodeLinkedList | undefined;
        if (!parent) {
          this.document.modelManager.addNode(clone);
          return;
        }

        parent.add(clone);
        parent.move(clone, parent, model);
      });
    } else {
      this.models.forEach(model => {
        model.transform = transform.multiply(model.transform);
      });
    }

    this.document.visual.update();
  }

  private cloneModel(model: GeometryNode): GeometryNode | undefined {
    if (model instanceof PinPointGateNode) {
      const cloned = new PinPointGateNode(
        model.name,
        model.plane,
        model.exportParams()
      );
      cloned.visible = model.visible;
      return cloned;
    }

    if (model instanceof LargeGateNode) {
      const cloned = new LargeGateNode(
        model.name,
        model.plane,
        model.exportParams()
      );
      cloned.visible = model.visible;
      return cloned;
    }

    if (model instanceof HotTipGateNode) {
      const cloned = new HotTipGateNode(
        model.name,
        model.plane,
        model.exportParams()
      );
      cloned.visible = model.visible;
      return cloned;
    }

    if (model instanceof SubGateNode) {
      const cloned = new SubGateNode(
        model.name,
        model.plane,
        model.exportParams()
      );
      cloned.visible = model.visible;
      return cloned;
    }

    if (model instanceof HornGateNode) {
      const cloned = new HornGateNode(
        model.name,
        model.plane,
        model.exportParams()
      );
      cloned.visible = model.visible;
      return cloned;
    }

    if (model instanceof VerticalRunnerNode) {
      const cloned = new VerticalRunnerNode(
        model.name,
        model.start,
        model.direction,
        model.exportParams()
      );
      cloned.visible = model.visible;
      return cloned;
    }

    if (model instanceof PointVerticalRunnerNode) {
      const cloned = new PointVerticalRunnerNode(
        model.name,
        model.plane,
        model.exportParams()
      );
      cloned.visible = model.visible;
      return cloned;
    }

    if (!(model instanceof ShapeNode)) return undefined;
    const shape = model.shape;
    if (!shape.isOk) return undefined;

    const cloned = new WorkpieceNode(model.name, shape.value.clone());
    cloned.visible = model.visible;
    copyWorkpieceShapeOrigin(cloned, model);
    return cloned;
  }
}
