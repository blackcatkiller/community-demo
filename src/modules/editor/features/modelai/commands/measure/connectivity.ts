// @ts-nocheck
import { transformI18n } from "@/plugins/i18n";
import type { AsyncController } from "@modelai/core";
import type { Matrix4 } from "@modelai/core/math";
import type { FaceMeshData, IDocument } from "@modelai/core/types";
import { command } from "@modelai/command";
import { GeometryNode } from "@modelai/model/shapeNode";
import { convertFromMatrix } from "@modelai/occ/helper";
import type { SnapResult } from "@modelai/selection/snap";
import { GetOrSelectNodeStep, type IStep } from "@modelai/step";
import { mountFormKit } from "@modelai/ui/formKit/mount";
import type {
  FaceMeshData as WasmFaceMeshData,
  gp_Trsf,
  MainModule
} from "chili-wasm";
import { ConnectivityResultSession } from "./connectivityResultSession";
import { MultistepCommand } from "../multistepCommand";

declare let wasm: MainModule;

const CONNECTIVITY_TOLERANCE = 1e-6;

type ConnectivityType = 0 | 1 | 2;

type ConnectivityDialogState = {
  resultText: string;
  meshId?: number;
};

@command({
  key: "measure.connectivity",
  icon: "icon-measureSelect"
})
export class ConnectivityMeasure extends MultistepCommand {
  protected override getSteps(): IStep[] {
    return [
      new GetOrSelectNodeStep(
        transformI18n("modelai.command.prompt.selectModelsForConnectivity"),
        {
          multiple: true,
          filter: node => node instanceof GeometryNode
        }
      ),
      {
        execute: (document, controller) =>
          this.showConnectivityResult(document, controller)
      }
    ];
  }

  protected override executeMainTask(): void {}

  private async showConnectivityResult(
    document: IDocument,
    controller: AsyncController
  ): Promise<SnapResult | undefined> {
    const dialogState = this.buildDialogState(document);
    if (!dialogState) return undefined;

    const session = new ConnectivityResultSession({
      resultText: dialogState.resultText
    });
    const unmount = mountFormKit(session.createFormKitRegistration(controller));

    try {
      return await new Promise(resolve => {
        controller.onCompleted(() => {
          if (controller.result?.status !== "success") {
            resolve(undefined);
            return;
          }
          resolve({
            view: this.stepDatas[0].view,
            shapes: []
          });
        });
        controller.onCancelled(() => resolve(undefined));
      });
    } finally {
      unmount();
      if (dialogState.meshId !== undefined) {
        document.visual.context.removeMesh(dialogState.meshId);
      }
    }
  }

  private buildDialogState(
    document: IDocument
  ): ConnectivityDialogState | undefined {
    const nodes = this.stepDatas[0].nodes;
    if (!nodes || nodes.length < 2) return undefined;

    const faceMeshDatas: FaceMeshData[] = [];
    const transforms: Matrix4[] = [];
    const gpTransforms: gp_Trsf[] = [];

    try {
      for (const node of nodes) {
        if (!(node instanceof GeometryNode)) continue;

        const faces = node.mesh.faces;
        if (!faces || faces.position.length === 0) continue;

        faceMeshDatas.push(faces);
        transforms.push(node.transform);
      }

      if (faceMeshDatas.length < 2) return undefined;

      for (const transform of transforms) {
        gpTransforms.push(convertFromMatrix(transform));
      }

      const result = wasm.MeshConnectivityChecker.detect(
        faceMeshDatas as unknown as WasmFaceMeshData[],
        gpTransforms,
        CONNECTIVITY_TOLERANCE
      );

      try {
        const type = result.type as ConnectivityType;
        let meshId: number | undefined;

        if (type < 2) {
          const contactMesh = this.createContactMesh(
            type as Exclude<ConnectivityType, 2>,
            result.contactMesh
          );
          if (contactMesh) {
            meshId = document.visual.context.displayMesh(
              [contactMesh],
              undefined,
              false
            );
          }
        }

        return {
          resultText: transformI18n(this.statusKey(type)),
          meshId
        };
      } finally {
        result.delete?.();
      }
    } finally {
      for (const transform of gpTransforms) {
        transform.delete();
      }
    }
  }

  private createContactMesh(
    type: Exclude<ConnectivityType, 2>,
    wasmFaceMeshData: WasmFaceMeshData
  ): FaceMeshData | undefined {
    const positions = Array.from(
      wasmFaceMeshData.position as ArrayLike<number>
    );
    if (positions.length === 0) return undefined;

    return {
      position: new Float32Array(positions),
      normal: new Float32Array(
        Array.from(wasmFaceMeshData.normal as ArrayLike<number>)
      ),
      uv: new Float32Array(
        Array.from(wasmFaceMeshData.uv as ArrayLike<number>)
      ),
      index: new Uint32Array(
        Array.from(wasmFaceMeshData.index as ArrayLike<number>)
      ),
      range: [],
      color: type === 0 ? 0xff4400 : 0xffcc00,
      groups: []
    };
  }

  private statusKey(type: ConnectivityType) {
    switch (type) {
      case 0:
        return "modelai.measurement.connectivityOverlapping";
      case 1:
        return "modelai.measurement.connectivityTouching";
      default:
        return "modelai.measurement.connectivitySeparate";
    }
  }
}
