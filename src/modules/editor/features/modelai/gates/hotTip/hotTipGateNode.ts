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
import { buildHotTipGateFeatureGeometry } from "../shared/gateBodyBuilders";
import {
  normalizeHotTipGateParams,
  type HotTipGateParams,
  type HotTipGateTemplate
} from "./hotTipGate";
import { serializable } from "../../serialize/serializer";

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

export class HotTipGateNode extends ShapeNode {
  private _plane: Plane;
  private _suspendRebuild = false;

  @property("modelai.hotTipGate.templateLabel", {
    group: "modelai.hotTipGate.group"
  })
  get template(): HotTipGateTemplate {
    return this.getPrivateValue(
      "template" as any,
      "P0.6"
    ) as HotTipGateTemplate;
  }
  set template(value: HotTipGateTemplate) {
    this.applyPropertyValue("template", value);
  }

  @property("modelai.hotTipGate.diameter", {
    group: "modelai.hotTipGate.group"
  })
  get gateDiameter(): number {
    return this.getPrivateValue("gateDiameter" as any, 0.6) as number;
  }
  set gateDiameter(value: number) {
    this.applyPropertyValue("gateDiameter", value);
  }

  @property("modelai.hotTipGate.angle", {
    group: "modelai.hotTipGate.group"
  })
  get gateAngle(): number {
    return this.getPrivateValue("gateAngle" as any, 24) as number;
  }
  set gateAngle(value: number) {
    this.applyPropertyValue("gateAngle", value);
  }

  @property("modelai.hotTipGate.length", {
    group: "modelai.hotTipGate.group"
  })
  get gateLength(): number {
    return this.getPrivateValue("gateLength" as any, 1.2) as number;
  }
  set gateLength(value: number) {
    this.applyPropertyValue("gateLength", value);
  }

  @property("modelai.hotTipGate.tiltAngle", {
    group: "modelai.hotTipGate.group"
  })
  get tiltAngle(): number {
    return this.getPrivateValue("tiltAngle" as any, 45) as number;
  }
  set tiltAngle(value: number) {
    this.applyPropertyValue("tiltAngle", value);
  }

  get plane(): Plane {
    return this._plane;
  }

  constructor(
    name: string,
    plane: Plane,
    params: HotTipGateParams,
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

  exportParams(): HotTipGateParams {
    return {
      template: this.template,
      gateDiameter: this.gateDiameter,
      gateAngle: this.gateAngle,
      gateLength: this.gateLength,
      tiltAngle: this.tiltAngle
    };
  }

  applyParams(
    params: HotTipGateParams,
    options?: { recordHistory?: boolean; rebuild?: boolean }
  ): void {
    const recordHistory = options?.recordHistory ?? true;
    const rebuild = options?.rebuild ?? true;
    const normalized = normalizeHotTipGateParams(params);

    this._suspendRebuild = true;
    try {
      this.applyPropertyValue("template", normalized.template, recordHistory);
      this.applyPropertyValue(
        "gateDiameter",
        normalized.gateDiameter,
        recordHistory
      );
      this.applyPropertyValue("gateAngle", normalized.gateAngle, recordHistory);
      this.applyPropertyValue(
        "gateLength",
        normalized.gateLength,
        recordHistory
      );
      this.applyPropertyValue("tiltAngle", normalized.tiltAngle, recordHistory);
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

  private applyPropertyValue<K extends keyof HotTipGateParams>(
    property: K,
    value: HotTipGateParams[K],
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
      buildHotTipGateFeatureGeometry(this._plane, {
        gateDiameter: this.gateDiameter,
        gateAngle: this.gateAngle,
        gateLength: this.gateLength,
        tiltAngle: this.tiltAngle
      })
    );
  }
}

const serializableClass: any = serializable;

serializableClass({
  serialize: (target: HotTipGateNode) => ({
    id: target.id,
    name: target.name,
    visible: target.visible,
    plane: serializePlane(target.plane),
    params: target.exportParams(),
    transform: target.transform.toArray(),
    ...serializeShapeReference(target)
  }),
  deserialize: (data: Record<string, unknown>) => {
    const node = new HotTipGateNode(
      String(data.name ?? "HotTipGate"),
      deserializePlane(data.plane as SerializedPlane | undefined),
      (data.params as HotTipGateParams | undefined) ?? {
        template: "P0.6",
        gateDiameter: 0.6,
        gateAngle: 24,
        gateLength: 1.2,
        tiltAngle: 45
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
})(HotTipGateNode);
