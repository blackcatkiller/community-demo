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
import { buildHornGateFeatureGeometry } from "../shared/gateBodyBuilders";
import {
  normalizeHornGateParams,
  type HornGateParams,
  type HornGateTemplate
} from "./hornGate";
import { serializable } from "../../serialize/serializer";

export class HornGateNode extends ShapeNode {
  private _plane: Plane;
  private _suspendRebuild = false;

  @property("modelai.hornGate.templateLabel", {
    group: "modelai.hornGate.group"
  })
  get template(): HornGateTemplate {
    return this.getPrivateValue("template" as any, "D3") as HornGateTemplate;
  }
  set template(value: HornGateTemplate) {
    this.applyPropertyValue("template", value);
  }

  @property("modelai.hornGate.diameter", {
    group: "modelai.hornGate.group"
  })
  get gateDiameter(): number {
    return this.getPrivateValue("gateDiameter" as any, 0.6) as number;
  }
  set gateDiameter(value: number) {
    this.applyPropertyValue("gateDiameter", value);
  }

  @property("modelai.hornGate.spreadingAngle", {
    group: "modelai.hornGate.group"
  })
  get gateSpreadingAngle(): number {
    return this.getPrivateValue("gateSpreadingAngle" as any, 24) as number;
  }
  set gateSpreadingAngle(value: number) {
    this.applyPropertyValue("gateSpreadingAngle", value);
  }

  @property("modelai.hornGate.length", {
    group: "modelai.hornGate.group"
  })
  get gateLength(): number {
    return this.getPrivateValue("gateLength" as any, 1.5) as number;
  }
  set gateLength(value: number) {
    this.applyPropertyValue("gateLength", value);
  }

  @property("modelai.hornGate.angle", { group: "modelai.hornGate.group" })
  get gateAngle(): number {
    return this.getPrivateValue("gateAngle" as any, 0) as number;
  }
  set gateAngle(value: number) {
    this.applyPropertyValue("gateAngle", value);
  }

  @property("modelai.hornGate.hornDiameterStart", {
    group: "modelai.hornGate.group"
  })
  get hornDiameterStart(): number {
    return this.getPrivateValue("hornDiameterStart" as any, 1.8) as number;
  }
  set hornDiameterStart(value: number) {
    this.applyPropertyValue("hornDiameterStart", value);
  }

  @property("modelai.hornGate.hornDiameterEnd", {
    group: "modelai.hornGate.group"
  })
  get hornDiameterEnd(): number {
    return this.getPrivateValue("hornDiameterEnd" as any, 3) as number;
  }
  set hornDiameterEnd(value: number) {
    this.applyPropertyValue("hornDiameterEnd", value);
  }

  @property("modelai.hornGate.channelOffsetX", {
    group: "modelai.hornGate.group"
  })
  get channelOffsetX(): number {
    return this.getPrivateValue("channelOffsetX" as any, 10) as number;
  }
  set channelOffsetX(value: number) {
    this.applyPropertyValue("channelOffsetX", value);
  }

  @property("modelai.hornGate.channelOffsetY", {
    group: "modelai.hornGate.group"
  })
  get channelOffsetY(): number {
    return this.getPrivateValue("channelOffsetY" as any, 0) as number;
  }
  set channelOffsetY(value: number) {
    this.applyPropertyValue("channelOffsetY", value);
  }

  get plane(): Plane {
    return this._plane;
  }

  constructor(
    name: string,
    plane: Plane,
    params: HornGateParams,
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

  exportParams(): HornGateParams {
    return {
      template: this.template,
      gateDiameter: this.gateDiameter,
      gateSpreadingAngle: this.gateSpreadingAngle,
      gateLength: this.gateLength,
      gateAngle: this.gateAngle,
      hornDiameterStart: this.hornDiameterStart,
      hornDiameterEnd: this.hornDiameterEnd,
      channelOffsetX: this.channelOffsetX,
      channelOffsetY: this.channelOffsetY
    };
  }

  applyParams(
    params: HornGateParams,
    options?: { recordHistory?: boolean; rebuild?: boolean }
  ): void {
    const recordHistory = options?.recordHistory ?? true;
    const rebuild = options?.rebuild ?? true;
    const normalized = normalizeHornGateParams(params);

    this._suspendRebuild = true;
    try {
      this.applyPropertyValue("template", normalized.template, recordHistory);
      this.applyPropertyValue(
        "gateDiameter",
        normalized.gateDiameter,
        recordHistory
      );
      this.applyPropertyValue(
        "gateSpreadingAngle",
        normalized.gateSpreadingAngle,
        recordHistory
      );
      this.applyPropertyValue(
        "gateLength",
        normalized.gateLength,
        recordHistory
      );
      this.applyPropertyValue("gateAngle", normalized.gateAngle, recordHistory);
      this.applyPropertyValue(
        "hornDiameterStart",
        normalized.hornDiameterStart,
        recordHistory
      );
      this.applyPropertyValue(
        "hornDiameterEnd",
        normalized.hornDiameterEnd,
        recordHistory
      );
      this.applyPropertyValue(
        "channelOffsetX",
        normalized.channelOffsetX,
        recordHistory
      );
      this.applyPropertyValue(
        "channelOffsetY",
        normalized.channelOffsetY,
        recordHistory
      );
    } finally {
      this._suspendRebuild = false;
    }

    if (rebuild) {
      this.rebuildGeometry();
    }
  }

  applyPlacement(
    plane: Plane,
    options?: { recordHistory?: boolean; rebuild?: boolean }
  ): void {
    void options?.recordHistory;
    this._plane = plane;
    if (options?.rebuild ?? true) {
      this.rebuildGeometry();
    }
  }

  private applyPropertyValue<K extends keyof HornGateParams>(
    property: K,
    value: HornGateParams[K],
    recordHistory = true
  ): void {
    this.setProperty(
      property as string,
      value,
      () => {
        if (!this._suspendRebuild) {
          this.rebuildGeometry();
        }
      },
      undefined,
      recordHistory
    );
  }

  private rebuildGeometry() {
    this.setFeatureGeometry(
      buildHornGateFeatureGeometry(this._plane, {
        gateDiameter: this.gateDiameter,
        gateSpreadingAngle: this.gateSpreadingAngle,
        gateLength: this.gateLength,
        gateAngle: this.gateAngle,
        hornDiameterStart: this.hornDiameterStart,
        hornDiameterEnd: this.hornDiameterEnd,
        channelOffsetX: this.channelOffsetX,
        channelOffsetY: this.channelOffsetY
      })
    );
  }
}

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

const serializableClass: any = serializable;

serializableClass({
  serialize: (target: HornGateNode) => ({
    id: target.id,
    name: target.name,
    visible: target.visible,
    plane: serializePlane(target.plane),
    params: target.exportParams(),
    transform: target.transform.toArray(),
    ...serializeShapeReference(target)
  }),
  deserialize: (data: Record<string, unknown>) => {
    const node = new HornGateNode(
      String(data.name ?? "HornGate"),
      deserializePlane(data.plane as SerializedPlane | undefined),
      (data.params as HornGateParams | undefined) ?? {
        template: "D3",
        gateDiameter: 0.6,
        gateSpreadingAngle: 24,
        gateLength: 1.5,
        gateAngle: 0,
        hornDiameterStart: 1.8,
        hornDiameterEnd: 3,
        channelOffsetX: 10,
        channelOffsetY: 0
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
})(HornGateNode);
