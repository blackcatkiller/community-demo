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
import {
  buildHorizontalRunnerFeatureGeometry,
  normalizeHorizontalRunnerParams,
  type HorizontalRunnerEndpoint,
  type HorizontalRunnerEndpointState,
  type HorizontalRunnerParams
} from "./horizontalRunner";
import { serializable } from "../../serialize/serializer";

export class HorizontalRunnerNode extends ShapeNode {
  private _baseStart: XYZ;
  private _baseEnd: XYZ;
  private _suspendRebuild = false;

  @property("modelai.horizontalRunner.diameter", {
    group: "modelai.horizontalRunner.group"
  })
  get diameter(): number {
    return this.getPrivateValue("diameter" as any, 3) as number;
  }
  set diameter(value: number) {
    this.applyPropertyValue("diameter", value);
  }

  @property("modelai.horizontalRunner.templateLabel", {
    group: "modelai.horizontalRunner.group"
  })
  get template(): HorizontalRunnerParams["template"] {
    return this.getPrivateValue(
      "template" as any,
      "D3"
    ) as HorizontalRunnerParams["template"];
  }
  set template(value: HorizontalRunnerParams["template"]) {
    this.applyPropertyValue("template", value);
  }

  @property("modelai.horizontalRunner.uAngle", {
    group: "modelai.horizontalRunner.group"
  })
  get uAngle(): number {
    return this.getPrivateValue("uAngle" as any, 15) as number;
  }
  set uAngle(value: number) {
    this.applyPropertyValue("uAngle", value);
  }

  @property("modelai.horizontalRunner.uWidth", {
    group: "modelai.horizontalRunner.group"
  })
  get uWidth(): number {
    return this.getPrivateValue("uWidth" as any, 3) as number;
  }
  set uWidth(value: number) {
    this.applyPropertyValue("uWidth", value);
  }

  @property("modelai.horizontalRunner.uHeight", {
    group: "modelai.horizontalRunner.group"
  })
  get uHeight(): number {
    return this.getPrivateValue("uHeight" as any, 1.5) as number;
  }
  set uHeight(value: number) {
    this.applyPropertyValue("uHeight", value);
  }

  @property("modelai.horizontalRunner.runnerTypeLabel", {
    group: "modelai.horizontalRunner.group"
  })
  get runnerType(): HorizontalRunnerParams["runnerType"] {
    return this.getPrivateValue(
      "runnerType" as any,
      "round"
    ) as HorizontalRunnerParams["runnerType"];
  }
  set runnerType(value: HorizontalRunnerParams["runnerType"]) {
    this.applyPropertyValue("runnerType", value);
  }

  @property("modelai.horizontalRunner.pushPlatePlaneZ", {
    group: "modelai.horizontalRunner.group"
  })
  get pushPlatePlaneZ(): number {
    return ((this as any)._pushPlatePlaneZ ??
      (this as any)._planeZ ??
      this._baseStart.z) as number;
  }
  set pushPlatePlaneZ(value: number) {
    this.applyPropertyValue("pushPlatePlaneZ", value);
  }

  get start(): XYZ {
    return new XYZ(this._baseStart.x, this._baseStart.y, this.pushPlatePlaneZ);
  }

  get end(): XYZ {
    return new XYZ(this._baseEnd.x, this._baseEnd.y, this.pushPlatePlaneZ);
  }

  constructor(
    name: string,
    start: XYZ,
    end: XYZ,
    params: HorizontalRunnerParams,
    options?: string | ShapeNodeConstructOptions
  ) {
    const resolvedOptions = resolveShapeNodeConstructOptions(options);
    super(name, resolvedOptions.id);
    this._baseStart = start;
    this._baseEnd = end;
    this.applyParams(params, {
      recordHistory: false,
      rebuild: resolvedOptions.rebuild ?? true
    });
  }

  exportEndpointState(): HorizontalRunnerEndpointState {
    return {
      start: this.start,
      end: this.end
    };
  }

  applyEndpoint(
    endpoint: HorizontalRunnerEndpoint,
    point: XYZ,
    options?: { recordHistory?: boolean; rebuild?: boolean }
  ): XYZ {
    const next = this.exportEndpointState();
    next[endpoint] = point;
    this.applyEndpoints(next, options);
    return this.exportEndpointState()[endpoint];
  }

  applyEndpoints(
    endpoints: HorizontalRunnerEndpointState,
    options?: { recordHistory?: boolean; rebuild?: boolean }
  ): void {
    void options?.recordHistory;
    const rebuild = options?.rebuild ?? true;
    this._baseStart = new XYZ(
      endpoints.start.x,
      endpoints.start.y,
      this._baseStart.z
    );
    this._baseEnd = new XYZ(endpoints.end.x, endpoints.end.y, this._baseEnd.z);
    if (rebuild) {
      this.rebuildShape();
    }
  }

  exportParams(): HorizontalRunnerParams {
    return {
      runnerType: this.runnerType,
      template: this.template,
      diameter: this.diameter,
      uAngle: this.uAngle,
      uWidth: this.uWidth,
      uHeight: this.uHeight,
      pushPlatePlaneZ: this.pushPlatePlaneZ
    };
  }

  applyParams(
    params: HorizontalRunnerParams,
    options?: { recordHistory?: boolean; rebuild?: boolean }
  ): void {
    const recordHistory = options?.recordHistory ?? true;
    const rebuild = options?.rebuild ?? true;
    const next = normalizeHorizontalRunnerParams(params);

    this._suspendRebuild = true;
    try {
      this.applyPropertyValue("runnerType", next.runnerType, recordHistory);
      this.applyPropertyValue("template", next.template, recordHistory);
      this.applyPropertyValue("diameter", next.diameter, recordHistory);
      this.applyPropertyValue("uAngle", next.uAngle, recordHistory);
      this.applyPropertyValue("uWidth", next.uWidth, recordHistory);
      this.applyPropertyValue("uHeight", next.uHeight, recordHistory);
      this.applyPropertyValue(
        "pushPlatePlaneZ",
        next.pushPlatePlaneZ,
        recordHistory
      );
    } finally {
      this._suspendRebuild = false;
    }

    if (rebuild) {
      this.rebuildShape();
    }
  }

  private applyPropertyValue<K extends keyof HorizontalRunnerParams>(
    property: K,
    value: HorizontalRunnerParams[K],
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
      buildHorizontalRunnerFeatureGeometry(
        this._baseStart,
        this._baseEnd,
        this.exportParams()
      )
    );
  }
}

const serializableClass: any = serializable;

serializableClass({
  serialize: (target: HorizontalRunnerNode) => ({
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
    const node = new HorizontalRunnerNode(
      String(data.name ?? "HorizontalRunner"),
      start,
      end,
      (data.params as HorizontalRunnerParams | undefined) ?? {
        runnerType: "round",
        template: "D3",
        diameter: 3,
        uAngle: 15,
        uWidth: 3,
        uHeight: 1.5,
        pushPlatePlaneZ: 0
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
})(HorizontalRunnerNode);
