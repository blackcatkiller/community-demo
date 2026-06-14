// @ts-nocheck
import { Matrix4, XYZ } from "@modelai/core/math";
import { property } from "@modelai/core/property";
import {
  resolveShapeNodeConstructOptions,
  restorePendingShapeReference,
  serializeShapeReference,
  ShapeNode,
  type ShapeNodeConstructOptions
} from "@modelai/model/shapeNode";
import { serializable } from "../../serialize/serializer";
import {
  buildVerticalRunnerFeatureGeometry,
  normalizeVerticalRunnerParams,
  type VerticalRunnerParams,
  type VerticalRunnerTemplate
} from "./verticalRunner";

export class VerticalRunnerNode extends ShapeNode {
  private readonly _start: XYZ;
  private readonly _direction: XYZ;
  private readonly _sourceGateNodeId?: string;
  private _suspendRebuild = false;

  @property("modelai.verticalRunner.templateLabel", {
    group: "modelai.verticalRunner.group"
  })
  get template(): VerticalRunnerTemplate {
    return this.getPrivateValue(
      "template" as any,
      "D3"
    ) as VerticalRunnerTemplate;
  }
  set template(value: VerticalRunnerTemplate) {
    this.applyPropertyValue("template", value);
  }

  @property("modelai.verticalRunner.diameterStart", {
    group: "modelai.verticalRunner.group"
  })
  get diameterStart(): number {
    return this.getPrivateValue(
      "diameterStart" as any,
      this.getPrivateValue("diameter" as any, 3)
    ) as number;
  }
  set diameterStart(value: number) {
    this.applyPropertyValue("diameterStart", value);
  }

  @property("modelai.verticalRunner.diameterEnd", {
    group: "modelai.verticalRunner.group"
  })
  get diameterEnd(): number {
    return this.getPrivateValue("diameterEnd" as any, 5) as number;
  }
  set diameterEnd(value: number) {
    this.applyPropertyValue("diameterEnd", value);
  }

  @property("modelai.verticalRunner.pushPlatePlaneZ", {
    group: "modelai.verticalRunner.group"
  })
  get pushPlatePlaneZ(): number {
    return ((this as any)._pushPlatePlaneZ ??
      (this as any)._planeZ ??
      this._start.z) as number;
  }
  set pushPlatePlaneZ(value: number) {
    this.applyPropertyValue("pushPlatePlaneZ", value);
  }

  get start(): XYZ {
    return this._start;
  }

  get direction(): XYZ {
    return this._direction;
  }

  get sourceGateNodeId(): string | undefined {
    return this._sourceGateNodeId;
  }

  constructor(
    name: string,
    start: XYZ,
    direction: XYZ,
    params: VerticalRunnerParams,
    sourceGateNodeId?: string,
    options?: string | ShapeNodeConstructOptions
  ) {
    const resolvedOptions = resolveShapeNodeConstructOptions(options);
    super(name, resolvedOptions.id);
    this._start = start;
    this._direction = direction.normalize();
    this._sourceGateNodeId = sourceGateNodeId;
    this.applyParams(params, {
      recordHistory: false,
      rebuild: resolvedOptions.rebuild ?? true
    });
  }

  exportParams(): VerticalRunnerParams {
    return {
      template: this.template,
      diameterStart: this.diameterStart,
      diameterEnd: this.diameterEnd,
      pushPlatePlaneZ: this.pushPlatePlaneZ
    };
  }

  applyParams(
    params: VerticalRunnerParams,
    options?: { recordHistory?: boolean; rebuild?: boolean }
  ) {
    const recordHistory = options?.recordHistory ?? true;
    const rebuild = options?.rebuild ?? true;
    const next = normalizeVerticalRunnerParams(params);

    this._suspendRebuild = true;
    try {
      this.applyPropertyValue("template", next.template, recordHistory);
      this.applyPropertyValue(
        "diameterStart",
        next.diameterStart,
        recordHistory
      );
      this.applyPropertyValue("diameterEnd", next.diameterEnd, recordHistory);
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

  private applyPropertyValue<K extends keyof VerticalRunnerParams>(
    propertyKey: K,
    value: VerticalRunnerParams[K],
    recordHistory = true
  ) {
    this.setProperty(
      propertyKey as string,
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
      buildVerticalRunnerFeatureGeometry(
        this._start,
        this._direction,
        this.exportParams()
      )
    );
  }
}

const serializableClass: any = serializable;

serializableClass({
  serialize: (target: VerticalRunnerNode) => ({
    id: target.id,
    name: target.name,
    visible: target.visible,
    start: target.start.toArray(),
    direction: target.direction.toArray(),
    sourceGateNodeId: target.sourceGateNodeId,
    params: target.exportParams(),
    transform: target.transform.toArray(),
    ...serializeShapeReference(target)
  }),
  deserialize: (data: Record<string, unknown>) => {
    const startArray = data.start as number[] | undefined;
    const directionArray = data.direction as number[] | undefined;
    const start =
      Array.isArray(startArray) && startArray.length === 3
        ? new XYZ(startArray[0], startArray[1], startArray[2])
        : new XYZ(0, 0, 0);
    const direction =
      Array.isArray(directionArray) && directionArray.length === 3
        ? new XYZ(directionArray[0], directionArray[1], directionArray[2])
        : new XYZ(0, 0, 1);
    const node = new VerticalRunnerNode(
      String(data.name ?? "VerticalRunner"),
      start,
      direction,
      (data.params as VerticalRunnerParams | undefined) ?? {
        template: "D3",
        diameterStart: 3,
        diameterEnd: 5,
        pushPlatePlaneZ: start.z
      },
      typeof data.sourceGateNodeId === "string"
        ? data.sourceGateNodeId
        : undefined,
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
})(VerticalRunnerNode);
