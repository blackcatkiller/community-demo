// @ts-nocheck
import { Matrix4, XYZ } from "@modelai/core/math";
import { property } from "@modelai/core/property";
import {
  resolveShapeNodeConstructOptions,
  restorePendingShapeReference,
  serializeShapeReference,
  ShapeNode,
  type ShapeNodeConstructOptions
} from "@/features/modelai/model/shapeNode";
import { serializable } from "../../serialize/serializer";
import {
  buildPartingRunnerFeatureGeometry,
  normalizePartingRunnerParams,
  type PartingRunnerEndpoint,
  type PartingRunnerParams
} from "./partingRunner";

export class PartingRunnerNode extends ShapeNode {
  private _start: XYZ;
  private _end: XYZ;
  private _suspendRebuild = false;

  @property("modelai.partingRunner.diameter", {
    group: "modelai.partingRunner.group"
  })
  get diameter(): number {
    return this.getPrivateValue("diameter" as any, 3) as number;
  }
  set diameter(value: number) {
    this.applyPropertyValue("diameter", value);
  }

  @property("modelai.partingRunner.templateLabel", {
    group: "modelai.partingRunner.group"
  })
  get template(): PartingRunnerParams["template"] {
    return this.getPrivateValue(
      "template" as any,
      "D3"
    ) as PartingRunnerParams["template"];
  }
  set template(value: PartingRunnerParams["template"]) {
    this.applyPropertyValue("template", value);
  }

  @property("modelai.partingRunner.uAngle", {
    group: "modelai.partingRunner.group"
  })
  get uAngle(): number {
    return this.getPrivateValue("uAngle" as any, 15) as number;
  }
  set uAngle(value: number) {
    this.applyPropertyValue("uAngle", value);
  }

  @property("modelai.partingRunner.uWidth", {
    group: "modelai.partingRunner.group"
  })
  get uWidth(): number {
    return this.getPrivateValue("uWidth" as any, 3) as number;
  }
  set uWidth(value: number) {
    this.applyPropertyValue("uWidth", value);
  }

  @property("modelai.partingRunner.uHeight", {
    group: "modelai.partingRunner.group"
  })
  get uHeight(): number {
    return this.getPrivateValue("uHeight" as any, 1.5) as number;
  }
  set uHeight(value: number) {
    this.applyPropertyValue("uHeight", value);
  }

  @property("modelai.partingRunner.runnerTypeLabel", {
    group: "modelai.partingRunner.group"
  })
  get runnerType(): PartingRunnerParams["runnerType"] {
    return this.getPrivateValue(
      "runnerType" as any,
      "round"
    ) as PartingRunnerParams["runnerType"];
  }
  set runnerType(value: PartingRunnerParams["runnerType"]) {
    this.applyPropertyValue("runnerType", value);
  }

  get start(): XYZ {
    return new XYZ(this._start.x, this._start.y, this._start.z);
  }

  get end(): XYZ {
    return new XYZ(this._end.x, this._end.y, this._end.z);
  }

  constructor(
    name: string,
    start: XYZ,
    end: XYZ,
    params: PartingRunnerParams,
    options?: string | ShapeNodeConstructOptions
  ) {
    const resolvedOptions = resolveShapeNodeConstructOptions(options);
    super(name, resolvedOptions.id);
    this._start = start;
    this._end = end;
    this.applyParams(params, {
      recordHistory: false,
      rebuild: resolvedOptions.rebuild ?? true
    });
  }

  exportEndpointState(): { start: XYZ; end: XYZ } {
    return {
      start: this.start,
      end: this.end
    };
  }

  applyEndpoint(
    endpoint: PartingRunnerEndpoint,
    point: XYZ,
    options?: { recordHistory?: boolean; rebuild?: boolean }
  ): XYZ {
    const next = this.exportEndpointState();
    next[endpoint] = point;
    this.applyEndpoints(next, options);
    return this.exportEndpointState()[endpoint];
  }

  applyEndpoints(
    endpoints: { start: XYZ; end: XYZ },
    options?: { recordHistory?: boolean; rebuild?: boolean }
  ): void {
    void options?.recordHistory;
    const rebuild = options?.rebuild ?? true;
    this._start = new XYZ(
      endpoints.start.x,
      endpoints.start.y,
      endpoints.start.z
    );
    this._end = new XYZ(endpoints.end.x, endpoints.end.y, endpoints.end.z);
    if (rebuild) {
      this.rebuildShape();
    }
  }

  exportParams(): PartingRunnerParams {
    return {
      runnerType: this.runnerType,
      template: this.template,
      diameter: this.diameter,
      uAngle: this.uAngle,
      uWidth: this.uWidth,
      uHeight: this.uHeight
    };
  }

  applyParams(
    params: PartingRunnerParams,
    options?: { recordHistory?: boolean; rebuild?: boolean }
  ): void {
    const recordHistory = options?.recordHistory ?? true;
    const rebuild = options?.rebuild ?? true;
    const next = normalizePartingRunnerParams(params);

    this._suspendRebuild = true;
    try {
      this.applyPropertyValue("runnerType", next.runnerType, recordHistory);
      this.applyPropertyValue("template", next.template, recordHistory);
      this.applyPropertyValue("diameter", next.diameter, recordHistory);
      this.applyPropertyValue("uAngle", next.uAngle, recordHistory);
      this.applyPropertyValue("uWidth", next.uWidth, recordHistory);
      this.applyPropertyValue("uHeight", next.uHeight, recordHistory);
    } finally {
      this._suspendRebuild = false;
    }

    if (rebuild) {
      this.rebuildShape();
    }
  }

  private applyPropertyValue<K extends keyof PartingRunnerParams>(
    property: K,
    value: PartingRunnerParams[K],
    recordHistory = true
  ): void {
    this.setProperty(
      property as string,
      value,
      () => {
        if (!this._suspendRebuild) {
          this.rebuildShape();
        }
      },
      undefined,
      recordHistory
    );
  }

  private rebuildShape() {
    this.setFeatureGeometry(
      buildPartingRunnerFeatureGeometry(
        this._start,
        this._end,
        this.exportParams()
      )
    );
  }
}

const serializableClass: any = serializable;

serializableClass({
  serialize: (target: PartingRunnerNode) => ({
    id: target.id,
    name: target.name,
    visible: target.visible,
    start: target.start.toArray(),
    end: target.end.toArray(),
    params: target.exportParams(),
    transform: target.transform.toArray(),
    ...serializeShapeReference(target)
  }),
  deserialize: (data: Record<string, unknown>) => {
    const startArray = data.start as number[] | undefined;
    const endArray = data.end as number[] | undefined;
    const start =
      Array.isArray(startArray) && startArray.length === 3
        ? new XYZ(startArray[0], startArray[1], startArray[2])
        : new XYZ(0, 0, 0);
    const end =
      Array.isArray(endArray) && endArray.length === 3
        ? new XYZ(endArray[0], endArray[1], endArray[2])
        : new XYZ(0, 0, 0);
    const node = new PartingRunnerNode(
      String(data.name ?? "PartingRunner"),
      start,
      end,
      (data.params as PartingRunnerParams | undefined) ?? {
        runnerType: "round",
        template: "D3",
        diameter: 3,
        uAngle: 15,
        uWidth: 3,
        uHeight: 1.5
      },
      {
        id: typeof data.id === "string" ? data.id : undefined,
        rebuild: data.shapeMode !== "reference"
      }
    );
    node.visible = Boolean(data.visible);
    const transformArray = data.transform as number[] | undefined;
    if (Array.isArray(transformArray) && transformArray.length === 16) {
      node.transform = Matrix4.fromArray(transformArray);
    }
    restorePendingShapeReference(node, data);
    return node;
  }
})(PartingRunnerNode);
