// @ts-nocheck
import { Matrix4, Plane, XYZ, type XYZLike } from "@modelai/core/math";
import { property } from "@modelai/core/property";
import {
  resolveShapeNodeConstructOptions,
  restorePendingShapeReference,
  serializeShapeReference,
  ShapeNode,
  type ShapeNodeConstructOptions
} from "@/features/modelai/model/shapeNode";
import { serializable } from "../../serialize/serializer";
import type { PinPointGateTemplate } from "../pinPoint/pinPointGate";
import type { VerticalRunnerTemplate } from "../verticalRunner/verticalRunner";
import {
  buildPointVerticalRunnerFeatureGeometry,
  normalizePointVerticalRunnerParams,
  type PointVerticalRunnerParams
} from "./pointVerticalRunner";

type SerializedPlane = {
  origin: XYZLike;
  normal: XYZLike;
  xvec: XYZLike;
};

function serializePlane(plane: Plane): SerializedPlane {
  return {
    origin: { x: plane.origin.x, y: plane.origin.y, z: plane.origin.z },
    normal: { x: plane.normal.x, y: plane.normal.y, z: plane.normal.z },
    xvec: { x: plane.xvec.x, y: plane.xvec.y, z: plane.xvec.z }
  };
}

function deserializePlane(data: SerializedPlane | undefined): Plane {
  if (!data) return Plane.XY();
  return new Plane(
    new XYZ(data.origin.x, data.origin.y, data.origin.z),
    new XYZ(data.normal.x, data.normal.y, data.normal.z),
    new XYZ(data.xvec.x, data.xvec.y, data.xvec.z)
  );
}

export class PointVerticalRunnerNode extends ShapeNode {
  private _plane: Plane;
  private _suspendRebuild = false;

  @property("modelai.pinPointGate.templateLabel", {
    group: "modelai.pointVerticalRunner.group"
  })
  get gateTemplate(): PinPointGateTemplate {
    return this.getPrivateValue(
      "gateTemplate" as any,
      "P0.6"
    ) as PinPointGateTemplate;
  }
  set gateTemplate(value: PinPointGateTemplate) {
    this.applyPropertyValue("gateTemplate", value);
  }

  @property("modelai.pinPointGate.diameter", {
    group: "modelai.pointVerticalRunner.group"
  })
  get gateDiameter(): number {
    return this.getPrivateValue("gateDiameter" as any, 0.6) as number;
  }
  set gateDiameter(value: number) {
    this.applyPropertyValue("gateDiameter", value);
  }

  @property("modelai.pinPointGate.angle", {
    group: "modelai.pointVerticalRunner.group"
  })
  get gateAngle(): number {
    return this.getPrivateValue("gateAngle" as any, 24) as number;
  }
  set gateAngle(value: number) {
    this.applyPropertyValue("gateAngle", value);
  }

  @property("modelai.pinPointGate.length", {
    group: "modelai.pointVerticalRunner.group"
  })
  get gateLength(): number {
    return this.getPrivateValue("gateLength" as any, 1.2) as number;
  }
  set gateLength(value: number) {
    this.applyPropertyValue("gateLength", value);
  }

  @property("modelai.verticalRunner.templateLabel", {
    group: "modelai.pointVerticalRunner.group"
  })
  get runnerTemplate(): VerticalRunnerTemplate {
    return this.getPrivateValue(
      "runnerTemplate" as any,
      "D3"
    ) as VerticalRunnerTemplate;
  }
  set runnerTemplate(value: VerticalRunnerTemplate) {
    this.applyPropertyValue("runnerTemplate", value);
  }

  @property("modelai.verticalRunner.diameterStart", {
    group: "modelai.pointVerticalRunner.group"
  })
  get runnerDiameterStart(): number {
    return this.getPrivateValue(
      "runnerDiameterStart" as any,
      this.getPrivateValue("runnerDiameter" as any, 3)
    ) as number;
  }
  set runnerDiameterStart(value: number) {
    this.applyPropertyValue("runnerDiameterStart", value);
  }

  @property("modelai.verticalRunner.diameterEnd", {
    group: "modelai.pointVerticalRunner.group"
  })
  get runnerDiameterEnd(): number {
    return this.getPrivateValue("runnerDiameterEnd" as any, 5) as number;
  }
  set runnerDiameterEnd(value: number) {
    this.applyPropertyValue("runnerDiameterEnd", value);
  }

  @property("modelai.verticalRunner.pushPlatePlaneZ", {
    group: "modelai.pointVerticalRunner.group"
  })
  get pushPlatePlaneZ(): number {
    return this.getPrivateValue(
      "pushPlatePlaneZ" as any,
      this._plane.origin.z
    ) as number;
  }
  set pushPlatePlaneZ(value: number) {
    this.applyPropertyValue("pushPlatePlaneZ", value);
  }

  get plane(): Plane {
    return this._plane;
  }

  constructor(
    name: string,
    plane: Plane,
    params: PointVerticalRunnerParams,
    options?: string | ShapeNodeConstructOptions
  ) {
    const resolvedOptions = resolveShapeNodeConstructOptions(options);
    super(name, resolvedOptions.id);
    this._plane = plane;
    this.applyParams(params, {
      recordHistory: false,
      rebuild: resolvedOptions.rebuild ?? true
    });
  }

  exportParams(): PointVerticalRunnerParams {
    return {
      gateTemplate: this.gateTemplate,
      gateDiameter: this.gateDiameter,
      gateAngle: this.gateAngle,
      gateLength: this.gateLength,
      runnerTemplate: this.runnerTemplate,
      runnerDiameterStart: this.runnerDiameterStart,
      runnerDiameterEnd: this.runnerDiameterEnd,
      pushPlatePlaneZ: this.pushPlatePlaneZ
    };
  }

  applyParams(
    params: PointVerticalRunnerParams,
    options?: { recordHistory?: boolean; rebuild?: boolean }
  ): void {
    const recordHistory = options?.recordHistory ?? true;
    const rebuild = options?.rebuild ?? true;
    const next = normalizePointVerticalRunnerParams(params);

    this._suspendRebuild = true;
    try {
      this.applyPropertyValue("gateTemplate", next.gateTemplate, recordHistory);
      this.applyPropertyValue("gateDiameter", next.gateDiameter, recordHistory);
      this.applyPropertyValue("gateAngle", next.gateAngle, recordHistory);
      this.applyPropertyValue("gateLength", next.gateLength, recordHistory);
      this.applyPropertyValue(
        "runnerTemplate",
        next.runnerTemplate,
        recordHistory
      );
      this.applyPropertyValue(
        "runnerDiameterStart",
        next.runnerDiameterStart,
        recordHistory
      );
      this.applyPropertyValue(
        "runnerDiameterEnd",
        next.runnerDiameterEnd,
        recordHistory
      );
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

  applyPlacement(
    plane: Plane,
    options?: { recordHistory?: boolean; rebuild?: boolean }
  ): void {
    void options?.recordHistory;
    this._plane = plane;
    if (options?.rebuild ?? true) {
      this.rebuildShape();
    }
  }

  private applyPropertyValue<K extends keyof PointVerticalRunnerParams>(
    propertyKey: K,
    value: PointVerticalRunnerParams[K],
    recordHistory = true
  ): void {
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

  private rebuildShape(): void {
    this.setFeatureGeometry(
      buildPointVerticalRunnerFeatureGeometry(this._plane, this.exportParams())
    );
  }
}

const serializableClass: any = serializable;

serializableClass({
  serialize: (target: PointVerticalRunnerNode) => ({
    id: target.id,
    name: target.name,
    visible: target.visible,
    plane: serializePlane(target.plane),
    params: target.exportParams(),
    transform: target.transform.toArray(),
    ...serializeShapeReference(target)
  }),
  deserialize: (data: Record<string, unknown>) => {
    const node = new PointVerticalRunnerNode(
      String(data.name ?? "PointVerticalRunner"),
      deserializePlane(data.plane as SerializedPlane | undefined),
      (data.params as PointVerticalRunnerParams | undefined) ?? {
        gateTemplate: "P0.6",
        gateDiameter: 0.6,
        gateAngle: 24,
        gateLength: 1.2,
        runnerTemplate: "D3",
        runnerDiameterStart: 3,
        runnerDiameterEnd: 5,
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
})(PointVerticalRunnerNode);
